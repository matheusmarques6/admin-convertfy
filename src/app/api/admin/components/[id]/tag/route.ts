/**
 * POST /api/admin/components/[id]/tag
 *
 * Roda o Taguedor de Variantes em UMA variante: converte o HTML "exemplo
 * pronto" em html_tagged ({{UPPER(key)}} do output_schema) e salva como
 * proposta PENDENTE (tagging_status='pending') com o relatório por campo.
 * A aprovação é humana, via PATCH da variante (aba Componentes).
 *
 * PATCH /api/admin/components/[id]/tag
 * Body { action: "approve" | "reject", html_tagged?: string }
 *  - approve: (opcionalmente com o html_tagged editado na revisão) →
 *    tagging_status='approved' — o pipeline passa a consumir.
 *  - reject: limpa a proposta (volta a NULL; re-rodar quando quiser).
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  NotFoundError,
  ValidationError,
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import { tagComponentVariant } from "@/lib/services/component-tagger.service"

const log = logger.child("ComponentTagRoute")

export const dynamic = "force-dynamic"
// GLM reasoning numa variante grande pode passar de 120s.
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const result = await tagComponentVariant(id)
    return successResponse(request, result)
  } catch (error) {
    log.error("component-tag.post", error)
    return errorResponse(request, error, "component-tag-post")
  }
}

const patchSchema = z.object({
  action: z.enum(["approve", "reject"]),
  // Edição manual da proposta antes de aprovar (revisão do designer).
  html_tagged: z.string().min(1).optional(),
})

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = patchSchema.parse(await request.json())

    const { data: row } = await admin
      .from("email_component_variants")
      .select("id, tagging_status, html_tagged")
      .eq("id", id)
      .maybeSingle()
    if (!row) throw new NotFoundError("Variante")

    if (parsed.action === "approve") {
      const html = parsed.html_tagged ?? (row.html_tagged as string | null)
      if (!html?.trim()) {
        throw new ValidationError(
          "Nada pra aprovar — rode o taguedor primeiro (POST) ou envie html_tagged.",
        )
      }
      const { error } = await admin
        .from("email_component_variants")
        .update({
          html_tagged: html,
          tagging_status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
      if (error) throw error
      return successResponse(request, { id, tagging_status: "approved" })
    }

    const { error } = await admin
      .from("email_component_variants")
      .update({
        html_tagged: null,
        tagging_status: null,
        tagging_meta: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (error) throw error
    return successResponse(request, { id, tagging_status: null })
  } catch (error) {
    log.error("component-tag.patch", error)
    return errorResponse(request, error, "component-tag-patch")
  }
}
