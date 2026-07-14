/**
 * GET /api/onboardings/[id]/asset-url?url=<stored>
 *
 * Resolve a URL final (pública ou signed) de um asset de onboarding a partir
 * de uma URL/path armazenado (em `onboardings.form_responses` ou espelhado em
 * `client_stores`). Usado pela UI da aba "Form do cliente" pra exibir
 * thumbnail / botão de download sem vazar signed URLs no HTML servido.
 *
 * Auth: requireAuth + org check — confirma que o onboarding pertence à org do
 * usuário antes de resolver (evita usar o resolver como oráculo cross-tenant).
 *
 * Query: `?url=` (URL/path armazenado) OU `?path=` (alias). O resolver aplica
 * allowlist de bucket internamente (só onboarding-assets / onboarding-public).
 */

import { NextRequest } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import {
  errorResponse,
  successResponse,
  requireAuth,
  AppError,
} from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import {
  parseStorageUrl,
  resolveOnboardingAssetUrl,
} from "@/lib/storage/onboarding-buckets"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const admin = createAdminClient()

    const search = new URL(request.url).searchParams
    const stored = search.get("url") ?? search.get("path")
    if (!stored) throw new AppError("url obrigatorio", 400)

    // Confirma que o onboarding pertence à org do usuário.
    const { data: onb, error } = await admin
      .from("onboardings")
      .select("id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) throw error
    if (!onb) throw new AppError("Onboarding nao encontrado", 404)

    // Isolamento de tenant: a checagem do onboarding acima confirma que `id`
    // pertence à org do usuário, mas `stored` vem do cliente e é resolvido de
    // forma independente. Sem esta trava, um usuário com QUALQUER onboarding na
    // sua org poderia pedir signed URL de assets de OUTRA org (os paths de
    // ambos os buckets começam com `<org_id>/...`). Exigimos que o path
    // resolvido comece com o org_id do usuário — mesmo critério do
    // /api/upload/onboarding GET/DELETE.
    const parsed = parseStorageUrl(stored)
    if (!parsed || !parsed.path.startsWith(`${orgId}/`)) {
      throw new AppError("Asset invalido ou inacessivel", 400)
    }

    const url = await resolveOnboardingAssetUrl(admin, stored)
    if (!url) throw new AppError("Asset invalido ou inacessivel", 400)

    return successResponse(request, { url })
  } catch (error) {
    return errorResponse(request, error, "onboarding-asset-url")
  }
}
