"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { CadencesBoard } from "./cadences-board"
import { CADENCIAS_PIPELINE_NAME } from "./constants"

/**
 * Aba "Cadencias" do modulo Customer Success. Renderiza o board da pipeline
 * canonica "Cadencias CS" (state-board com as colunas de frequencia:
 * Semanal · Quinzenal · Mensal · Pausada). Arrastar entre colunas troca a
 * cadencia da loja (o endpoint de move ja dispara syncCadenceMove).
 *
 * Resolve o pipeline por NAME (mesma convencao de src/lib/cs-pipelines.ts).
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

interface PipelineSummary {
  id: string
  name: string
}

export function CadenciasTab() {
  const { data } = useSWR<{
    pipelines?: PipelineSummary[]
    data?: { pipelines: PipelineSummary[] }
  }>("/api/crm/pipelines?scope=cs", fetcher)

  const pipelines = useMemo<PipelineSummary[]>(
    () => data?.data?.pipelines ?? data?.pipelines ?? [],
    [data],
  )

  const cadencias = pipelines.find((p) => p.name === CADENCIAS_PIPELINE_NAME)

  if (!data) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--crm-gray-400)" }}>
        Carregando cadências…
      </div>
    )
  }

  if (!cadencias) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "var(--crm-gray-400)" }}>
        Pipeline “{CADENCIAS_PIPELINE_NAME}” não encontrada. Rode o seed dos pipelines CS.
      </div>
    )
  }

  return <CadencesBoard pipelineId={cadencias.id} />
}
