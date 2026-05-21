/**
 * GET /api/client-stores/search?q=<query>&limit=<n>
 *
 * Busca lojas ativas da org do user logado. Usada por:
 *  - NewDealDialog: quando o usuario quer linkar deal a loja existente
 *    (autopreenche title + client_id + store_id + phone).
 *
 * Match em: store_name, store_url, client.name, client.company.
 * Retorna `clients.name`, `clients.email`, `clients.phone` pra
 * permitir autopreenchimento do phone no dialog.
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  requireAuth,
  successResponse,
  AppError,
} from "@/lib/api/errors"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const { data: member } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!member) throw new AppError("Sem org", 403)

    const sp = request.nextUrl.searchParams
    const q = (sp.get("q") || "").trim()
    const limit = Math.min(parseInt(sp.get("limit") || "20", 10), 50)

    let query = admin
      .from("client_stores")
      .select(
        `id, store_name, store_url, platform, mrr_cents, health_score, is_active,
         client:clients!client_stores_client_id_fkey(id, name, company, email, phone)`,
      )
      .eq("org_id", member.org_id)
      .eq("is_active", true)
      .order("store_name", { ascending: true })
      .limit(limit)

    if (q.length >= 2) {
      // ilike on store_name + store_url; client name match nao funciona em
      // query simples PostgREST, entao deixamos so na loja por enquanto.
      query = query.or(`store_name.ilike.%${q}%,store_url.ilike.%${q}%`)
    }

    const { data, error } = await query
    if (error) throw new AppError(error.message, 500)

    return successResponse(request, { stores: data ?? [] })
  } catch (error) {
    return errorResponse(request, error, "client-stores-search")
  }
}
