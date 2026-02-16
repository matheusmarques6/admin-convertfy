import { NextRequest, NextResponse } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { corsHeaders, handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"

const log = logger.child("OnboardingTemplates")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}





// GET - List all onboarding templates with steps
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

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
      log.error("[Templates] Error fetching:", error)
      throw new AppError("Erro ao buscar templates", 500)
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

    return successResponse(request, { templates: sortedTemplates })
  } catch (error) {
    return errorResponse(request, error, "OnboardingTemplates")
  }
}
