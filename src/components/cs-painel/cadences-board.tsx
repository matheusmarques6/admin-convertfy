"use client"

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Calendar, ExternalLink, Phone, X } from "lucide-react"
import { ROUTES } from "@/lib/routes"

/**
 * Board dedicado da aba Cadencias — porta do design do prototipo (modulos
 * 06 CadenceBoard + 04 StoreDrawer). Cada loja e um card rico (saude, MRR,
 * nota, CSM, proxima call). Colunas = etapas do pipeline "Cadencias CS"
 * (Semanal · Quinzenal · Mensal · Pausada, ordem 1-4).
 *
 * Fonte: GET /api/crm/pipelines/[id] (deals com store enriquecido).
 * Mover card entre colunas = POST /api/crm/deals/[id]/move (dispara
 * syncCadenceMove -> store_cadence_overrides).
 */

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((j) => j?.data ?? j)

const fmtBRL = (cents: number | null | undefined) =>
  "R$ " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format((cents ?? 0) / 100)

// Cor/estado de saude pela faixa de score.
function health(score: number | null | undefined) {
  if (score == null) return { c: "var(--crm-gray-400)", bg: "var(--crm-gray-100)", label: "Sem score" }
  if (score >= 70) return { c: "var(--crm-pos)", bg: "var(--crm-pos-bg)", label: "Saudável" }
  if (score >= 50) return { c: "var(--crm-amber)", bg: "var(--crm-warn-bg)", label: "Atenção" }
  return { c: "var(--crm-neg)", bg: "var(--crm-neg-bg)", label: "Risco" }
}

// Metadados da coluna por ordem do stage (1=Semanal ... 4=Pausada).
const COL_META: Record<number, { color: string; hint: string }> = {
  1: { color: "var(--crm-brand)", hint: "Alto toque · onboarding ou risco" },
  2: { color: "var(--crm-purple)", hint: "Crescimento · acompanhamento próximo" },
  3: { color: "var(--crm-pos)", hint: "Estável · check-in de rotina" },
  4: { color: "var(--crm-gray-400)", hint: "Sem call recorrente no momento" },
}

