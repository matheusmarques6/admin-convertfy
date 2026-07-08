/**
 * GET /api/tasks/[id]/campaign-uploads/slice?store_id=<uuid>&port_id=<id>
 *
 * Baixa UMA fatia (porta) do email da loja como PNG, cortada nas frações
 * do mapa aprovado aplicadas à altura REAL da imagem da loja (medida no
 * buffer com sharp — a exibição no modal usa CSS crop, o arquivo é
 * gerado aqui no servidor, sem canvas/CORS).
 *
 * Sem efeito de escrita: o client PATCHa downloaded_ports após o download.
 * Exige mapa APPROVED (409 — o gate do modal já bloqueia antes).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { getCutMap } from "@/lib/services/campaign-central/campaign-cut-map.service"
import { getStoreEmailWithName } from "@/lib/services/campaign-central/campaign-store-email.service"
import { sliceStoreEmailPorts } from "@/lib/services/campaign-central/campaign-email-slice.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const querySchema = z.object({
  store_id: z.string().uuid(),
  port_id: z.string().min(1).max(64),
  /** inline=1 → exibir no <img> do modal (preview = PNG real, sem CSS crop). */
  inline: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const ctx = await requireTaskAccess(user.id, id, "read")

    const { source_type, source_id } = ctx.task
    if (source_type !== "campaign_suggestion" || !source_id) {
      throw new AppError("Task não é de campanha", 400)
    }

    const parsed = querySchema.safeParse({
      store_id: request.nextUrl.searchParams.get("store_id"),
      port_id: request.nextUrl.searchParams.get("port_id"),
      inline: request.nextUrl.searchParams.get("inline") ?? undefined,
    })
    if (!parsed.success) throw new AppError("Parâmetros inválidos", 400)

    const { map } = await getCutMap(source_id, ctx.member.orgId)
    if (!map || map.status !== "approved") {
      throw new AppError("Mapa de cortes ainda não aprovado", 409)
    }

    const { row, storeName } = await getStoreEmailWithName(
      source_id,
      ctx.member.orgId,
      parsed.data.store_id,
    )

    const slices = await sliceStoreEmailPorts(map, row, storeName, {
      portIds: [parsed.data.port_id],
    })
    const slice = slices[0]

    const ab = slice.buffer.buffer.slice(
      slice.buffer.byteOffset,
      slice.buffer.byteOffset + slice.buffer.byteLength,
    ) as ArrayBuffer

    const isInline = parsed.data.inline === "1"
    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename="${slice.filename}"`,
        "Content-Length": String(ab.byteLength),
        // Inline (preview do modal): cache curto no browser — o client põe
        // ?v=<updated_at> na URL, então imagem/mapa novos furam o cache.
        "Cache-Control": isInline ? "private, max-age=300" : "no-store",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads:slice")
  }
}
