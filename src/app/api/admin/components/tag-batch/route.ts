/**
 * POST /api/admin/components/tag-batch
 *
 * Batch de sincronização do Taguedor: processa até `limit` (default 3,
 * máx 5) variantes ativas que nunca passaram pelo taguedor
 * (tagging_status IS NULL, com output_schema). Cada chamada cabe no
 * maxDuration — a UI chama em loop até remaining=0. Tudo vira proposta
 * PENDENTE; nada é aprovado automaticamente.
 *
 * Body: { limit?: number, exclude_ids?: string[] }
 * (exclude_ids = variantes que já falharam no loop da UI — evita re-tentar
 * uma variante quebrada pra sempre e travar a fila.)
 * Resposta: { processed[], failed[], remaining }
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
} from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { logger } from "@/lib/logger"
import { tagPendingBatch } from "@/lib/services/component-tagger.service"

const log = logger.child("ComponentTagBatch")

export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  limit: z.number().int().min(1).max(5).optional(),
  exclude_ids: z.array(z.string().uuid()).max(500).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const parsed = bodySchema.parse(await request.json().catch(() => ({})))
    const result = await tagPendingBatch(
      parsed.limit ?? 3,
      parsed.exclude_ids ?? [],
    )

    log.info("tag-batch.done", {
      processed: result.processed.length,
      failed: result.failed.length,
      remaining: result.remaining,
    })
    return successResponse(request, result)
  } catch (error) {
    log.error("tag-batch.post", error)
    return errorResponse(request, error, "component-tag-batch")
  }
}
