/**
 * Contrato de dados do dashboard de funil — tipos + carregamento.
 *
 * Vive separado da UI porque é lógica pura e testável: foi aqui que
 * nasceu o crash "Algo deu errado" em /admin/comercial/funil. O fetcher
 * antigo (`r => r.json()`) devolvia o corpo de erro da API como se fosse
 * dado válido; `data` ficava truthy sem o shape esperado e o primeiro
 * acesso a `data.ad_spend.entries` lançava TypeError, derrubando a
 * página inteira no ErrorBoundary.
 *
 * Duas defesas, cobertas por teste:
 *   1. `fetcher` rejeita resposta não-2xx → SWR trata como erro e a UI
 *      mostra o aviso com "Tentar novamente".
 *   2. `normalizeFunnelData` preenche payload parcial → nenhum acesso
 *      aninhado pode explodir, mesmo se a API mudar de shape.
 */

export interface FunnelPipelineStage {
  id: string
  name: string
  order: number
  stage_type: string
  funnel_step: string | null
}

export interface FunnelPipeline {
  id: string
  name: string
  color: string | null
  stages: FunnelPipelineStage[]
}

export interface AdSpendEntry {
  id: string
  day: string
  platform: string
  account_name: string
  amount: number
  notes: string | null
}

export interface ConnectedAdAccount {
  id: string
  account_id: string
  account_name: string
  last_synced_at: string | null
  last_sync_status: string | null
  last_sync_error: string | null
}

export interface CreativePerformance {
  ad_name: string
  campaign_name: string
  adset_name: string
  spend: number
  impressions: number
  clicks: number
  leads_meta: number
  leads_crm: number
  vendas: number
  receita: number
  cpl: number | null
  cpa: number | null
  roas: number | null
}

export interface FunnelApiData {
  window: { days: number; from: string; to: string }
  funnel: { leads: number; mql: number; agendamento: number; reuniao: number; venda: number }
  rates: {
    leads_mql: number | null
    mql_agendamento: number | null
    agendamento_reuniao: number | null
    reuniao_venda: number | null
  }
  metrics: {
    investimento: number
    faturamento: number
    cash_collect: number
    roas: number | null
    tx_conversao: number | null
    ticket_medio: number | null
    taxa_cash_collect: number | null
    cpl: number | null
    custo_mql: number | null
    custo_agendamento: number | null
    custo_reuniao: number | null
    cpa: number | null
  }
  ad_spend: {
    total: number
    manual: number
    synced: number
    by_account: Array<{ platform: string; account_name: string; amount: number }>
    entries: AdSpendEntry[]
  }
  ad_accounts: ConnectedAdAccount[]
  creatives: CreativePerformance[]
  vendas: Array<{
    id: string
    title: string
    value: number
    cash_collected: number | null
    won_at: string | null
    pipeline_id: string
  }>
  pipelines: FunnelPipeline[]
  mapped_steps: string[]
  /** Tabelas/colunas do funil ausentes no banco (migration pendente). */
  schema_missing?: string[]
  utm_options: { sources: string[]; mediums: string[]; campaigns: string[] }
}

/** Lança em resposta não-2xx pra o SWR tratar como erro de verdade. */
export const fetchFunnel = async (url: string): Promise<FunnelApiData> => {
  const res = await fetch(url)
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (!res.ok || !json || typeof json !== "object") {
    const raw = json?.error
    const message =
      (typeof raw === "string"
        ? raw
        : (raw as { message?: string } | undefined)?.message) ??
      `Falha ao carregar o funil (${res.status})`
    throw new Error(message)
  }
  return json as unknown as FunnelApiData
}

const EMPTY_FUNNEL: FunnelApiData["funnel"] = {
  leads: 0,
  mql: 0,
  agendamento: 0,
  reuniao: 0,
  venda: 0,
}

const EMPTY_RATES: FunnelApiData["rates"] = {
  leads_mql: null,
  mql_agendamento: null,
  agendamento_reuniao: null,
  reuniao_venda: null,
}

const EMPTY_METRICS: FunnelApiData["metrics"] = {
  investimento: 0,
  faturamento: 0,
  cash_collect: 0,
  roas: null,
  tx_conversao: null,
  ticket_medio: null,
  taxa_cash_collect: null,
  cpl: null,
  custo_mql: null,
  custo_agendamento: null,
  custo_reuniao: null,
  cpa: null,
}

/**
 * Preenche os buracos de um payload parcial. Normalizar uma vez aqui é
 * mais seguro que espalhar optional chaining por toda a árvore da UI.
 */
export function normalizeFunnelData(
  raw?: Partial<FunnelApiData>,
): FunnelApiData | undefined {
  if (!raw || typeof raw !== "object") return undefined
  return {
    window: raw.window ?? { days: 30, from: "", to: "" },
    funnel: { ...EMPTY_FUNNEL, ...(raw.funnel ?? {}) },
    rates: { ...EMPTY_RATES, ...(raw.rates ?? {}) },
    metrics: { ...EMPTY_METRICS, ...(raw.metrics ?? {}) },
    ad_spend: {
      total: raw.ad_spend?.total ?? 0,
      manual: raw.ad_spend?.manual ?? 0,
      synced: raw.ad_spend?.synced ?? 0,
      by_account: raw.ad_spend?.by_account ?? [],
      entries: raw.ad_spend?.entries ?? [],
    },
    ad_accounts: raw.ad_accounts ?? [],
    creatives: raw.creatives ?? [],
    vendas: raw.vendas ?? [],
    pipelines: raw.pipelines ?? [],
    mapped_steps: raw.mapped_steps ?? [],
    schema_missing: raw.schema_missing ?? [],
    utm_options: raw.utm_options ?? { sources: [], mediums: [], campaigns: [] },
  }
}
