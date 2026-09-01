/**
 * Regras EDITÁVEIS do health score de loja — tipos, defaults e
 * sanitização. Puro e client-safe (a UI de regras importa daqui).
 *
 * O que é configurável:
 * - weights: peso relativo (%) de cada componente do score. A soma NÃO
 *   precisa dar 100 — o cálculo renormaliza sobre os componentes com
 *   dado presente (regra da renormalização por presença do
 *   crm-health.service).
 * - stage_thresholds: faixas que movem a loja na Gestão de Carteira
 *   (score >= healthy → 1ª etapa aberta; >= attention → 2ª; senão 3ª).
 * - alert_threshold / alert_critical: score abaixo do qual nasce um
 *   store_alert, e abaixo do qual ele é severidade "critical".
 *
 * As fórmulas INTERNAS de cada componente (sub-pesos do email, faixas
 * de razão da receita, penalidades de tickets, NPS/10) seguem em código
 * — o painel as EXIBE como documentação viva, mas editá-las mudaria a
 * semântica do histórico (crm_health_history) e fica fora do escopo.
 *
 * Persistência: tabela `settings` (key/value JSONB), chave
 * "store_health_rules" — ver store-health-rules.service.ts.
 */

export interface StoreHealthWeights {
  email: number
  revenue: number
  tickets: number
  nps: number
}

export interface StoreHealthRules {
  /** Peso relativo (0-100) de cada componente. */
  weights: StoreHealthWeights
  /** Faixas da carteira: >= healthy → Saudável; >= attention → Atenção; senão Risco. */
  stage_thresholds: { healthy: number; attention: number }
  /** Score < alert_threshold cria store_alert. */
  alert_threshold: number
  /** Score < alert_critical faz o alerta nascer "critical" (senão "warning"). */
  alert_critical: number
}

export const STORE_HEALTH_RULES_KEY = "store_health_rules"

export const DEFAULT_STORE_HEALTH_RULES: StoreHealthRules = {
  weights: { email: 35, revenue: 30, tickets: 20, nps: 15 },
  stage_thresholds: { healthy: 80, attention: 60 },
  alert_threshold: 50,
  alert_critical: 30,
}

const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Normaliza input arbitrário (do banco ou do PUT) para regras válidas.
 * Nunca lança: campo inválido cai no default correspondente. Invariantes
 * garantidas: pelo menos um peso > 0; healthy > attention; critical <=
 * alert_threshold.
 */
export function sanitizeStoreHealthRules(input: unknown): StoreHealthRules {
  const d = DEFAULT_STORE_HEALTH_RULES
  const raw = (input ?? {}) as Partial<StoreHealthRules> & {
    weights?: Partial<StoreHealthWeights>
    stage_thresholds?: Partial<StoreHealthRules["stage_thresholds"]>
  }

  const weights: StoreHealthWeights = {
    email: clamp(raw.weights?.email, 0, 100, d.weights.email),
    revenue: clamp(raw.weights?.revenue, 0, 100, d.weights.revenue),
    tickets: clamp(raw.weights?.tickets, 0, 100, d.weights.tickets),
    nps: clamp(raw.weights?.nps, 0, 100, d.weights.nps),
  }
  // Tudo zerado tornaria o score incomputável pra sempre — volta ao default.
  if (weights.email + weights.revenue + weights.tickets + weights.nps === 0) {
    Object.assign(weights, d.weights)
  }

  let healthy = clamp(raw.stage_thresholds?.healthy, 1, 100, d.stage_thresholds.healthy)
  let attention = clamp(raw.stage_thresholds?.attention, 0, 99, d.stage_thresholds.attention)
  if (healthy <= attention) {
    // Faixa invertida não tem leitura possível — restaura a relação.
    ;[healthy, attention] = [Math.max(attention + 1, healthy), Math.min(attention, healthy - 1)]
    if (healthy <= attention) {
      healthy = d.stage_thresholds.healthy
      attention = d.stage_thresholds.attention
    }
  }

  const alert_threshold = clamp(raw.alert_threshold, 0, 100, d.alert_threshold)
  const alert_critical = Math.min(
    clamp(raw.alert_critical, 0, 100, d.alert_critical),
    alert_threshold,
  )

  return { weights, stage_thresholds: { healthy, attention }, alert_threshold, alert_critical }
}
