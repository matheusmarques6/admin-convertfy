"use client"

import useSWR from "swr"
import { useState } from "react"
import { Section, Btn, C, TNUM } from "./_primitives"
import {
  defaultReferenceMonths,
  monthLabel,
  monthOptionsFor,
} from "@/lib/services/call-coverage"

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
  /** Presentes quando a call veio do Fathom (migration 20261106). */
  fathom_url?: string | null
  fathom_recording_id?: string | null
  /** Meses cobertos pela call, "YYYY-MM" (migration 20261108). */
  reference_months?: string[] | null
}

interface CallsPayload {
  calls: Call[]
  upcoming_call_date: string | null
  next_meeting_agenda?: {
    pending: Array<{ description: string; days_open: number; assignee: string | null }>
    completed_since_last: string[]
  }
  /** Meses fechados sem alinhamento registrado. */
  coverage?: { missing: string[]; covered: string[] }
}

function moneyBRL(n: number | null): string {
  if (n == null) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(n)
}

const EMPTY_FORM = {
  conducted_at: new Date().toISOString().slice(0, 16),
  duration_minutes: 30,
  notes: "",
  action_items: "",
  next_call_date: "",
  fathom_url: "",
}

export default function TabCalls({ storeId }: { storeId: string }) {
  // successResponse ESPALHA no topo ({success, calls, ...}) — ler
  // `data.data` deixava o histórico sempre vazio. Aceita os dois
  // formatos para não depender do envelope.
  const { data, isLoading, mutate } = useSWR<{ data?: CallsPayload } & Partial<CallsPayload>>(
    `/api/stores/${storeId}/calls`,
    fetcher,
  )
  const payload: CallsPayload | undefined = data?.calls
    ? (data as CallsPayload)
    : data?.data
  const calls = payload?.calls ?? []
  const upcoming = payload?.upcoming_call_date ?? null
  const agenda = payload?.next_meeting_agenda
  const missing = payload?.coverage?.missing ?? []

  const [showNewForm, setShowNewForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  // Meses cobertos pela call. Default = mês anterior (convenção do
  // time); `mesesTocado` impede que mudar a data desfaça a escolha.
  const [meses, setMeses] = useState<string[]>(() => defaultReferenceMonths(new Date()))
  const [mesesTocado, setMesesTocado] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [apagando, setApagando] = useState<string | null>(null)

  async function excluirCall(callId: string) {
    setApagando(callId)
    setErro(null)
    try {
      const res = await fetch(`/api/stores/${storeId}/calls/${callId}`, { method: "DELETE" })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b?.error || `Não foi possível excluir (${res.status})`)
      }
      setConfirmId(null)
      await mutate()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir a call")
    } finally {
      setApagando(null)
    }
  }

  async function createCall() {
    if (saving) return
    setSaving(true)
    setErro(null)
    setOkMsg(null)
    try {
      const res = await fetch(`/api/stores/${storeId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          conducted_at: new Date(form.conducted_at).toISOString(),
          duration_minutes: form.duration_minutes,
          notes: form.notes || null,
          action_items: form.action_items || null,
          next_call_date: form.next_call_date
            ? new Date(form.next_call_date).toISOString()
            : null,
          fathom_url: form.fathom_url.trim() || null,
          reference_months: meses,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        fathom?: { title: string | null; action_items: number } | null
      }
      // Antes o erro era engolido: o form fechava e nada acontecia.
      if (!res.ok) throw new Error(body?.error || `Não foi possível salvar (${res.status})`)
      await mutate()
      if (body.fathom) {
        setOkMsg(
          `Importado do Fathom${body.fathom.title ? `: “${body.fathom.title}”` : ""} · ${body.fathom.action_items} item(ns) de ação.`,
        )
        setTimeout(() => setOkMsg(null), 5000)
      }
      setShowNewForm(false)
      setForm({ ...EMPTY_FORM, conducted_at: new Date().toISOString().slice(0, 16) })
      setMeses(defaultReferenceMonths(new Date()))
      setMesesTocado(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a call")
    } finally {
      setSaving(false)
    }
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
            <FormField label="Link do Fathom (opcional · puxa resumo, ações e participantes)" colSpan={2}>
              <input
                type="url"
                value={form.fathom_url}
                onChange={(e) => setForm({ ...form, fathom_url: e.target.value })}
                placeholder="fathom.video/calls/123456789"
                style={inputStyle}
              />
            </FormField>
            <FormField label="Data/hora da call">
              <input
                type="datetime-local"
                value={form.conducted_at}
                onChange={(e) => {
                  const v = e.target.value
                  setForm({ ...form, conducted_at: v })
                  // A sugestão de mês acompanha a data até o operador
                  // escolher os meses à mão.
                  if (!mesesTocado && v) setMeses(defaultReferenceMonths(v))
                }}
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
            <FormField
              label="Referente a que mês? (define o alerta de relatório em atraso)"
              colSpan={2}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {monthOptionsFor(form.conducted_at || new Date(), 6).map((m) => {
                  const on = meses.includes(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMesesTocado(true)
                        setMeses((prev) =>
                          prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort(),
                        )
                      }}
                      style={{
                        height: 26,
                        padding: "0 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 4,
                        cursor: "pointer",
                        border: `1px solid ${on ? C.brand : C.g200}`,
                        background: on ? C.brand : "#fff",
                        color: on ? "#fff" : C.g700,
                      }}
                    >
                      {monthLabel(m)}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10.5, color: C.g500, marginTop: 4 }}>
                {meses.length === 0
                  ? "Sem marcação, assumimos o mês anterior à call."
                  : "Marque mais de um quando a call cobriu meses atrasados."}
              </div>
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
            {erro && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  fontSize: 12,
                  color: C.neg,
                  background: C.negBg,
                  border: `1px solid ${C.negBorder}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
                role="alert"
              >
                {erro}
              </div>
            )}
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => setShowNewForm(false)}>
                Cancelar
              </Btn>
              <Btn variant="primary" size="sm" onClick={createCall} disabled={saving}>
                {saving ? (form.fathom_url.trim() ? "Buscando no Fathom…" : "Salvando…") : "Salvar call"}
              </Btn>
            </div>
          </div>
        )}
      </Section>

      {okMsg && (
        <div
          style={{
            fontSize: 12.5,
            color: C.pos,
            background: C.posBg,
            border: `1px solid ${C.posBorder}`,
            borderRadius: 6,
            padding: "10px 12px",
          }}
          role="status"
        >
          {okMsg}
        </div>
      )}

      {/* Falha fora do formulário (exclusão) precisa aparecer: o erro
          dentro do form some junto com ele. */}
      {erro && !showNewForm && (
        <div
          style={{
            fontSize: 12.5,
            color: C.neg,
            background: C.negBg,
            border: `1px solid ${C.negBorder}`,
            borderRadius: 6,
            padding: "10px 12px",
          }}
          role="alert"
        >
          {erro}
        </div>
      )}

      {/* Mês fechado sem call registrada = relatório em atraso */}
      {missing.length > 0 && (
        <div
          style={{
            fontSize: 12.5,
            color: C.warn,
            background: C.warnBg,
            border: `1px solid ${C.warnBorder}`,
            borderRadius: 6,
            padding: "10px 12px",
          }}
          role="status"
        >
          <strong>Sem alinhamento registrado:</strong>{" "}
          {missing.map(monthLabel).join(" · ")}
          <div style={{ fontSize: 11, color: C.g500, marginTop: 2 }}>
            Meses já fechados sem nenhuma call marcada como referente a eles.
          </div>
        </div>
      )}

      {/* Pauta da próxima call: o que ficou aberto nas anteriores */}
      {agenda && agenda.pending.length > 0 && (
        <Section title="Para falar na próxima call">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {agenda.pending.map((p, i) => (
              <div
                key={i}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}
              >
                <span style={{ color: C.g900 }}>
                  {p.description}
                  {p.assignee && <span style={{ color: C.g500 }}> · {p.assignee}</span>}
                </span>
                <span
                  style={{
                    ...TNUM,
                    fontSize: 11,
                    color: p.days_open >= 30 ? C.neg : p.days_open >= 14 ? C.warn : C.g500,
                  }}
                >
                  aberto há {p.days_open}d
                </span>
              </div>
            ))}
            {agenda.completed_since_last.length > 0 && (
              <div style={{ fontSize: 11, color: C.g500, marginTop: 4 }}>
                Entregue desde então: {agenda.completed_since_last.slice(0, 4).join(" · ")}
              </div>
            )}
          </div>
        </Section>
      )}

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
                    {(c.reference_months?.length ?? 0) > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: C.g500 }}>
                        {"  "}· ref. {(c.reference_months ?? []).map(monthLabel).join(" · ")}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.g500, display: "flex", gap: 8, alignItems: "center" }}>
                    <span>
                      {c.duration_minutes ?? "—"}min · {c.conducted_by_profile?.name ?? "—"}
                    </span>
                    {c.fathom_url && (
                      <a
                        href={c.fathom_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: C.brand, textDecoration: "none", fontWeight: 600 }}
                        title="Abrir a gravação no Fathom"
                      >
                        ▶ Fathom
                      </a>
                    )}
                    {/* Excluir em dois toques: apagar leva junto resumo,
                        ações e gravação — não pode ser um clique só. */}
                    {confirmId === c.id ? (
                      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          onClick={() => void excluirCall(c.id)}
                          disabled={apagando === c.id}
                          style={{
                            color: C.neg,
                            fontWeight: 700,
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          {apagando === c.id ? "excluindo…" : "excluir"}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          style={{ color: C.g500, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                        >
                          cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setErro(null)
                          setConfirmId(c.id)
                        }}
                        title="Excluir esta call"
                        aria-label="Excluir esta call"
                        style={{
                          color: C.g500,
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          fontSize: 13,
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    )}
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
