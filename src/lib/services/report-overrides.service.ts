/**
 * Report Overrides Service
 *
 * Aplica edições manuais (kpis_overrides) sobre o snapshot do relatório
 * mensal NA LEITURA — o snapshot cristalizado nunca é reescrito com
 * valores editados, então cada campo pode ser restaurado ao original e o
 * resync não apaga edições (coluna separada).
 *
 * PURO e sem imports de servidor: usado tanto por server components
 * (print, ai-fill) quanto pelo editor client (preview ao vivo).
 *
 * Mesmo padrão de applyMetricsOverrides do weekly report
 * (src/lib/services/weekly-report.service.ts).
 */

import type {
  ReportSnapshot,
  ReportKpisOverrides,
  ReportKpisOverridesPatch,
} from "@/types/monthly-report"

export interface ApplyKpisOverridesResult {
  snapshot: ReportSnapshot
  /** Paths explicitamente editados, ex.: "kpis.receita_total",
   *  "email.open_rate", "campaigns.<id>.revenue". Derivados recalculados
   *  NÃO entram aqui. */
  overriddenPaths: string[]
}

function isEmptyOverrides(o: ReportKpisOverrides | null | undefined): boolean {
  if (!o) return true
  const hasKeys = (obj?: Record<string, unknown>) =>
    !!obj && Object.keys(obj).length > 0
  return !hasKeys(o.kpis) && !hasKeys(o.email) && !hasKeys(o.campaigns) && !hasKeys(o.flows)
}

/**
 * Merge dos overrides sobre o snapshot + recálculo de derivados.
 *
 * Derivados (atribuicao_pct, ticket_medio, ticket_medio_atribuido) são
 * recalculados quando um dos seus componentes foi editado E o próprio
 * derivado NÃO foi editado explicitamente (override explícito sempre
 * vence). NÃO cascateia camp+flows→atribuída nem Σrows→receita_campanhas:
 * as linhas são estimadas por share e a atribuída pode incluir SMS —
 * cada total é editável de forma independente.
 */
