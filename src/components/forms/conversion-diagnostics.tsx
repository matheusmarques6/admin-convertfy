"use client"

/**
 * Diagnóstico dos eventos de conversão da Meta, dentro da aba
 * Rastreamento do formulário.
 *
 * Antes disto, o recurso falhava sem deixar rastro na interface: o
 * "Lead qualificado" não disparava porque a condição não batia com a
 * resposta, e o "Lead" às vezes ficava para trás na fila com um erro da
 * Meta que ninguém via. A única forma de perceber era abrir o
 * Gerenciador de Eventos e reparar na falta.
 *
 * O painel responde, sem sair do admin:
 *   - a configuração está completa? (o que falta é listado em ordem)
 *   - quantos eventos saíram, quantos falharam e por quê;
 *   - as condições do lead qualificado casariam com quem já se
 *     cadastrou? E, quando não, qual condição reprovou.
 */

import { useState } from "react"
import useSWR from "swr"
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react"
import type { RuleDiagnosis } from "@/lib/services/conversion-dispatch.service"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = (body as { error?: unknown })?.error
    throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
  }
  return body
}

interface EventRow {
  id: string
  event_name: string
  status: string
  attempts: number
  last_error: string | null
  created_at: string
  sent_at: string | null
}

interface SubmissionTest {
  submission_id: string
  created_at: string
  qualified: boolean
  reason: string | null
  rules: RuleDiagnosis[]
}

interface Payload {
  setup: {
    meta_enabled: boolean
    has_pixel: boolean
    has_token: boolean
    qualified_enabled: boolean
    qualified_event_name: string
    qualified_rules: number
    test_event_code: string | null
  }
  blockers: string[]
  totals: { events: number; sent: number; failed: number; queued: number }
  by_event: Record<string, { sent: number; failed: number; queued: number }>
  recent_events: EventRow[]
  qualified_test: {
    submissions_checked: number
    would_qualify: number
    results: SubmissionTest[]
  }
}

const OPERATOR_LABEL: Record<string, string> = {
  equals: "é igual a",
  not_equals: "é diferente de",
  in: "está entre",
  not_in: "não está entre",
  contains: "contém",
  gt: "maior que",
  gte: "maior ou igual a",
  lt: "menor que",
  lte: "menor ou igual a",
  is_set: "está preenchido",
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "pos" | "neg" | "warn" | "neut"
}) {
  const colors = {
    pos: { fg: "var(--crm-pos)", bg: "var(--crm-pos-bg)", br: "var(--crm-pos-border)" },
    neg: { fg: "var(--crm-neg)", bg: "var(--crm-neg-bg)", br: "var(--crm-neg-border)" },
    warn: { fg: "var(--crm-warn)", bg: "var(--crm-warn-bg)", br: "var(--crm-warn-border)" },
    neut: { fg: "var(--crm-gray-700)", bg: "var(--crm-gray-50)", br: "var(--crm-gray-200)" },
  }[tone]
  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded px-3 py-2"
      style={{ background: colors.bg, border: `1px solid ${colors.br}` }}
    >
      <span style={{ fontSize: "var(--crm-text-lg)", fontWeight: 600, color: colors.fg, lineHeight: 1.2 }}>
        {value}
      </span>
      <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)" }}>{label}</span>
    </div>
  )
}

function RuleLine({ rule }: { rule: RuleDiagnosis }) {
  return (
    <li className="flex items-start gap-1.5" style={{ fontSize: "var(--crm-text-xs)" }}>
      {rule.passed ? (
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--crm-pos)" }} />
      ) : (
        <XCircle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--crm-neg)" }} />
      )}
      <span style={{ color: "var(--crm-gray-700)" }}>
        <strong>{rule.field_label ?? "campo removido"}</strong>{" "}
        {OPERATOR_LABEL[rule.operator] ?? rule.operator}{" "}
        {rule.operator !== "is_set" && <em>&quot;{rule.expected}&quot;</em>}
        {rule.field_missing ? (
          <span style={{ color: "var(--crm-neg)" }}> — este campo não existe mais no formulário</span>
        ) : (
          <span style={{ color: "var(--crm-gray-500)" }}>
            {" "}
            · respondeu: {rule.answered ? `"${rule.answered}"` : "(vazio)"}
          </span>
        )}
      </span>
    </li>
  )
}

