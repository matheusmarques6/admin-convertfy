/**
 * POST /api/admin/stores/[id]/preview-html-vars
 *
 * Resolve e retorna as 20 vars que `buildHtmlPromptVars` injeta no
 * HTML Agent v2 — sem rodar o LLM. Util pra debug na aba "Testar" do
 * /admin/settings/email-generation.
 *
 * Body: { emailId }
 *
 * Retorno:
 *   { vars: Record<string,string>, meta: { flowType, emailNumber } }
 */

import { NextRequest } from "next/server"
import { z } from "zod"

import {
  createAdminClient,
  createClient,
} from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { buildHtmlPromptVars } from "@/lib/agents/html/build-vars"
import type {
  EmailBlueprint,
} from "@/types/email-generation"
import type {
  StoreBrandIdentity,
  StoreBriefing,
  TopProduct,
} from "@/types/email-workspace"

const log = logger.child("PreviewHtmlVars")

export const dynamic = "force-dynamic"
export const maxDuration = 30

const bodySchema = z.object({
  emailId: z.string().uuid(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)

    const body = await request.json()
    const { emailId } = bodySchema.parse(body)

    const admin = createAdminClient()

    // Resolve flow_type + email_number do email
    const { data: emailRow } = await admin
      .from("email_flow_emails")
      .select("email_number, flow_id")
      .eq("id", emailId)
      .maybeSingle()

    if (!emailRow) {
      return errorResponse(
        request,
        new Error("email não encontrado"),
        "preview-html-vars",
      )
    }

    const flowId = emailRow.flow_id as string | null
    const emailNumber = (emailRow.email_number as number | null) ?? null

    let flowType: string | null = null
    if (flowId) {
      const { data: flowRow } = await admin
        .from("email_flows")
        .select("flow_type")
        .eq("id", flowId)
        .maybeSingle()
      flowType = (flowRow?.flow_type as string | undefined) ?? null
    }

    // Carrega context base em paralelo
    const [storeRes, brandRes, briefingRes, blueprintRes, topProductsRes] =
      await Promise.all([
        admin.from("client_stores").select("*").eq("id", storeId).maybeSingle(),
        admin
          .from("store_brand_identities")
          .select("*")
          .eq("store_id", storeId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("store_briefings")
          .select("*")
          .eq("store_id", storeId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        flowType && emailNumber != null
          ? admin
              .from("email_blueprints")
              .select("*")
              .eq("flow_type", flowType)
              .eq("email_number", emailNumber)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        admin
          .from("store_brand_identities")
          .select("top_products")
          .eq("store_id", storeId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    const vars = await buildHtmlPromptVars({
      emailId,
      brand: (brandRes.data as StoreBrandIdentity | null) ?? null,
      briefing: (briefingRes.data as StoreBriefing | null) ?? null,
      blueprint: (blueprintRes.data as EmailBlueprint | null) ?? null,
      topProducts:
        ((topProductsRes.data?.top_products as TopProduct[] | undefined) ?? []),
      storeRaw: (storeRes.data as Record<string, unknown>) ?? {},
      flowType,
      emailNumber,
      admin,
    })

    log.info("preview-html-vars.success", {
      storeId,
      emailId,
      flowType,
      emailNumber,
      varCount: Object.keys(vars).length,
    })

    return successResponse(request, {
      vars,
      meta: { flowType, emailNumber },
    })
  } catch (error) {
    log.error("preview-html-vars.error", error)
    return errorResponse(request, error, "preview-html-vars")
  }
}
