import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all onboarding templates with steps
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401, headers: corsHeaders(request.headers.get("origin")) })
    }

    const searchParams = request.nextUrl.searchParams
    const includeSteps = searchParams.get("include_steps") !== "false"

    const { data: templates, error } = await supabase
      .from("onboarding_templates")
      .select(includeSteps ? `
        *,
        steps:onboarding_template_steps(*)
      ` : "*")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })

    if (error) {
      console.error("[Templates] Error fetching:", error)
      return NextResponse.json({ error: "Erro ao buscar templates" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
    }

    // Sort steps by position if included
    interface TemplateWithSteps {
      steps?: Array<{ position: number }>
      [key: string]: unknown
    }
    const sortedTemplates = ((templates || []) as unknown as TemplateWithSteps[]).map(template => {
      if (template.steps) {
        return {
          ...template,
          steps: template.steps.sort((a, b) => a.position - b.position)
        }
      }
      return template
    })

    return NextResponse.json({ templates: sortedTemplates }, { headers: corsHeaders(request.headers.get("origin")) })
  } catch (error) {
    console.error("[Templates] Error:", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500, headers: corsHeaders(request.headers.get("origin")) })
  }
}
