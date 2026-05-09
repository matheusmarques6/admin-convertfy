/**
 * PATCH  /api/crm/custom-fields/[id] — atualiza campo
 * DELETE /api/crm/custom-fields/[id] — soft delete (is_active=false)
 *
 * Soft delete preserva valores ja gravados em crm_leads.custom_fields[key].
 * Pra deletar dados antigos, faria-se UPDATE crm_leads SET custom_fields =
 * custom_fields - 'key' separadamente.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmCustomFieldDetail")

export const dynamic = "force-dynamic"

const FIELD_TYPES = [
  "text", "textarea", "number", "select", "multi_select",
  "boolean", "date", "url", "email", "phone",
] as const

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  field_type: z.enum(FIELD_TYPES).optional(),
  options: z.array(z.union([z.string(), z.object({ label: z.string(), value: z.string() })])).optional(),
  description: z.string().nullable().optional(),
  required: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = patchSchema.parse(body)

    if (Object.keys(parsed).length === 0) {
      return successResponse(request, { ok: true })
    }

    const { error } = await admin
      .from("crm_custom_fields")
      .update(parsed)
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Custom field PATCH error:", error)
    return errorResponse(request, error, "crm-custom-field-patch")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const { error } = await admin
      .from("crm_custom_fields")
      .update({ is_active: false })
      .eq("id", id)
      .eq("org_id", orgId)

    if (error) throw error
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("Custom field DELETE error:", error)
    return errorResponse(request, error, "crm-custom-field-delete")
  }
}
