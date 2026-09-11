/**
 * Sincronização Asaas → `invoices` (espelho local) e → `client_subscriptions`.
 *
 * O Financeiro lista os pagamentos AO VIVO do Asaas, mas a carteira, o
 * funil e o onboarding leem `unified_invoices` — isto é, o ESPELHO. Medido
 * em 08/09/2026: `integrations.last_sync` parado em 19/02, 39 linhas
 * `pending` (todas vencidas) e 12 `paid` num Asaas que mostrava as mesmas
 * cobranças como pagas. A carteira dizia "Comissão atrasada" para comissão
 * paga em agosto. O webhook do Asaas cobre só o que ele entrega; sem uma
 * varredura periódica, qualquer evento perdido vira "atrasado" para
 * sempre — o mesmo padrão dos eventos de conversão da Meta.
 *
 * Regras:
 *  - PAGINA até o `totalCount` (a rota manual pedia `limit: 100` e parava:
 *    cobrança além da primeira página nunca entrava no espelho).
 *  - Tem ORÇAMENTO de tempo e diz quando não terminou (`truncado`), em vez
 *    de estourar o `maxDuration` no meio de uma página e não gravar nada.
 *  - O update preserva a classificação humana: `buildInvoiceRowFromPayment`
 *    não emite `store_id`/`reference_months`, e `charge_type` só vira
 *    `subscription` quando não há classificação.
 *  - Falha por payment é contada, nunca derruba a varredura.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AsaasService } from "@/lib/integrations/asaas"
import type { AsaasPayment } from "@/lib/integrations/types"
import { isMissingClassificationColumn, stripClassification } from "@/lib/services/charge-classification"
import { buildInvoiceRowFromPayment, resolveClientForPayment } from "@/lib/services/asaas-invoice-mirror"
import {
  casarClientes,
  statusDeAssinatura,
  type ClienteAsaas,
} from "@/lib/services/asaas-clientes-match"
import { logger } from "@/lib/logger"

const log = logger.child("AsaasSync")

/** Teto do Asaas por página. */
export const PAGINA_ASAAS = 100

export interface VarreduraOpts {
  tamanhoPagina?: number
  /** Orçamento em ms; estourado, devolve o que já leu e marca `truncado`. */
  orcamentoMs?: number
  agora?: () => number
}

export interface Varredura<T> {
  itens: T[]
  paginas: number
  total: number
  truncado: boolean
}

/**
 * Lê todas as páginas de uma listagem paginada por offset. Puro em relação
 * ao I/O: `listar` é injetado (daí o teste com listagem falsa).
 */
export async function varrerPaginado<T>(
  listar: (offset: number, limit: number) => Promise<{ data: T[]; totalCount: number }>,
  opts: VarreduraOpts = {},
): Promise<Varredura<T>> {
  const limit = opts.tamanhoPagina ?? PAGINA_ASAAS
  const agora = opts.agora ?? Date.now
  const inicio = agora()
  const itens: T[] = []
  let paginas = 0
  let total = 0
  let offset = 0
  for (;;) {
    if (opts.orcamentoMs != null && agora() - inicio > opts.orcamentoMs) {
      return { itens, paginas, total, truncado: true }
    }
    const { data, totalCount } = await listar(offset, limit)
    paginas += 1
    total = totalCount
    itens.push(...data)
    offset += data.length
    if (data.length === 0 || offset >= totalCount) break
  }
  return { itens, paginas, total, truncado: false }
}

export interface SyncPagamentosStats {
  total: number
  lidos: number
  paginas: number
  criados: number
  atualizados: number
  semCliente: number
  erros: number
  truncado: boolean
}

export interface SyncPagamentosOpts {
  orcamentoMs?: number
  /** Só cobranças com vencimento a partir daqui (YYYY-MM-DD). */
  vencimentoDesde?: string | null
}

