/**
 * DELETE /api/crm/deals/[id]/files/[fileId]
 * Remove arquivo do deal: deleta registro + objeto do Storage.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, NotFoundError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealFiles")

export const dynamic = "force-dynamic"

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const { id, fileId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    // 1. Busca metadata pra saber storage_path
    const { data: file, error: fetchError } = await admin
      .from("crm_deal_files")
      .select("id, deal_id, storage_path, storage_bucket, name")
      .eq("id", fileId)
      .eq("deal_id", id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!file) throw new NotFoundError("Arquivo nao encontrado")

    // 2. Remove do Storage (best effort — se falhar, ainda removemos o registro
    //    pra evitar listagem fantasma; um job de garbage collection limpa orfaos)
    const { error: storageError } = await admin.storage
      .from(file.storage_bucket)
      .remove([file.storage_path])

    if (storageError) {
      log.warn("[Files] storage remove failed (continuing)", {
        file_id: fileId,
        path: file.storage_path,
        error: storageError.message,
      })
    }

    // 3. Remove o registro
    const { error: delError } = await admin
      .from("crm_deal_files")
      .delete()
      .eq("id", fileId)

    if (delError) throw delError

    log.info("[Files] deleted", { deal_id: id, file_id: fileId })
    return successResponse(request, { ok: true })
  } catch (error) {
    log.error("File delete error:", error)
    return errorResponse(request, error, "crm-deal-files-delete")
  }
}
