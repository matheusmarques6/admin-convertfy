/**
 * Ponte Onboarding → Gestão de Carteira (puro, client-safe).
 *
 * A carteira tem uma etapa "Onboarding" que NÃO é gerida por health
 * score: ela espelha o pipeline operacional real. A loja só entra em
 * acompanhamento (faixa Saudável/Atenção/Risco) quando o onboarding
 * chega na coluna de handoff — "Cliente ativo".
 *
 * Por que a COLUNA e não o `status`: hoje, na base de produção, 24
 * onboardings estão parados em `status='in_progress'` na coluna
 * "Cliente ativo". O status não é encerrado no handoff — quem diz que
 * o cliente virou acompanhamento é a coluna. Usar o status jogaria
 * essas lojas de volta para a coluna de onboarding para sempre.
 */

/** Status que encerram o onboarding sem passar pela coluna de handoff. */
const DONE_STATUSES = new Set(["completed"])
const DROPPED_STATUSES = new Set(["cancelled"])

export interface OnboardingRow {
  id: string
  store_id: string
  status: string | null
  /** Coluna atual no pipeline operacional. */
  column_slug: string | null
  column_name: string | null
  column_is_final: boolean | null
  entered_at: string | null
  last_column_change_at: string | null
  created_at: string | null
}

export interface StoreOnboardingState {
  onboarding_id: string
  /** Nome da coluna atual no pipeline operacional. */
  phase: string | null
  phase_slug: string | null
  /** Desde quando está nesta fase (para "há N dias"). */
  since: string | null
  /** true = ainda não chegou no handoff; a loja fica na etapa Onboarding. */
  in_onboarding: boolean
}

/**
 * A coluna de handoff ("Cliente ativo - Handoff pro time de
 * Acompanhamento"). Reconhecida pelo slug canônico; `is_final` e o
 * nome com "ativo" são redes de segurança para org que renomeou a
 * coluna — o pipeline operacional é editável.
 */
export function isHandoffColumn(row: {
  column_slug: string | null
  column_name: string | null
  column_is_final: boolean | null
}): boolean {
  const slug = (row.column_slug ?? "").toLowerCase()
  if (slug === "cliente_ativo") return true
  if (row.column_is_final === true) return true
  return /\bativ[oa]s?\b/i.test(row.column_name ?? "")
}

/** Onboarding que já entregou a loja para o acompanhamento. */
function isHandedOff(row: OnboardingRow): boolean {
  const status = (row.status ?? "").toLowerCase()
  if (DONE_STATUSES.has(status)) return true
  return isHandoffColumn(row)
}

/** Onboarding abandonado — não segura a loja fora do acompanhamento. */
function isDropped(row: OnboardingRow): boolean {
  return DROPPED_STATUSES.has((row.status ?? "").toLowerCase())
}

const timeOf = (row: OnboardingRow): number => {
  const v = row.last_column_change_at ?? row.entered_at ?? row.created_at
  const t = v ? Date.parse(v) : NaN
  return Number.isNaN(t) ? 0 : t
}

/**
 * Estado de onboarding de UMA loja a partir de todos os onboardings
 * dela.
 *
 * Um onboarding já entregue VENCE um pendente: a loja que já virou
 * acompanhamento não volta para a coluna de onboarding. É o caso real
 * do duplicado (o cron `process-deal-won` e o dialog de venda ganha
 * podiam criar dois) e o do re-onboarding de cliente antigo.
 */
export function resolveStoreOnboarding(rows: OnboardingRow[]): StoreOnboardingState | null {
  if (rows.length === 0) return null

  const handedOff = rows.filter(isHandedOff).sort((a, b) => timeOf(b) - timeOf(a))
  if (handedOff.length > 0) {
    const r = handedOff[0]
    return {
      onboarding_id: r.id,
      phase: r.column_name,
      phase_slug: r.column_slug,
      since: r.last_column_change_at ?? r.entered_at ?? r.created_at,
      in_onboarding: false,
    }
  }

  const pending = rows.filter((r) => !isDropped(r)).sort((a, b) => timeOf(b) - timeOf(a))
  if (pending.length === 0) {
    // Só cancelados: a loja não está em onboarding e não há fase a
    // mostrar — o acompanhamento segue pela régua de score.
    return null
  }
  const r = pending[0]
  return {
    onboarding_id: r.id,
    phase: r.column_name,
    phase_slug: r.column_slug,
    since: r.last_column_change_at ?? r.entered_at ?? r.created_at,
    in_onboarding: true,
  }
}

/** Estado por loja (uma passada nas linhas do banco). */
export function buildOnboardingStateByStore(
  rows: OnboardingRow[],
): Map<string, StoreOnboardingState> {
  const byStore = new Map<string, OnboardingRow[]>()
  for (const row of rows) {
    if (!row.store_id) continue
    const list = byStore.get(row.store_id) ?? []
    list.push(row)
    byStore.set(row.store_id, list)
  }
  const out = new Map<string, StoreOnboardingState>()
  for (const [storeId, list] of byStore) {
    const state = resolveStoreOnboarding(list)
    if (state) out.set(storeId, state)
  }
  return out
}

/** Nome canônico da etapa da carteira que espelha o onboarding. */
export const CARTEIRA_ONBOARDING_STAGE = "Onboarding"

/**
 * A etapa da carteira é reconhecida pelo NOME (a pipeline é editável e
 * não tem slug). Só o nome exato "Onboarding" — uma etapa chamada
 * "Pós-onboarding" não deve ser confundida com ela.
 */
export function isOnboardingStageName(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "onboarding"
}
