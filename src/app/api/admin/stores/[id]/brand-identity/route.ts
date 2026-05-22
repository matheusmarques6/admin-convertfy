import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/stores/[id]/brand-identity
 *   Retorna a versão mais recente de store_brand_identity da loja.
 *
 * PATCH /api/admin/stores/[id]/brand-identity
 *   Cria uma nova versão (version = max + 1, source = 'edited') a partir
 *   da versão atual + os campos enviados. Versionamento herda o padrão
 *   já usado pelo Email Workspace.
 */

const colorSchema = z.object({
  hex: z.string(),
  name: z.string().optional(),
  role: z.string().optional(),
})

const patchSchema = z.object({
  logo_main_svg: z.string().nullable().optional(),
  logo_main_png: z.string().nullable().optional(),
  logo_alt_svg: z.string().nullable().optional(),
  logo_alt_png: z.string().nullable().optional(),
  logo_monogram_svg: z.string().nullable().optional(),
  logo_monogram_png: z.string().nullable().optional(),
  logo_reverse_svg: z.string().nullable().optional(),
  logo_reverse_png: z.string().nullable().optional(),
  colors_primary: z.array(colorSchema).optional(),
  colors_secondary: z.array(colorSchema).optional(),
  font_heading: z.string().nullable().optional(),
  font_heading_weight: z.string().nullable().optional(),
  font_body: z.string().nullable().optional(),
  font_body_weight: z.string().nullable().optional(),
  voice: z.array(z.string()).optional(),
  trust_icons: z
    .array(z.object({ image_url: z.string().min(1) }))
    .optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return successResponse(request, { identity: data ?? null })
  } catch (error) {
    return errorResponse(request, error, "store-brand-identity-get")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " + parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    const { data: current } = await admin
      .from("store_brand_identity")
      .select("*")
      .eq("store_id", storeId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (current?.version ?? 0) + 1
    const merged: Record<string, unknown> = {
      store_id: storeId,
      version: nextVersion,
      source: "edited",
      created_by: user.id,
      // herda campos anteriores
      logo_main_svg: current?.logo_main_svg ?? null,
      logo_main_png: current?.logo_main_png ?? null,
      logo_alt_svg: current?.logo_alt_svg ?? null,
      logo_alt_png: current?.logo_alt_png ?? null,
      logo_monogram_svg: current?.logo_monogram_svg ?? null,
      logo_monogram_png: current?.logo_monogram_png ?? null,
      logo_reverse_svg: current?.logo_reverse_svg ?? null,
      logo_reverse_png: current?.logo_reverse_png ?? null,
      colors_primary: current?.colors_primary ?? [],
      colors_secondary: current?.colors_secondary ?? [],
      font_heading: current?.font_heading ?? null,
      font_heading_weight: current?.font_heading_weight ?? null,
      font_body: current?.font_body ?? null,
      font_body_weight: current?.font_body_weight ?? null,
      voice: current?.voice ?? [],
      trust_icons: current?.trust_icons ?? [],
      top_products: current?.top_products ?? [],
    }

    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) merged[k] = v
    }

    const { data: inserted, error } = await admin
      .from("store_brand_identity")
      .insert(merged)
      .select("*")
      .single()

    if (error) throw error
    return successResponse(request, { identity: inserted })
  } catch (error) {
    return errorResponse(request, error, "store-brand-identity-patch")
  }
}
