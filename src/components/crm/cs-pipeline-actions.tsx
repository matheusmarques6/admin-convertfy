"use client"

/**
 * Barra de acoes contextual pros pipelines CS canonicos.
 *
 * Detecta o pipeline aberto e, se for "Gestao de Carteira", mostra
 * botoes pra disparar sync manual sem ter que voltar pro Hub
 * /admin/operacional/pipelines. Pipelines genericos nao mostram nada.
 *
 * Renderizado no /admin/operacional/pipelines/[id]/page.tsx acima do
 * PipelineBoardView.
 */

import { useState } from "react"
import useSWR from "swr"
import { RefreshCw, Zap } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineLite {
  id: string
  name: string
}

interface Props {
  pipelineId: string
}

export function CsPipelineActions({ pipelineId }: Props) {
  const { data } = useSWR<{
    pipeline: PipelineLite
    data?: { pipeline: PipelineLite }
  }>(`/api/crm/pipelines/${pipelineId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const pipeline = data?.data?.pipeline ?? data?.pipeline
  const name = pipeline?.name ?? ""

  const [syncing, setSyncing] = useState<"health" | "carteira" | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const isCarteira = name === "Gestao de Carteira"
  if (!isCarteira) return null

  async function runCarteiraSync() {
    if (syncing) return
    setSyncing("carteira")
    setMessage(null)
    try {
      const r = await fetch("/api/admin/cs-carteira/sync-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error?.message || "Falha no sync")
      const res = body.data ?? body
      setMessage(
        `Carteira sincronizada · ${res.ok}/${res.total} lojas classificadas. Recarregue a tela.`,
      )
    } catch (e) {
      setMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setSyncing(null)
    }
  }

  async function runHealthSync() {
    if (syncing) return
    setSyncing("health")
    setMessage(null)
    try {
      const r = await fetch("/api/admin/crm-health/compute-now", {
        method: "POST",
        credentials: "include",
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body?.error?.message || "Falha no recalculo")
      const res = body.data ?? body
      setMessage(
        `Health recalculado · ${res.ok}/${res.total} lojas · ${res.alerts_created ?? 0} novo(s) alerta(s). Recarregue a tela.`,
      )
    } catch (e) {
      setMessage(`Erro: ${(e as Error).message}`)
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        borderBottom: "1px solid var(--crm-border)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-800)",
            marginBottom: 2,
          }}
        >
          Pipeline auto-alimentado por health_score
        </div>
        <div style={{ fontSize: 11.5, color: "var(--crm-gray-500)" }}>
          Lojas sao distribuidas automaticamente nas colunas conforme
          health_score (Saudavel ≥80, Atencao 60-79, Risco &lt;60, Churn quando
          inativa). Em recuperacao / Churn iminente sao manuais.
        </div>
      </div>
      <div style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={runCarteiraSync}
          disabled={syncing !== null}
          title="Analisa cada loja e classifica no stage correspondente ao health_score atual"
          className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
          style={{
            height: 32,
            padding: "0 12px",
            background: "#fff",
            color: "var(--crm-gray-700)",
            border: "1px solid var(--crm-border)",
            fontSize: 12,
            fontWeight: 500,
            cursor: syncing ? "wait" : "pointer",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <RefreshCw
            className={
              "h-3.5 w-3.5" + (syncing === "carteira" ? " animate-spin" : "")
            }
          />
          {syncing === "carteira" ? "Analisando..." : "Sincronizar carteira"}
        </button>
        <button
          type="button"
          onClick={runHealthSync}
          disabled={syncing !== null}
          title="Recalcula health score de todas lojas e sincroniza carteira + alertas"
          className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
          style={{
            height: 32,
            padding: "0 12px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            border: 0,
            fontSize: 12,
            fontWeight: 600,
            cursor: syncing ? "wait" : "pointer",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          <Zap
            className={
              "h-3.5 w-3.5" + (syncing === "health" ? " animate-pulse" : "")
            }
          />
          {syncing === "health" ? "Recalculando..." : "Recalcular health"}
        </button>
      </div>
      {message && (
        <div
          style={{
            width: "100%",
            marginTop: 4,
            padding: "8px 12px",
            background: message.startsWith("Erro") ? "#FEF2F2" : "#ECFDF5",
            color: message.startsWith("Erro") ? "#991B1B" : "#065F46",
            border: `1px solid ${message.startsWith("Erro") ? "#FECACA" : "#A7F3D0"}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
