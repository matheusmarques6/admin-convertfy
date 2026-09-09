/**
 * PATCH /api/conteudo/perfis/[id] — configuração do perfil no módulo
 * Conteúdo: meta semanal e CADÊNCIA (dias da semana + hora). Grava em
 * `crm_channels.config.conteudo`, sem tocar em credenciais.
 *
 * A cadência é o que transforma o slot vazio do calendário de SUGESTÃO
 * (derivada da meta, espalhada pela semana) em promessa declarada por
 * alguém — e a tela mostra a diferença, porque slot inventado faz o
 * operador ignorar os dois. Lista de dias VAZIA volta a derivar da meta.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { loadIgChannels } from "@/lib/services/conteudo-instagram-sync.service"
import { patchConteudoConfig, perfilDoCanal } from "@/lib/services/conteudo-perfis.service"

export const dynamic = "force-dynamic"

const schema = z
  .object({
    metaSemanal: z.number().int().min(0).max(30).optional(),
    /** 0 = domingo. */
    cadenciaDias: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    cadenciaHora: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((v) => v.metaSemanal !== undefined || v.cadenciaDias !== undefined || v.cadenciaHora !== undefined, "nada para alterar")

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Alteração inválida: meta de 0 a 30, dias de 0 a 6 e hora em HH:MM.", 400)
    const e = parsed.data
    const channels = await loadIgChannels(admin, orgId, false)
    const i = channels.findIndex((c) => c.id === id)
    if (i < 0) throw new AppError("Perfil não encontrado", 404, "not-found")
    const patch = {
      ...(e.metaSemanal !== undefined ? { meta_semanal: e.metaSemanal } : {}),
      ...(e.cadenciaDias !== undefined ? { cadencia_dias: Array.from(new Set(e.cadenciaDias)).sort((a, b) => a - b) } : {}),
      // `null` explícito volta ao horário padrão da casa; ausente não toca.
      ...(e.cadenciaHora !== undefined ? { cadencia_hora: e.cadenciaHora ?? undefined } : {}),
    }
    await patchConteudoConfig(admin, channels[i], patch)
    const atualizado = { ...channels[i], config: { ...(channels[i].config ?? {}), conteudo: { ...((channels[i].config?.conteudo as Record<string, unknown> | undefined) ?? {}), ...patch } } }
    return successResponse(request, { perfil: perfilDoCanal(atualizado, i) })
  } catch (error) {
    return errorResponse(request, error, "conteudo-perfil-patch")
  }
}
