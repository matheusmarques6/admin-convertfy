/**
 * POST /api/conteudo/ideias/gerar — a ConvertIA propõe pautas e elas entram
 * no banco já classificadas (fonte "ConvertIA").
 *
 * `lacunas` vem do progresso da semana do pipeline de Reels quando o pedido
 * sai de lá ("Planejar com IA"): o modelo prioriza o funil que falta fechar.
 * Sem elas, é o "Gerar ideias com IA" do banco.
 *
 * Grava tudo de uma vez e devolve as ideias criadas — a tela não precisa
 * relistar para mostrar o que acabou de nascer.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { criarIdeia } from "@/lib/services/conteudo-ideias.service"
import { gerarPautas } from "@/lib/services/conteudo-trends.service"
import { loadPerfis } from "@/lib/services/conteudo-perfis.service"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const schema = z.object({
  lacunas: z.array(z.string().max(60)).max(3).optional(),
  quantidade: z.number().int().min(1).max(8).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {})
    if (!parsed.success) throw new AppError("Pedido inválido.", 400)

    const { perfis } = await loadPerfis(admin, orgId)
    const perfil = perfis.find((p) => p.ativo) ?? perfis[0] ?? null
    const pautas = await gerarPautas(
      admin,
      orgId,
      { handle: perfil?.handle ?? null, nome: perfil?.nome ?? "Convertfy" },
      parsed.data,
    )

    const ideias = []
    for (const p of pautas) {
      ideias.push(
        await criarIdeia(admin, orgId, user.id, {
          titulo: p.titulo,
          funil: p.funil,
          formato: p.formato,
          pilar: p.pilar,
          tags: p.tags,
          fonte: "convertia",
          fonteDetalhe: parsed.data.lacunas?.length ? "planejamento da semana" : null,
          score: p.score,
          porQue: p.porQue,
          molde: p.molde,
        }),
      )
    }
    return successResponse(request, { ideias }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideias-gerar")
  }
}
