import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { completeTaskWithHandoff } from "@/lib/services/onboarding-task-completion.service"
import { attemptCampaignDesignHandoffForTask } from "@/lib/services/campaign-central/campaign-design-trigger.service"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const access = await requireTaskAccess(user.id, id, "work")
    const result = await completeTaskWithHandoff({
      task: access.task as unknown as Parameters<
        typeof completeTaskWithHandoff
      >[0]["task"],
      actorId: user.id,
    })

    // Dispatcher de design de campanha (non-blocking): avanca o pipeline de
    // design quando a task concluida pertence a uma campanha. No-op caso
    // contrario.
    try {
      await attemptCampaignDesignHandoffForTask({ taskId: id, actorId: user.id })
    } catch (campaignErr) {
      console.error("Campaign design handoff failed (non-blocking):", campaignErr)
    }

    return successResponse(request, {
      task: result.task,
      already_done: result.alreadyDone,
      handoff: result.handoff,
    })
  } catch (error) {
    return errorResponse(request, error, "task-complete")
  }
}
