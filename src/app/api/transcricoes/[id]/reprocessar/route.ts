/**
 * POST /api/transcricoes/[id]/reprocessar
 *
 * Dois escopos:
 *  - `escopo: "indexacao"` (padrão) — refaz tópicos, chunks e embeddings.
 *    Não toca no áudio nem gasta transcrição de novo. É o que resolve
 *    "editei várias falas" e "acabei de ligar a faísca da coleção".
 *  - `escopo: "tudo"` — volta para a etapa 0. Só faz sentido quando a
 *    transcrição em si saiu ruim (modelo trocado, jargão da coleção
 *    corrigido).
 *
 * Reprocessar zera as tentativas: o contador existe para conter retry
 * automático, não para punir quem pediu de novo à mão.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const schema = z.object({ escopo: z.enum(["indexacao", "tudo"]).default("indexacao") })

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {})
    const escopo = parsed.success ? parsed.data.escopo : "indexacao"

    const { data: linha } = await admin
      .from("transcricoes")
      .select("id, audio_path, media_path, url_original, plataforma")
      .eq("org_id", orgId)
      .eq("id", id)
      .maybeSingle<{
        id: string
        audio_path: string | null
        media_path: string | null
        url_original: string | null
        plataforma: string
      }>()
    if (!linha) throw new AppError("Transcrição não encontrada.", 404)

    if (escopo === "tudo" && !linha.media_path && !linha.audio_path && !linha.url_original) {
      // A mídia é DESCARTADA quando a transcrição fica pronta (o vídeo mora
      // na plataforma, não aqui). Para link isso não é problema: o worker
      // rebaixa da URL. Arquivo enviado, sim — a fonte não existe mais em
      // lugar nenhum, e dizer isso é melhor que enfileirar algo que vai
      // falhar sozinho daqui a pouco.
      throw new AppError(
        "O arquivo enviado não fica guardado depois da transcrição, então não há de onde reprocessar do início. " +
          "Envie o arquivo de novo para gerar uma transcrição nova.",
        409,
      )
    }

    if (escopo === "indexacao") {
      // Reindexar sem fala nenhuma não é reindexação: o worker retomaria na
      // etapa 3, não teria o que indexar e a linha voltaria "pronta" com o
      // painel vazio. Quem quer isso quer reprocessar do início.
      const { count } = await admin
        .from("transcricoes_blocos")
        .select("id", { count: "exact", head: true })
        .eq("transcricao_id", id)
      if (!count) {
        throw new AppError(
          "Esta transcrição ainda não tem falas para indexar. Reprocesse do início.",
          409,
        )
      }
    }

    const patch =
      escopo === "tudo"
        ? { status: "aguardando", etapa: 0, progresso: null }
        : // A indexação é a etapa 3: o worker retoma dali sem rebaixar nem
          // retranscrever, porque o áudio já está no Storage.
          { status: "aguardando", etapa: 3, progresso: null }

    const { error } = await admin
      .from("transcricoes")
      .update({
        ...patch,
        erro_msg: null,
        erro_codigo: null,
        tentativas: 0,
        proxima_tentativa_em: null,
        claim_token: null,
        claim_expira_em: null,
      })
      .eq("org_id", orgId)
      .eq("id", id)
    if (error) throw error

    // Marca os chunks para regeneração: sem isso o worker poderia concluir
    // a etapa sem nada a fazer e o pedido viraria um no-op silencioso.
    if (escopo === "indexacao") {
      await admin.from("transcricoes_chunks").update({ desatualizado: true }).eq("transcricao_id", id)
    }

    return successResponse(request, { enfileirada: true, escopo })
  } catch (error) {
    return errorResponse(request, error, "transcricao-reprocessar")
  }
}
