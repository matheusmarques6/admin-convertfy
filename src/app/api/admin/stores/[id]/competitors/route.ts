/**
 * GET  /api/admin/stores/[id]/competitors  — lista
 * POST /api/admin/stores/[id]/competitors  — cria
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().optional().nullable().or(z.literal("")),
  posicionamento: z.enum(["popular", "similar", "premium"]).optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_competitors")
      .select("id, name, url, posicionamento, notas, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: true })
    if (error) throw error
    return successResponse(request, { competitors: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "store-competitors-list")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: storeId } = await params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()

    const raw = await request.json()
    const parsed = createSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(
        "Payload invalido: " +
          parsed.error.issues.map((i) => i.message).join("; "),
        400,
      )
    }
    const body = parsed.data

    const { data, error } = await admin
      .from("client_competitors")
      .insert({
        store_id: storeId,
        name: body.name.trim(),
        url: body.url && body.url.trim() ? body.url.trim() : null,
        posicionamento: body.posicionamento || null,
        notas: body.notas?.trim() || null,
      })
      .select("id, name, url, posicionamento, notas, created_at")
      .single()
    if (error) throw error
    return successResponse(request, { competitor: data })
  } catch (error) {
    return errorResponse(request, error, "store-competitors-create")
  }
}
