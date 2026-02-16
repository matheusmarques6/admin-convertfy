import { NextRequest, NextResponse } from "next/server"
import { errorResponse, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("CampaignsHistory")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
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
      throw new AppError("Não autorizado", 401)
    }

    const { id } = await params

    // Verify campaign exists
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", id)
      .single()

    if (fetchError || !campaign) {
      throw new AppError("Campanha não encontrada", 404)
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
      log.error("[Campaigns] History error:", historyError)
      throw new AppError("Erro ao buscar histórico", 500)
    }

    // Transform changer from array to single object
    const transformedHistory = (history || []).map(h => ({
      ...h,
      changer: Array.isArray(h.changer) ? h.changer[0] : h.changer
    }))

    return NextResponse.json({
      campaign: { id: campaign.id, name: campaign.name },
      history: transformedHistory,
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    return errorResponse(request, error, "CampaignsHistory")
  }
}
