"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ChevronRight, Layers, Plus, Search } from "lucide-react"
import { NewPipelineDialog } from "@/components/crm/new-pipeline-dialog"
import { PipelineBoard } from "./pipeline-board"
import { CarteiraBoard } from "./carteira-board"
import { CADENCIAS_PIPELINE_NAME, CARTEIRA_PIPELINE_NAME } from "./constants"

/**
 * Aba "Pipelines CS" do modulo Customer Success — porta do prototipo
 * Figma Make (grid agrupado por categoria) ligada aos pipelines REAIS
 * (GET /api/crm/pipelines?scope=cs). Os pipelines ja existentes sao
 * preservados; muda apenas a UI.
 *
 * Ao abrir um pipeline, embute o board real (PipelineBoardView) inline —
 * mantem drag-drop, deal drawer, sync de cadencia/carteira etc.
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

interface PipelineSummary {
  id: string
  name: string
  description: string | null
  color: string | null
  category?: string | null
  deal_count: number
  stages: Array<{ id: string; name: string }>
}

export function PipelinesTab() {
  const { data, mutate } = useSWR<{
    pipelines?: PipelineSummary[]
    data?: { pipelines: PipelineSummary[] }
  }>("/api/crm/pipelines?scope=cs", fetcher)

  const pipelines = useMemo<PipelineSummary[]>(
    () => data?.data?.pipelines ?? data?.pipelines ?? [],
    [data],
  )

  const [query, setQuery] = useState("")
  const [openPipe, setOpenPipe] = useState<PipelineSummary | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  // Detalhe: board no design do prototipo, ligado aos dados reais.
  // A "Gestao de Carteira" tem board proprio (kanban de LOJAS por etapa
  // de saude, nao de deals genericos).
  if (openPipe) {
    if (openPipe.name === CARTEIRA_PIPELINE_NAME) {
      return <CarteiraBoard onBack={() => setOpenPipe(null)} />
    }
    return <PipelineBoard pipelineId={openPipe.id} onBack={() => setOpenPipe(null)} />
  }

  // "Cadencias CS" tem aba propria (Cadencias) — nao aparece no grid.
  const visible = pipelines.filter((p) => p.name !== CADENCIAS_PIPELINE_NAME)

  // Agrupa por categoria preservando a ordem de aparicao (null -> "Outros")
  const q = query.trim().toLowerCase()
  const filtered = q
    ? visible.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q),
      )
    : visible

  const groupOrder: string[] = []
  const byGroup = new Map<string, PipelineSummary[]>()
  for (const p of filtered) {
    const g = p.category?.trim() || "Outros"
    if (!byGroup.has(g)) {
      byGroup.set(g, [])
      groupOrder.push(g)
    }
    byGroup.get(g)!.push(p)
  }
  // "Outros" sempre por ultimo
  groupOrder.sort((a, b) => (a === "Outros" ? 1 : b === "Outros" ? -1 : 0))

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", width: 320, maxWidth: "50%" }}>
          <span
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--crm-gray-400)",
            }}
          >
            <Search className="h-4 w-4" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pipeline…"
            style={{
              width: "100%",
              height: 38,
              padding: "0 12px 0 34px",
              border: "1px solid var(--crm-border)",
              borderRadius: 9,
              fontFamily: "var(--crm-font-sans)",
              fontSize: 13,
              color: "var(--crm-gray-700)",
              background: "#fff",
              outline: "none",
            }}
          />
        </div>
        <span style={{ fontSize: 12.5, color: "var(--crm-gray-400)" }}>
          Cada pipeline organiza um processo do CS em etapas.
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setNewDialogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-[6px] cf-focusable"
          style={{
            height: 38,
            padding: "0 14px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontSize: 13,
            fontWeight: 600,
            border: 0,
            cursor: "pointer",
          }}
        >
          <Plus className="h-4 w-4" />
          Novo pipeline
        </button>
      </div>

      {filtered.length === 0 && (
        <div
          style={{
            padding: "48px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--crm-gray-400)",
          }}
        >
          {q
            ? `Nenhum pipeline encontrado para “${query}”.`
            : "Nenhum pipeline CS ainda. Crie o primeiro."}
        </div>
      )}

      {groupOrder.map((g) => {
        const items = byGroup.get(g)!
        return (
          <div key={g}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--crm-gray-500)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {g}
              </span>
              <span
                className="crm-tnum"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--crm-gray-400)",
                  background: "var(--crm-gray-100)",
                  minWidth: 20,
                  height: 18,
                  padding: "0 6px",
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {items.length}
              </span>
              <span style={{ flex: 1, height: 1, background: "var(--crm-gray-100)" }} />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 14,
              }}
            >
              {items.map((p) => (
                <PipelineCard key={p.id} p={p} onOpen={() => setOpenPipe(p)} />
              ))}
            </div>
          </div>
        )
      })}

      <NewPipelineDialog
        open={newDialogOpen}
        scope="cs"
        onClose={() => setNewDialogOpen(false)}
        onCreated={() => {
          setNewDialogOpen(false)
          mutate()
        }}
      />
    </div>
  )
}

function PipelineCard({ p, onOpen }: { p: PipelineSummary; onOpen: () => void }) {
  const dot = p.color || "var(--crm-brand)"
  const nStages = p.stages?.length ?? 0
  const filled = Math.max(1, Math.round(nStages * 0.4))
  return (
    <button
      type="button"
      onClick={onOpen}
      className="cf-focusable"
      style={{
        textAlign: "left",
        background: "#fff",
        border: "1px solid var(--crm-border)",
        borderTop: `3px solid ${dot}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
        fontFamily: "var(--crm-font-sans)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: `color-mix(in srgb, ${dot} 12%, transparent)`,
            color: dot,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Layers className="h-[17px] w-[17px]" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
            }}
          >
            {p.name}
          </div>
          {p.description && (
            <div
              className="line-clamp-2"
              style={{
                fontSize: 11.5,
                color: "var(--crm-gray-500)",
                marginTop: 4,
                lineHeight: 1.45,
              }}
            >
              {p.description}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4" style={{ color: "var(--crm-gray-300)", flexShrink: 0 }} />
      </div>

      {/* mini etapas */}
      <div style={{ display: "flex", gap: 3 }}>
        {Array.from({ length: nStages }).map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: i < filled ? dot : "var(--crm-gray-100)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          borderTop: "1px solid var(--crm-gray-100)",
          paddingTop: 11,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--crm-gray-600)" }}>
          <b className="crm-tnum" style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-gray-900)" }}>
            {p.deal_count}
          </b>
          deal{p.deal_count === 1 ? "" : "s"}
        </span>
        <span style={{ width: 1, height: 14, background: "var(--crm-gray-200)" }} />
        <span className="crm-tnum" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--crm-gray-600)" }}>
          <b style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-gray-900)" }}>{nStages}</b>
          etapas
        </span>
      </div>
    </button>
  )
}
