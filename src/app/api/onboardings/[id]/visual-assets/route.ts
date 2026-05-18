import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export interface VisualAssets {
  palette?: string[]
  logos?: {
    main?: { url: string; filename: string; size: number }
    mono?: { url: string; filename: string; size: number }
  }
  font?: { family: string; fallback?: string }
  top_products?: Array<{ name: string; image_url?: string; url?: string }>
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: onb, error } = await admin
      .from("onboardings")
      .select("id, visual_assets")
      .eq("id", id)
      .maybeSingle()

    if (error || !onb) throw new AppError("Onboarding não encontrado", 404)

    return successResponse(request, {
      visual_assets: (onb.visual_assets as VisualAssets) ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingVisualAssets")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const assets = body.visual_assets as VisualAssets | undefined

    if (!assets || typeof assets !== "object") {
      throw new AppError("visual_assets obrigatório (object)", 400)
    }

    // Validação básica
    if (assets.palette && (!Array.isArray(assets.palette) || assets.palette.length > 10)) {
      throw new AppError("palette deve ser array de hex (max 10)", 400)
    }
    if (
      assets.palette &&
      !assets.palette.every((c) => typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c))
    ) {
      throw new AppError("palette deve conter cores em hex válido (#RRGGBB)", 400)
    }

    const admin = createAdminClient()

    // Busca atual pra fazer merge parcial
    const { data: current } = await admin
      .from("onboardings")
      .select("visual_assets")
      .eq("id", id)
      .maybeSingle()

    const merged = {
      ...((current?.visual_assets as VisualAssets) ?? {}),
      ...assets,
    }

    const { error: updateErr } = await admin
      .from("onboardings")
      .update({ visual_assets: merged, updated_at: new Date().toISOString() })
      .eq("id", id)

    if (updateErr) throw new AppError("Erro ao salvar assets visuais", 500)

    return successResponse(request, { visual_assets: merged })
  } catch (error) {
    return errorResponse(request, error, "OnboardingVisualAssets")
  }
}
