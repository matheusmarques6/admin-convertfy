/**
 * GET  /api/conteudo/ideias — banco de ideias da org (com votos do time).
 * POST /api/conteudo/ideias — anota uma ideia. `classificar: true` pede à
 *      ConvertIA funil, formato, tags, molde, score e o "por que" ANTES de
 *      gravar; falhar a classificação NÃO perde a ideia — ela entra crua e
 *      a tela mostra o traço no lugar do score.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { criarIdeia, listarIdeias } from "@/lib/services/conteudo-ideias.service"
import { classificarIdeia } from "@/lib/services/conteudo-trends.service"
import { logger } from "@/lib/logger"

const log = logger.child("ConteudoIdeiasRoute")

export const dynamic = "force-dynamic"
export const maxDuration = 120

const criarSchema = z.object({
  titulo: z.string().min(3).max(300),
  funil: z.enum(["topo", "meio", "fundo"]).nullable().optional(),
  formato: z.enum(["Carrossel", "Reels", "Vídeo", "Imagem"]).nullable().optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  fonte: z.enum(["time", "convertia", "trend", "dashboard", "inbox", "cs"]).optional(),
  fonteDetalhe: z.string().max(80).nullable().optional(),
  trendId: z.string().uuid().nullable().optional(),
  classificar: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    return successResponse(request, { ideias: await listarIdeias(admin, orgId, user.id) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideias")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = criarSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Escreva a ideia (pelo menos 3 caracteres).", 400)
    const e = parsed.data

    let extras: Awaited<ReturnType<typeof classificarIdeia>> | null = null
    if (e.classificar !== false) {
      try {
        extras = await classificarIdeia(admin, orgId, e.titulo)
      } catch (err) {
        // A ideia é o que importa; a classificação é enfeite que dá para
        // refazer. Perder o que a pessoa acabou de escrever, não.
        log.warn("conteudo_ideias.classificacao_falhou", { erro: (err as Error).message })
      }
    }

    const ideia = await criarIdeia(admin, orgId, user.id, {
      titulo: e.titulo,
      funil: e.funil ?? extras?.funil ?? null,
      formato: e.formato ?? extras?.formato ?? null,
      pilar: extras?.pilar ?? null,
      tags: e.tags ?? extras?.tags ?? [],
      fonte: e.fonte ?? "time",
      fonteDetalhe: e.fonteDetalhe ?? null,
      score: extras?.score ?? null,
      porQue: extras?.porQue ?? null,
      molde: extras?.molde ?? null,
      trendId: e.trendId ?? null,
    })
    return successResponse(request, { ideia, classificada: Boolean(extras) }, { status: 201 })
  } catch (error) {
    return errorResponse(request, error, "conteudo-ideias-post")
  }
}
