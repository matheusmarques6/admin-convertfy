"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { ChevronLeft, Layers } from "lucide-react"
import { DealDrawer } from "@/components/crm/deal-drawer"

/**
 * Board de detalhe de um pipeline CS — porta do design do prototipo
 * Figma Make (colunas horizontais + cards ricos), ligado aos dados REAIS:
 *   - GET  /api/crm/pipelines/[id]        (pipeline + stages + deals)
 *   - POST /api/crm/deals/[id]/move       (mover deal entre etapas)
 *
 * Drag-drop nativo (HTML5). Ao soltar, faz update otimista + persiste no
 * endpoint real (que ja dispara os syncs de cadencia/carteira).
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

const fmtBRL = (v: number | null | undefined) =>
  "R$ " +
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v ?? 0)

interface Stage {
  id: string
  name: string
  color: string | null
  order: number
  stage_type: string
}
interface Deal {
  id: string
  stage_id: string
  title: string | null
  value: number | null
  last_stage_changed_at: string | null
  created_at: string | null
  owner: { id: string; name: string | null; avatar_url: string | null } | null
  client: { id: string; name: string | null } | null
  store: { id: string; store_name: string | null; health_score: number | null } | null
}

// Cor de saude pela faixa de score (>=70 saudavel · >=50 atencao · <50 risco).
// null = sem score → acento neutro (cor do pipeline, definido no card).
function healthColor(score: number | null | undefined): string | null {
  if (score == null) return null
  if (score >= 70) return "var(--crm-pos)"
  if (score >= 50) return "var(--crm-amber)"
  return "var(--crm-neg)"
}
interface DetailResp {
  pipeline: { id: string; name: string; description: string | null; color: string | null; stages: Stage[] }
  deals: Deal[]
}

function dealLabel(d: Deal) {
  return d.store?.store_name || d.client?.name || d.title || "Sem nome"
}
function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
function daysInStage(d: Deal): number {
  const iso = d.last_stage_changed_at || d.created_at
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

// Glyph quadrado deterministico por nome (iniciais coloridas).
function glyphColor(name: string) {
  const palette = [
    ["#EEF0FB", "#2137B6"],
    ["#F3E8FF", "#7C3AED"],
    ["#ECFDF5", "#065F46"],
    ["#FFFBEB", "#92400E"],
    ["#FEF2F2", "#991B1B"],
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export function PipelineBoard({
  pipelineId,
  onBack,
}: {
  pipelineId: string
  onBack?: () => void
}) {
  const { data, mutate } = useSWR<DetailResp>(
    `/api/crm/pipelines/${pipelineId}`,
    fetcher,
  )

  const pipeline = data?.pipeline
  const stages = useMemo(
    () => (pipeline?.stages ?? []).slice().sort((a, b) => a.order - b.order),
    [pipeline],
  )
  const deals = useMemo(() => data?.deals ?? [], [data])
  const dot = pipeline?.color || "var(--crm-brand)"

  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [activeDealId, setActiveDealId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; from: string } | null>(null)

  const byStage = useMemo(() => {
    const m = new Map<string, Deal[]>()
    for (const s of stages) m.set(s.id, [])
    for (const d of deals) {
      if (m.has(d.stage_id)) m.get(d.stage_id)!.push(d)
    }
    return m
  }, [stages, deals])

  const totalValue = deals.reduce((a, d) => a + (d.value ?? 0), 0)

  async function moveDeal(dealId: string, toStageId: string, fromStageId: string) {
    if (toStageId === fromStageId) return
    // Update otimista
    mutate(
      (cur) =>
        cur
          ? {
              ...cur,
              deals: cur.deals.map((d) =>
                d.id === dealId ? { ...d, stage_id: toStageId } : d,
              ),
            }
          : cur,
      { revalidate: false },
    )
    try {
      const r = await fetch(`/api/crm/deals/${dealId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stage_id: toStageId }),
      })
      if (!r.ok) throw new Error("move falhou")
      mutate()
    } catch {
      mutate() // reverte pro estado do servidor
    }
  }

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-[8px] cf-focusable"
            style={{
              background: "#fff",
              border: "1px solid var(--crm-border)",
              padding: "7px 12px",
              cursor: "pointer",
              fontFamily: "var(--crm-font-sans)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--crm-gray-700)",
            }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Pipelines
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `color-mix(in srgb, ${dot} 12%, transparent)`,
              color: dot,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Layers className="h-[17px] w-[17px]" />
          </span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--crm-gray-900)", letterSpacing: "-0.01em" }}>
              {pipeline?.name ?? "…"}
            </div>
            {pipeline?.description && (
              <div style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>{pipeline.description}</div>
            )}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
          <Summary value={String(deals.length)} label="deals" />
          <Summary value={String(stages.length)} label="etapas" />
          <Summary value={fmtBRL(totalValue)} label="em pipeline" tone="pos" />
        </div>
      </div>

      {/* Board horizontal */}
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
        {stages.map((col) => {
          const items = byStage.get(col.id) ?? []
          const colVal = items.reduce((s, d) => s + (d.value ?? 0), 0)
          const isOver = overStage === col.id
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault()
                if (overStage !== col.id) setOverStage(col.id)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setOverStage((o) => (o === col.id ? null : o))
              }}
              onDrop={() => {
                if (dragRef.current) moveDeal(dragRef.current.id, col.id, dragRef.current.from)
                setDragId(null)
                setOverStage(null)
                dragRef.current = null
              }}
              style={{
                width: 270,
                flexShrink: 0,
                background: isOver ? "var(--crm-blue-50)" : "var(--crm-gray-25)",
                border: `1px solid ${isOver ? dot : "var(--crm-border)"}`,
                borderRadius: 12,
                padding: 12,
                alignSelf: "flex-start",
                minHeight: 120,
                transition: "background 120ms, border-color 120ms",
              }}
            >
              {/* Cabecalho da coluna */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingBottom: 11,
                  marginBottom: 11,
                  borderBottom: "1px solid var(--crm-border)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 3, background: col.color || dot }} />
                <span
                  className="truncate"
                  style={{ fontSize: 12.5, fontWeight: 700, color: "var(--crm-gray-900)", letterSpacing: "-0.01em", flex: 1 }}
                >
                  {col.name}
                </span>
                <span
                  className="crm-tnum"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--crm-gray-600)",
                    background: "#fff",
                    border: "1px solid var(--crm-border)",
                    minWidth: 22,
                    height: 20,
                    padding: "0 7px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {items.length}
                </span>
              </div>
              <div className="crm-tnum" style={{ fontSize: 10.5, color: "var(--crm-gray-400)", fontWeight: 600, marginBottom: 10 }}>
                {fmtBRL(colVal)}
              </div>

              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {items.length === 0 && (
                  <div
                    style={{
                      padding: "20px 8px",
                      textAlign: "center",
                      fontSize: 11,
                      color: isOver ? dot : "var(--crm-gray-400)",
                      border: `1px dashed ${isOver ? dot : "var(--crm-gray-200)"}`,
                      borderRadius: 8,
                    }}
                  >
                    {isOver ? "Soltar aqui" : "Vazio"}
                  </div>
                )}
                {items.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    accent={dot}
                    dragging={dragId === d.id}
                    onOpen={() => setActiveDealId(d.id)}
                    onDragStart={() => {
                      setDragId(d.id)
                      dragRef.current = { id: d.id, from: col.id }
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverStage(null)
                      dragRef.current = null
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>

    <DealDrawer
      dealId={activeDealId}
      onClose={() => setActiveDealId(null)}
      onUpdated={() => mutate()}
      pipelineStages={stages.map((s) => ({
        id: s.id,
        name: s.name,
        stage_type: s.stage_type,
        color: s.color ?? null,
        order: s.order,
      }))}
    />
    </>
  )
}

function Summary({ value, label, tone }: { value: string; label: string; tone?: "pos" }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        className="crm-tnum"
        style={{ fontSize: 16, fontWeight: 700, color: tone === "pos" ? "var(--crm-pos)" : "var(--crm-gray-900)" }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--crm-gray-400)" }}>{label}</div>
    </div>
  )
}

function DealCard({
  deal,
  accent,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  deal: Deal
  accent: string
  dragging: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const name = dealLabel(deal)
  const [gbg, gc] = glyphColor(name)
  const age = daysInStage(deal)
  const ownerName = deal.owner?.name || ""
  // Borda esquerda pela saude da loja; sem score cai no acento do pipeline.
  const border = healthColor(deal.store?.health_score) ?? accent
  return (
    <div
      draggable
      onClick={onOpen}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move"
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      style={{
        background: "#fff",
        border: "1px solid var(--crm-border)",
        borderLeft: `3px solid ${border}`,
        borderRadius: 9,
        padding: "10px 11px",
        cursor: "grab",
        boxShadow: "var(--crm-shadow-sm)",
        opacity: dragging ? 0.35 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            flexShrink: 0,
            background: gbg,
            color: gc,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
          }}
        >
          {initials(name)}
        </span>
        <span
          className="truncate"
          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--crm-gray-900)", flex: 1 }}
        >
          {name}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          borderTop: "1px solid var(--crm-gray-100)",
          paddingTop: 9,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: "var(--crm-gray-400)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 1 }}>
            Valor mensal
          </div>
          <div className="crm-tnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--crm-gray-900)" }}>
            {fmtBRL(deal.value)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: "var(--crm-gray-400)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 1 }}>
            Na etapa
          </div>
          <div
            className="crm-tnum"
            style={{ fontSize: 12, fontWeight: 600, color: age > 21 ? "var(--crm-amber)" : "var(--crm-gray-600)" }}
          >
            {age}d
          </div>
        </div>
      </div>
      {ownerName && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              flexShrink: 0,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 8,
              fontWeight: 700,
            }}
          >
            {initials(ownerName)}
          </span>
          <span className="truncate" style={{ fontSize: 11, color: "var(--crm-gray-500)" }}>
            {ownerName.split(" ")[0]}
          </span>
        </div>
      )}
    </div>
  )
}
