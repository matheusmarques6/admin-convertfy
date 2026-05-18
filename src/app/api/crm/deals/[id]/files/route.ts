/**
 * GET  /api/crm/deals/[id]/files — lista arquivos do deal (com signed URLs)
 * POST /api/crm/deals/[id]/files — registra arquivo apos upload no Storage
 *
 * Convencao: o front faz upload via Supabase Storage client direto
 * (bucket `crm-files`, path `deals/{deal_id}/{uuid}-{filename}`),
 * e depois chama POST aqui com os metadados pra registrar o registro
 * em `crm_deal_files`. Isso evita streaming binario pelo Next route.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("CrmDealFiles")

export const dynamic = "force-dynamic"

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  mime_type: z.string().nullable().optional(),
  size_bytes: z.number().int().nullable().optional(),
  storage_path: z.string().min(1).max(1024),
  storage_bucket: z.string().min(1).max(64).default("crm-files"),
  category: z.string().max(64).nullable().optional(),
})

const SIGN_EXPIRY = 60 * 60 // 1h

// ── GET ─────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("crm_deal_files")
      .select(`
        id, deal_id, name, mime_type, size_bytes, storage_path,
        storage_bucket, uploaded_by, category, created_at,
        uploader:profiles!crm_deal_files_uploaded_by_fkey (id, name, avatar_url)
      `)
      .eq("deal_id", id)
      .order("created_at", { ascending: false })

    if (error) throw error

    // Gera signed URLs em paralelo
    const files = await Promise.all(
      (data || []).map(async (f) => {
        const { data: signed } = await admin.storage
          .from(f.storage_bucket)
          .createSignedUrl(f.storage_path, SIGN_EXPIRY)
        return { ...f, signed_url: signed?.signedUrl ?? null }
      }),
    )

    return successResponse(request, { files })
  } catch (error) {
    log.error("Files list error:", error)
    return errorResponse(request, error, "crm-deal-files-list")
  }
}

// ── POST ────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = fileSchema.parse(body)

    const { data, error } = await admin
      .from("crm_deal_files")
      .insert({
        deal_id: id,
        name: parsed.name,
        mime_type: parsed.mime_type ?? null,
        size_bytes: parsed.size_bytes ?? null,
        storage_path: parsed.storage_path,
        storage_bucket: parsed.storage_bucket,
        category: parsed.category ?? null,
        uploaded_by: user.id,
      })
      .select(`
        id, deal_id, name, mime_type, size_bytes, storage_path,
        storage_bucket, uploaded_by, category, created_at,
        uploader:profiles!crm_deal_files_uploaded_by_fkey (id, name, avatar_url)
      `)
      .single()

    if (error) throw error

    // Cria uma activity 'file_attached' pra timeline
    await admin.from("crm_deal_activities").insert({
      deal_id: id,
      type: "file_attached",
      content: `Anexou arquivo: ${parsed.name}`,
      metadata: {
        file_id: data.id,
        storage_path: parsed.storage_path,
        size_bytes: parsed.size_bytes,
      },
      created_by: user.id,
      is_internal: true,
    })

    log.info("[Files] uploaded", { deal_id: id, name: parsed.name })
    return successResponse(request, { file: data })
  } catch (error) {
    log.error("File post error:", error)
    return errorResponse(request, error, "crm-deal-files-post")
  }
}
