/**
 * GET /api/tasks/[id]/campaign-uploads/download-zip?store_id=<uuid>
 *
 * Todas as fatias (portas) do email da loja num único .zip — o buffer da
 * imagem é baixado UMA vez e fatiado com sharp
 * (sliceStoreEmailPorts). Espelha campaign-images/download-zip.
 *
 * Sem efeito de escrita: o client PATCHa downloaded_ports após o download.
 */

import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth } from "@/lib/api/errors"
import { requireTaskAccess } from "@/lib/api/onboarding-task-access"
import { getCutMap } from "@/lib/services/campaign-central/campaign-cut-map.service"
import { getStoreEmailWithName } from "@/lib/services/campaign-central/campaign-store-email.service"
import {
  sanitizeFilename,
  sliceStoreEmailPorts,
} from "@/lib/services/campaign-central/campaign-email-slice.service"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_TOTAL_BYTES = 60 * 1024 * 1024 // 60 MB

const querySchema = z.object({ store_id: z.string().uuid() })

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
    })
    if (!parsed.success) throw new AppError("store_id inválido", 400)

    const { map } = await getCutMap(source_id, ctx.member.orgId)
    if (!map || map.status !== "approved") {
      throw new AppError("Mapa de cortes ainda não aprovado", 409)
    }

    const { row, storeName } = await getStoreEmailWithName(
      source_id,
      ctx.member.orgId,
      parsed.data.store_id,
    )

    const slices = await sliceStoreEmailPorts(map, row, storeName)

    const zip = new JSZip()
    let totalBytes = 0
    for (const s of slices) {
      totalBytes += s.buffer.length
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new AppError("Fatias combinadas excedem 60MB", 413)
      }
      zip.file(s.filename, s.buffer)
    }

    const arr = await zip.generateAsync({ type: "uint8array" })
    const ab = arr.buffer.slice(
      arr.byteOffset,
      arr.byteOffset + arr.byteLength,
    ) as ArrayBuffer
    const filename = `${sanitizeFilename(storeName)}-cortes.zip`

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(ab.byteLength),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return errorResponse(request, error, "tasks:campaign-uploads:download-zip")
  }
}
