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
    const { data: callsRaw, error } = await admin
      .from("store_feedback_calls")
      .select(
        "id, conducted_at, duration_minutes, notes, action_items, next_call_date, " +
          "result_percentage, klaviyo_revenue, total_revenue, " +
          "conducted_by_profile:profiles!store_feedback_calls_conducted_by_fkey(id, name, avatar_url)",
      )
      .eq("store_id", id)
      .order("conducted_at", { ascending: false })

    if (error) throw new AppError("Erro ao listar calls", 500)

    const calls = (callsRaw ?? []) as unknown as Array<{
      id: string
      conducted_at: string
      duration_minutes: number | null
      notes: string | null
      action_items: string | null
      next_call_date: string | null
      result_percentage: number | null
      klaviyo_revenue: number | null
      total_revenue: number | null
      conducted_by_profile: { id: string; name: string; avatar_url: string | null } | null
    }>

    const now = new Date().toISOString()
    const upcomingCall = calls.find((c) => c.next_call_date && c.next_call_date > now)

    return successResponse(request, {
      calls,
      upcoming_call_date: upcomingCall?.next_call_date ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "StoreCalls")
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

    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("client_id")
      .eq("id", id)
      .maybeSingle()

    if (!store) throw new AppError("Loja não encontrada", 404)

    const { data: created, error } = await admin
      .from("store_feedback_calls")
      .insert({
        store_id: id,
        client_id: store.client_id,
        conducted_by: user.id,
        conducted_at: body.conducted_at ?? new Date().toISOString(),
        duration_minutes: body.duration_minutes ?? 30,
        notes: body.notes ?? null,
        action_items: body.action_items ?? null,
        next_call_date: body.next_call_date ?? null,
        klaviyo_revenue: body.klaviyo_revenue ?? 0,
        total_revenue: body.total_revenue ?? 0,
        result_percentage: body.result_percentage ?? null,
      })
      .select()
      .single()

    if (error) throw new AppError(error.message, 500)
    return successResponse(request, { call: created })
  } catch (error) {
    return errorResponse(request, error, "StoreCalls")
  }
}
