/**
 * POST /api/transcricoes/upload — prepara o envio de um arquivo.
 *
 * O arquivo NÃO passa pela API: até 4 GB, ele sobe direto para o Storage
 * pelo protocolo resumível (TUS). Esta rota só cria a linha e devolve o
 * endereço e o token do upload; o progresso que a barra mostra vem dos
 * eventos do TUS no navegador, não de uma estimativa.
 *
 * POST com `concluido: true` fecha o ciclo: marca a linha como pronta para
 * a fila, e é aí que o worker a enxerga.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { BUCKET_MEDIA, prefixoOrg } from "@/lib/services/transcricoes-assets"
import { carregarRegras } from "@/lib/services/transcricoes-previa.service"
import { garantirInbox } from "@/lib/services/transcricoes.service"
import { sugerirColecao } from "@/lib/transcricoes/sugestao"

export const dynamic = "force-dynamic"

/**
 * O que o `<input type="file">` do modal aceita — e o que o bucket
 * `transcricoes-media` permite. As três listas (aqui, `ACEITOS` do modal e
 * `allowed_mime_types` do bucket) andam juntas: extensão aceita aqui e
 * recusada lá vira 400 do Storage no meio do envio, sem explicação.
 */
const EXTENSOES = new Set(["mp4", "mov", "mkv", "webm", "mp3", "m4a", "wav", "flac", "ogg", "aac"])

/** Teto do bucket — o que o Storage aceita guardar. */
const MAX_BYTES_BUCKET = 4 * 1024 * 1024 * 1024

/**
 * O limite que vale de verdade é o do PROJETO no Supabase (Storage →
 * Settings → Upload file size limit), que capa todo bucket e nasce em 50 MB.
 * O bucket declarar 4 GB não muda isso: o endpoint resumível responde 413
 * no meio do envio, com "Maximum size exceeded" e nada dizendo onde mexer.
 *
 * Por isso o teto é declarado aqui e recusado ANTES de criar a linha e de
 * subir um byte. Ao aumentar o limite no painel, suba este número junto
 * (`TRANSCRICOES_UPLOAD_MAX_MB`) — prometer o que a plataforma recusa é
 * pior que um limite baixo e honesto.
 */
const MAX_MB = Math.min(
  Math.max(1, Number(process.env.TRANSCRICOES_UPLOAD_MAX_MB) || 50),
  MAX_BYTES_BUCKET / 1024 / 1024,
)
const MAX_BYTES = MAX_MB * 1024 * 1024

const iniciarSchema = z.object({
  nomeArquivo: z.string().min(1).max(300),
  tamanhoBytes: z.number().int().positive().max(MAX_BYTES_BUCKET),
  tipo: z.string().max(120).optional(),
  colecaoId: z.string().uuid().nullable().optional(),
  idioma: z.string().min(2).max(10).default("pt-BR"),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
})

const concluirSchema = z.object({
  id: z.string().uuid(),
  concluido: z.literal(true),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const corpo = await request.json().catch(() => null)

    // ── Fechamento: o navegador terminou de subir ──────────────────────
    const fim = concluirSchema.safeParse(corpo)
    if (fim.success) {
      const { data, error } = await admin
        .from("transcricoes")
        .update({ status: "aguardando", etapa: 0, progresso: null })
        .eq("org_id", orgId)
        .eq("id", fim.data.id)
        .select("id, titulo")
        .maybeSingle<{ id: string; titulo: string }>()
      if (error) throw error
      if (!data) throw new AppError("Transcrição não encontrada.", 404)
      return successResponse(request, { id: data.id, titulo: data.titulo })
    }

    // ── Início: cria a linha e devolve o destino do upload ─────────────
    const parsed = iniciarSchema.safeParse(corpo)
    if (!parsed.success) throw new AppError("Dados do arquivo inválidos.", 400)
    const p = parsed.data

    // Recusa ANTES de criar a linha: deixar o TUS descobrir isso no meio do
    // envio gasta a banda do usuário e devolve um 413 sem instrução.
    if (p.tamanhoBytes > MAX_BYTES) {
      throw new AppError(
        `O arquivo tem ${(p.tamanhoBytes / 1024 / 1024).toFixed(0)} MB e o limite de upload é ${MAX_MB} MB. ` +
          `Aumente em Supabase → Storage → Settings → Upload file size limit (e a variável TRANSCRICOES_UPLOAD_MAX_MB), ` +
          `ou cole o link do vídeo em vez de enviar o arquivo.`,
        413,
      )
    }

    const ext = (p.nomeArquivo.split(".").pop() ?? "").toLowerCase()
    if (!EXTENSOES.has(ext)) {
      throw new AppError("Formato não aceito. Use MP4, MOV, MKV, WEBM, MP3, M4A, WAV, FLAC, OGG ou AAC.", 415)
    }

    const titulo = p.nomeArquivo.replace(/\.[^.]+$/, "").trim().slice(0, 300) || "Arquivo enviado"
    const [regras, inboxId] = await Promise.all([carregarRegras(admin, orgId), garantirInbox(admin, orgId, user.id)])
    const sugerida = sugerirColecao({ titulo, canal: null, url: null, plataforma: "upload" }, regras)

    const { data: linha, error } = await admin
      .from("transcricoes")
      .insert({
        org_id: orgId,
        colecao_id: p.colecaoId ?? sugerida ?? inboxId,
        titulo,
        plataforma: "upload",
        idioma: p.idioma,
        tags: p.tags,
        // Nasce "processando" com etapa 0: enquanto o arquivo sobe, o card
        // já aparece na biblioteca com a barra do upload. Só vira
        // "aguardando" (visível para o worker) quando o envio termina —
        // senão o worker pegaria um arquivo pela metade.
        status: "processando",
        etapa: 0,
        progresso: 0,
        criado_por: user.id,
      })
      .select("id")
      .maybeSingle<{ id: string }>()
    if (error) throw error
    if (!linha) throw new AppError("Não foi possível registrar o arquivo.", 500)

    const caminho = `${prefixoOrg(orgId)}/${linha.id}/media.${ext}`
    await admin.from("transcricoes").update({ media_path: caminho }).eq("id", linha.id)

    // O TUS do Supabase autentica com o access token da sessão; devolvemos
    // o endereço e o destino, o token o navegador já tem.
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
    return successResponse(request, {
      id: linha.id,
      bucket: BUCKET_MEDIA,
      caminho,
      enderecoTus: `${base}/storage/v1/upload/resumable`,
      tamanhoMaximoBytes: MAX_BYTES,
    })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-upload")
  }
}
