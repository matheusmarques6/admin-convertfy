/**
 * Ganho de negócio indicado por parceiro: abre o pós-venda e recalcula
 * o extrato do parceiro.
 *
 * Roda FAIL-OPEN depois do update de ganho. É a regra da casa desde o
 * incidente 20261066: ponte entre módulos nunca pode derrubar a ação do
 * usuário — arrastar o card pra "Ganho" e ver 500 é o defeito caro; um
 * negócio de onboarding que não nasceu aparece na tela e se cria com um
 * clique.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("CrmGanhoParceiro")

/** Pipeline que recebe o cliente novo. Resolvida por NOME dentro da org. */
export const PIPELINE_POS_VENDA = "Onboarding 30d"

export interface ResultadoDoGanho {
  /** Negócio criado no pós-venda (ou o que já existia). */
  deal_pos_venda_id: string | null
  /** true quando a linha nasceu agora; false quando já existia. */
  criado: boolean
  parceiro_atualizado: boolean
  /** Por que não deu, em texto de gente. Vazio = correu tudo. */
  avisos: string[]
}

const VAZIO: ResultadoDoGanho = {
  deal_pos_venda_id: null,
  criado: false,
  parceiro_atualizado: false,
  avisos: [],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

/**
 * Chave de origem no `custom_fields` do negócio de pós-venda. É por ela
 * que o segundo ganho do mesmo card reconhece o primeiro — sem índice
 * único, então duas requisições no mesmo instante ainda duplicariam.
 * Aceitável: ganhar o mesmo negócio duas vezes no mesmo segundo não
 * acontece, e um índice aqui pesaria em toda pipeline do sistema.
 */
export const CHAVE_ORIGEM = "origem_deal_id"

export async function registrarGanhoDeParceiro(
  admin: Admin,
  dealId: string,
): Promise<ResultadoDoGanho> {
  const avisos: string[] = []

  const { data: deal, error } = await admin
    .from("deals")
    .select(
      "id, title, value, currency, lead_id, client_id, owner_id, referrer_partner_id, tags",
    )
    .eq("id", dealId)
    .maybeSingle()

  if (error || !deal) {
    log.error("ganho: negócio não lido", { dealId, error })
    return VAZIO
  }

  // Sem parceiro não há nada disto a fazer: o pós-venda comum já tem o
  // caminho dele (`createFromDeal` / cron `process-deal-won`).
  if (!deal.referrer_partner_id) return VAZIO

  const resultado: ResultadoDoGanho = { ...VAZIO, avisos }

  // ── Negócio no pós-venda ─────────────────────────────────────────
  // A pipeline é achada por NOME: `pipelines` não tem `org_id` neste
  // schema (as pipelines são globais — a rota que as lista não filtra
  // por org nenhuma). Pedir a coluna aqui devolvia 42703, o erro caía
  // no `data: null` e o pós-venda "não existia" em toda venda ganha.
  const { data: pipeline, error: pipeErr } = await admin
    .from("pipelines")
    .select("id, name")
    .eq("name", PIPELINE_POS_VENDA)
    .eq("is_archived", false)
    .maybeSingle()

  if (pipeErr) {
    log.error("ganho: pipeline do pós-venda não lida", { dealId, pipeErr })
    avisos.push("A pipeline do pós-venda não pôde ser lida — o negócio não foi aberto.")
    return resultado
  }

  if (!pipeline) {
    // Nomeia a pipeline que falta: "não criou o pós-venda" sozinho
    // mandaria procurar bug onde só falta uma pipeline.
    avisos.push(
      `A pipeline "${PIPELINE_POS_VENDA}" não existe nesta organização — o pós-venda não foi aberto.`,
    )
  } else {
    const { data: primeira } = await admin
      .from("pipeline_stages")
      .select("id, name")
      .eq("pipeline_id", pipeline.id)
      .order("order", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!primeira) {
      avisos.push(`A pipeline "${PIPELINE_POS_VENDA}" não tem nenhuma etapa.`)
    } else {
      const { data: jaExiste } = await admin
        .from("deals")
        .select("id")
        .eq("pipeline_id", pipeline.id)
        .eq("custom_fields->>" + CHAVE_ORIGEM, dealId)
        .limit(1)
        .maybeSingle()

      if (jaExiste) {
        resultado.deal_pos_venda_id = jaExiste.id
      } else {
        const { data: maxPos } = await admin
          .from("deals")
          .select("position")
          .eq("stage_id", primeira.id)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle()

        const { data: novo, error: iErr } = await admin
          .from("deals")
          .insert({
            pipeline_id: pipeline.id,
            stage_id: primeira.id,
            // Mesmo título: é o mesmo cliente, e renomear faria o time
            // procurar dois nomes pra mesma conta.
            title: deal.title,
            value: deal.value,
            currency: deal.currency,
            lead_id: deal.lead_id,
            client_id: deal.client_id,
            owner_id: deal.owner_id,
            referrer_partner_id: deal.referrer_partner_id,
            status: "open",
            position: (maxPos?.position ?? 0) + 10,
            custom_fields: { [CHAVE_ORIGEM]: dealId },
          })
          .select("id")
          .single()

        if (iErr || !novo) {
          log.error("ganho: pós-venda não nasceu", { dealId, iErr })
          avisos.push("O negócio no pós-venda não foi criado.")
        } else {
          resultado.deal_pos_venda_id = novo.id
          resultado.criado = true
        }
      }
    }
  }

  // ── Extrato do parceiro ──────────────────────────────────────────
  // Recalculado a partir dos negócios, NUNCA incrementado: `+= 1` em
  // read-modify-write perde contagem em concorrência e nunca se corrige
  // sozinho — e um extrato de comissão errado é o pior lugar pra isso.
  const { data: ganhos, error: gErr } = await admin
    .from("deals")
    .select("value, won_at")
    .eq("referrer_partner_id", deal.referrer_partner_id)
    .eq("status", "won")

  if (gErr) {
    log.error("ganho: extrato do parceiro não recalculou", { dealId, gErr })
    avisos.push("O extrato do parceiro não foi atualizado.")
    return resultado
  }

  const linhas = ganhos ?? []
  const totalCents = linhas.reduce(
    (acc, d) => acc + Math.round(Number(d.value ?? 0) * 100),
    0,
  )
  const ultima = linhas
    .map((d) => d.won_at)
    .filter((v): v is string => typeof v === "string")
    .sort()
    .at(-1)

  const { error: pErr } = await admin
    .from("crm_partners")
    .update({
      total_deals_won: linhas.length,
      total_revenue_cents: totalCents,
      last_referral_at: ultima ?? new Date().toISOString(),
    })
    .eq("id", deal.referrer_partner_id)

  if (pErr) {
    log.error("ganho: parceiro não atualizou", { dealId, pErr })
    avisos.push("O extrato do parceiro não foi atualizado.")
  } else {
    resultado.parceiro_atualizado = true
  }

  return resultado
}
