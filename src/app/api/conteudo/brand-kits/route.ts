/**
 * GET /api/conteudo/brand-kits — kits por perfil (canal). Perfil sem kit
 * salvo recebe o padrão derivado do Instagram (handle, nome, foto).
 * PUT { perfil, kit } — upsert do kit de um perfil.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { brandKitPadrao } from "@/lib/conteudo/brand"
import type { BrandKit } from "@/lib/conteudo/types"
import { loadPerfis } from "@/lib/services/conteudo-perfis.service"

export const dynamic = "force-dynamic"

const kitSchema = z.object({
  brandName: z.string().max(80),
  brandName2: z.string().max(120),
  copyright: z.string().max(60),
  avatar: z.string().max(2000).nullable(),
  verificado: z.boolean(),
})

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const { perfis } = await loadPerfis(admin, orgId)
    const { data, error } = await admin.from("conteudo_brand_kits").select("channel_id, kit").eq("org_id", orgId)
    if (error) throw error
    const salvos = new Map((data ?? []).map((r: { channel_id: string; kit: BrandKit }) => [r.channel_id, r.kit]))
    const kits: Record<string, BrandKit> = {}
    for (const p of perfis) kits[p.id] = salvos.get(p.id) ?? brandKitPadrao(p)
    return successResponse(request, { kits, perfis })
  } catch (error) {
    return errorResponse(request, error, "conteudo-brand-kits")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const body = z.object({ perfil: z.string().uuid(), kit: kitSchema }).safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError("Brand kit inválido.", 400)
    if (body.data.kit.avatar?.startsWith("data:")) throw new AppError("Envie a foto pelo upload antes de salvar o kit.", 413)
    const { data: canal } = await admin.from("crm_channels").select("id").eq("org_id", orgId).eq("id", body.data.perfil).maybeSingle()
    if (!canal) throw new AppError("Perfil não encontrado", 404, "not-found")
    const { error } = await admin.from("conteudo_brand_kits").upsert({ org_id: orgId, channel_id: body.data.perfil, kit: body.data.kit }, { onConflict: "org_id,channel_id" })
    if (error) throw error
    return successResponse(request, { perfil: body.data.perfil, kit: body.data.kit })
  } catch (error) {
    return errorResponse(request, error, "conteudo-brand-kits-put")
  }
}
