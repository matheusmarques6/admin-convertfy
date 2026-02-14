import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// POST - Webhook endpoint for n8n to send store analysis results
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret (will be configured later)
    const webhookSecret = request.headers.get("X-Webhook-Secret")
    const expectedSecret = process.env.ONBOARDING_WEBHOOK_SECRET

    // For now, if no secret is configured, allow requests (dev mode)
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() })
    }

    const body = await request.json()

    // Expected payload from n8n:
    // {
    //   onboarding_id: "uuid",
    //   type: "store_analysis" | "copies_generated",
    //   data: { ... }
    // }

    if (!body.onboarding_id || !body.type || !body.data) {
      return NextResponse.json(
        { error: "Campos obrigatórios: onboarding_id, type, data" },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminClient = createAdminClient()

    if (body.type === "store_analysis") {
      // Update store_analysis field
      const { error } = await adminClient
        .from("client_onboardings")
        .update({ store_analysis: body.data })
        .eq("id", body.onboarding_id)

      if (error) {
        console.error("[Webhook] Update error:", error)
        return NextResponse.json({ error: "Erro ao salvar análise" }, { status: 500, headers: corsHeaders() })
      }

      // If there's a step for "Análise da Loja", mark it as completed
      await adminClient
        .from("client_onboarding_steps")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          notes: "Análise concluída via n8n",
        })
        .eq("onboarding_id", body.onboarding_id)
        .ilike("name", "%Análise da Loja%")

      return NextResponse.json({
        success: true,
        message: "Análise da loja salva com sucesso",
      }, { headers: corsHeaders() })
    }

    if (body.type === "copies_generated") {
      // Update generated_copies field
      const { error } = await adminClient
        .from("client_onboardings")
        .update({ generated_copies: body.data })
        .eq("id", body.onboarding_id)

      if (error) {
        console.error("[Webhook] Update error:", error)
        return NextResponse.json({ error: "Erro ao salvar copies" }, { status: 500, headers: corsHeaders() })
      }

      return NextResponse.json({
        success: true,
        message: "Copies geradas e salvas com sucesso",
      }, { headers: corsHeaders() })
    }

    return NextResponse.json(
      { error: "Tipo de webhook não suportado" },
      { status: 400, headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Webhook] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
