/**
 * POST /api/admin/campaign-central/suggestions
 *
 * Cria campanha MANUAL (modal "Nova campanha"). Entra direto como
 * approved + item no Kanban — o COO criou, então já aprovou (mockup:
 * "entra na fila como aprovada por você").
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  parseAndValidate,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { getUserOrgRole } from "@/lib/api/onboarding-permissions"
import { manualSuggestionSchema } from "@/lib/validations/campaign-central"
import { approveSuggestion } from "@/lib/services/campaign-central/suggestion-approval.service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await getUserOrgRole(user.id)
    if (!ctx) return errorResponse(request, new Error("Sem org membership"), "suggestions:post")

    const body = await parseAndValidate(request, manualSuggestionSchema)
    const admin = createAdminClient()

    // Valida targets contra lojas reais da org
    const storeIds = body.targets.map((t) => t.store_id)
    const { data: stores, error: storesErr } = await admin
      .from("client_stores")
      .select("id, store_name, country")
      .eq("org_id", ctx.orgId)
      .in("id", storeIds)
    if (storesErr) throw storesErr

    const validById = new Map((stores ?? []).map((s) => [s.id as string, s]))
    const targets = body.targets
      .filter((t) => validById.has(t.store_id))
      .map((t) => {
        const s = validById.get(t.store_id)!
        return {
          store_id: t.store_id,
          store_name: (s.store_name as string) ?? t.store_name,
          country: ((s.country as string) || t.country || "BR").toUpperCase().slice(0, 2),
        }
      })

    if (targets.length === 0) {
      return errorResponse(
        request,
        new Error("Nenhuma loja-alvo válida"),
        "suggestions:post",
      )
    }

    // Ancora no ciclo corrente (se existir) pra aparecer na tela
    const { data: cycle } = await admin
      .from("campaign_cycles")
      .select("id")
      .eq("org_id", ctx.orgId)
      .in("status", ["ready", "partial", "generating"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: suggestion, error: insertErr } = await admin
      .from("campaign_suggestions")
      .insert({
        org_id: ctx.orgId,
        cycle_id: cycle?.id ?? null,
        source: "manual",
        status: "suggested", // approveSuggestion transiciona pra approved
        type: body.type,
        title: body.title,
        confidence: null,
        trigger: {
          label: "Criada manualmente",
          detail: body.briefing?.slice(0, 140) || "Campanha avulsa do COO",
          source: "manual",
        },
        angle: body.briefing ?? null,
        subject: null,
        channel: body.channel,
        targets,
        target_summary: `${targets.length} loja${targets.length > 1 ? "s" : ""}`,
        send_date: body.send_date ?? null,
        created_by: user.id,
      })
      .select("id")
      .single()
    if (insertErr) throw insertErr

    const { pipeline_item_id } = await approveSuggestion({
      suggestionId: suggestion.id as string,
      orgId: ctx.orgId,
      userId: user.id,
    })

    return successResponse(request, {
      suggestion_id: suggestion.id,
      pipeline_item_id,
      status: "approved",
    })
  } catch (error) {
    return errorResponse(request, error, "suggestions:post")
  }
}
