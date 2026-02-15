import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all stores with client info for campaign targeting
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const searchParams = request.nextUrl.searchParams
    const language = searchParams.get("language")
    const clientId = searchParams.get("client_id")
    const activeOnly = searchParams.get("active_only") !== "false" // Default true

    // Build query - select stores with client info
    let query = supabase
      .from("client_stores")
      .select(`
        id,
        store_name,
        platform,
        store_url,
        is_active,
        language,
        client_id,
        client:clients(
          id,
          name,
          company,
          email
        )
      `)
      .order("store_name")

    // Apply filters
    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    if (language) {
      query = query.eq("language", language)
    }

    if (clientId) {
      query = query.eq("client_id", clientId)
    }

    const { data: stores, error } = await query

    if (error) {
      console.error("[Admin Stores] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar lojas" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Get unique languages for quick filters
    const { data: languages } = await supabase
      .from("client_stores")
      .select("language")
      .eq("is_active", true)
      .not("language", "is", null)

    const uniqueLanguages = Array.from(new Set(languages?.map(l => l.language).filter(Boolean)))

    // Count stores by language
    const languageCounts: Record<string, number> = {}
    stores?.forEach(store => {
      const lang = store.language || "pt-BR"
      languageCounts[lang] = (languageCounts[lang] || 0) + 1
    })

    return NextResponse.json({
      stores: stores || [],
      totalCount: stores?.length || 0,
      languages: uniqueLanguages,
      languageCounts,
    }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    console.error("[Admin Stores] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
