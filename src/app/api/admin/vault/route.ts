/**
 * GET  /api/admin/vault — estado do conhecimento sincronizado, para a aba
 *      "Conhecimento" do hub: sync state, últimas runs do sync (com as notas
 *      puladas e o motivo), e o material ativo agrupado por flow.
 * POST /api/admin/vault — sincronização manual (botão "Sincronizar agora";
 *      `force: true` re-sincroniza mesmo sem commit novo).
 *
 * Auth: canManagePrompts (admin/owner OU tag `dev`) — mesmo gate do hub.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { syncVault } from "@/lib/vault/vault-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("AdminVaultRoute")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const [stateRes, runsRes, intentsRes, refsRes, learningsRes] = await Promise.all([
      admin.from("vault_sync_state").select("*").eq("id", "default").maybeSingle(),
      admin.from("vault_sync_runs").select("*").order("created_at", { ascending: false }).limit(10),
      admin.from("email_intents")
        .select("id, flow_type, kind, email_number, slug, status, is_active, updated_at")
        .order("flow_type").order("email_number", { ascending: true, nullsFirst: true }),
      admin.from("email_structure_refs")
        .select("id, flow_type, slug, emails, escopo, amostra, procedencia, secoes, secoes_normalizadas, status, is_active, updated_at")
        .order("flow_type").order("slug"),
      admin.from("email_learnings")
        .select("id, flow_type, slug, aplica_a, origem_estrutura, autor, status, is_active, updated_at")
        .order("flow_type", { nullsFirst: true }).order("slug"),
    ])

    return successResponse(request, {
      state: stateRes.data ?? null,
      runs: runsRes.data ?? [],
      intents: intentsRes.data ?? [],
      structure_refs: refsRes.data ?? [],
      learnings: learningsRes.data ?? [],
      configured: Boolean(process.env.VAULT_REPO && process.env.VAULT_GITHUB_TOKEN),
    })
  } catch (error) {
    log.error("GET vault error", error)
    return errorResponse(request, error, "admin-vault-get")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = (await request.json().catch(() => ({}))) as { force?: boolean }
    const result = await syncVault({ trigger: "manual", force: body.force === true })
    return successResponse(request, result)
  } catch (error) {
    log.error("POST vault sync error", error)
    return errorResponse(request, error, "admin-vault-sync")
  }
}
