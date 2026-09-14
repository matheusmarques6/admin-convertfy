/**
 * POST /api/admin/stores/[id]/politicas — "Reler políticas" (Passo 16).
 *
 * Captura troca/devolução e frete das páginas públicas da loja e grava em
 * `client_stores.politicas`. Roda também sozinho no callback
 * `pesquisa-completa`, antes do Catalogador; este botão é para quando a
 * loja publicou a página depois, ou a URL mudou.
 *
 * GET devolve o que está gravado (a tela lê pelo `/api/client-stores/[id]`,
 * que seleciona `*`; o GET existe para o operador conferir sem recarregar).
 */

import { NextRequest } from "next/server"

import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { normalizarPoliticas } from "@/lib/stores/politicas"
import { capturarPoliticas } from "@/lib/stores/politicas.service"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()
    const r = await capturarPoliticas(admin, storeId)
    return successResponse(request, r)
  } catch (error) {
    return errorResponse(request, error, "store-politicas-post")
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: storeId } = await context.params
    const sb = await createClient()
    await requireAuth(sb)
    const admin = createAdminClient()
    const { data, error } = await admin.from("client_stores").select("politicas").eq("id", storeId).maybeSingle()
    if (error) throw error
    return successResponse(request, { politicas: normalizarPoliticas((data as { politicas?: unknown } | null)?.politicas) })
  } catch (error) {
    return errorResponse(request, error, "store-politicas-get")
  }
}
