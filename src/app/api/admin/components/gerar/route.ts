/**
 * Gerador de Anatomias (Trilha B4).
 *
 * GET  = o que a tela precisa para montar o pedido: cobertura da biblioteca
 *        por dispositivo (ativas / geradas aguardando) e as lojas de
 *        referência (paletas de prova).
 * POST = gera UMA anatomia: `{dispositivo, variante, densidade, idioma?,
 *        notas?, refs_ids?, store_id?}`. Entra desativada; a ativação é o
 *        PATCH de sempre em /api/admin/components/[id].
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { assertCanManagePrompts } from "@/lib/services/prompt-management.service"
import { DISPOSITIVOS_PEDIVEIS, type Dispositivo } from "@/lib/agents/shared/dispositivos"
import { paletasDeProva } from "@/lib/agents/html/paletas-de-prova"
import { gerarAnatomia } from "@/lib/agents/gerador-anatomia/gerar-anatomia.service"
import { logger } from "@/lib/logger"

const log = logger.child("ComponentsGerar")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const [{ data }, paletas] = await Promise.all([
      admin.from("email_component_variants").select("dispositivo, is_active, source"),
      paletasDeProva(admin),
    ])
    const cobertura: Record<string, { ativas: number; geradas_aguardando: number }> = {}
    // `nao_classificado` fica fora: é valor de CONTROLE, não um mecanismo
    // que a biblioteca precise cobrir — contá-lo pediria anatomia para ele.
    for (const d of DISPOSITIVOS_PEDIVEIS) cobertura[d] = { ativas: 0, geradas_aguardando: 0 }
    for (const r of (data ?? []) as Array<{ dispositivo: string | null; is_active: boolean; source: string | null }>) {
      if (!r.dispositivo || !cobertura[r.dispositivo]) continue
      if (r.is_active) cobertura[r.dispositivo].ativas++
      else if (r.source === "gerada") cobertura[r.dispositivo].geradas_aguardando++
    }
    return successResponse(request, {
      cobertura,
      lojas: paletas.filter((p) => p.storeId).map((p) => ({ id: p.storeId, nome: p.nome })),
      paletas: paletas.map((p) => ({ nome: p.nome, origem: p.origem })),
    })
  } catch (error) {
    log.error("components.gerar.get", error)
    return errorResponse(request, error, "components-gerar-get")
  }
}

const postSchema = z.object({
  dispositivo: z.enum(DISPOSITIVOS_PEDIVEIS as unknown as [string, ...string[]]),
  variante: z.string().trim().min(1).max(3).default("a"),
  densidade: z.enum(["minimal", "balanced", "rich"]).default("balanced"),
  idioma: z.string().trim().max(10).optional(),
  notas: z.string().max(2000).optional(),
  refs_ids: z.array(z.string().uuid()).max(3).optional(),
  store_id: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    await assertCanManagePrompts(admin, user.id)

    const body = postSchema.parse(await request.json().catch(() => ({})))
    const r = await gerarAnatomia({
      dispositivo: body.dispositivo as Dispositivo,
      variante: body.variante,
      densidade: body.densidade,
      idioma: body.idioma,
      notas: body.notas,
      refsIds: body.refs_ids,
      storeId: body.store_id,
      triggeredBy: user.id,
    })
    log.info("components.gerar.post", { by: user.id, dispositivo: body.dispositivo, status: r.status, variantId: r.variantId, tentativas: r.tentativas, custoCents: r.custoCents })
    return successResponse(request, r)
  } catch (error) {
    log.error("components.gerar.post", error)
    return errorResponse(request, error, "components-gerar-post")
  }
}
