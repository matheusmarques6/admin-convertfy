/**
 * Derivação PURA coluna ← estado para o board unificado da Central de Campanhas.
 *
 * O card do board é a campanha = par (campaign_suggestion, campaign_pipeline_item).
 * A COLUNA É SEMPRE DERIVADA, NUNCA ARMAZENADA. Este módulo é a única fonte da
 * verdade da derivação e é importado dos DOIS lados:
 *   - servidor (board.service.ts → getBoard)
 *   - cliente (use-board.ts → optimistic update no drag)
 *
 * Importar a mesma função nos dois lados evita o card "pular" de coluna quando
 * o SWR revalida depois de um drag otimista (risco transversal do plano).
 *
 * Regras (tabela do plano "Modelo do board"):
 *   Sugestão IA | status='suggested' (sem piloto 'good' em copy_results.test)
 *   Aprovada    | status='approved' E copy_results.production vazio
 *   Copy        | status='approved' E há copy_results.production E max(prod_stage)==0
 *   Design      | max(prod_stage das lojas)==1
 *   Revisão     | max(prod_stage)==2
 *   Agendada    | max(prod_stage)==3
 *   Enviada     | min(prod_stage) >= 4 (todas enviadas)
 *
 * Agregação: max(prod_stage) para colunas intermediárias (mostra progresso),
 * min>=4 para "Enviada" (só sai quando todas enviaram). **Checar status ANTES
 * de prod_stage** (rascunho com item legado não pode cair em "Copy").
 */

import type { CampaignStage } from "@/types/campaign-pipeline"

/** As 7 colunas do board, em ordem (índice = posição no fluxo). */
export const BOARD_COLUMNS = [
  { key: "sugestao", label: "Sugestão IA", color: "#7C3AED", hint: "Geradas pela IA · aprovar ou rejeitar" },
  { key: "aprovada", label: "Aprovada", color: "#2563EB", hint: "COO aprovou · aguardando copy" },
  { key: "copy", label: "Copy", color: "#0891B2", hint: "Gerar e validar a copy por loja" },
  { key: "design", label: "Design", color: "#D97706", hint: "Na fila do designer · monta o e-mail" },
  { key: "revisao", label: "Revisão", color: "#DC2626", hint: "Revisão final antes de agendar" },
  { key: "agendada", label: "Agendada", color: "#9333EA", hint: "Envio agendado na ferramenta de email" },
  { key: "enviada", label: "Enviada", color: "#059669", hint: "Disparada · registrada no admin" },
] as const

export type BoardColumnKey = (typeof BOARD_COLUMNS)[number]["key"]

/** Ordem das colunas, pra cálculo de adjacência no drag. */
export const BOARD_COLUMN_ORDER: BoardColumnKey[] = BOARD_COLUMNS.map((c) => c.key)

/** Índice (0..6) de uma coluna. */
export function boardColumnIndex(col: BoardColumnKey): number {
  return BOARD_COLUMN_ORDER.indexOf(col)
}

/** Rótulo PT-BR da sub-etapa do pipeline de design (design_data.design_stage). */
const CAMPAIGN_DESIGN_STAGE_LABELS: Record<string, string> = {
  estrutura: "Estrutura",
  aprovacao: "Aprovação",
  producao: "Produção",
  finalizacao: "Finalização",
}
export function campaignDesignStageLabel(
  slug: string | null | undefined,
): string | null {
  if (!slug) return null
  return CAMPAIGN_DESIGN_STAGE_LABELS[slug] ?? null
}

/**
 * Fallback: stage global do item → estágio por loja (0..4) para itens antigos
 * (sem prod_stage no JSONB target_stores). DEVE espelhar `stageToProdIndex` de
 * production.service.ts pra não divergir da aba de produção legada.
 */
export function stageToProdIndex(stage: CampaignStage): number {
  switch (stage) {
    case "design":
      return 1
    case "review":
      return 2
    case "ready_to_deploy":
    case "deploying":
      return 3
    case "deployed":
      return 4
    default:
      // idea, briefing, copy_creation
      return 0
  }
}

/** Entrada da derivação — o estado mínimo necessário pra decidir a coluna. */
export interface BoardDerivationInput {
  /** Status da campaign_suggestion atrelada (ou null se card sem sugestão). */
  status: "suggested" | "approved" | "dismissed" | null
  /** Há ao menos 1 entry em copy_results.production (copy de rollout gerada)? */
  hasProductionCopy: boolean
  /**
   * prod_stage (0..4) de CADA loja do pipeline_item, JÁ resolvido com fallback
   * de stage legado (use resolveProdStages). Vazio = sem pipeline_item ainda.
   */
  prodStages: number[]
}

/**
 * Resolve a lista de prod_stage por loja aplicando o fallback de stage legado
 * por loja (mesma regra de production.service.ts:182).
 */
export function resolveProdStages(
  targetStores: Array<{ prod_stage?: number | null }>,
  itemStage: CampaignStage,
): number[] {
  const fallback = stageToProdIndex(itemStage)
  return targetStores.map((t) => (typeof t.prod_stage === "number" ? t.prod_stage : fallback))
}

/** max(prodStages), 0 se vazio. */
function maxProdStage(prodStages: number[]): number {
  return prodStages.length === 0 ? 0 : Math.max(...prodStages)
}

/** min(prodStages), -1 se vazio (nunca conta como "todas enviadas"). */
function minProdStage(prodStages: number[]): number {
  return prodStages.length === 0 ? -1 : Math.min(...prodStages)
}

/**
 * Deriva a coluna do board a partir do estado da campanha.
 *
 * ORDEM IMPORTA: status é checado ANTES de prod_stage. Um pipeline_item legado
 * atrelado a uma sugestão ainda 'suggested' fica em "Sugestão IA", nunca cai em
 * "Copy/Design" só porque o JSONB tem prod_stage > 0.
 */
export function deriveBoardColumn(input: BoardDerivationInput): BoardColumnKey {
  const { status, hasProductionCopy, prodStages } = input

  // 1) Sugestão ainda não aprovada → sempre coluna inicial.
  //    (dismissed nunca chega ao board; defensivamente cai aqui também.)
  if (status !== "approved") {
    return "sugestao"
  }

  // 2) Aprovada mas sem nenhuma loja em produção → "Aprovada"/"Copy".
  //    Sem pipeline_item (prodStages vazio): "Aprovada" enquanto não há copy
  //    de produção; "Copy" assim que a copy de rollout foi disparada.
  if (prodStages.length === 0) {
    return hasProductionCopy ? "copy" : "aprovada"
  }

  // 3) Todas as lojas enviadas (min >= 4) → "Enviada".
  if (minProdStage(prodStages) >= 4) {
    return "enviada"
  }

  // 4) Colunas intermediárias por max(prod_stage) — mostra o progresso.
  const top = maxProdStage(prodStages)
  switch (top) {
    case 0:
      // prod_stage 0 = copy. Sem copy de produção ainda → "Aprovada".
      return hasProductionCopy ? "copy" : "aprovada"
    case 1:
      return "design"
    case 2:
      return "revisao"
    case 3:
      return "agendada"
    default:
      // max >= 4 mas min < 4: algumas enviadas, outras não → "Agendada"
      // (ainda há peça pendente; só vai pra "Enviada" quando TODAS enviarem).
      return "agendada"
  }
}
