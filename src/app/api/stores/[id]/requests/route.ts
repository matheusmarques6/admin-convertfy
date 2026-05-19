import { NextRequest } from "next/server"
import { errorResponse, successResponse, requireAuth, AppError } from "@/lib/api/errors"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { handleCorsPreFlight } from "@/lib/cors"

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    await requireAuth(supabase)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("client_store_requests")
      .select(
        "id, title, description, status, priority, category, " +
          "requested_at, completed_at, related_task_id, " +
          "requested_by_profile:profiles!client_store_requests_requested_by_fkey(id, name, avatar_url), " +
          "completed_by_profile:profiles!client_store_requests_completed_by_fkey(id, name, avatar_url)",
      )
      .eq("store_id", id)
      .order("requested_at", { ascending: false })

    if (error) throw new AppError("Erro ao listar solicitações", 500)

    return successResponse(request, { requests: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "StoreRequests")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const user = await requireAuth(supabase)

    const body = await request.json()
    if (!body.title || typeof body.title !== "string") {
      throw new AppError("title obrigatório", 400)
    }

    const admin = createAdminClient()

    // Pega org_id e client_id da loja
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id, client_id")
      .eq("id", id)
      .maybeSingle()

    if (!store) throw new AppError("Loja não encontrada", 404)

    const { data: created, error: insertErr } = await admin
      .from("client_store_requests")
      .insert({
        org_id: store.org_id,
        store_id: id,
        client_id: store.client_id,
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? "open",
        priority: body.priority ?? "medium",
        category: body.category ?? null,
        requested_by: user.id,
      })
      .select()
      .single()

    if (insertErr) throw new AppError(insertErr.message, 500)

    return successResponse(request, { request: created })
  } catch (error) {
    return errorResponse(request, error, "StoreRequests")
  }
}
