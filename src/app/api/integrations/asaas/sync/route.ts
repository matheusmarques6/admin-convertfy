/**
 * POST /api/integrations/asaas/sync — sincronização manual (botão em
 * Configurações → Integrações). A varredura mora em
 * `asaas-sync.service.ts`, a MESMA do cron `/api/cron/asaas-sync`: antes
 * a rota pedia `limit: 100` sem paginar e era o único caminho — o espelho
 * ficou parado de fevereiro a setembro de 2026 e a carteira acusava
 * comissão paga como atrasada.
 */

import { NextResponse } from "next/server"
import { requireAuth, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { createClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { runAsaasSync, vencimentoDesde } from "@/lib/services/asaas-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("IntegrationsAsaasSync")

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  try {
    const supabase = await createClient()
    const user = await requireAuth(supabase)
    const orgId = await resolveOrgId(user.id)

    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("id, credentials, is_active")
      .eq("type", "asaas")
      .eq("is_active", true)
      .eq("org_id", orgId)
      .single()

    if (intError || !integration) throw new AppError("Integração Asaas não encontrada ou inativa", 400)

    const asaas = createAsaasService(decryptCredentialsJson(integration.credentials))
    const { pagamentos, assinaturas } = await runAsaasSync(supabase, orgId, asaas, integration.id as string, {
      orcamentoMs: 240_000,
      vencimentoDesde: vencimentoDesde(24),
    })

    return NextResponse.json({
      success: true,
      message: pagamentos.truncado
        ? "Sincronização parcial: o tempo acabou antes da última página. Rode de novo para completar."
        : "Sincronização concluída",
      stats: {
        total: pagamentos.total,
        synced: pagamentos.criados,
        updated: pagamentos.atualizados,
        errors: pagamentos.erros,
        sem_cliente: pagamentos.semCliente,
        truncado: pagamentos.truncado,
        subscriptions: { synced: assinaturas.criadas, updated: assinaturas.atualizadas, errors: assinaturas.erros },
      },
    })
  } catch (error) {
    log.error("Error syncing Asaas:", error)
    // A tela lê `success` + `error` (não o envelope do errorResponse).
    const status = error instanceof AppError ? error.statusCode : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro ao sincronizar" },
      { status },
    )
  }
}