export async function syncAsaasPayments(
  db: SupabaseClient,
  orgId: string,
  asaas: AsaasService,
  opts: SyncPagamentosOpts = {},
): Promise<SyncPagamentosStats> {
  const varredura = await varrerPaginado<AsaasPayment>(
    (offset, limit) =>
      asaas.listPayments({
        offset,
        limit,
        ...(opts.vencimentoDesde ? { "dueDate[ge]": opts.vencimentoDesde } : {}),
      }),
    { orcamentoMs: opts.orcamentoMs },
  )

  const stats: SyncPagamentosStats = {
    total: varredura.total,
    lidos: varredura.itens.length,
    paginas: varredura.paginas,
    criados: 0,
    atualizados: 0,
    semCliente: 0,
    erros: 0,
    truncado: varredura.truncado,
  }

  for (const payment of varredura.itens) {
    try {
      const { data: existente } = await db
        .from("invoices")
        .select("id, charge_type")
        .eq("asaas_id", payment.id)
        .maybeSingle<{ id: string; charge_type: string | null }>()

      // Sem dono a fatura ENTRA assim mesmo, para a triagem "Sem cliente"
      // do Financeiro. O código antigo contava `semCliente` e gravava o
      // null na linha seguinte: `invoices.client_id` era NOT NULL, o
      // INSERT morria, e o pagamento não entrava em lugar nenhum — 167
      // cobranças fora da carteira numa rodada só (10/09/2026).
      const clientId = await resolveClientForPayment(db, orgId, payment)
      if (!clientId) stats.semCliente += 1

      const row = buildInvoiceRowFromPayment(payment, clientId, existente?.charge_type, orgId)
      const gravar = async (r: Record<string, unknown>) =>
        existente
          ? db.from("invoices").update({ ...r, updated_at: new Date().toISOString() }).eq("id", existente.id)
          : db.from("invoices").insert(r)

      let { error } = await gravar(row)
      if (error && isMissingClassificationColumn(error)) ({ error } = await gravar(stripClassification(row)))
      if (error) throw error
      if (existente) stats.atualizados += 1
      else stats.criados += 1
    } catch (e) {
      stats.erros += 1
      log.warn("payment não sincronizado", { payment_id: payment.id, erro: (e as Error).message })
    }
  }
  return stats
}

export interface SyncAssinaturasStats {
  clientes: number
  criadas: number
  atualizadas: number
  erros: number
}

/**
 * Assinaturas do Asaas → stubs locais, por cliente com `asaas_customer_id`.
 * Lookup pelo `asaas_subscription_id` SOZINHO (índice único global,
 * migration 20261132): buscar por cliente + id deixava a mesma assinatura
 * ser inserida sob outro cliente e estourar 23505 a cada rodada.
 */
export async function syncAsaasSubscriptions(db: SupabaseClient, orgId: string, asaas: AsaasService): Promise<SyncAssinaturasStats> {
  const stats: SyncAssinaturasStats = { clientes: 0, criadas: 0, atualizadas: 0, erros: 0 }
  const { data: clientes } = await db
    .from("clients")
    .select("id, custom_fields")
    .eq("org_id", orgId)
    .not("custom_fields->asaas_customer_id", "is", null)
  for (const c of clientes ?? []) {
    const asaasCustomer = (c.custom_fields as Record<string, string> | null)?.asaas_customer_id
    if (!asaasCustomer) continue
    stats.clientes += 1
    try {
      const { data: subs } = await asaas.listSubscriptions({ customer: asaasCustomer })
      for (const sub of subs ?? []) {
        // O CHECK da coluna aceita active|inactive|cancelled. O código
        // antigo fazia `String(status).toLowerCase()` e `EXPIRED` virava
        // "expired", que o banco recusa — minúscula não é tradução.
        const st = statusDeAssinatura(sub.status)
        if (!st.reconhecido) {
          log.warn("status de assinatura desconhecido no Asaas", {
            asaas_subscription_id: sub.id,
            status_recebido: sub.status,
            gravado_como: st.status,
          })
        }
        const payload = {
          client_id: c.id as string,
          name: sub.description ?? "Assinatura Asaas",
          value: Number(sub.value) || 0,
          cycle: sub.cycle ?? "MONTHLY",
          payment_method: "asaas",
          status: st.status,
          start_date: sub.dateCreated?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          next_due_date: sub.nextDueDate ?? new Date().toISOString().slice(0, 10),
          asaas_subscription_id: sub.id,
        }
        const { data: existente } = await db
          .from("client_subscriptions")
          .select("id, client_id")
          .eq("asaas_subscription_id", sub.id)
          .maybeSingle<{ id: string; client_id: string }>()
        if (existente) {
          // Não muda o dono: assinatura já espelhada sob outro cliente é
          // decisão humana (o PATCH de unificar), não do sync.
          const { client_id: _c, ...semDono } = payload
          void _c
          const { error } = await db.from("client_subscriptions").update(semDono).eq("id", existente.id)
          if (error) throw error
          stats.atualizadas += 1
        } else {
          const { error } = await db.from("client_subscriptions").insert(payload)
          if (error) throw error
          stats.criadas += 1
        }
      }
    } catch (e) {
      stats.erros += 1
      log.warn("assinaturas do cliente não sincronizadas", { client_id: c.id, erro: (e as Error).message })
    }
  }
  return stats
}

export interface VincularClientesStats {
  doAsaas: number
  vinculados: number
  porDocumento: number
  porEmail: number
  semMatch: number
  ambiguos: number
  erros: number
}

