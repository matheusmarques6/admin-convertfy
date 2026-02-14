import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// GET - Get campaign history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() }
      )
    }

    const { id } = await params

    // Verify campaign exists
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      return NextResponse.json(
        { error: "Campanha não encontrada" },
        { status: 404, headers: corsHeaders() }
      )
    }

    // Get history with changer info
    const { data: history, error: historyError } = await supabase
      .from("campaign_history")
      .select(`
        *,
        changer:profiles!campaign_history_changed_by_fkey(id, name, email, avatar_url)
      `)
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })

    if (historyError) {
      console.error("[Campaigns] History error:", historyError)
      return NextResponse.json(
        { error: "Erro ao buscar histórico" },
        { status: 500, headers: corsHeaders() }
      )
    }

    // Transform changer from array to single object
    const transformedHistory = (history || []).map(h => ({
      ...h,
      changer: Array.isArray(h.changer) ? h.changer[0] : h.changer
    }))

    return NextResponse.json({
      campaign: { id: campaign.id, name: campaign.name },
      history: transformedHistory,
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Campaigns] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
