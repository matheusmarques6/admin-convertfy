/**
 * GET /api/conteudo/espionagem?handle=&forcar=1 — varredura de um perfil
 * público pela API oficial (`business_discovery`).
 *
 * Erro da Meta vira mensagem de gente: "conta pessoal ou privada" não é a
 * mesma coisa que "perfil não existe", e a diferença muda o que o operador
 * faz em seguida.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { withTiming } from "@/lib/api/with-timing"
import { espionarPerfil } from "@/lib/services/conteudo-espionagem.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handleGet(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const q = request.nextUrl.searchParams
    const resultado = await espionarPerfil(admin, orgId, q.get("handle") ?? "", { forcar: q.get("forcar") === "1" })
    return successResponse(request, { espionagem: resultado })
  } catch (error) {
    // `EspionagemError` é `AppError` com 422: o envelope de erro da casa já
    // devolve `{ error, code }`, que é o que o cliente lê.
    return errorResponse(request, error, "conteudo-espionagem")
  }
}

export const GET = withTiming("conteudo-espionagem", handleGet, { slowMs: 12_000 })
