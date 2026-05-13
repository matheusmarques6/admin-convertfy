/**
 * GET /api/forms/[token]
 *
 * Endpoint público (sem auth) que carrega o contexto do formulário
 * de onboarding por token. Retorna nome do cliente, da loja e estado
 * atual (form respondido? briefing aprovado?).
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params
    const admin = createAdminClient()
    const { data: onb, error } = await admin
      .from("onboardings")
      .select(
        `id, briefing_status, form_responses, briefing,
         briefing_confirmed_by_client, form_submitted_at,
         client:clients(id, name, company),
         store:client_stores(id, store_name, store_url, platform)`,
      )
      .eq("form_token", token)
      .maybeSingle()
    if (error) throw error
    if (!onb) {
      return NextResponse.json(
        { error: "Token inválido ou expirado" },
        { status: 404 },
      )
    }
    return NextResponse.json({ success: true, onboarding: onb })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}
