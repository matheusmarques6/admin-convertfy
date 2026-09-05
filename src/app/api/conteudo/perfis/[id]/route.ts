/**
 * PATCH /api/conteudo/perfis/[id] — configuração do perfil no módulo
 * Conteúdo (hoje: meta semanal de publicações). Grava em
 * `crm_channels.config.conteudo`, sem tocar em credenciais.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { loadIgChannels } from "@/lib/services/conteudo-instagram-sync.service"
import { patchConteudoConfig, perfilDoCanal } from "@/lib/services/conteudo-perfis.service"

export const dynamic = "force-dynamic"

const schema = z.object({ metaSemanal: z.number().int().min(0).max(30) })

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Meta semanal inválida (0 a 30).", 400)
    const channels = await loadIgChannels(admin, orgId, false)
    const i = channels.findIndex((c) => c.id === id)
    if (i < 0) throw new AppError("Perfil não encontrado", 404, "not-found")
    await patchConteudoConfig(admin, channels[i], { meta_semanal: parsed.data.metaSemanal })
    const atualizado = { ...channels[i], config: { ...(channels[i].config ?? {}), conteudo: { ...((channels[i].config?.conteudo as Record<string, unknown> | undefined) ?? {}), meta_semanal: parsed.data.metaSemanal } } }
    return successResponse(request, { perfil: perfilDoCanal(atualizado, i) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-perfil-patch")
  }
}
