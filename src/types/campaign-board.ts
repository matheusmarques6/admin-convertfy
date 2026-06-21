/**
 * Tipos do board unificado de 7 colunas da Central de Campanhas (Fase 2).
 *
 * O card = campanha = par (campaign_suggestion, campaign_pipeline_item). A
 * coluna é DERIVADA (board-mapping.ts), nunca armazenada. Um card pode existir
 * só como sugestão (status 'suggested'/'approved' ainda sem pipeline_item) ou
 * já com produção por loja (target_stores).
 */

import type { BoardColumnKey } from "@/lib/services/campaign-central/board-mapping"
import type { CampaignSuggestionType } from "./campaign-central"
import type { ProductionDesigner, ProductionStore } from "./campaign-production"

export type { BoardColumnKey }

/** Loja-alvo de um card sem produção por loja ainda (só sugestão). */
export interface BoardCardTarget {
  store_id: string
  store_name: string
  country: string
}

/** Um card do board = uma campanha. */
export interface BoardCard {
  /** Identidade do card. Usa pipeline_item_id quando existe; senão sugg:{id}. */
  id: string
  /** ID da campaign_suggestion atrelada (pode ser null em itens legados). */
  suggestion_id: string | null
  /** ID do campaign_pipeline_item (null = card só-sugestão, sem produção). */
  pipeline_item_id: string | null
  /** Coluna DERIVADA server-side (board-mapping). Cliente re-deriva no drag. */
  column: BoardColumnKey
  /** Status da sugestão atrelada (pra re-derivar coluna no cliente). */
  status: "suggested" | "approved" | "dismissed" | null
  type: CampaignSuggestionType
  title: string
  subject: string | null
  angle: string | null
  channel: string
  confidence: number | null
  low_perf: boolean
  send_date: string | null
  /** Dias até o envio (negativo = atrasado, null = sem data). */
  send_in: number | null
  /** Lojas-alvo (resumo). Vem dos targets da sugestão OU das stores do item. */
  targets: BoardCardTarget[]
  /** Produção por loja (vazio enquanto o card é só sugestão sem pipeline_item). */
  stores: ProductionStore[]
  /** Há ao menos 1 entry em copy_results.test marcada quality='good'?
   *  Gate de "Sugestão → Aprovada" — UI pré-desabilita o drag quando false. */
  has_pilot_good: boolean
  /** Há ao menos 1 entry em copy_results.production (copy de rollout gerada)? */
  has_production_copy: boolean
  /** Nº de copies de produção geradas (chip "Copy" no card). */
  production_copy_count: number
}

export interface BoardResponse {
  cards: BoardCard[]
  designers: ProductionDesigner[]
  count: number
}
