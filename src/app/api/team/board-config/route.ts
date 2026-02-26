import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"
import { logger } from "@/lib/logger"
import { getDefaultsForRole } from "@/lib/services/board-config-defaults"
import { z } from "zod"
import type { OrgRole } from "@/types"

const log = logger.child("BoardConfig")

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

// GET - Buscar config do board de um membro
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const searchParams = request.nextUrl.searchParams
    const orgMemberId = searchParams.get("org_member_id")

    if (!orgMemberId) {
      throw new AppError("org_member_id é obrigatório", 400)
    }

    // Verificar se o usuário pertence à mesma org
    const { data: targetMember } = await supabase
      .from("org_members")
      .select("id, org_id, role")
      .eq("id", orgMemberId)
      .single()

    if (!targetMember) {
      throw new AppError("Membro não encontrado", 404)
    }

    const { data: userMembership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("profile_id", user.id)
      .eq("org_id", targetMember.org_id)
      .single()

    if (!userMembership) {
      throw new AppError("Acesso negado", 403)
    }

    // Buscar config existente
    const { data: config } = await supabase
      .from("board_config")
      .select("*")
      .eq("org_member_id", orgMemberId)
      .single()

    if (config) {
      return successResponse(request, { config, is_default: false })
    }

    // Se não existe, retornar defaults baseados na role
    const defaults = getDefaultsForRole(targetMember.role as OrgRole)
    return successResponse(request, {
      config: {
        org_member_id: orgMemberId,
        org_id: targetMember.org_id,
        ...defaults,
      },
      is_default: true,
    })
  } catch (error) {
    return errorResponse(request, error, "board-config.get")
  }
}

const boardConfigSchema = z.object({
  org_member_id: z.string().uuid(),
  show_onboarding_tasks: z.boolean(),
  show_meeting_tasks: z.boolean(),
  show_campaign_tasks: z.boolean(),
  show_feedback_tasks: z.boolean(),
  show_report_tasks: z.boolean(),
  show_contract_tasks: z.boolean(),
  show_manual_tasks: z.boolean().optional().default(true),
  calendar_view_mode: z.enum(["daily", "weekly", "monthly"]).optional().default("monthly"),
  show_personal_events: z.boolean().optional().default(true),
})

// PUT - Criar ou atualizar config do board
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    const validated = boardConfigSchema.parse(body)

    // Verificar permissão: deve ser da mesma org + ser admin/manager ou o próprio membro
    const { data: targetMember } = await supabase
      .from("org_members")
      .select("id, org_id, profile_id, role")
      .eq("id", validated.org_member_id)
      .single()

    if (!targetMember) {
      throw new AppError("Membro não encontrado", 404)
    }

    const { data: userMembership } = await supabase
      .from("org_members")
      .select("id, org_id, role, profile_id")
      .eq("profile_id", user.id)
      .eq("org_id", targetMember.org_id)
      .single()

    if (!userMembership) {
      throw new AppError("Acesso negado", 403)
    }

    // Apenas admins/managers ou o próprio membro podem editar
    const isOrgAdmin = userMembership.role === "owner" || userMembership.role === "manager"
    const isSelf = userMembership.id === validated.org_member_id
    if (!isOrgAdmin && !isSelf) {
      throw new AppError("Apenas administradores ou o próprio membro podem alterar a configuração do board", 403)
    }

    // Upsert
    const configData = {
      org_member_id: validated.org_member_id,
      org_id: targetMember.org_id,
      show_onboarding_tasks: validated.show_onboarding_tasks,
      show_meeting_tasks: validated.show_meeting_tasks,
      show_campaign_tasks: validated.show_campaign_tasks,
      show_feedback_tasks: validated.show_feedback_tasks,
      show_report_tasks: validated.show_report_tasks,
      show_contract_tasks: validated.show_contract_tasks,
      show_manual_tasks: validated.show_manual_tasks,
      calendar_view_mode: validated.calendar_view_mode,
      show_personal_events: validated.show_personal_events,
    }

    const { data: config, error } = await supabase
      .from("board_config")
      .upsert(configData, { onConflict: "org_member_id" })
      .select()
      .single()

    if (error) {
      log.error("Erro ao salvar board_config", { error })
      throw new AppError("Erro ao salvar configuração", 500)
    }

    log.info("Board config salva", {
      org_member_id: validated.org_member_id,
      updated_by: user.id,
    })

    return successResponse(request, { config })
  } catch (error) {
    return errorResponse(request, error, "board-config.put")
  }
}
