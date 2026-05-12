/**
 * Bootstrap das 4 pipelines operacionais padrao (Onboarding Ops,
 * Acompanhamento, Feedback, Suporte).
 *
 * Idempotente — se as pipelines ja existem, nao faz nada. Usado
 * tanto pelo GET /api/operational-pipelines (lista, primeiro acesso
 * da org) quanto pelos endpoints que resolvem por slug (caso o user
 * navegue direto pra uma rota sem antes carregar a lista).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { DEFAULT_OPERATIONAL_PIPELINES } from "@/types/operational-pipeline"
import { logger } from "@/lib/logger"

const log = logger.child("OpPipelinesBootstrap")

export async function ensureOperationalPipelinesBootstrap(
  orgId: string,
  userId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { count } = await admin
    .from("operational_pipelines")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_active", true)

  if ((count ?? 0) > 0) return

  const rows = DEFAULT_OPERATIONAL_PIPELINES.map((p) => ({
    org_id: orgId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    icon: p.icon,
    color: p.color,
    columns: p.columns.map((c, i) => ({
      id: crypto.randomUUID(),
      name: c.name,
      color: c.color,
      position: i,
      wip_limit: null,
    })),
    automations: [],
    created_by: userId,
  }))

  const { error } = await admin
    .from("operational_pipelines")
    .insert(rows)
  if (error) {
    log.warn("Bootstrap insert failed", { code: error.code, msg: error.message })
  }
}
