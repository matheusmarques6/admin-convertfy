import { NextRequest } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("AdminSettings")

const profileUpdateSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  // phone: will be added after Story 9.3 migration creates the column
})

// GET - Get current user profile
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url, role")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      log.error("[AdminSettings] Profile not found:", profileError)
      throw new AppError("Perfil não encontrado", 404)
    }

    // Fetch org membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("role, job_title, organization:organizations(id, name)")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    return successResponse(request, {
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        role: profile.role,
      },
      organization: membership
        ? {
            role: membership.role,
            job_title: membership.job_title,
            org: membership.organization,
          }
        : null,
    })
  } catch (error) {
    return errorResponse(request, error, "AdminSettings")
  }
}

// PUT - Update current user profile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const parsed = profileUpdateSchema.safeParse(body)

    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos",
        400
      )
    }

    // WHITELIST: only name is updatable on profiles table
    // phone will be added in Story 9.3 migration
    const updateData: Record<string, unknown> = {
      name: parsed.data.name,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id)

    if (updateError) {
      log.error("[AdminSettings] Update error:", updateError)
      throw new AppError("Erro ao atualizar perfil", 500)
    }

    return successResponse(request, { success: true }, { message: "Perfil atualizado com sucesso" })
  } catch (error) {
    return errorResponse(request, error, "AdminSettings")
  }
}
