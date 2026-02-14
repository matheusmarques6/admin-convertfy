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

// GET - List all available features from catalog
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders() })
    }

    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get("category")
    const activeOnly = searchParams.get("active_only") !== "false"

    let query = supabase
      .from("features_catalog")
      .select("*")
      .order("sort_order", { ascending: true })

    if (category) {
      query = query.eq("category", category)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: features, error } = await query

    if (error) {
      console.error("[Features] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar features" }, { status: 500, headers: corsHeaders() })
    }

    // Group features by category
    const grouped = (features || []).reduce((acc, feature) => {
      if (!acc[feature.category]) {
        acc[feature.category] = []
      }
      acc[feature.category].push(feature)
      return acc
    }, {} as Record<string, typeof features>)

    return NextResponse.json({
      features: features || [],
      grouped,
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error("[Features] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders() })
  }
}
