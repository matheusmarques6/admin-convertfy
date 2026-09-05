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

/** O que o `<input type="file">` do modal aceita. */
const EXTENSOES = new Set(["mp4", "mov", "mkv", "webm", "mp3", "m4a", "wav", "flac", "ogg", "aac"])
const MAX_BYTES = 4 * 1024 * 1024 * 1024

const iniciarSchema = z.object({
  nomeArquivo: z.string().min(1).max(300),
  tamanhoBytes: z.number().int().positive().max(MAX_BYTES),
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

    const ext = (p.nomeArquivo.split(".").pop() ?? "").toLowerCase()
    if (!EXTENSOES.has(ext)) {
      throw new AppError("Formato não aceito. Use MP4, MOV, MKV, WEBM, MP3, M4A, WAV ou FLAC.", 415)
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
