import { SupabaseClient } from "@supabase/supabase-js"
import { ForbiddenError } from "./errors"

/**
 * Server-side permission check helpers for API routes.
 * These check the org_member_features table to verify if the
 * authenticated user has the required feature(s) enabled.
 *
 * Admin (profiles.role = 'admin') and org owners always pass.
 */

interface PermissionContext {
  userId: string
  isAdmin?: boolean
  isOrgOwner?: boolean
}

async function getPermissionContext(
  supabase: SupabaseClient,
  userId: string
): Promise<PermissionContext> {
  // Check if global admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single()

  if (profile?.role === "admin") {
    return { userId, isAdmin: true }
  }

  // Check if org owner
  const { data: orgMember } = await supabase
    .from("org_members")
    .select("role")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .single()

  if (orgMember?.role === "owner") {
    return { userId, isOrgOwner: true }
  }

  return { userId }
}

/**
 * Throws ForbiddenError if the user does not have the specified feature enabled.
 * Admin and org owner always pass.
 */
export async function requireFeature(
  supabase: SupabaseClient,
  userId: string,
  feature: string
): Promise<void> {
  const ctx = await getPermissionContext(supabase, userId)

  if (ctx.isAdmin || ctx.isOrgOwner) return

  const { data: orgMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .single()

  if (!orgMember) {
    throw new ForbiddenError("Usuário não pertence a nenhuma organização")
  }

  const { data: featureRow } = await supabase
    .from("org_member_features")
    .select("enabled")
    .eq("org_member_id", orgMember.id)
    .eq("feature_key", feature)
    .eq("enabled", true)
    .single()

  if (!featureRow) {
    throw new ForbiddenError(`Sem permissão: ${feature}`)
  }
}

/**
 * Throws ForbiddenError if the user does not have ANY of the specified features.
 * Admin and org owner always pass.
 */
export async function requireAnyFeature(
  supabase: SupabaseClient,
  userId: string,
  features: string[]
): Promise<void> {
  const ctx = await getPermissionContext(supabase, userId)

  if (ctx.isAdmin || ctx.isOrgOwner) return

  const { data: orgMember } = await supabase
    .from("org_members")
    .select("id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .single()

  if (!orgMember) {
    throw new ForbiddenError("Usuário não pertence a nenhuma organização")
  }

  const { data: featureRows } = await supabase
    .from("org_member_features")
    .select("feature_key")
    .eq("org_member_id", orgMember.id)
    .in("feature_key", features)
    .eq("enabled", true)

  if (!featureRows || featureRows.length === 0) {
    throw new ForbiddenError(`Sem permissão para: ${features.join(", ")}`)
  }
}
