import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"
import {
  PLATFORM_VALUES,
  COUNTRY_VALUES,
  LANGUAGE_VALUES,
  SHIPPING_TYPE_VALUES,
  PRICE_SENSITIVITY_VALUES,
} from "@/lib/constants/onboarding"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingEdit")

// AC 37.3.7: Partial validation schema — all fields optional
const editSchema = z.object({
  // Client fields
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/).optional().nullable(),
  cpf_cnpj: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  // Store fields
  store_name: z.string().min(2).max(100).optional(),
  store_url: z.string().min(5).refine(
    (val) => /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(val.trim()),
    { message: "URL inválida. Ex: minhaloja.com.br ou https://minhaloja.com.br" }
  ).optional(),
  platform: z.enum(PLATFORM_VALUES).optional(),
  niche: z.string().optional().nullable(),
  country: z.enum(COUNTRY_VALUES).optional(),
  language: z.enum(LANGUAGE_VALUES).optional(),
  target_audience: z.string().optional().nullable(),
  free_shipping_type: z.enum(SHIPPING_TYPE_VALUES).optional().nullable(),
  shopify_collaborator_code: z.string().optional().nullable(),
  // Onboarding data fields
  price_sensitivity: z.enum(PRICE_SENSITIVITY_VALUES).optional().nullable(),
  additional_notes: z.string().optional().nullable(),
  design_direction_text: z.string().optional().nullable(),
}).strict()