/**
 * Casa os pagadores do Asaas com os nossos clientes e GRAVA o vínculo.
 *
 * `resolveClientForPayment` só acha quem já tem `asaas_customer_id` em
 * `custom_fields`; quem nunca foi vinculado nunca é achado, e o pagamento
 * dele fica sem dono para sempre. Este passo fecha isso pelo que o Asaas
 * sabe do pagador — documento e email — e roda ANTES da varredura de
 * pagamentos, para que a mesma rodada já resolva o que casar.
 *
 * A decisão de casar é PURA (`asaas-clientes-match.ts`, com testes): aqui
 * só entra o I/O. Nunca casa no empate — atribuir a fatura ao cliente
 * errado move dinheiro para a carteira de outra pessoa e o número
 * continua plausível.
 */
export async function vincularClientesDoAsaas(
  db: SupabaseClient,
  orgId: string,
  asaas: AsaasService,
  opts: { orcamentoMs?: number } = {},
): Promise<VincularClientesStats> {
  const stats: VincularClientesStats = {
    doAsaas: 0,
    vinculados: 0,
    porDocumento: 0,
    porEmail: 0,
    semMatch: 0,
    ambiguos: 0,
    erros: 0,
  }
  try {
    const varredura = await varrerPaginado<ClienteAsaas>(
      (offset, limit) => asaas.listCustomers({ offset, limit }),
      { orcamentoMs: opts.orcamentoMs },
    )
    stats.doAsaas = varredura.itens.length

    const { data: locais, error } = await db
      .from("clients")
      .select("id, email, cpf_cnpj, custom_fields")
      .eq("org_id", orgId)
    if (error) throw error

    const jaVinculados = new Set(
      (locais ?? [])
        .map((c) => (c.custom_fields as Record<string, string> | null)?.asaas_customer_id)
        .filter(Boolean) as string[],
    )
    // Pagador já vinculado não precisa de casamento nenhum.
    const pendentes = varredura.itens.filter((a) => !jaVinculados.has(a.id))

    const { vincular, sem } = casarClientes(
      pendentes,
      (locais ?? []).map((c) => ({
        id: c.id as string,
        email: c.email as string | null,
        cpf_cnpj: c.cpf_cnpj as string | null,
        asaas_customer_id:
          (c.custom_fields as Record<string, string> | null)?.asaas_customer_id ?? null,
      })),
    )
    stats.semMatch = sem.filter((s) => s.motivo !== "ambiguo").length
    stats.ambiguos = sem.filter((s) => s.motivo === "ambiguo").length

    const porId = new Map((locais ?? []).map((c) => [c.id as string, c]))
    for (const v of vincular) {
      const atual = (porId.get(v.client_id)?.custom_fields as Record<string, unknown> | null) ?? {}
      const { error: upErr } = await db
        .from("clients")
        .update({ custom_fields: { ...atual, asaas_customer_id: v.asaas_customer_id } })
        .eq("id", v.client_id)
      if (upErr) {
        stats.erros += 1
        continue
      }
      stats.vinculados += 1
      if (v.criterio === "documento") stats.porDocumento += 1
      else stats.porEmail += 1
    }
    if (stats.vinculados > 0 || stats.ambiguos > 0) {
      log.info("clientes do Asaas vinculados", { org_id: orgId, ...stats })
    }
  } catch (e) {
    // Vincular é enriquecimento: falhar aqui não pode impedir o espelho
    // das cobranças, que é o que a carteira lê.
    stats.erros += 1
    log.warn("vínculo de clientes do Asaas não rodou", { erro: (e as Error).message })
  }
  return stats
}

export interface RunAsaasSyncResult {
  clientes: VincularClientesStats
  pagamentos: SyncPagamentosStats
  assinaturas: SyncAssinaturasStats
}

/** Janela padrão do espelho: cobranças com vencimento nos últimos N meses. */
export function vencimentoDesde(meses: number, hoje = new Date()): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - meses, 1))
  return d.toISOString().slice(0, 10)
}

/**
 * Varredura completa de uma org e carimbo de `integrations.last_sync` —
 * é o que a rota manual e o cron chamam; um segundo caminho divergiria.
 */
export async function runAsaasSync(
  db: SupabaseClient,
  orgId: string,
  asaas: AsaasService,
  integrationId: string,
  opts: SyncPagamentosOpts = {},
): Promise<RunAsaasSyncResult> {
  // Vincular vem PRIMEIRO: o dono descoberto aqui já é achado pela
  // varredura de pagamentos logo abaixo, na mesma rodada.
  const clientes = await vincularClientesDoAsaas(db, orgId, asaas, {
    orcamentoMs: opts.orcamentoMs ? Math.round(opts.orcamentoMs * 0.25) : undefined,
  })
  const pagamentos = await syncAsaasPayments(db, orgId, asaas, opts)
  const assinaturas = await syncAsaasSubscriptions(db, orgId, asaas)
  await db.from("integrations").update({ last_sync: new Date().toISOString() }).eq("id", integrationId)
  log.info("sync concluído", { org_id: orgId, clientes, ...pagamentos, assinaturas })
  return { clientes, pagamentos, assinaturas }
}
