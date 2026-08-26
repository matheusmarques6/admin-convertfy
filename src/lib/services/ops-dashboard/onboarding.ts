/**
 * Resumo do Onboarding pro Dashboard Operacional — counts que antes só
 * existiam client-side no kanban (que baixava TODOS os onboardings com
 * tasks aninhadas). Aqui é aritmética pura sobre linhas magras.
 *
 * Atrasado = mesma régua do kanban (onboarding-kanban.tsx isOverdue):
 * horas na coluna atual >= sla_hours da coluna.
 */

export interface OnboardingRow {
  id: string
  current_column_id: string | null
  entered_at: string | null
  last_column_change_at: string | null
  store_name: string | null
}

export interface PipelineColumnRow {
  id: string
  name: string
  slug: string | null
  position: number
  color: string | null
  sla_hours: number | null
}

export interface OnboardingSummary {
  in_progress: number
  avg_days: number | null
  overdue: number
  phases: Array<{ id: string; name: string; slug: string | null; color: string | null; count: number }>
  oldest: Array<{ id: string; store_name: string; phase: string; days_in_phase: number }>
}

const DAY_MS = 86_400_000

export function summarizeOnboardings(
  rows: OnboardingRow[],
  columns: PipelineColumnRow[],
  now: Date = new Date(),
  oldestLimit = 5,
): OnboardingSummary {
  const colById = new Map(columns.map((c) => [c.id, c]))
  const counts = new Map<string, number>()
  let overdue = 0
  let totalAgeDays = 0
  let agedCount = 0

  const withPhaseAge = rows.map((r) => {
    const col = r.current_column_id ? colById.get(r.current_column_id) : undefined
    if (r.current_column_id) {
      counts.set(r.current_column_id, (counts.get(r.current_column_id) ?? 0) + 1)
    }
    const changedAt = r.last_column_change_at ? new Date(r.last_column_change_at).getTime() : NaN
    const phaseMs = Number.isFinite(changedAt) ? now.getTime() - changedAt : NaN
    if (col?.sla_hours != null && Number.isFinite(phaseMs) && phaseMs / 3_600_000 >= col.sla_hours) {
      overdue++
    }
    const enteredAt = r.entered_at ? new Date(r.entered_at).getTime() : NaN
    if (Number.isFinite(enteredAt)) {
      totalAgeDays += (now.getTime() - enteredAt) / DAY_MS
      agedCount++
    }
    return {
      id: r.id,
      store_name: r.store_name || "—",
      phase: col?.name ?? "—",
      days_in_phase: Number.isFinite(phaseMs) ? Math.floor(phaseMs / DAY_MS) : 0,
    }
  })

  const phases = [...columns]
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      color: c.color,
      count: counts.get(c.id) ?? 0,
    }))

  const oldest = withPhaseAge
    .sort((a, b) => b.days_in_phase - a.days_in_phase)
    .slice(0, oldestLimit)

  return {
    in_progress: rows.length,
    avg_days: agedCount > 0 ? Math.round(totalAgeDays / agedCount) : null,
    overdue,
    phases,
    oldest,
  }
}
