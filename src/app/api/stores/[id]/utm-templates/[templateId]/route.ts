import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { errorResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("UtmTemplateAPI")

// ---------------------------------------------------------------------------
// PATCH /api/stores/[id]/utm-templates/[templateId]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: storeId, templateId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new AppError("Unauthorized", 401)

    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Validar que store pertence a org
    const { data: store } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .single()

    if (!store) throw new AppError("Store not found", 404)

    // Validar que template pertence a loja e org
    const { data: existing } = await admin
      .from("utm_templates")
      .select("id")
      .eq("id", templateId)
      .eq("store_id", storeId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .single()

    if (!existing) throw new AppError("Template not found", 404)

    let body
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // Incremento atomico de usage_count
    if (body.increment_usage === true) {
      const { error: rpcError } = await admin.rpc("increment_utm_usage", {
        template_id: templateId,
      })

      if (rpcError) {
        log.error("Failed to increment usage_count", { templateId, error: rpcError.message })
        throw new AppError("Failed to increment usage", 500)
      }

      // Buscar template atualizado
      const { data: updated } = await admin
        .from("utm_templates")
        .select("*")
        .eq("id", templateId)
        .single()

      return Response.json({ success: true, template: updated })
    }

    // Update fields path (no increment_usage flag)
    // Atualizar campos permitidos
    const allowedFields = [
      "name",
      "description",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "is_active",
    ] as const

    const updateData: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const value = body[field]
        if (typeof value === "string") {
          updateData[field] = value.trim()
        } else {
          updateData[field] = value
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError("Nenhum campo para atualizar", 400)
    }

    // Validar campos obrigatorios se fornecidos
    const requiredUtm = ["name", "utm_source", "utm_medium", "utm_campaign"]
    for (const field of requiredUtm) {
      if (field in updateData && !updateData[field]) {
        throw new AppError(`Campo '${field}' nao pode ser vazio`, 400)
      }
    }

    // Validar sem espacos nos valores UTM
    const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
    for (const key of utmKeys) {
      const val = updateData[key]
      if (typeof val === "string" && val.includes(" ")) {
        throw new AppError(`Campo '${key}' nao pode conter espacos`, 400)
      }
    }

    const { data: template, error } = await admin
      .from("utm_templates")
      .update(updateData)
      .eq("id", templateId)
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        throw new AppError(
          "Ja existe um template ativo com mesmos source, medium e campaign nesta loja",
          409
        )
      }
      log.error("Failed to update utm_template", { templateId, error: error.message })
      throw new AppError("Failed to update template", 500)
    }

    return Response.json({ success: true, template })
  } catch (error) {
    return errorResponse(request, error, "PATCH /api/stores/[id]/utm-templates/[templateId]")
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/stores/[id]/utm-templates/[templateId]
// Soft delete: is_active = false, deleted_at = now()
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: storeId, templateId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new AppError("Unauthorized", 401)

    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Validar que store pertence a org
    const { data: store } = await admin
      .from("client_stores")
      .select("id")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .single()

    if (!store) throw new AppError("Store not found", 404)

    // Validar que template pertence a loja e org
    const { data: existing } = await admin
      .from("utm_templates")
      .select("id")
      .eq("id", templateId)
      .eq("store_id", storeId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .single()

    if (!existing) throw new AppError("Template not found", 404)

    // Soft delete
    const { error } = await admin
      .from("utm_templates")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq("id", templateId)

    if (error) {
      log.error("Failed to soft-delete utm_template", { templateId, error: error.message })
      throw new AppError("Failed to delete template", 500)
    }

    return Response.json({ success: true })
  } catch (error) {
    return errorResponse(request, error, "DELETE /api/stores/[id]/utm-templates/[templateId]")
  }
}
