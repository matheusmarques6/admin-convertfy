/**
 * Vercel Cron — espelho das cobranças do Asaas em `invoices`.
 *
 * Schedule: minuto 25 das horas pares (a cada 2 h). Por que existe: o webhook do Asaas
 * só cobre o evento que ele entrega, e a rota manual depende de alguém
 * clicar em "Sincronizar" — `last_sync` ficou em 19/02/2026 até setembro,
 * e a carteira mostrava comissão PAGA como atrasada porque a linha do
 * espelho nunca soube do pagamento. Redundância deliberada, a mesma de
 * pixel + CAPI nos eventos de conversão.
 *
 * Idempotente: cada payment é achado por `asaas_id` (índice único) e
 * atualizado no lugar; classificação humana (loja, meses) não é tocada.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { createAsaasService } from "@/lib/integrations/asaas"
import { decryptCredentialsJson } from "@/lib/crypto"
import { runAsaasSync, vencimentoDesde, type RunAsaasSyncResult } from "@/lib/services/asaas-sync.service"
import { logger } from "@/lib/logger"

const log = logger.child("CronAsaasSync")

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Orçamento total da execução; a última org pode ficar truncada e diz isso. */
const ORCAMENTO_TOTAL_MS = 270_000
const JANELA_MESES = 24

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const inicio = Date.now()
  const admin = createAdminClient()
  const { data: integracoes, error } = await admin
    .from("integrations")
    .select("id, org_id, credentials")
    .eq("type", "asaas")
    .eq("is_active", true)
  if (error) {
    log.error("não listou integrações", { erro: error.message })
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const resultados: Array<{ org_id: string; ok: boolean; erro?: string; stats?: RunAsaasSyncResult }> = []
  for (const integ of integracoes ?? []) {
    const restante = ORCAMENTO_TOTAL_MS - (Date.now() - inicio)
    if (restante < 20_000) {
      resultados.push({ org_id: integ.org_id as string, ok: false, erro: "sem orçamento nesta execução" })
      continue
    }
    try {
      const asaas = createAsaasService(decryptCredentialsJson(integ.credentials))
      const stats = await runAsaasSync(admin, integ.org_id as string, asaas, integ.id as string, {
        orcamentoMs: restante - 15_000,
        vencimentoDesde: vencimentoDesde(JANELA_MESES),
      })
      resultados.push({ org_id: integ.org_id as string, ok: true, stats })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.error("org falhou", { org_id: integ.org_id, erro: msg })
      resultados.push({ org_id: integ.org_id as string, ok: false, erro: msg })
    }
  }

  const ok = resultados.filter((r) => r.ok).length
  log.info("cron concluído", { orgs: resultados.length, ok, ms: Date.now() - inicio })
  return NextResponse.json({ success: ok === resultados.length, orgs: resultados.length, ok, resultados })
}
