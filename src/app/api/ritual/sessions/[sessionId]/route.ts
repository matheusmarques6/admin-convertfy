import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export const dynamic = "force-dynamic"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data: session, error } = await admin
      .from("ritual_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle()

    if (error || !session) throw new AppError("Sessão não encontrada", 404)

    // Diagnósticos associados
    const { data: diagnosticsRaw } = await admin
      .from("ritual_store_diagnostics")
      .select("*, store:client_stores(id, store_name, store_url, niche, mrr_cents, client:clients!client_stores_client_id_fkey(name))")
      .eq("ritual_session_id", sessionId)

    // Converte mrr_cents -> mrr_value (reais) pra contrato com o front
    const diagnostics = (diagnosticsRaw ?? []).map((d) => {
      const r = d as Record<string, unknown>
      const s = r.store as { mrr_cents?: number | null } | null
      if (s && typeof s === "object") {
        const cents = s.mrr_cents ?? 0
        ;(s as Record<string, unknown>).mrr_value =
          cents > 0 ? Math.round(cents / 100) : null
      }
      return d
    })

    return successResponse(request, { session, diagnostics })
  } catch (error) {
    return errorResponse(request, error, "RitualSession")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (typeof body.current_store_index === "number") {
      updates.current_store_index = body.current_store_index
    }
    if (typeof body.status === "string") {
      updates.status = body.status
      if (body.status === "completed") {
        updates.completed_at = new Date().toISOString()
      }
    }
    if (typeof body.recording_url === "string") {
      updates.recording_url = body.recording_url
      updates.recording_uploaded_at = new Date().toISOString()
    }
    if (typeof body.recording_filename === "string") {
      updates.recording_filename = body.recording_filename
    }
    if (Array.isArray(body.participants)) {
      updates.participants = body.participants
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError("Nenhum campo válido", 400)
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("ritual_sessions")
      .update(updates)
      .eq("id", sessionId)
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)
    return successResponse(request, { session: data })
  } catch (error) {
    return errorResponse(request, error, "RitualSession")
  }
}
