import { Suspense } from "react"
import { PipelineBoardView } from "@/components/crm/pipeline-board-view"
import { CarteiraSyncButton } from "@/components/crm/carteira-sync-button"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { syncCarteiraDeal } from "@/lib/services/cs-pipelines-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("CsPipelineDetailPage")

export const dynamic = "force-dynamic"

/**
 * Detalhe de um pipeline CS — renderiza o PipelineBoardView padrao
 * (UX identica a qualquer outro pipeline).
 *
 * Particularidades por pipeline:
 *  - "Gestao de Carteira": tenta popular server-side antes do render
 *    (se vazio, sincroniza todas as lojas do org). Tambem injeta o
 *    botao manual "Sincronizar carteira" no header via headerExtras —
 *    fallback caso o auto-populate falhe (deploy delay, erro de
 *    permissao, etc).
 */
export default async function CsPipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  await maybePopulateGestaoCarteira(id).catch((err) => {
    log.warn("populate falhou (nao bloqueia render)", {
      err: err instanceof Error ? err.message : String(err),
    })
  })

  return (
    <Suspense fallback={null}>
      <PipelineBoardView
        pipelineId={id}
        scope="cs"
        headerExtras={<CarteiraSyncButton pipelineId={id} />}
      />
    </Suspense>
  )
}

async function maybePopulateGestaoCarteira(pipelineId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: pipeline } = await admin
    .from("pipelines")
    .select("id, name, scope")
    .eq("id", pipelineId)
    .maybeSingle()
  if (!pipeline || pipeline.name !== "Gestao de Carteira" || pipeline.scope !== "cs") {
    return
  }

  const { count } = await admin
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_id", pipelineId)
    .neq("status", "archived")

  if ((count ?? 0) > 0) return

  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return

  const { data: member } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!member?.org_id) return

  const { data: stores } = await admin
    .from("client_stores")
    .select("id, health_score")
    .eq("org_id", member.org_id)

  if (!stores || stores.length === 0) return

  log.info("Auto-populando Gestao de Carteira", {
    pipeline_id: pipelineId,
    org_id: member.org_id,
    store_count: stores.length,
  })

  const BATCH = 10
  for (let i = 0; i < stores.length; i += BATCH) {
    const batch = stores.slice(i, i + BATCH)
    await Promise.all(
      batch.map((s) =>
        syncCarteiraDeal({
          storeId: s.id as string,
          healthScore: (s.health_score as number | null) ?? null,
        }).catch((err) => {
          log.warn("syncCarteiraDeal falhou", {
            store_id: s.id,
            err: err instanceof Error ? err.message : String(err),
          })
        }),
      ),
    )
  }
}
