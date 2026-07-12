/**
 * unread-math — regra ÚNICA de contagem de "não lido" dos badges de
 * notificação do admin.
 *
 * Existem duas fontes desconectadas de notificação:
 *  - tabela `notifications` (avisos in-app — o "sino")
 *  - tabela `report_jobs` (relatórios em andamento/prontos não vistos)
 *
 * Até jul/2026 cada badge contava uma fonte diferente (menu da conta =
 * só reports; sino mobile = só notifications) e os números divergiam.
 * Este módulo centraliza a matemática; o hook unificado soma as duas.
 *
 * Módulo puro (zero I/O) — testável.
 */

import type { ReportJobStatus } from "@/types/report"

export const REPORT_ACTIVE_STATUSES: ReportJobStatus[] = [
  "queued",
  "processing",
  "paused",
]

export const REPORT_UNREAD_TERMINAL_STATUSES: ReportJobStatus[] = [
  "completed",
  "partial",
  "failed",
]

export interface ReportJobLike {
  status: ReportJobStatus
  viewed_at?: string | null
}

/** Jobs ativos (rodando/na fila) — contam no badge como "acontecendo agora". */
export function countActiveReportJobs(jobs: ReportJobLike[]): number {
  return jobs.filter((j) => REPORT_ACTIVE_STATUSES.includes(j.status)).length
}

/**
 * Não lidos de relatórios = terminais (completed/partial/failed) ainda
 * não visualizados + ativos. Cancelado/expirado NUNCA contam.
 */
export function countReportUnread(jobs: ReportJobLike[]): number {
  const unreadTerminal = jobs.filter(
    (j) => REPORT_UNREAD_TERMINAL_STATUSES.includes(j.status) && !j.viewed_at,
  ).length
  return unreadTerminal + countActiveReportJobs(jobs)
}

/** Total do badge = sino (notifications não lidas) + relatórios não vistos. */
export function combineUnread(notifUnread: number, reportUnread: number): number {
  return Math.max(0, notifUnread) + Math.max(0, reportUnread)
}
