/**
 * PATCH /api/transcricoes/[id]/blocos — edição inline de uma fala.
 *
 * Além de gravar o texto, marca os chunks que COBREM o intervalo do bloco
 * como desatualizados e enfileira a reindexação. Sem isso a base de
 * conhecimento diverge do texto que o usuário está vendo, e o erro é
 * silencioso: a busca continua devolvendo a versão antiga sem avisar.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { marcarDesatualizados } from "@/lib/transcricoes/indexar"
import { lerBlocos } from "@/lib/transcricoes/blocos-io"

export const dynamic = "force-dynamic"

const schema = z.object({
  blocoId: z.number().int().positive(),
  texto: z.string().min(1).max(20000),
})

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Texto inválido.", 400)
    const texto = parsed.data.texto.trim()
    if (!texto) throw new AppError("A fala não pode ficar vazia.", 400)

    const { data: bloco, error } = await admin
      .from("transcricoes_blocos")
      .update({ texto, editado: true, editado_em: new Date().toISOString(), editado_por: user.id })
      .eq("id", parsed.data.blocoId)
      .eq("transcricao_id", id)
      .eq("org_id", orgId)
      .select("id, s, fim, texto, editado")
      .maybeSingle<{ id: number; s: number; fim: number; texto: string; editado: boolean }>()
    if (error) throw error
    if (!bloco) throw new AppError("Fala não encontrada.", 404)

    const marcados = await marcarDesatualizados(admin, id, { s: Number(bloco.s), fim: Number(bloco.fim) })

    // O texto completo é derivado dos blocos: deixar a coluna velha faria a
    // exportação e o "copiar texto completo" divergirem da tela. A leitura é
    // PAGINADA — reescrever a coluna a partir de uma resposta cortada em
    // 1.000 linhas apagaria o fim da transcrição a cada edição.
    const todos = await lerBlocos(admin, id, "id, s, fim, locutor, texto, editado")
    if (todos.length) {
      await admin
        .from("transcricoes")
        .update({ texto_completo: todos.map((b) => b.texto).join(" ") })
        .eq("id", id)
        .eq("org_id", orgId)
    }

    return successResponse(request, {
      bloco: { id: bloco.id, s: Number(bloco.s), fim: Number(bloco.fim), texto: bloco.texto, editado: true },
      chunksParaReindexar: marcados,
    })
  } catch (error) {
    return errorResponse(request, error, "transcricao-bloco")
  }
}