export function applyKpisOverrides(
  snapshot: ReportSnapshot,
  overrides: ReportKpisOverrides | null | undefined,
): ApplyKpisOverridesResult {
  if (isEmptyOverrides(overrides)) {
    return { snapshot, overriddenPaths: [] }
  }
  const o = overrides as ReportKpisOverrides
  // Deep clone (consistente com applyMetricsOverrides do weekly)
  const out = JSON.parse(JSON.stringify(snapshot)) as ReportSnapshot
  const paths: string[] = []

  // ── kpis ────────────────────────────────────────────────────────────
  const ok = o.kpis ?? {}
  if (Object.keys(ok).length > 0) {
    out.kpis = out.kpis ?? {}
    for (const [key, value] of Object.entries(ok)) {
      if (value === undefined) continue
      ;(out.kpis as Record<string, unknown>)[key] = value
      paths.push(`kpis.${key}`)
    }
  }

  // ── email ───────────────────────────────────────────────────────────
  const oe = o.email ?? {}
  if (Object.keys(oe).length > 0) {
    out.email = out.email ?? {}
    for (const [key, value] of Object.entries(oe)) {
      if (value === undefined) continue
      ;(out.email as Record<string, unknown>)[key] = value
      paths.push(`email.${key}`)
    }
  }

  // ── rows (campaigns / flows), keyed por id ─────────────────────────
  for (const branch of ["campaigns", "flows"] as const) {
    const rowOverrides = o[branch]
    if (!rowOverrides) continue
    for (const [id, patch] of Object.entries(rowOverrides)) {
      const row = out[branch]?.find((r) => r.id === id)
      // id ausente (linha saiu do top-N após resync) → override dormant:
      // skip silencioso; volta a valer se a linha reaparecer.
      if (!row) continue
      if (patch.revenue !== undefined) {
        row.revenue = patch.revenue
        // Valor manual não é estimativa — remove a flag "~" da linha
        row.revenue_estimated = false
        paths.push(`${branch}.${id}.revenue`)
      }
      if (patch.name !== undefined) {
        row.name = patch.name
        paths.push(`${branch}.${id}.name`)
      }
    }
  }

  // ── Derivados (só recalcula os NÃO editados explicitamente) ─────────
  if (out.kpis) {
    const k = out.kpis
    const edited = (key: string) => key in ok

    const receitaTotal = k.receita_total ?? null
    const receitaAtribuida = k.receita_atribuida ?? null
    const pedidosLoja = k.pedidos_loja ?? k.pedidos ?? null
    const pedidosAtribuidos = k.pedidos_atribuidos ?? null

    const revenueEdited = edited("receita_total") || edited("receita_atribuida")
    if (revenueEdited && !edited("atribuicao_pct")) {
      k.atribuicao_pct =
        receitaTotal !== null && receitaTotal > 0 && receitaAtribuida !== null
          ? receitaAtribuida / receitaTotal
          : k.atribuicao_pct ?? null
    }
    if ((edited("receita_total") || edited("pedidos_loja")) && !edited("ticket_medio")) {
      k.ticket_medio =
        pedidosLoja !== null && pedidosLoja > 0 && receitaTotal !== null
          ? receitaTotal / pedidosLoja
          : k.ticket_medio ?? null
    }
    if (
      (edited("receita_atribuida") || edited("pedidos_atribuidos")) &&
      !edited("ticket_medio_atribuido")
    ) {
      k.ticket_medio_atribuido =
        pedidosAtribuidos !== null && pedidosAtribuidos > 0 && receitaAtribuida !== null
          ? receitaAtribuida / pedidosAtribuidos
          : k.ticket_medio_atribuido ?? null
    }
  }

  return { snapshot: out, overriddenPaths: paths }
}

/**
 * Merge server-side do patch de edição sobre os overrides persistidos.
 * `null` numa folha = restaurar (remove a chave). Sub-objetos que ficarem
 * vazios são removidos. Preserva chaves não mencionadas no patch.
 */
export function mergeKpisOverrides(
  prev: ReportKpisOverrides | null | undefined,
  patch: ReportKpisOverridesPatch,
): ReportKpisOverrides {
  const out: ReportKpisOverrides = JSON.parse(JSON.stringify(prev ?? {}))

  const mergeFlat = (branch: "kpis" | "email") => {
    const p = patch[branch]
    if (!p) return
    const target = { ...(out[branch] ?? {}) } as Record<string, number>
    for (const [key, value] of Object.entries(p)) {
      if (value === undefined) continue
      if (value === null) delete target[key]
      else target[key] = value
    }
    if (Object.keys(target).length > 0) {
      ;(out as Record<string, unknown>)[branch] = target
    } else {
      delete out[branch]
    }
  }
  mergeFlat("kpis")
  mergeFlat("email")

  const mergeRows = (branch: "campaigns" | "flows") => {
    const p = patch[branch]
    if (!p) return
    const target = { ...(out[branch] ?? {}) } as Record<
      string,
      { revenue?: number; name?: string }
    >
    for (const [id, rowPatch] of Object.entries(p)) {
      const row = { ...(target[id] ?? {}) }
      if (rowPatch.revenue !== undefined) {
        if (rowPatch.revenue === null) delete row.revenue
        else row.revenue = rowPatch.revenue
      }
      if (rowPatch.name !== undefined) {
        if (rowPatch.name === null) delete row.name
        else row.name = rowPatch.name
      }
      if (Object.keys(row).length > 0) target[id] = row
      else delete target[id]
    }
    if (Object.keys(target).length > 0) {
      ;(out as Record<string, unknown>)[branch] = target
    } else {
      delete out[branch]
    }
  }
  mergeRows("campaigns")
  mergeRows("flows")

  return out
}
