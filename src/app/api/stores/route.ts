import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// CORS headers
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

// GET - List all stores with client info
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const clientId = searchParams.get("client_id")
    const activeOnly = searchParams.get("active") === "true"

    let query = supabase
      .from("client_stores")
      .select(`
        *,
        client:clients(id, name, company, email)
      `)
      .order("store_name")

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: stores, error } = await query

    if (error) {
      console.error("[Stores] Error fetching stores:", error)
      return NextResponse.json(
        { error: "Erro ao buscar lojas" },
        { status: 500, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      { stores: stores || [] },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error("[Stores] Error:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
