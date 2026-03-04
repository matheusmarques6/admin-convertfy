import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { errorResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("UtmTemplatesAPI")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUtmUrl(
  storeUrl: string | null,
  template: {
    utm_source: string
    utm_medium: string
    utm_campaign: string
    utm_content?: string | null
    utm_term?: string | null
  }
): string | null {
  if (!storeUrl) return null

  try {
    const url = new URL(storeUrl.replace(/\/+$/, ""))
    url.searchParams.set("utm_source", template.utm_source)
    url.searchParams.set("utm_medium", template.utm_medium)
    url.searchParams.set("utm_campaign", template.utm_campaign)
    if (template.utm_content) url.searchParams.set("utm_content", template.utm_content)
    if (template.utm_term) url.searchParams.set("utm_term", template.utm_term)
    return url.toString()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// GET /api/stores/[id]/utm-templates
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new AppError("Unauthorized", 401)

    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    // Validar acesso a loja
    const { data: store } = await admin
      .from("client_stores")
      .select("id, store_url")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .single()

    if (!store) throw new AppError("Store not found", 404)

    // Buscar templates (RLS filtra deleted_at IS NULL, mas usamos admin, entao filtrar manualmente)
    const { data: templates, error } = await admin
      .from("utm_templates")
      .select("*")
      .eq("store_id", storeId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (error) {
      log.error("Failed to fetch utm_templates", { storeId, error: error.message })
      throw new AppError("Failed to fetch templates", 500)
    }

    const templatesWithUrl = (templates || []).map((t) => ({
      ...t,
      generatedUrl: generateUtmUrl(store.store_url, t),
    }))

    return Response.json({ success: true, templates: templatesWithUrl })
  } catch (error) {
    return errorResponse(request, error, "GET /api/stores/[id]/utm-templates")
  }
}

// ---------------------------------------------------------------------------
// POST /api/stores/[id]/utm-templates
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: storeId } = await params
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
      .select("id, store_url")
      .eq("id", storeId)
      .eq("org_id", orgId)
      .single()

    if (!store) throw new AppError("Store not found", 404)

    let body
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { name, description, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = body

    // Validar campos obrigatorios
    if (!name?.trim()) throw new AppError("Campo 'name' e obrigatorio", 400)
    if (!utm_source?.trim()) throw new AppError("Campo 'utm_source' e obrigatorio", 400)
    if (!utm_medium?.trim()) throw new AppError("Campo 'utm_medium' e obrigatorio", 400)
    if (!utm_campaign?.trim()) throw new AppError("Campo 'utm_campaign' e obrigatorio", 400)

    // Validar que nao tem espacos nos valores UTM
    const utmFields = { utm_source, utm_medium, utm_campaign, utm_content, utm_term }
    for (const [key, value] of Object.entries(utmFields)) {
      if (value && typeof value === "string" && value.trim().includes(" ")) {
        throw new AppError(`Campo '${key}' nao pode conter espacos`, 400)
      }
    }

    // Inserir template (trim nos valores, preservar case original)
    const { data: template, error } = await admin
      .from("utm_templates")
      .insert({
        org_id: orgId,
        store_id: storeId,
        name: name.trim(),
        description: description?.trim() || null,
        utm_source: utm_source.trim(),
        utm_medium: utm_medium.trim(),
        utm_campaign: utm_campaign.trim(),
        utm_content: utm_content?.trim() || null,
        utm_term: utm_term?.trim() || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      // Unique constraint violation
      if (error.code === "23505") {
        throw new AppError(
          "Ja existe um template ativo com mesmos source, medium e campaign nesta loja",
          409
        )
      }
      log.error("Failed to create utm_template", { storeId, error: error.message })
      throw new AppError("Failed to create template", 500)
    }

    return Response.json(
      {
        success: true,
        template: {
          ...template,
          generatedUrl: generateUtmUrl(store.store_url, template),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(request, error, "POST /api/stores/[id]/utm-templates")
  }
}
