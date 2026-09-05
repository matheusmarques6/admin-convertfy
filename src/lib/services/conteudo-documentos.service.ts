/**
 * Documentos do Estúdio — leitura/escrita em `conteudo_documentos`.
 *
 * `dados` guarda o Documento inteiro (JSONB); colunas espelham o que a
 * biblioteca filtra (nome, status, perfil, template). O `atualizado_em` do
 * banco é a versão para detecção de conflito: o PUT manda o carimbo que o
 * cliente tinha e o servidor recusa (409) se outro salvamento passou na
 * frente — sem `force`.
 */

import { z } from "zod"
import type { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import type { Documento } from "@/lib/conteudo/types"

type Admin = ReturnType<typeof createAdminClient>

/** Tamanho máximo do JSON do documento (imagens vão para o Storage, não pra cá). */
export const MAX_DOC_BYTES = 1_500_000

export const documentoSchema = z
  .object({
    id: z.string().uuid(),
    nome: z.string().min(1).max(300),
    projeto: z.string().max(200),
    templateId: z.string().max(80),
    perfil: z.string().max(80),
    proporcaoExport: z.enum(["4:5", "9:16"]),
    status: z.enum(["rascunho", "pronto", "agendado", "publicado"]),
    versao: z.string().max(20),
    data: z.string().max(10),
    brandKit: z.object({ brandName: z.string(), brandName2: z.string(), copyright: z.string(), avatar: z.string().nullable(), verificado: z.boolean() }).passthrough(),
    frames: z.array(z.object({ frameId: z.string(), tipo: z.string() }).passthrough()).min(1).max(40),
    legenda: z.string().max(10_000),
    palavraChave: z.string().max(80),
    historico: z.array(z.unknown()).max(500),
    criadoEm: z.string(),
    atualizadoEm: z.string(),
  })
  .passthrough()

export interface DocumentoRow {
  id: string
  org_id: string
  channel_id: string | null
  nome: string
  status: string
  template_id: string | null
  dados: Documento
  criado_em: string
  atualizado_em: string
}

const COLS = "id, org_id, channel_id, nome, status, template_id, dados, criado_em, atualizado_em"

export function rowToDocumento(r: DocumentoRow): Documento {
  return { ...r.dados, id: r.id, nome: r.nome, status: r.status as Documento["status"], criadoEm: r.criado_em, atualizadoEm: r.atualizado_em }
}

export function validarDocumento(body: unknown): Documento {
  const parsed = documentoSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(`Documento inválido: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, 400)
  }
  const doc = parsed.data as unknown as Documento
  const bytes = Buffer.byteLength(JSON.stringify(doc), "utf8")
  if (bytes > MAX_DOC_BYTES) {
    throw new AppError("Documento grande demais para salvar. Imagens precisam ser enviadas pelo upload (não coladas no documento).", 413)
  }
  for (const f of doc.frames) {
    const url = f.imagens?.slot1?.url
    if (url && url.startsWith("data:") && url.length > 20_000) {
      throw new AppError(`O frame ${f.label} carrega uma imagem embutida. Envie a imagem pelo upload para salvar.`, 413)
    }
  }
  return doc
}

export async function listarDocumentos(admin: Admin, orgId: string): Promise<Documento[]> {
  const { data, error } = await admin.from("conteudo_documentos").select(COLS).eq("org_id", orgId).order("atualizado_em", { ascending: false }).limit(500).returns<DocumentoRow[]>()
  if (error) throw error
  return (data ?? []).map(rowToDocumento)
}

export async function obterDocumento(admin: Admin, orgId: string, id: string): Promise<DocumentoRow | null> {
  const { data, error } = await admin.from("conteudo_documentos").select(COLS).eq("org_id", orgId).eq("id", id).maybeSingle<DocumentoRow>()
  if (error) throw error
  return data
}

async function canalDaOrg(admin: Admin, orgId: string, channelId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) return null
  const { data } = await admin.from("crm_channels").select("id").eq("org_id", orgId).eq("id", channelId).maybeSingle()
  return data?.id ?? null
}

export async function criarDocumento(admin: Admin, orgId: string, userId: string, doc: Documento): Promise<Documento> {
  const channelId = await canalDaOrg(admin, orgId, doc.perfil)
  const { data, error } = await admin
    .from("conteudo_documentos")
    .insert({ id: doc.id, org_id: orgId, channel_id: channelId, nome: doc.nome, status: doc.status, template_id: doc.templateId, dados: doc, criado_por: userId })
    .select(COLS)
    .single<DocumentoRow>()
  if (error) {
    if (error.code === "23505") throw new AppError("Já existe um carrossel com este id.", 409)
    throw error
  }
  return rowToDocumento(data)
}

export class ConflitoDocumentoError extends AppError {
  atual: Documento
  constructor(atual: Documento) {
    super("Este carrossel foi alterado em outro lugar. Recarregue para ver a versão mais nova ou sobrescreva.", 409)
    this.atual = atual
  }
}

/**
 * Substitui o documento. `baseAtualizadoEm` = carimbo que o cliente tinha;
 * divergente do banco → 409 com a versão atual (a UI decide).
 */
export async function salvarDocumento(
  admin: Admin,
  orgId: string,
  userId: string,
  doc: Documento,
  opts: { baseAtualizadoEm?: string | null; force?: boolean } = {},
): Promise<Documento> {
  const atual = await obterDocumento(admin, orgId, doc.id)
  if (!atual) return criarDocumento(admin, orgId, userId, doc)
  if (!opts.force && opts.baseAtualizadoEm && Date.parse(opts.baseAtualizadoEm) !== Date.parse(atual.atualizado_em)) {
    throw new ConflitoDocumentoError(rowToDocumento(atual))
  }
  const channelId = await canalDaOrg(admin, orgId, doc.perfil)
  const { data, error } = await admin
    .from("conteudo_documentos")
    .update({ channel_id: channelId, nome: doc.nome, status: doc.status, template_id: doc.templateId, dados: doc })
    .eq("org_id", orgId)
    .eq("id", doc.id)
    .select(COLS)
    .single<DocumentoRow>()
  if (error) throw error
  return rowToDocumento(data)
}

export async function excluirDocumento(admin: Admin, orgId: string, id: string): Promise<void> {
  const { error } = await admin.from("conteudo_documentos").delete().eq("org_id", orgId).eq("id", id)
  if (error) throw error
}
