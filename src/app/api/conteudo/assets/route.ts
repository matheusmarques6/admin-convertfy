/**
 * GET /api/conteudo/assets — banco de imagens da org: tudo que já foi
 * enviado pelo Estúdio ou gerado pela ConvertIA na pasta da org no Storage
 * (`stores/org-<id>/email-assets`). É a fonte das "sugestões" do painel
 * Mídia — imagens REAIS da casa, mais recentes primeiro.
 */

import { NextRequest } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { CONVERTIA_IMAGE_BUCKET, convertiaImageUrl, isConvertiaImagePath } from "@/lib/ai/convertia-image-url"

export const dynamic = "force-dynamic"

export interface AssetItem {
  url: string
  path: string
  nome: string
  criadoEm: string | null
  kind: "avatar" | "slide" | "gerada"
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)
    const limit = Math.min(120, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 60) || 60))
    const prefixo = `stores/org-${orgId}/email-assets`
    const { data, error } = await admin.storage.from(CONVERTIA_IMAGE_BUCKET).list(prefixo, { limit: 500, sortBy: { column: "created_at", order: "desc" } })
    if (error) throw error
    const itens: AssetItem[] = (data ?? [])
      .filter((o) => o.name && /\.(png|jpe?g|webp)$/i.test(o.name))
      .map((o) => ({ path: `${prefixo}/${o.name}`, nome: o.name, criadoEm: o.created_at ?? null }))
      .filter((o) => isConvertiaImagePath(o.path))
      .map((o): AssetItem => ({
        ...o,
        url: convertiaImageUrl(o.path),
        kind: o.nome.startsWith("avatar-") ? "avatar" : o.nome.startsWith("slide-") ? "slide" : "gerada",
      }))
      .slice(0, limit)
    return successResponse(request, { itens })
  } catch (error) {
    return errorResponse(request, error, "conteudo-assets")
  }
}
