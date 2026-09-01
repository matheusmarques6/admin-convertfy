/**
 * GET /api/ai/convertia/bootstrap?workspace=operacional|comercial
 *
 * Payload único que a tela da ConvertIA carrega: conversas do usuário
 * (do workspace), lojas ativas com a DISPONIBILIDADE de cada conector
 * built-in (credencial presente? — sem descriptografar nada), skills e
 * servidores MCP externos da org. Uma rota só porque o composer
 * precisa de tudo isso junto pra montar os menus.
 */

import { NextRequest } from "next/server"
import { withTiming } from "@/lib/api/with-timing"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

export const dynamic = "force-dynamic"

const MISSING_SCHEMA = new Set(["42P01", "PGRST205", "42703"])

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()
    const workspace = request.nextUrl.searchParams.get("workspace") === "comercial"
      ? "comercial"
      : "operacional"

    const [convResp, storesResp, skillsResp, mcpResp, profileResp] = await Promise.all([
      admin
        .from("ai_chat_conversations")
        .select("id, title, context, last_message_at, created_at")
        .eq("user_id", user.id)
        .contains("context", { source: "convertia", workspace })
        .order("last_message_at", { ascending: false })
        .limit(50),
      admin
        .from("client_stores")
        .select(
          "id, store_name, shopify_access_token, shopify_store_domain, omnisend_api_key, klaviyo_api_key, email_platform",
        )
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("store_name")
        .limit(300),
      admin
        .from("ai_skills")
        .select("id, name, description, icon, workspace, is_active")
        .eq("org_id", orgId)
        .in("workspace", [workspace, "geral"])
        .order("created_at", { ascending: true }),
      admin
        .from("ai_mcp_servers")
        .select("id, name, url, store_id, is_active, allow_write, tool_count, last_status, last_checked_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true }),
      admin.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    ])

    // Skills/MCP degradam com aviso quando a migration 20261090 não rodou
    const schemaMissing: string[] = []
    const skills = skillsResp.error
      ? (MISSING_SCHEMA.has(skillsResp.error.code) ? (schemaMissing.push("ai_skills"), []) : [])
      : (skillsResp.data ?? [])
    const mcpServers = mcpResp.error
      ? (MISSING_SCHEMA.has(mcpResp.error.code) ? (schemaMissing.push("ai_mcp_servers"), []) : [])
      : (mcpResp.data ?? [])

    const stores = (storesResp.data ?? []).map((s) => ({
      id: s.id,
      name: s.store_name,
      connectors: {
        shopify: Boolean(s.shopify_access_token && s.shopify_store_domain),
        omnisend: Boolean(s.omnisend_api_key),
        klaviyo: Boolean(s.klaviyo_api_key),
      },
    }))

    return successResponse(request, {
      user_name: profileResp.data?.name ?? null,
      conversations: convResp.data ?? [],
      stores,
      skills,
      mcp_servers: mcpServers,
      schema_missing: schemaMissing,
    })
  } catch (error) {
    return errorResponse(request, error, "convertia-bootstrap")
  }
}

export const GET = withTiming("ai/convertia/bootstrap", handleGet)
