"use client"

import useSWR from "swr"
import { useState } from "react"
import { Section, Badge, Btn, C, TNUM } from "./_primitives"

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

interface Call {
  id: string
  conducted_at: string
  duration_minutes: number | null
  notes: string | null
  action_items: string | null
  next_call_date: string | null
  result_percentage: number | null
  klaviyo_revenue: number | null
  total_revenue: number | null
  conducted_by_profile: { id: string; name: string; avatar_url: string | null } | null
}

function moneyBRL(n: number | null): string {
  if (n == null) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(n)
}

export default function TabCalls({ storeId }: { storeId: string }) {
  const { data, isLoading, mutate } = useSWR<{ data?: { calls: Call[]; upcoming_call_date: string | null } }>(
    `/api/stores/${storeId}/calls`,
    fetcher,
  )
  const payload = data?.data
  const calls = payload?.calls ?? []
  const upcoming = payload?.upcoming_call_date ?? null

  const [showNewForm, setShowNewForm] = useState(false)
  const [form, setForm] = useState({
    conducted_at: new Date().toISOString().slice(0, 16),
    duration_minutes: 30,
    notes: "",
    action_items: "",
    next_call_date: "",
  })

  async function createCall() {
    await fetch(`/api/stores/${storeId}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        conducted_at: new Date(form.conducted_at).toISOString(),
        duration_minutes: form.duration_minutes,
        notes: form.notes,
        action_items: form.action_items,
        next_call_date: form.next_call_date ? new Date(form.next_call_date).toISOString() : null,
      }),
    })
    setShowNewForm(false)
    setForm({
      conducted_at: new Date().toISOString().slice(0, 16),
      duration_minutes: 30,
      notes: "",
      action_items: "",
      next_call_date: "",
    })
    mutate()
  }

  if (isLoading) {
    return (
      <Section title="Calls">
        <div style={{ padding: 24, textAlign: "center", color: C.g500, fontSize: 13 }}>
          Carregando...
        </div>
      </Section>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section
        title="Próxima call"
        right={
          <Btn variant="primary" size="sm" onClick={() => setShowNewForm(!showNewForm)}>
            {showNewForm ? "Cancelar" : "+ Registrar call"}
          </Btn>
        }
      >
        {upcoming ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                background: C.brand,
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>
                {new Date(upcoming).toLocaleDateString("pt-BR", { month: "short" }).slice(0, 3)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, ...TNUM, lineHeight: 1 }}>
                {new Date(upcoming).getDate()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>
                {new Date(upcoming).toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </div>
              <div style={{ fontSize: 12, color: C.g500 }}>
                {new Date(upcoming).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: C.g500, fontSize: 13 }}>
            Nenhuma call agendada. Defina &quot;Próxima call&quot; ao registrar uma nova.
          </div>
        )}

        {showNewForm && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              background: C.g50,
              borderRadius: 6,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <FormField label="Data/hora da call">
              <input
                type="datetime-local"
                value={form.conducted_at}
                onChange={(e) => setForm({ ...form, conducted_at: e.target.value })}
                style={inputStyle}
              />
            </FormField>
            <FormField label="Duração (min)">
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                style={inputStyle}
              />
            </FormField>
            <FormField label="Próxima call (opcional)" colSpan={2}>
              <input
                type="datetime-local"
                value={form.next_call_date}
                onChange={(e) => setForm({ ...form, next_call_date: e.target.value })}
                style={inputStyle}
              />
            </FormField>
            <FormField label="Notas" colSpan={2}>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ ...inputStyle, minHeight: 60 }}
                placeholder="Resumo da call..."
              />
            </FormField>
            <FormField label="Ações combinadas" colSpan={2}>
              <textarea
                value={form.action_items}
                onChange={(e) => setForm({ ...form, action_items: e.target.value })}
                style={{ ...inputStyle, minHeight: 60 }}
                placeholder="O que ficou definido..."
              />
            </FormField>
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => setShowNewForm(false)}>
                Cancelar
              </Btn>
              <Btn variant="primary" size="sm" onClick={createCall}>
                Salvar call
              </Btn>
            </div>
          </div>
        )}
      </Section>

      <Section title={`Histórico · ${calls.length} calls`}>
        {calls.length === 0 ? (
          <div style={{ color: C.g500, fontSize: 13, padding: "24px 0", textAlign: "center" }}>
            Nenhuma call registrada ainda.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {calls.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  border: `1px solid ${C.g200}`,
                  borderRadius: 4,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.g900 }}>
                    {new Date(c.conducted_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: C.g500 }}>
                    {c.duration_minutes ?? "—"}min · {c.conducted_by_profile?.name ?? "—"}
                  </div>
                </div>
                {c.notes && (
                  <div style={{ fontSize: 12, color: C.g700, marginBottom: 6, whiteSpace: "pre-wrap" }}>
                    {c.notes}
                  </div>
                )}
                {c.action_items && (
                  <div
                    style={{
                      fontSize: 11,
                      color: C.g700,
                      padding: 8,
                      background: C.g50,
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <strong style={{ color: C.g900 }}>Ações:</strong> {c.action_items}
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: C.g500 }}>
                  {c.total_revenue != null && (
                    <span>Receita total: <strong style={{ color: C.g900, ...TNUM }}>{moneyBRL(c.total_revenue)}</strong></span>
                  )}
                  {c.klaviyo_revenue != null && (
                    <span>Klaviyo/Omnisend: <strong style={{ color: C.g900, ...TNUM }}>{moneyBRL(c.klaviyo_revenue)}</strong></span>
                  )}
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
  width: "100%",
  padding: "6px 8px",
  fontSize: 12,
  border: `1px solid ${C.g200}`,
  borderRadius: 4,
  outline: "none",
  background: "#fff",
}

function FormField({
  label,
  children,
  colSpan,
}: {
  label: string
  children: React.ReactNode
  colSpan?: number
}) {
  return (
    <div style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          color: C.g500,
          marginBottom: 4,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