// Field routing: which table each field belongs to
const clientFields = new Set(["name", "email", "phone", "cpf_cnpj", "company"])
const storeFields = new Set(["store_name", "store_url", "platform", "niche", "country", "language", "target_audience", "free_shipping_type", "shopify_collaborator_code"])
const onboardingDataFields = new Set(["price_sensitivity", "additional_notes", "design_direction_text"])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const adminClient = createAdminClient()

    // AC 37.3.2: Permission check (same gate as approve)
    const { data: orgMember } = await adminClient
      .from("org_members")
      .select("id, role, profile_id, org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single()

    if (!orgMember) {
      throw new AppError("Membro da organização não encontrado", 403)
    }

    const { data: feature } = await adminClient
      .from("org_member_features")
      .select("id")
      .eq("org_member_id", orgMember.id)
      .eq("feature_key", "onboarding_approve")
      .eq("enabled", true)
      .maybeSingle()

    const hasPermission = !!feature || ["owner", "manager", "coo"].includes(orgMember.role)
    if (!hasPermission) {
      throw new AppError("Você não tem permissão para editar onboardings", 403)
    }

    // AC 37.3.3: Verify onboarding is in pending_approval
    const { data: onboarding } = await adminClient
      .from("client_onboardings")
      .select("id, current_phase, status, client_id, store_id")
      .eq("id", id)
      .single()

    if (!onboarding) {
      throw new AppError("Onboarding não encontrado", 404)
    }

    // AC 37.3.4: Verify org-scoping
    if (onboarding.store_id) {
      const { data: store } = await adminClient
        .from("client_stores")
        .select("org_id")
        .eq("id", onboarding.store_id)
        .single()

      if (store?.org_id && store.org_id !== orgMember.org_id) {
        throw new AppError("Você não tem permissão para este onboarding", 403)
      }
    }

    if (onboarding.current_phase !== "pending_approval" && onboarding.status !== "pending_approval") {
      throw new AppError(
        `Onboarding não está aguardando aprovação (fase atual: ${onboarding.current_phase || onboarding.status})`,
        400
      )
    }

    // Parse and validate body
    const body = await request.json()
    const parsed = editSchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      throw new AppError(`Campo inválido: ${firstIssue.path.join(".")} — ${firstIssue.message}`, 400)
    }

    const fields = parsed.data
    if (Object.keys(fields).length === 0) {
      throw new AppError("Nenhum campo para editar", 400)
    }

    // Fetch current values for audit log
    const { data: currentClient } = await adminClient
      .from("clients")
      .select("name, email, phone, cpf_cnpj, company")
      .eq("id", onboarding.client_id)
      .single()

    const { data: currentStore } = await adminClient
      .from("client_stores")
      .select("store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
      .eq("id", onboarding.store_id)
      .single()

    const { data: currentOnbData } = await adminClient
      .from("store_onboarding_data")
      .select("price_sensitivity, additional_notes, design_direction_text")
      .eq("store_id", onboarding.store_id)
      .maybeSingle()

    // AC 37.3.5: Email duplicate check
    if (fields.email && fields.email !== currentClient?.email) {
      const { data: existingClient } = await adminClient
        .from("clients")
        .select("id")
        .eq("org_id", orgMember.org_id)
        .ilike("email", fields.email)
        .neq("id", onboarding.client_id)
        .maybeSingle()

      if (existingClient) {
        throw new AppError("Já existe um cliente com este email nesta organização", 409)
      }

      const { data: existingPortal } = await adminClient
        .from("client_portal_users")
        .select("id")
        .ilike("email", fields.email)
        .maybeSingle()

      if (existingPortal) {
        throw new AppError("Já existe um usuário de portal com este email", 409)
      }
    }

    // AC 37.3.6: Store name duplicate check
    if (fields.store_name && fields.store_name !== currentStore?.store_name) {
      const { data: existingStore } = await adminClient
        .from("client_stores")
        .select("id")
        .eq("org_id", orgMember.org_id)
        .ilike("store_name", fields.store_name)
        .neq("id", onboarding.store_id)
        .maybeSingle()

      if (existingStore) {
        throw new AppError("Já existe uma loja com este nome nesta organização", 409)
      }
    }

    // AC 37.3.8: Clear shopify_collaborator_code if platform changes away from shopify
    if (fields.platform && fields.platform !== "shopify" && currentStore?.platform === "shopify") {
      fields.shopify_collaborator_code = null
    }

    // Build updates per table
    const clientUpdate: Record<string, unknown> = {}
    const storeUpdate: Record<string, unknown> = {}
    const onbDataUpdate: Record<string, unknown> = {}
    const editLogs: Array<{ field_name: string; old_value: string | null; new_value: string | null }> = []

    for (const [key, value] of Object.entries(fields)) {
      // Get current value for audit
      let oldValue: unknown = null
      if (clientFields.has(key)) {
        oldValue = currentClient?.[key as keyof typeof currentClient]
        clientUpdate[key] = value
      } else if (storeFields.has(key)) {
        oldValue = currentStore?.[key as keyof typeof currentStore]
        storeUpdate[key] = value
      } else if (onboardingDataFields.has(key)) {
        oldValue = currentOnbData?.[key as keyof typeof currentOnbData]
        onbDataUpdate[key] = value
      }

      // Only log if value actually changed
      const oldStr = oldValue == null ? null : String(oldValue)
      const newStr = value == null ? null : String(value)
      if (oldStr !== newStr) {
        editLogs.push({
          field_name: key,
          old_value: oldStr,
          new_value: newStr,
        })
      }
    }

    // Apply updates
    if (Object.keys(clientUpdate).length > 0) {
      clientUpdate.updated_at = new Date().toISOString()
      const { error } = await adminClient
        .from("clients")
        .update(clientUpdate)
        .eq("id", onboarding.client_id)

      if (error) {
        log.error("Failed to update client", error)
        throw new AppError("Erro ao atualizar dados do cliente", 500)
      }
    }

    if (Object.keys(storeUpdate).length > 0) {
      storeUpdate.updated_at = new Date().toISOString()
      const { error } = await adminClient
        .from("client_stores")
        .update(storeUpdate)
        .eq("id", onboarding.store_id)

      if (error) {
        log.error("Failed to update store", error)
        throw new AppError("Erro ao atualizar dados da loja", 500)
      }
    }

    if (Object.keys(onbDataUpdate).length > 0) {
      onbDataUpdate.updated_at = new Date().toISOString()
      const { error } = await adminClient
        .from("store_onboarding_data")
        .update(onbDataUpdate)
        .eq("store_id", onboarding.store_id)

      if (error) {
        log.error("Failed to update onboarding data", error)
        throw new AppError("Erro ao atualizar dados do formulário", 500)
      }
    }

    // AC 37.3.9: Audit log
    if (editLogs.length > 0) {
      const logEntries = editLogs.map((entry) => ({
        onboarding_id: id,
        org_id: orgMember.org_id,
        field_name: entry.field_name,
        old_value: entry.old_value,
        new_value: entry.new_value,
        edited_by: orgMember.id,
      }))

      const { error: logError } = await adminClient
        .from("onboarding_edit_log")
        .insert(logEntries)

      if (logError) {
        log.error("Failed to write edit log (non-blocking)", logError)
      }
    }

    log.info(`Onboarding ${id} edited by COO`, {
      editedBy: orgMember.id,
      fieldsChanged: editLogs.map((e) => e.field_name),
    })

    // AC 37.3.10: Return updated data
    const { data: updatedClient } = await adminClient
      .from("clients")
      .select("name, email, phone, cpf_cnpj, company")
      .eq("id", onboarding.client_id)
      .single()

    const { data: updatedStore } = await adminClient
      .from("client_stores")
      .select("store_name, store_url, platform, niche, country, language, target_audience, free_shipping_type, shopify_collaborator_code")
      .eq("id", onboarding.store_id)
      .single()

    const { data: updatedOnbData } = await adminClient
      .from("store_onboarding_data")
      .select("price_sensitivity, additional_notes, design_direction_text")
      .eq("store_id", onboarding.store_id)
      .maybeSingle()

    return successResponse(request, {
      client: updatedClient,
      store: updatedStore,
      onboarding_data: updatedOnbData,
      fields_changed: editLogs.map((e) => e.field_name),
      message: `${editLogs.length} campo(s) atualizado(s)`,
    })
  } catch (error) {
    return errorResponse(request, error, "OnboardingEdit")
  }
}
