/**
 * POST /api/transcricoes/previa — prévia dos links colados no modal.
 *
 * Devolve um item por link, na ordem digitada, já com o aviso de duplicado
 * e a coleção sugerida. É o que permite ao usuário revisar antes de
 * enfileirar — e o duplicado nem entra na fila.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { carregarRegras, resolverPrevia, workerConfigurado } from "@/lib/services/transcricoes-previa.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const schema = z.object({
  urls: z.array(z.string().min(4).max(2000)).min(1).max(30),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new AppError("Cole ao menos um link.", 400)

    const regras = await carregarRegras(admin, orgId)
    // Em paralelo: colar 10 links não pode custar 10 idas em série.
    const itens = await Promise.all(parsed.data.urls.map((u) => resolverPrevia(admin, orgId, u, regras)))

    return successResponse(request, {
      itens,
      // Sem worker não há duração na prévia. A UI diz isso em vez de deixar
      // o campo vazio parecendo defeito.
      duracaoDisponivel: workerConfigurado(),
    })
  } catch (error) {
    return errorResponse(request, error, "transcricoes-previa")
  }
}
