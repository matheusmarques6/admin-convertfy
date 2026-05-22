"use client"

/**
 * Botao de sincronizar que aparece INLINE no header da pipeline,
 * antes do "+ Novo deal". Visivel APENAS quando o pipeline aberto e
 * "Gestao de Carteira" — pra outros pipelines retorna null.
 *
 * Click dispara POST /api/admin/cs-carteira/sync-now que classifica
 * cada loja ativa em Saudavel/Atencao/Risco/Churn baseado no health
 * score atual.
 *
 * Usado por: src/app/admin/operacional/pipelines/[id]/page.tsx via
 * prop `headerExtras` do PipelineBoardView.
 */

import { useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { RefreshCw } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  pipelineId: string
}

export function CarteiraSyncButton({ pipelineId }: Props) {
  const { mutate } = useSWRConfig()
  const { data } = useSWR<{
    pipeline?: { name: string }
    data?: { pipeline?: { name: string } }
  }>(`/api/crm/pipelines/${pipelineId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const pipelineName =
    data?.data?.pipeline?.name ?? data?.pipeline?.name ?? ""
  const isCarteira = pipelineName === "Gestao de Carteira"

  const [syncing, setSyncing] = useState(false)
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)

  if (!isCarteira) return null

  async function run() {
    if (syncing) return
    setSyncing(true)
    setFeedback(null)
    try {
      const r = await fetch("/api/admin/cs-carteira/sync-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) {
        throw new Error(body?.error?.message || `HTTP ${r.status}`)
      }
      const res = body.data ?? body
      setFeedback({
        tone: "success",
        text: `${res.ok}/${res.total} lojas classificadas`,
      })
      // Revalida pipeline pra mostrar novos deals
      void mutate(`/api/crm/pipelines/${pipelineId}`)
      // Auto-some apos 3s
      setTimeout(() => setFeedback(null), 3000)
    } catch (e) {
      setFeedback({
        tone: "error",
        text: `Erro: ${(e as Error).message}`,
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      {feedback && (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 500,
            color:
              feedback.tone === "success"
                ? "var(--crm-success-fg)"
                : "var(--crm-danger-fg)",
            background:
              feedback.tone === "success"
                ? "var(--crm-success-bg)"
                : "var(--crm-danger-bg)",
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${
              feedback.tone === "success"
                ? "var(--crm-success-border)"
                : "var(--crm-danger-border)"
            }`,
          }}
        >
          {feedback.text}
        </span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={syncing}
        title="Classifica cada loja em Saudavel/Atencao/Risco/Churn baseado no health score atual"
        className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px] transition-colors"
        style={{
          height: 34,
          padding: "0 12px",
          background: "var(--crm-gray-0)",
          color: "var(--crm-gray-700)",
          border: "1px solid var(--crm-border)",
          fontSize: 12.5,
          fontWeight: 500,
          cursor: syncing ? "wait" : "pointer",
          opacity: syncing ? 0.6 : 1,
        }}
      >
        <RefreshCw
          className={"h-3.5 w-3.5" + (syncing ? " animate-spin" : "")}
        />
        {syncing ? "Sincronizando..." : "Sincronizar carteira"}
      </button>
    </>
  )
}
