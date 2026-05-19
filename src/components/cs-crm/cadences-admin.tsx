"use client"

import { useState } from "react"
import useSWR from "swr"
import { CSPageHeader } from "./cs-page-header"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  g50: "#F8FAFC",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
  pos: "#065F46",
  posBg: "#ECFDF5",
  warn: "#92400E",
  warnBg: "#FFFBEB",
  neg: "#991B1B",
  negBg: "#FEF2F2",
  purple: "#7C3AED",
  purpleBg: "#F3E8FF",
}

interface CadenceItem {
  store_id: string
  store_name: string
  mrr_value: number | null
  client_name: string | null
  owner_name: string | null
  frequency: "weekly" | "biweekly" | "monthly" | "paused"
  is_default: boolean
  reason: string | null
  configured_at: string | null
  configured_by: string | null
  override_id: string | null
}

interface CadenceData {
  items: CadenceItem[]
  stats: {
    weekly: number
    biweekly: number
    monthly: number
    paused: number
    total: number
    exceptions: number
  }
}

const FREQ_LABELS: Record<CadenceItem["frequency"], { label: string; color: string; bg: string }> = {
  weekly: { label: "Semanal (padrão)", color: C.pos, bg: C.posBg },
  biweekly: { label: "Quinzenal", color: C.brand, bg: C.brand50 },
  monthly: { label: "Mensal", color: C.warn, bg: C.warnBg },
  paused: { label: "Suspenso", color: C.neg, bg: C.negBg },
}

function moneyBRL(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1)}k`
  return `R$ ${n.toFixed(0)}`
}

export function CadencesAdmin() {
  const { data, mutate, isLoading } = useSWR<{ data?: CadenceData }>("/api/cs-crm/cadences", fetcher)
  const [filter, setFilter] = useState<"all" | "exceptions" | CadenceItem["frequency"]>("all")
  const [editingStore, setEditingStore] = useState<CadenceItem | null>(null)

  const payload = data?.data
  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>Carregando...</div>
  if (!payload) return <div style={{ padding: 40, textAlign: "center", color: C.g500 }}>Erro</div>

  const filtered =
    filter === "all"
      ? payload.items
      : filter === "exceptions"
      ? payload.items.filter((i) => !i.is_default)
      : payload.items.filter((i) => i.frequency === filter)

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <CSPageHeader
        title="Cadências de Feedback"
        description="Define com que frequência cada loja recebe a call de feedback do CS. O padrão é semanal — cadências diferentes precisam de justificativa registrada. Essa configuração alimenta o Acompanhamento Semanal e o pipeline de Calls Mensais."
        active="cadences"
      />

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <StatPill label="Total" value={payload.stats.total} tone="brand" onClick={() => setFilter("all")} active={filter === "all"} />
        <StatPill label="Semanal" value={payload.stats.weekly} tone="pos" onClick={() => setFilter("weekly")} active={filter === "weekly"} />
        <StatPill label="Quinzenal" value={payload.stats.biweekly} tone="brand" onClick={() => setFilter("biweekly")} active={filter === "biweekly"} />
        <StatPill label="Mensal" value={payload.stats.monthly} tone="warn" onClick={() => setFilter("monthly")} active={filter === "monthly"} />
        <StatPill label="Exceções" value={payload.stats.exceptions} tone="purple" onClick={() => setFilter("exceptions")} active={filter === "exceptions"} />
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: `1px solid ${C.g200}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderBottom: `1px solid ${C.g100}`,
            fontSize: 11,
            fontWeight: 700,
            color: C.g700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) 1fr 1fr 1fr auto",
            gap: 12,
            background: C.g50,
          }}
        >
          <span>Loja / Cliente</span>
          <span>Cadência</span>
          <span>Motivo</span>
          <span>Configurado por</span>
          <span></span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.g500, fontSize: 13 }}>
            Nenhuma loja com este filtro.
          </div>
        ) : (
          filtered.map((item) => {
            const freq = FREQ_LABELS[item.frequency]
            return (
              <div
                key={item.store_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 2fr) 1fr 1fr 1fr auto",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: `1px solid ${C.g100}`,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: C.g900 }}>{item.store_name}</div>
                  <div style={{ fontSize: 11, color: C.g500, marginTop: 2 }}>
                    {item.client_name ?? "—"}
                    {item.mrr_value != null && (
                      <span style={{ fontWeight: 600, color: C.g700, marginLeft: 8 }}>{moneyBRL(item.mrr_value)}</span>
                    )}
                  </div>
                </div>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      color: freq.color,
                      background: freq.bg,
                      borderRadius: 3,
                    }}
                  >
                    {freq.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.g700, lineHeight: 1.4 }}>
                  {item.reason ?? <span style={{ color: C.g500, fontStyle: "italic" }}>—</span>}
                </div>
                <div style={{ fontSize: 11, color: C.g500 }}>
                  {item.configured_by ? (
                    <>
                      {item.configured_by}
                      <br />
                      {item.configured_at && new Date(item.configured_at).toLocaleDateString("pt-BR")}
                    </>
                  ) : (
                    <span style={{ fontStyle: "italic" }}>Padrão</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingStore(item)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    color: C.brand,
                    background: "transparent",
                    border: `1px solid ${C.brand}`,
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Editar
                </button>
              </div>
            )
          })
        )}
      </div>

      {editingStore && (
        <EditModal item={editingStore} onClose={() => setEditingStore(null)} onSave={() => { mutate(); setEditingStore(null) }} />
      )}
    </div>
  )
}