export function ConversionDiagnostics({ formId }: { formId: string }) {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    `/api/crm/forms/${formId}/conversion-events`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const [retrying, setRetrying] = useState(false)
  const [retryMsg, setRetryMsg] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const retry = async () => {
    setRetrying(true)
    setRetryMsg(null)
    try {
      const res = await fetch(`/api/crm/forms/${formId}/conversion-events`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string })?.error || "Falha ao reprocessar")
      setRetryMsg(
        (body as { requeued?: number }).requeued
          ? `${(body as { requeued: number }).requeued} evento(s) recolocado(s) na fila — o envio sai em até um minuto.`
          : "Não havia evento com falha para reprocessar.",
      )
      mutate()
    } catch (err) {
      setRetryMsg(err instanceof Error ? err.message : "Falha ao reprocessar")
    } finally {
      setRetrying(false)
    }
  }

  if (error) {
    return (
      <div
        className="rounded border px-3 py-2"
        style={{
          borderColor: "var(--crm-neg-border)",
          background: "var(--crm-neg-bg)",
          color: "var(--crm-neg)",
          fontSize: "var(--crm-text-sm)",
        }}
      >
        Não foi possível carregar o diagnóstico: {error instanceof Error ? error.message : "erro"}
      </div>
    )
  }
  if (isLoading || !data) {
    return (
      <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-gray-500)" }}>
        Carregando diagnóstico…
      </p>
    )
  }

  const tests = showAll ? data.qualified_test.results : data.qualified_test.results.slice(0, 5)
  const qualifiedName = data.setup.qualified_event_name

  return (
    <div className="flex flex-col gap-3">
      {/* O que impede o envio */}
      {data.blockers.length > 0 && (
        <div
          className="flex flex-col gap-1 rounded border px-3 py-2"
          style={{
            borderColor: "var(--crm-warn-border)",
            background: "var(--crm-warn-bg)",
            color: "var(--crm-warn)",
            fontSize: "var(--crm-text-xs)",
          }}
        >
          <span className="flex items-center gap-1.5" style={{ fontWeight: 600 }}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Pendências de configuração
          </span>
          <ul className="ml-5 list-disc">
            {data.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Números */}
      <div className="flex flex-wrap gap-2">
        <Metric label="Enviados à Meta" value={data.totals.sent} tone="pos" />
        <Metric label="Na fila" value={data.totals.queued} tone="warn" />
        <Metric label="Com falha" value={data.totals.failed} tone="neg" />
      </div>

      {Object.keys(data.by_event).length > 0 && (
        <div className="flex flex-col gap-1">
          {Object.entries(data.by_event).map(([name, c]) => (
            <div
              key={name}
              className="flex items-center gap-2"
              style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-700)" }}
            >
              <strong className="min-w-0 truncate">{name}</strong>
              <span style={{ color: "var(--crm-pos)" }}>{c.sent} enviados</span>
              {c.queued > 0 && <span style={{ color: "var(--crm-warn)" }}>{c.queued} na fila</span>}
              {c.failed > 0 && <span style={{ color: "var(--crm-neg)" }}>{c.failed} com falha</span>}
            </div>
          ))}
        </div>
      )}

      {/* Teste das condições do lead qualificado */}
      <div
        className="flex flex-col gap-2 rounded border p-3"
        style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-25, #FCFCFD)" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span style={{ fontSize: "var(--crm-text-sm)", fontWeight: 600, color: "var(--crm-gray-900)" }}>
            Teste do &quot;{qualifiedName}&quot;
          </span>
          <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
            {data.qualified_test.would_qualify} de {data.qualified_test.submissions_checked} cadastros
            recentes se enquadram
          </span>
        </div>

        {data.qualified_test.submissions_checked === 0 ? (
          <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)" }}>
            Nenhum cadastro recebido ainda — assim que alguém se cadastrar, o teste aparece aqui.
          </p>
        ) : data.qualified_test.would_qualify === 0 ? (
          <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-neg)" }}>
            Nenhum dos cadastros recentes atende às condições — é por isso que o evento não chega na
            Meta. Veja abaixo qual condição reprovou e ajuste o valor esperado.
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {tests.map((t) => (
            <li
              key={t.submission_id}
              className="flex flex-col gap-1 border-t pt-2 first:border-t-0 first:pt-0"
              style={{ borderColor: "var(--crm-gray-200)" }}
            >
              <div className="flex items-center gap-2" style={{ fontSize: "var(--crm-text-xs)" }}>
                {t.qualified ? (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: "var(--crm-pos)", fontWeight: 600 }}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Qualifica
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: "var(--crm-gray-500)", fontWeight: 600 }}
                  >
                    <XCircle className="h-3 w-3" /> Não qualifica
                  </span>
                )}
                <span style={{ color: "var(--crm-gray-400)" }}>{fmtDateTime(t.created_at)}</span>
              </div>
              {t.rules.length > 0 && (
                <ul className="ml-1 flex flex-col gap-0.5">
                  {t.rules.map((r, i) => (
                    <RuleLine key={`${t.submission_id}-${i}`} rule={r} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {data.qualified_test.results.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="self-start underline"
            style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)" }}
          >
            {showAll ? "Mostrar menos" : `Ver todos os ${data.qualified_test.results.length}`}
          </button>
        )}
      </div>

      {/* Últimos eventos */}
      {data.recent_events.length > 0 && (
        <div className="flex flex-col gap-1">
          <span style={{ fontSize: "var(--crm-text-xs)", fontWeight: 600, color: "var(--crm-gray-700)" }}>
            Últimos envios
          </span>
          <ul className="flex flex-col gap-1">
            {data.recent_events.slice(0, 8).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                style={{ fontSize: "var(--crm-text-xs)" }}
              >
                {e.status === "sent" ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: "var(--crm-pos)" }} />
                ) : e.status === "failed" ? (
                  <XCircle className="h-3 w-3 shrink-0" style={{ color: "var(--crm-neg)" }} />
                ) : (
                  <Clock className="h-3 w-3 shrink-0" style={{ color: "var(--crm-warn)" }} />
                )}
                <strong style={{ color: "var(--crm-gray-800)" }}>{e.event_name}</strong>
                <span style={{ color: "var(--crm-gray-400)" }}>{fmtDateTime(e.created_at)}</span>
                {e.last_error && (
                  <span className="min-w-0 basis-full" style={{ color: "var(--crm-neg)" }}>
                    {e.last_error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Onde conferir do lado da Meta — o evento é personalizado e não
          aparece na lista dos eventos padrão. */}
      <details
        className="rounded border px-3 py-2"
        style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-50)" }}
      >
        <summary
          className="cursor-pointer"
          style={{ fontSize: "var(--crm-text-xs)", fontWeight: 600, color: "var(--crm-gray-700)" }}
        >
          Onde conferir na Meta
        </summary>
        <ol
          className="ml-4 mt-2 flex list-decimal flex-col gap-1"
          style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)" }}
        >
          <li>
            Gerenciador de Eventos → escolha o pixel → aba <strong>Visão geral</strong>. O
            &quot;Lead&quot; aparece entre os eventos padrão.
          </li>
          <li>
            <strong>&quot;{qualifiedName}&quot; é um evento personalizado</strong> — ele não fica na
            lista dos eventos padrão e só aparece depois do primeiro disparo real.
          </li>
          <li>
            Para usar esse evento como objetivo de campanha, crie uma{" "}
            <strong>conversão personalizada</strong> apontando para ele em Gerenciador de Eventos →
            Conversões personalizadas.
          </li>
          <li>
            Para testar sem sujar os dados, preencha o <strong>código de teste</strong> aqui em cima
            e acompanhe na aba <strong>Testar eventos</strong>.
            {data.setup.test_event_code && (
              <span style={{ color: "var(--crm-warn)" }}>
                {" "}
                Atenção: há um código de teste configurado agora — os eventos estão indo para a aba de
                teste, e não para os relatórios.
              </span>
            )}
          </li>
          <li>
            Cada evento é enviado pelo servidor e pelo navegador com o mesmo identificador: a Meta
            junta os dois e conta <strong>uma</strong> conversão. Ver o mesmo evento duas vezes na
            aba de teste é o comportamento esperado.
          </li>
        </ol>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => mutate()}
          className="crm-button-ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
        {data.totals.failed > 0 && (
          <button type="button" onClick={retry} disabled={retrying} className="crm-button-secondary">
            {retrying ? "Reprocessando…" : `Reenviar ${data.totals.failed} com falha`}
          </button>
        )}
        {retryMsg && (
          <span style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-600)" }}>{retryMsg}</span>
        )}
      </div>
    </div>
  )
}
