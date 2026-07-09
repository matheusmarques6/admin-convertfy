/**
 * Tipos do relatório mensal cliente-facing (client_monthly_reports).
 *
 * ReportSnapshot: shape do jsonb `snapshot` cristalizado na geração
 * (consumido pelos slides em report-slides.tsx, preview e print).
 *
 * ReportKpisOverrides: shape do jsonb `kpis_overrides` — edições manuais
 * aplicadas NA LEITURA por applyKpisOverrides
 * (src/lib/services/report-overrides.service.ts). O snapshot original é
 * preservado; restaurar um campo = remover a chave do override.
 */

export interface ReportSnapshot {
  store_name?: string
  client_name?: string
  cm_name?: string
  plan?: string
  month_label?: string
  period?: { start: string; end: string }
  account?: { currency?: string; platform?: string | null }

  // KPIs cristalizados. Campos novos (pedidos_loja, pedidos_atribuidos,
  // etc) sao nullable: null = fonte indisponivel na geracao (slides
  // renderizam "—"); snapshots ANTIGOS nao tem esses campos.
  kpis?: {
    receita_total?: number | null
    receita_atribuida?: number | null
    /** Fração 0–1 (os slides multiplicam por 100). */
    atribuicao_pct?: number | null
    receita_campanhas?: number | null
    receita_flows?: number | null
    /** LEGADO: pedidos da LOJA (em snapshots antigos era o unico campo). */
    pedidos?: number | null
    pedidos_loja?: number | null
    pedidos_atribuidos?: number | null
    ticket_medio?: number | null
    ticket_medio_atribuido?: number | null
    novos_clientes?: number | null
    envios?: number | null
    total_leads?: number | null
    open_rate?: number | null
    click_rate?: number | null
    opened_unique?: number | null
    clicked_unique?: number | null
    spam_rate?: number | null
    recovery_rate?: number | null
    total_campaigns?: number | null
    total_flows?: number | null
  }
  email?: {
    delivered?: number | null
    opened?: number | null
    clicked?: number | null
    open_rate?: number | null
    click_rate?: number | null
    ctor?: number | null
    bounce_rate?: number | null
    unsub_rate?: number | null
    source?: "reports-api" | "rows"
  }
  campaigns?: Array<ReportSnapshotRow>
  flows?: Array<ReportSnapshotRow>
  insights?: {
    capa?: string
    resumo?: string
    atribuida?: string
    email?: string
    rankings?: string
    trabalho?: string
    proximos?: string
  }
}

export interface ReportSnapshotRow {
  id: string
  name: string
  delivered?: number
  recipients?: number
  openRate?: number
  clickRate?: number
  revenue?: number
  revenue_estimated?: boolean
}

/** Chaves numéricas editáveis de snapshot.kpis (SEM a legada `pedidos` —
 *  a edição escreve sempre em pedidos_loja, que o helper storeOrders()
 *  já prioriza sobre o campo legado). */
export interface ReportKpisOverrides {
  /** Moeda de EXIBIÇÃO do relatório (código ISO 4217, ex. "USD") —
   *  sobrepõe snapshot.account.currency na leitura. */
  currency?: string
  kpis?: Partial<{
    receita_total: number
    receita_atribuida: number
    /** Fração 0–1. */
    atribuicao_pct: number
    receita_campanhas: number
    receita_flows: number
    pedidos_loja: number
    pedidos_atribuidos: number
    ticket_medio: number
    ticket_medio_atribuido: number
    novos_clientes: number
    envios: number
    total_leads: number
    open_rate: number
    click_rate: number
    opened_unique: number
    clicked_unique: number
    spam_rate: number
    recovery_rate: number
    total_campaigns: number
    total_flows: number
  }>
  email?: Partial<{
    delivered: number
    open_rate: number
    click_rate: number
    ctor: number
    bounce_rate: number
    unsub_rate: number
  }>
  /** Keyed por row.id do snapshot.campaigns/flows. */
  campaigns?: Record<string, { revenue?: number; name?: string }>
  flows?: Record<string, { revenue?: number; name?: string }>
}

/** Patch enviado ao PATCH da API: mesmas chaves, folhas aceitam null =
 *  "restaurar" (remove a chave persistida). */
export type ReportKpisOverridesPatch = {
  /** null = restaurar a moeda do snapshot. */
  currency?: string | null
  kpis?: Partial<Record<keyof NonNullable<ReportKpisOverrides["kpis"]>, number | null>>
  email?: Partial<Record<keyof NonNullable<ReportKpisOverrides["email"]>, number | null>>
  campaigns?: Record<string, { revenue?: number | null; name?: string | null }>
  flows?: Record<string, { revenue?: number | null; name?: string | null }>
}
