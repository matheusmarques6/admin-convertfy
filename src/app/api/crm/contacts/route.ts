/**
 * GET /api/crm/contacts?client_id=&store_id=
 *
 * Contatos do cliente (crm_contacts) para o diálogo de reunião mostrar QUEM
 * do lado do cliente vai receber o convite — e deixar trocar antes de salvar.
 *
 * Escopo: o cliente precisa ser da org de quem pergunta. crm_contacts não
 * tem org_id próprio (pendura em clients), então a checagem é no cliente.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"

const log = logger.child("CrmContacts")

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const clientId = request.nextUrl.searchParams.get("client_id")
    const storeId = request.nextUrl.searchParams.get("store_id")

    if (!clientId || !UUID.test(clientId)) {
      throw new AppError("client_id é obrigatório", 422, "validation-error")
    }
    if (storeId && !UUID.test(storeId)) {
      throw new AppError("store_id inválido", 422, "validation-error")
    }

    // O cliente tem de ser da org de quem pergunta. Sem isto, um UUID
    // adivinhado devolveria a agenda de contatos de outra organização.
    const { data: client } = await admin
      .from("clients")
      .select("id, name, email, org_id")
      .eq("id", clientId)
      .maybeSingle()

    if (!client || client.org_id !== orgId) {
      throw new AppError("Cliente não encontrado", 404)
    }

    const { data: contacts, error } = await admin
      .from("crm_contacts")
      .select("id, name, email, phone, role, is_primary, store_id")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true })

    if (error) {
      log.error("Falha ao listar contatos", { clientId, message: error.message })
      throw new AppError("Erro ao carregar contatos", 500)
    }

    return successResponse(request, {
      contacts: contacts ?? [],
      // Email do cadastro do cliente. NÃO é um detalhe de fallback: medido em
      // 08/09, `crm_contacts` tem ZERO linhas e `clients.email` cobre 54 dos
      // 55 clientes — todas as 63 lojas ativas têm cliente com email. Sem
      // oferecer isto, a tela diria "nenhum contato cadastrado" em 100% dos
      // casos, com o endereço a uma coluna de distância, e quem agenda
      // redigitaria à mão o que o banco já sabe.
      client_email: client.email ?? null,
      client_name: client.name ?? null,
      store_id: storeId ?? null,
    })
  } catch (error) {
    return errorResponse(request, error, "CrmContacts")
  }
}
