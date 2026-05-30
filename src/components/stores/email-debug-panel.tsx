"use client"

/**
 * EmailDebugPanel (Epic AE - Story AE-6)
 *
 * Painel colapsavel exibido apenas para admin/owner/tag=dev.
 * Mostra telemetria do pipeline AE: timing por fase com duracoes
 * calculadas, custo total em R$, attempts, qa_issues raw JSON e
 * link para os runs do email em /admin/agents/runs (story AE-9 —
 * placeholder por enquanto).
 *
 * Renderiza dentro de <details> nativo para nao precisar de estado.
 */

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import type { LiveEmail } from "@/hooks/use-emails-live"

interface EmailDebugPanelProps {
  email: LiveEmail
}

interface PhaseSpan {
  label: string
  startedAt: string | null
  endedAt: string | null
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}min`
}

function durationBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (isNaN(s) || isNaN(e)) return null
  return e - s
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

export function EmailDebugPanel({ email }: EmailDebugPanelProps) {
  const t = email.timing
  const phases: PhaseSpan[] = [
    { label: "Copy", startedAt: t.copy_started_at, endedAt: t.copy_ready_at },
    {
      label: "Rendering",
      startedAt: t.rendering_started_at,
      endedAt: t.qa_started_at ?? t.ready_at ?? t.failed_at,
    },
    {
      label: "QA",
      startedAt: t.qa_started_at,
      endedAt: t.ready_at ?? t.failed_at,
    },
  ]

  const e2eMs = durationBetween(
    t.copy_started_at,
    t.ready_at ?? t.failed_at,
  )

  return (
    <details className="border-t border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:bg-gray-100 select-none">
        Debug (dev)
      </summary>

      <div className="px-4 py-3 space-y-4 text-xs">
        {/* Timing */}
        <section>
          <h5 className="font-semibold text-gray-700 mb-2">Timing</h5>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-gray-500">
                <th className="py-1 font-normal">Fase</th>
                <th className="py-1 font-normal">Inicio</th>
                <th className="py-1 font-normal">Fim</th>
                <th className="py-1 font-normal">Duracao</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr key={p.label} className="border-t border-gray-200">
                  <td className="py-1 font-mono">{p.label}</td>
                  <td className="py-1 font-mono text-gray-600">
                    {p.startedAt ? new Date(p.startedAt).toLocaleTimeString("pt-BR") : "—"}
                  </td>
                  <td className="py-1 font-mono text-gray-600">
                    {p.endedAt ? new Date(p.endedAt).toLocaleTimeString("pt-BR") : "—"}
                  </td>
                  <td className="py-1 font-mono">
                    {formatDuration(durationBetween(p.startedAt, p.endedAt))}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 font-semibold">
                <td className="py-1">Total e2e</td>
                <td colSpan={2} />
                <td className="py-1 font-mono">{formatDuration(e2eMs)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Metricas */}
        <section className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-gray-500">Custo total</div>
            <div className="font-mono font-semibold text-gray-900">
              {formatBRL(email.total_cost_cents)}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Attempts</div>
            <div className="font-mono font-semibold text-gray-900">
              {email.attempts}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Batch</div>
            <div className="font-mono text-gray-700">
              {email.generation_batch_id
                ? email.generation_batch_id.slice(0, 8)
                : "—"}
            </div>
          </div>
        </section>

        {/* QA issues */}
        <section>
          <h5 className="font-semibold text-gray-700 mb-1">
            QA Issues ({email.qa_issues?.length ?? 0})
          </h5>
          {email.qa_issues && email.qa_issues.length > 0 ? (
            <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto text-[10px] font-mono text-gray-700">
              {JSON.stringify(email.qa_issues, null, 2)}
            </pre>
          ) : (
            <div className="text-gray-500">Nenhuma issue registrada.</div>
          )}
        </section>

        {/* Failure reason (raw) */}
        {email.failure_reason && (
          <section>
            <h5 className="font-semibold text-gray-700 mb-1">Failure reason</h5>
            <code className="bg-white border border-red-200 rounded px-2 py-1 text-red-700">
              {email.failure_reason}
            </code>
          </section>
        )}

        {/* Link para runs */}
        <section>
          <Link
            href={`/admin/agents/runs?email_id=${email.id}`}
            className="inline-flex items-center gap-1 text-blue-700 hover:underline"
          >
            Ver runs deste email <ExternalLink className="h-3 w-3" />
          </Link>
        </section>
      </div>
    </details>
  )
}