function StatPill({
  label,
  value,
  tone,
  onClick,
  active,
}: {
  label: string
  value: number
  tone: "brand" | "pos" | "warn" | "purple"
  onClick: () => void
  active: boolean
}) {
  const colors = {
    brand: { color: C.brand, bg: C.brand50 },
    pos: { color: C.pos, bg: C.posBg },
    warn: { color: C.warn, bg: C.warnBg },
    purple: { color: C.purple, bg: C.purpleBg },
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: 14,
        background: active ? colors.color : "#fff",
        border: `1px solid ${active ? colors.color : C.g200}`,
        borderRadius: 6,
        cursor: "pointer",
        textAlign: "left",
        color: active ? "#fff" : C.g900,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: active ? "#fff" : C.g500, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </button>
  )
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: CadenceItem
  onClose: () => void
  onSave: () => void
}) {
  const [frequency, setFrequency] = useState<CadenceItem["frequency"]>(item.frequency)
  const [reason, setReason] = useState(item.reason ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (frequency !== "weekly" && !reason.trim()) {
      alert("Motivo é obrigatório quando a cadência é diferente do padrão.")
      return
    }
    setSaving(true)
    try {
      await fetch("/api/cs-crm/cadences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          store_id: item.store_id,
          frequency,
          reason: reason.trim() || "Voltou ao padrão",
        }),
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100 }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          maxWidth: "92vw",
          background: "#fff",
          borderRadius: 8,
          zIndex: 101,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.g900, margin: 0, marginBottom: 4 }}>
          Configurar cadência
        </h2>
        <div style={{ fontSize: 12, color: C.g500, marginBottom: 16 }}>{item.store_name}</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.g700, textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 6 }}>
            Frequência
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {(["weekly", "biweekly", "monthly", "paused"] as const).map((f) => {
              const meta = FREQ_LABELS[f]
              const isActive = frequency === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  style={{
                    padding: 10,
                    fontSize: 12,
                    fontWeight: 600,
                    background: isActive ? meta.color : "#fff",
                    color: isActive ? "#fff" : meta.color,
                    border: `1px solid ${meta.color}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        {frequency !== "weekly" && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.g700, textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 6 }}>
              Motivo (obrigatório)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente prefere mensal · Conta em ramp-up · Pausado durante reestruturação"
              style={{
                width: "100%",
                minHeight: 80,
                padding: 10,
                fontSize: 13,
                border: `1px solid ${C.g200}`,
                borderRadius: 4,
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              color: C.g700,
              background: "transparent",
              border: `1px solid ${C.g200}`,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "8px 20px",
              fontSize: 12,
              fontWeight: 600,
              color: "#fff",
              background: C.brand,
              border: "none",
              borderRadius: 4,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </>
  )
}
