/**
 * Flow Seed Service
 *
 * Helpers compartilhados para criar os 7 flows padrão (welcome, site_abandoned,
 * browse_abandonment, abandoned_cart, upsell, win_back, shipping_stages) +
 * 38 emails default de uma loja.
 *
 * Mantém paridade 1:1 com a migration SQL `20260626_auto_seed_flows.sql`
 * (trigger AFTER INSERT em client_stores). O endpoint
 * `/api/admin/stores/[id]/init-flows` continua usando este service para
 * reparar lojas legadas.
 *
 * Idempotente: skip flows já existentes (via flow_type) e emails já
 * existentes (via number).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type FlowTypeKey =
  | "welcome"
  | "site_abandoned"
  | "browse_abandonment"
  | "abandoned_cart"
  | "upsell"
  | "win_back"
  | "shipping_stages"

export interface DefaultFlowDef {
  flow_type: FlowTypeKey
  name: string
  description: string
  status: "in_progress"
  position: number
}

export interface DefaultEmailDef {
  number: number
  name: string
  delay_hours: number
}

/**
 * Catálogo canônico dos 7 flows. TODOS nascem `in_progress` (decisão AE-17
 * — `blocked` deixa de ser status inicial diferenciado). `post_purchase`
 * fica fora (deprecated; preservado no enum por retrocompat).
 */
export const DEFAULT_FLOWS: DefaultFlowDef[] = [
  {
    flow_type: "welcome",
    name: "Welcome Flow",
    description: "Sequência de boas-vindas para novos inscritos",
    status: "in_progress",
    position: 1,
  },
  {
    flow_type: "site_abandoned",
    name: "Site Abandoned",
    description: "Recuperação de visitantes que saíram do site sem interagir",
    status: "in_progress",
    position: 2,
  },
  {
    flow_type: "browse_abandonment",
    name: "Browse Abandoned",
    description: "Recuperação de navegação sem compra",
    status: "in_progress",
    position: 3,
  },
  {
    flow_type: "abandoned_cart",
    name: "Carrinho Abandonado",
    description: "Recuperação de carrinho abandonado",
    status: "in_progress",
    position: 4,
  },
  {
    flow_type: "upsell",
    name: "Upsell",
    description: "Upsell pós-compra para aumentar ticket médio",
    status: "in_progress",
    position: 5,
  },
  {
    flow_type: "win_back",
    name: "Winback",
    description: "Reativação de clientes inativos",
    status: "in_progress",
    position: 6,
  },
  {
    flow_type: "shipping_stages",
    name: "Etapas de Envio",
    description: "Notificações transacionais durante o envio do pedido",
    status: "in_progress",
    position: 7,
  },
]

/**
 * 38 emails default distribuídos pelos 7 flows. Names e delay_hours batem
 * 100% com a migration `20260620_email_flows_restructure.sql` e o endpoint
 * legado `init-flows/route.ts`.
 */
export const DEFAULT_EMAILS: Record<FlowTypeKey, DefaultEmailDef[]> = {
  welcome: [
    { number: 1, name: "Welcome 1", delay_hours: 0 },
    { number: 2, name: "Welcome 2", delay_hours: 24 },
    { number: 3, name: "Welcome 3", delay_hours: 48 },
    { number: 4, name: "Welcome 4", delay_hours: 96 },
    { number: 5, name: "Welcome 5", delay_hours: 120 },
    { number: 6, name: "Welcome 6", delay_hours: 144 },
    { number: 7, name: "Welcome 7", delay_hours: 168 },
    { number: 8, name: "Welcome 8", delay_hours: 192 },
  ],
  site_abandoned: [
    { number: 1, name: "Site Abandoned 1", delay_hours: 1 },
  ],
  browse_abandonment: [
    { number: 1, name: "Browse Abandoned 1", delay_hours: 1 },
    { number: 2, name: "Browse Abandoned 2", delay_hours: 24 },
    { number: 3, name: "Browse Abandoned 3", delay_hours: 48 },
    { number: 4, name: "Browse Abandoned 4", delay_hours: 72 },
    { number: 5, name: "Browse Abandoned 5", delay_hours: 120 },
  ],
  abandoned_cart: [
    { number: 1, name: "Carrinho Abandonado 1", delay_hours: 1 },
    { number: 2, name: "Carrinho Abandonado 2", delay_hours: 4 },
    { number: 3, name: "Carrinho Abandonado 3", delay_hours: 24 },
    { number: 4, name: "Carrinho Abandonado 4", delay_hours: 48 },
    { number: 5, name: "Carrinho Abandonado 5", delay_hours: 72 },
    { number: 6, name: "Carrinho Abandonado 6", delay_hours: 96 },
    { number: 7, name: "Carrinho Abandonado 7", delay_hours: 120 },
    { number: 8, name: "Carrinho Abandonado 8", delay_hours: 168 },
  ],
  upsell: [
    { number: 1, name: "Upsell 1", delay_hours: 24 },
    { number: 2, name: "Upsell 2", delay_hours: 72 },
    { number: 3, name: "Upsell 3", delay_hours: 168 },
    { number: 4, name: "Upsell 4", delay_hours: 336 },
  ],
  win_back: [
    { number: 1, name: "Winback 1", delay_hours: 0 },
    { number: 2, name: "Winback 2", delay_hours: 168 },
    { number: 3, name: "Winback 3", delay_hours: 336 },
  ],
  shipping_stages: [
    { number: 1, name: "Pedido Pago", delay_hours: 0 },
    { number: 2, name: "Pedido em separação", delay_hours: 0 },
    { number: 3, name: "Pedido em coleta", delay_hours: 0 },
    { number: 4, name: "Atraso na Entrega", delay_hours: 0 },
    { number: 5, name: "Pedido Enviado", delay_hours: 0 },
  ],
}

