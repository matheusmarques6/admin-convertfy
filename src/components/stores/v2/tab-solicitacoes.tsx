"use client"

import useSWR from "swr"
import { useState } from "react"
import { Section, Badge, Btn, C } from "./_primitives"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

interface Request {
  id: string
  title: string
  description: string | null
  status: "open" | "in_progress" | "completed" | "declined" | "on_hold"
  priority: "low" | "medium" | "high" | "urgent"
  category: string | null
  requested_at: string
  completed_at: string | null
  related_task_id: string | null
  requested_by_profile: { id: string; name: string; avatar_url: string | null } | null
  completed_by_profile: { id: string; name: string; avatar_url: string | null } | null
}

const STATUS_TONE: Record<Request["status"], "pos" | "warn" | "info" | "neut" | "neg"> = {
  open: "info",
  in_progress: "warn",
  completed: "pos",
  declined: "neg",
  on_hold: "neut",
}

const STATUS_LABEL: Record<Request["status"], string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  completed: "Concluída",
  declined: "Recusada",
  on_hold: "Em espera",
}

const PRIO_LABEL: Record<Request["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
}

const PRIO_COLOR: Record<Request["priority"], string> = {
  low: C.g500,
  medium: C.info,
  high: C.warn,
  urgent: C.neg,
}

export default function TabSolicitacoes({ storeId }: { storeId: string }) {
  const { data, isLoading, mutate } = useSWR<{ data?: { requests: Request[] } }>(
    `/api/stores/${storeId}/requests`,
    fetcher,
  )
  const requests = data?.data?.requests ?? []
  const [showNew, setShowNew] = useState(false)
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all")
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as Request["priority"],
    category: "feature",
  })

  async function createRequest() {
    if (!form.title.trim()) return
    await fetch(`/api/stores/${storeId}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    })
    setShowNew(false)
    setForm({ title: "", description: "", priority: "medium", category: "feature" })
    mutate()
  }

  async function updateStatus(id: string, status: Request["status"]) {
    await fetch(`/api/stores/${storeId}/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    })
    mutate()
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta solicitação?")) return
    await fetch(`/api/stores/${storeId}/requests/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
    mutate()
  }

  if (isLoading) {
    return (
      <Section title="Solicitações">
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Carregando...
        </div>
      </Section>
    )
  }

  const filtered =
    filter === "all"
      ? requests
      : filter === "open"
      ? requests.filter((r) => r.status === "open" || r.status === "in_progress" || r.status === "on_hold")
      : requests.filter((r) => r.status === "completed" || r.status === "declined")

  const openCount = requests.filter((r) => r.status === "open" || r.status === "in_progress").length

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section
        title="Solicitações do cliente"
        right={
          <div style={{ display: "flex", gap: 6 }}>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`Todas · ${requests.length}`} />
            <FilterChip active={filter === "open"} onClick={() => setFilter("open")} label={`Abertas · ${openCount}`} />
            <FilterChip active={filter === "completed"} onClick={() => setFilter("completed")} label="Finalizadas" />
            <Btn variant="primary" size="sm" onClick={() => setShowNew(!showNew)}>
              {showNew ? "Cancelar" : "+ Nova"}
            </Btn>
          </div>
        }
      >
        {showNew && (
          <div
            style={{
              marginBottom: 14,
              padding: 14,
              background: C.g50,
              borderRadius: 6,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Título da solicitação"
                style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
                autoFocus
              />
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição (opcional)..."
              style={{ ...inputStyle, minHeight: 60, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Request["priority"] })}
                style={inputStyle}
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={inputStyle}
              >
                <option value="feature">Feature</option>
                <option value="fix">Ajuste</option>
                <option value="campaign">Campanha</option>
                <option value="question">Dúvida</option>
                <option value="other">Outro</option>
              </select>
              <Btn variant="primary" size="sm" onClick={createRequest}>
                Criar
              </Btn>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ color: C.g500, fontSize: 13, padding: "32px 0", textAlign: "center" }}>
            Nenhuma solicitação {filter === "open" ? "aberta" : filter === "completed" ? "finalizada" : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: 12,
                  border: `1px solid ${C.g200}`,
                  borderRadius: 4,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: PRIO_COLOR[r.priority],
                          letterSpacing: 0.4,
                        }}
                      >
                        {PRIO_LABEL[r.priority]}
                      </span>
                      {r.category && (
                        <span style={{ fontSize: 11, color: C.g500 }}>· {r.category}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, marginBottom: 4 }}>
                      {r.title}
                    </div>
                    {r.description && (
                      <div style={{ fontSize: 12, color: C.g700, whiteSpace: "pre-wrap", marginBottom: 6 }}>
                        {r.description}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: C.g500 }}>
                      Solicitada {new Date(r.requested_at).toLocaleDateString("pt-BR")}
                      {r.requested_by_profile && ` por ${r.requested_by_profile.name}`}
                      {r.completed_at &&
                        ` · Concluída ${new Date(r.completed_at).toLocaleDateString("pt-BR")}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {r.status !== "completed" && r.status !== "declined" && (
                      <button
                        onClick={() => updateStatus(r.id, "completed")}
                        style={miniBtn(C.pos)}
                      >
                        ✓ Concluir
                      </button>
                    )}
                    {r.status === "open" && (
                      <button
                        onClick={() => updateStatus(r.id, "in_progress")}
                        style={miniBtn(C.info)}
                      >
                        ↗ Em andamento
                      </button>
                    )}
                    <button onClick={() => remove(r.id)} style={miniBtn(C.neg, true)}>
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  border: `1px solid ${C.g200}`,
  borderRadius: 4,
  outline: "none",
  background: "#fff",
  width: "100%",
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 10px",
        background: active ? C.brand : "transparent",
        color: active ? "#fff" : C.g700,
        border: `1px solid ${active ? C.brand : C.g200}`,
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

function miniBtn(color: string, outlined?: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 600,
    padding: "3px 8px",
    background: outlined ? "transparent" : color,
    color: outlined ? color : "#fff",
    border: outlined ? `1px solid ${color}` : "none",
    borderRadius: 3,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }
}