function fmtNextCall(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getUTCDay()]
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${wd} ${dd}/${mm}`
}
function relTime(iso: string | null): string {
  if (!iso) return "sem registro"
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return "hoje"
  if (d === 1) return "ontem"
  return `há ${d}d`
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
}
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

interface Stage {
  id: string
  name: string
  order: number
}
interface Deal {
  id: string
  stage_id: string
  owner: { id: string; name: string | null } | null
  store: {
    id: string
    store_name: string | null
    health_score: number | null
    mrr_cents: number | null
    next_feedback_date: string | null
    last_feedback_date: string | null
    additional_notes: string | null
  } | null
}
interface DetailResp {
  pipeline: { id: string; name: string; description: string | null; stages: Stage[] }
  deals: Deal[]
}
interface Card {
  deal_id: string
  stage_id: string
  store_id: string | null
  name: string
  score: number | null
  mrr_cents: number | null
  note: string | null
  csm: string | null
  next_call: string | null
  last_call: string | null
}

export function CadencesBoard({ pipelineId }: { pipelineId: string }) {
  const { data, mutate } = useSWR<DetailResp>(`/api/crm/pipelines/${pipelineId}`, fetcher)

  const stages = useMemo(
    () => (data?.pipeline?.stages ?? []).slice().sort((a, b) => a.order - b.order),
    [data],
  )
  const deals = useMemo(() => data?.deals ?? [], [data])

  const cardsByStage = useMemo(() => {
    const m = new Map<string, Card[]>()
    for (const s of stages) m.set(s.id, [])
    for (const d of deals) {
      if (!m.has(d.stage_id)) continue
      m.get(d.stage_id)!.push({
        deal_id: d.id,
        stage_id: d.stage_id,
        store_id: d.store?.id ?? null,
        name: d.store?.store_name || "Sem loja",
        score: d.store?.health_score ?? null,
        mrr_cents: d.store?.mrr_cents ?? null,
        note: d.store?.additional_notes ?? null,
        csm: d.owner?.name ?? null,
        next_call: d.store?.next_feedback_date ?? null,
        last_call: d.store?.last_feedback_date ?? null,
      })
    }
    return m
  }, [stages, deals])

  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const dragRef = useRef<{ id: string } | null>(null)
  const [drawer, setDrawer] = useState<Card | null>(null)

  async function move(dealId: string, toStageId: string) {
    mutate(
      (cur) =>
        cur
          ? { ...cur, deals: cur.deals.map((d) => (d.id === dealId ? { ...d, stage_id: toStageId } : d)) }
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
      if (!r.ok) throw new Error()
      mutate()
    } catch {
      mutate()
    }
  }

  // Frequencias pro drawer (mudar cadencia).
  const frequencies = stages.map((s) => ({ stage_id: s.id, label: s.name, order: s.order }))
  const liveDrawer = drawer
    ? cardsByStage.get(
        // acha o card atualizado (pode ter mudado de coluna)
        deals.find((d) => d.id === drawer.deal_id)?.stage_id ?? drawer.stage_id,
      )?.find((c) => c.deal_id === drawer.deal_id) ?? drawer
    : null

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 14, alignItems: "start" }}>
        {stages.map((col) => {
          const items = cardsByStage.get(col.id) ?? []
          const meta = COL_META[col.order] ?? COL_META[1]
          const isOver = over === col.id
          const mrrSum = items.reduce((a, c) => a + (c.mrr_cents ?? 0), 0)
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault()
                if (over !== col.id) setOver(col.id)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setOver((o) => (o === col.id ? null : o))
              }}
              onDrop={() => {
                if (dragRef.current) move(dragRef.current.id, col.id)
                setDragId(null)
                setOver(null)
                dragRef.current = null
              }}
              style={{
                background: isOver ? "var(--crm-blue-50)" : "var(--crm-gray-25)",
                border: `1px solid ${isOver ? meta.color : "var(--crm-border)"}`,
                borderRadius: 12,
                padding: 12,
                minHeight: 480,
                transition: "background 120ms, border-color 120ms",
              }}
            >
              {/* Cabecalho */}
              <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid var(--crm-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: meta.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--crm-gray-900)", letterSpacing: "-0.01em" }}>
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
                      marginLeft: "auto",
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--crm-gray-400)", lineHeight: 1.35, paddingLeft: 17, marginBottom: 6 }}>
                  {meta.hint}
                </div>
                <div className="crm-tnum" style={{ fontSize: 10.5, color: "var(--crm-gray-500)", fontWeight: 600, paddingLeft: 17 }}>
                  {fmtBRL(mrrSum)}/mês em carteira
                </div>
              </div>

              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.length === 0 && (
                  <div
                    style={{
                      padding: "28px 10px",
                      textAlign: "center",
                      fontSize: 11.5,
                      color: isOver ? meta.color : "var(--crm-gray-400)",
                      border: `1px dashed ${isOver ? meta.color : "var(--crm-gray-200)"}`,
                      borderRadius: 8,
                      background: isOver ? "transparent" : "#fff",
                    }}
                  >
                    {isOver ? "Soltar aqui" : "Nenhuma loja neste estado"}
                  </div>
                )}
                {items.map((c) => (
                  <StoreCard
                    key={c.deal_id}
                    card={c}
                    dragging={dragId === c.deal_id}
                    onOpen={() => setDrawer(c)}
                    onDragStart={() => {
                      setDragId(c.deal_id)
                      dragRef.current = { id: c.deal_id }
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                      dragRef.current = null
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <StoreDrawer
        card={liveDrawer}
        frequencies={frequencies}
        onMove={(stageId) => {
          if (liveDrawer) move(liveDrawer.deal_id, stageId)
        }}
        onClose={() => setDrawer(null)}
      />
    </>
  )
}

function StoreCard({
  card,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  card: Card
  dragging: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const h = health(card.score)
  const [gbg, gc] = glyphColor(card.name)
  const risky = card.score != null && card.score < 50
  const noteText = card.note || h.label
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
        borderLeft: `3px solid ${h.c}`,
        borderRadius: 10,
        padding: "12px 13px",
        cursor: "grab",
        boxShadow: "var(--crm-shadow-sm)",
        opacity: dragging ? 0.35 : 1,
      }}
    >
      {/* Topo: loja + score */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            flexShrink: 0,
            background: gbg,
            color: gc,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {initials(card.name)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="truncate"
            style={{ fontSize: 13.5, fontWeight: 600, color: "var(--crm-gray-900)", letterSpacing: "-0.01em", lineHeight: 1.25 }}
          >
            {card.name}
          </div>
          <div className="truncate" style={{ fontSize: 11, color: "var(--crm-gray-400)", marginTop: 1 }}>
            {card.mrr_cents ? `${fmtBRL(card.mrr_cents)}/mês` : "MRR —"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <span className="crm-tnum" style={{ fontSize: 15, fontWeight: 700, color: h.c, lineHeight: 1 }}>
            {card.score ?? "—"}
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, color: "var(--crm-gray-400)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            saúde
          </span>
        </div>
      </div>

      {/* Estado */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", borderRadius: 7, background: h.bg, marginBottom: 11 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: h.c, flexShrink: 0 }} />
        <span
          className="truncate"
          style={{ fontSize: 11, color: risky ? "var(--crm-neg)" : "var(--crm-gray-600)", fontWeight: risky ? 600 : 500, lineHeight: 1.35 }}
        >
          {noteText}
        </span>
      </div>

      {/* Rodape: CSM + proxima call */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--crm-gray-100)", paddingTop: 10 }}>
        <span
          style={{
            width: 20,
            height: 20,
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
          {card.csm ? initials(card.csm) : "—"}
        </span>
        <span className="truncate" style={{ fontSize: 11, color: "var(--crm-gray-500)", flex: 1 }}>
          {card.csm?.split(" ")[0] ?? "sem CSM"}
        </span>
        <span
          className="crm-tnum"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            fontWeight: card.next_call ? 600 : 500,
            color: card.next_call ? "var(--crm-gray-600)" : "var(--crm-gray-400)",
            whiteSpace: "nowrap",
          }}
        >
          {card.next_call && <Calendar className="h-[11px] w-[11px]" />}
          {card.next_call ? fmtNextCall(card.next_call) : "sem call"}
        </span>
      </div>
    </div>
  )
}

function StoreDrawer({
  card,
  frequencies,
  onMove,
  onClose,
}: {
  card: Card | null
  frequencies: Array<{ stage_id: string; label: string; order: number }>
  onMove: (stageId: string) => void
  onClose: () => void
}) {
  if (!card) return null
  const h = health(card.score)
  const currentStage = card.stage_id

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.35)", zIndex: 70 }} />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          background: "#fff",
          zIndex: 71,
          boxShadow: "var(--crm-shadow-drawer)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--crm-font-sans)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--crm-gray-100)", display: "flex", alignItems: "center", gap: 12 }}>
          <Glyph name={card.name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 16, fontWeight: 600, color: "var(--crm-gray-900)", letterSpacing: "-0.01em" }}>
              {card.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--crm-gray-500)" }}>
              {card.mrr_cents ? `${fmtBRL(card.mrr_cents)}/mês` : "MRR —"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--crm-gray-400)", display: "inline-flex" }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, background: h.bg, borderRadius: 10, padding: "14px 16px" }}>
              <div className="crm-tnum" style={{ fontSize: 26, fontWeight: 700, color: h.c, lineHeight: 1 }}>
                {card.score ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--crm-gray-500)", marginTop: 4 }}>Saúde · {h.label}</div>
            </div>
            <div style={{ flex: 1, background: "var(--crm-gray-50)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--crm-gray-900)", lineHeight: 1.1 }}>
                {frequencies.find((f) => f.stage_id === currentStage)?.label ?? "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--crm-gray-500)", marginTop: 6 }}>
                Próx: {card.next_call ? fmtNextCall(card.next_call) : "—"}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-gray-400)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
              Estado atual
            </div>
            <div style={{ fontSize: 13, color: "var(--crm-gray-700)", lineHeight: 1.5, padding: "10px 12px", background: "var(--crm-gray-25)", border: "1px solid var(--crm-gray-100)", borderRadius: 8 }}>
              {card.note || h.label}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--crm-blue-50)",
                color: "var(--crm-brand)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {card.csm ? initials(card.csm) : "—"}
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--crm-gray-900)" }}>{card.csm ?? "Sem CSM"}</div>
              <div style={{ fontSize: 11, color: "var(--crm-gray-400)" }}>última call {relTime(card.last_call)}</div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-gray-400)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
              Mudar cadência
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {frequencies.map((f) => {
                const isCurrent = f.stage_id === currentStage
                const color = COL_META[f.order]?.color ?? "var(--crm-brand)"
                return (
                  <button
                    key={f.stage_id}
                    onClick={() => !isCurrent && onMove(f.stage_id)}
                    disabled={isCurrent}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "9px 11px",
                      borderRadius: 8,
                      cursor: isCurrent ? "default" : "pointer",
                      background: isCurrent ? "var(--crm-blue-50)" : "#fff",
                      border: `1px solid ${isCurrent ? "var(--crm-blue-100)" : "var(--crm-border)"}`,
                      fontFamily: "var(--crm-font-sans)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: isCurrent ? "var(--crm-brand-hover)" : "var(--crm-gray-700)",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--crm-gray-100)", display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => alert("Agendar call — integração com Google Calendar em breve.")}
            className="inline-flex items-center justify-center gap-1.5"
            style={{
              flex: 1,
              height: 40,
              borderRadius: 8,
              background: "var(--crm-brand)",
              color: "#fff",
              border: 0,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Phone className="h-[15px] w-[15px]" /> Agendar call
          </button>
          {card.store_id && (
            <Link
              href={ROUTES.ADMIN.STORES.DETAIL(card.store_id)}
              className="inline-flex items-center justify-center gap-1.5"
              style={{
                height: 40,
                padding: "0 14px",
                borderRadius: 8,
                background: "#fff",
                border: "1px solid var(--crm-border)",
                color: "var(--crm-gray-700)",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <ExternalLink className="h-[15px] w-[15px]" /> Abrir loja
            </Link>
          )}
        </div>
      </div>
    </>
  )
}

function Glyph({ name, size }: { name: string; size: number }) {
  const [bg, c] = glyphColor(name)
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: bg,
        color: c,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 700,
      }}
    >
      {initials(name)}
    </span>
  )
}