export interface SeedDefaultFlowsResult {
  /** Quantidade de flows novos criados nesta execução. */
  flows_created: number
  /** Quantidade de emails novos criados nesta execução. */
  emails_created: number
  /** Quantidade de flows que já existiam (não foram tocados). */
  skipped: number
}

/**
 * A régua vigente de um fluxo: o que a tela "Arquitetura dos Emails" gravou
 * em `email_flow_templates`, caindo em `DEFAULT_EMAILS` quando a tabela não
 * responde.
 *
 * O fallback não é decoração: sem ele, uma migration não aplicada faria a
 * loja nova nascer SEM e-mail nenhum — falha silenciosa, e a pior possível
 * neste caminho. Só a régua ATIVA entra; um e-mail removido na tela não é
 * semeado para lojas novas, e as antigas seguem intocadas.
 */
export async function loadFlowRuler(
  admin: SupabaseClient,
): Promise<Record<string, DefaultEmailDef[]>> {
  try {
    const { data, error } = await admin
      .from("email_flow_templates")
      .select("flow_type, email_number, name, delay_hours")
      .eq("is_active", true)
      .order("flow_type")
      .order("email_number", { ascending: true })
    if (error) throw error

    const rows = (data ?? []) as Array<{
      flow_type: string
      email_number: number
      name: string
      delay_hours: number
    }>
    if (rows.length === 0) return DEFAULT_EMAILS

    const byFlow: Record<string, DefaultEmailDef[]> = {}
    for (const r of rows) {
      ;(byFlow[r.flow_type] ??= []).push({
        number: r.email_number,
        name: r.name,
        delay_hours: r.delay_hours,
      })
    }
    // Fluxo ausente da tabela mantém o default — nunca fica sem e-mail
    // porque alguém ainda não abriu aquele fluxo na tela.
    return { ...DEFAULT_EMAILS, ...byFlow }
  } catch {
    return DEFAULT_EMAILS
  }
}

/**
 * Cria os 7 flows + os emails da régua vigente para uma loja. Idempotente:
 * - Flows existentes (mesmo flow_type) são ignorados.
 * - Emails existentes (mesmo number dentro do flow) são ignorados.
 *
 * Em loja recém-criada (trigger SQL já rodou), normalmente retorna
 * `{ flows_created: 0, emails_created: 0, skipped: 7 }`.
 */
export async function seedDefaultFlows(
  storeId: string,
  admin: SupabaseClient,
): Promise<SeedDefaultFlowsResult> {
  // 1. Verifica flows existentes
  const { data: existing, error: fetchErr } = await admin
    .from("email_flows")
    .select("id, flow_type")
    .eq("store_id", storeId)
  if (fetchErr) throw fetchErr

  const existingByType = new Map<string, string>(
    (existing ?? []).map((f) => [f.flow_type as string, f.id as string]),
  )

  const toInsert = DEFAULT_FLOWS.filter(
    (f) => !existingByType.has(f.flow_type),
  ).map((f) => ({ ...f, store_id: storeId }))

  let flowsCreated = 0
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await admin
      .from("email_flows")
      .insert(toInsert)
      .select("id, flow_type")
    if (insErr) throw insErr
    flowsCreated = inserted?.length ?? 0
    for (const f of inserted ?? []) {
      existingByType.set(f.flow_type as string, f.id as string)
    }
  }

  // 2. Garante os emails da régua vigente em todos os flows (idempotente)
  const ruler = await loadFlowRuler(admin)
  let emailsCreated = 0
  for (const flow of DEFAULT_FLOWS) {
    const flowId = existingByType.get(flow.flow_type)
    if (!flowId) continue
    const defaults = ruler[flow.flow_type]
    if (!defaults || defaults.length === 0) continue

    const { data: existingEmails, error: emailFetchErr } = await admin
      .from("email_flow_emails")
      .select("number")
      .eq("flow_id", flowId)
    if (emailFetchErr) throw emailFetchErr
    const existingNumbers = new Set(
      (existingEmails ?? []).map((e) => e.number as number),
    )

    const emailsToInsert = defaults
      .filter((e) => !existingNumbers.has(e.number))
      .map((e) => ({
        flow_id: flowId,
        number: e.number,
        name: e.name,
        status: "draft" as const,
        delay_hours: e.delay_hours,
      }))

    if (emailsToInsert.length > 0) {
      const { error: emailInsErr } = await admin
        .from("email_flow_emails")
        .insert(emailsToInsert)
      if (emailInsErr) throw emailInsErr
      emailsCreated += emailsToInsert.length
    }
  }

  return {
    flows_created: flowsCreated,
    emails_created: emailsCreated,
    skipped: DEFAULT_FLOWS.length - flowsCreated,
  }
}
