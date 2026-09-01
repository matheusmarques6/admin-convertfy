"use client"

/**
 * Painel "Regras do score" da Gestão de Carteira: mostra COMO a loja
 * entra na carteira (fluxo onboarding → carteira, sem depender de
 * negócio), permite EDITAR as condições que movem a loja de etapa
 * (faixas do score, pesos dos componentes, limiares de alerta) e expõe
 * as fórmulas internas como documentação viva. "Recalcular agora" roda
 * o mesmo cálculo do cron diário na hora, pra ver o efeito da mudança.
 *
 * Persistência: GET/PUT /api/crm/carteira/health-rules (tabela
 * settings, defaults em código).
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { RefreshCw } from "lucide-react"
import { Modal, ModalBtn } from "./carteira-board"
import type { StoreHealthRules } from "@/lib/services/store-health-rules"

interface StageLite {
  id: string
  name: string
  stage_type: string
  order: number
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
  return body as { rules: StoreHealthRules; defaults: StoreHealthRules }
}

const SEC: React.CSSProperties = { color: "var(--ops-sec)" }
const MUT: React.CSSProperties = { color: "var(--ops-mut)" }
const TITLE: React.CSSProperties = { color: "var(--ops-title)" }
const TNUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" }

const COMPONENT_META: Array<{
  key: keyof StoreHealthRules["weights"]
  label: string
  detail: string
}> = [
  {
    key: "email",
    label: "Email (engajamento 30d)",
    detail:
      "abertura ×0,30 + clique ×0,25 + entrega ×0,20 + (1 − spam×100) ×0,15 + (1 − unsub×50) ×0,10 — campanhas + flows. Sem envio no período, o componente fica de fora.",
  },
  {
    key: "revenue",
    label: "Receita (tendência)",
    detail:
      "mês atual (30d) vs média mensal dos 60 dias anteriores: ≥120% → 90 · ≥100% → 70 · ≥80% → 50 · ≥50% → 30 · abaixo → 10. Loja nova com receita → 80.",
  },
  {
    key: "tickets",
    label: "Tickets",
    detail:
      "100 − 15 por ticket estourando SLA − 3 por ticket aberto acima de 3 (pipeline “Tickets de Cliente”). Sem histórico de tickets, fica de fora.",
  },
  {
    key: "nps",
    label: "NPS",
    detail: "última nota 0-10 da loja × 10. Sem resposta de NPS, fica de fora.",
  },
]

function NumInput({
  value,
  onChange,
  suffix,
  width = 64,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
  width?: number
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          if (Number.isFinite(n)) onChange(Math.min(100, Math.max(0, n)))
        }}
        className="h-[30px] rounded-[7px] border bg-transparent px-2 text-right text-[12.5px] outline-none"
        style={{ width, borderColor: "var(--ops-border)", ...TITLE, ...TNUM }}
      />
      {suffix && (
        <span className="text-[11px]" style={MUT}>
          {suffix}
        </span>
      )}
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] font-[650] uppercase tracking-[0.08em]" style={MUT}>
      {children}
    </div>
  )
}

export function ScoreRulesDialog({
  stages,
  onClose,
  onChanged,
}: {
  stages: StageLite[]
  onClose: () => void
  onChanged: () => void
}) {
  const { data, error, mutate } = useSWR("/api/crm/carteira/health-rules", fetcher, {
    revalidateOnFocus: false,
  })

  const [rules, setRules] = useState<StoreHealthRules | null>(null)
  const [saving, setSaving] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (data?.rules && !rules) setRules(structuredClone(data.rules))
  }, [data, rules])

  // As 3 primeiras etapas ABERTAS são a faixa do score; lost = churn.
  const auto = useMemo(
    () =>
      stages
        .filter((s) => (s.stage_type ?? "open") === "open")
        .sort((a, b) => a.order - b.order)
        .slice(0, 3),
    [stages],
  )
  const lostStage = stages.find((s) => s.stage_type === "lost")
  const pauseStage = stages.find((s) => s.stage_type === "archived" || /pausad/i.test(s.name))

  const set = (patch: Partial<StoreHealthRules>) =>
    setRules((r) => (r ? { ...r, ...patch } : r))

  const save = async () => {
    if (!rules) return
    setSaving(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch("/api/crm/carteira/health-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string })?.error || "Não foi possível salvar")
      const saved = (body as { rules: StoreHealthRules }).rules
      setRules(structuredClone(saved))
      await mutate({ rules: saved, defaults: data!.defaults }, { revalidate: false })
      setMsg("Regras salvas. O cron diário já usa os novos valores — ou recalcule agora.")
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar")
    } finally {
      setSaving(false)
    }
  }

  const recompute = async () => {
    setRecomputing(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/crm-health/compute-now", { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string })?.error || "Falha ao recalcular")
      const r = body as { total?: number; ok?: number; errors?: number }
      setMsg(
        `Recalculado: ${r.ok ?? 0} de ${r.total ?? 0} lojas${(r.errors ?? 0) > 0 ? ` (${r.errors} sem dados)` : ""}. O board já reflete as novas etapas.`,
      )
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao recalcular")
    } finally {
      setRecomputing(false)
    }
  }

  const restoreDefaults = () => {
    if (data?.defaults) setRules(structuredClone(data.defaults))
  }

  const weightSum = rules
    ? rules.weights.email + rules.weights.revenue + rules.weights.tickets + rules.weights.nps
    : 0

  return (
    <Modal onClose={onClose} width={560}>
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        <div className="text-[14.5px] font-[650]" style={TITLE}>
          Regras do score
        </div>
        <div className="mt-1 text-[11.5px] leading-[1.5]" style={SEC}>
          O que move cada loja entre as etapas da carteira — e de onde o número vem.
        </div>

        {/* ── Fluxo: como a loja chega aqui ── */}
        <div className="mt-4">
          <SectionTitle>Como a loja entra na carteira</SectionTitle>
          <div
            className="mt-2 rounded-[8px] border px-3 py-2.5"
            style={{ borderColor: "var(--ops-border)" }}
          >
            {[
              ["1", "Cliente novo passa pelo onboarding — é lá que a loja nasce e é vinculada a ele (não depende de negócio no comercial)."],
              ["2", "Toda loja ATIVA ganha um card aqui automaticamente, na etapa correspondente ao score atual."],
              ["3", `O cron diário (02:10) recalcula o score e move o card entre ${auto.map((s) => `“${s.name}”`).join(", ") || "as 3 primeiras etapas"}.`],
              ["4", `${pauseStage ? `“${pauseStage.name}”` : "Pausada"}, ${lostStage ? `“${lostStage.name}”` : "Churn"} e as demais etapas são sempre decisão do CSM — o automático nunca desfaz um movimento manual.`],
              ["5", "Loja desativada no sistema vai para o churn sozinha."],
            ].map(([n, txt]) => (
              <div key={n} className="flex gap-2.5 py-[3px] text-[11.5px] leading-[1.5]" style={SEC}>
                <span
                  className="mt-[1px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold"
                  style={{ background: "rgba(78,98,216,0.1)", color: "#4E62D8" }}
                >
                  {n}
                </span>
                <span>{txt}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-3 text-[11.5px]" style={{ color: "var(--ops-neg)" }} role="alert">
            Não foi possível carregar as regras: {error instanceof Error ? error.message : ""}
          </div>
        )}

        {rules && (
          <>
            {/* ── Faixas da carteira ── */}
            <div className="mt-4">
              <SectionTitle>Faixas da carteira</SectionTitle>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-[12px]" style={TITLE}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#059669" }} />
                    Score ≥{" "}
                    <NumInput
                      value={rules.stage_thresholds.healthy}
                      onChange={(v) =>
                        set({ stage_thresholds: { ...rules.stage_thresholds, healthy: v } })
                      }
                    />
                  </span>
                  <span style={SEC}>→ {auto[0]?.name ?? "1ª etapa"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px]" style={TITLE}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#D97706" }} />
                    Score ≥{" "}
                    <NumInput
                      value={rules.stage_thresholds.attention}
                      onChange={(v) =>
                        set({ stage_thresholds: { ...rules.stage_thresholds, attention: v } })
                      }
                    />
                  </span>
                  <span style={SEC}>→ {auto[1]?.name ?? "2ª etapa"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px]" style={TITLE}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: "#DC2626" }} />
                    Score abaixo de {rules.stage_thresholds.attention}
                  </span>
                  <span style={SEC}>→ {auto[2]?.name ?? "3ª etapa"}</span>
                </div>
                {rules.stage_thresholds.healthy <= rules.stage_thresholds.attention && (
                  <div className="text-[11px]" style={{ color: "var(--ops-neg)" }}>
                    A faixa de cima precisa ser maior que a de baixo — ao salvar, os valores serão
                    ajustados.
                  </div>
                )}
              </div>
            </div>

            {/* ── Pesos ── */}
            <div className="mt-4">
              <SectionTitle>Peso de cada componente</SectionTitle>
              <div className="mt-2 flex flex-col gap-2">
                {COMPONENT_META.map((c) => {
                  const v = rules.weights[c.key]
                  const pct = weightSum > 0 ? (v / weightSum) * 100 : 0
                  return (
                    <div key={c.key}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium" style={TITLE}>
                          {c.label}
                        </span>
                        <NumInput
                          value={v}
                          suffix="%"
                          onChange={(nv) => set({ weights: { ...rules.weights, [c.key]: nv } })}
                        />
                      </div>
                      <div
                        className="mt-1 h-[4px] overflow-hidden rounded-[2px]"
                        style={{ background: "var(--ops-track, rgba(0,0,0,0.08))" }}
                      >
                        <div
                          className="h-full rounded-[2px]"
                          style={{ width: `${pct}%`, background: "#4E62D8" }}
                        />
                      </div>
                      <div className="mt-1 text-[10.5px] leading-[1.45]" style={MUT}>
                        {c.detail}
                      </div>
                    </div>
                  )
                })}
                <div className="text-[10.5px] leading-[1.5]" style={MUT}>
                  Os pesos são relativos (soma atual: {weightSum}). Componente sem dado no período
                  fica FORA da conta e os pesos são redistribuídos entre os presentes — loja sem
                  nenhum sinal fica “sem score” e não é movida.
                </div>
              </div>
            </div>

            {/* ── Alertas ── */}
            <div className="mt-4">
              <SectionTitle>Alertas automáticos</SectionTitle>
              <div className="mt-2 flex flex-col gap-2 text-[12px]" style={TITLE}>
                <div className="flex items-center justify-between gap-3">
                  <span>Criar alerta na loja quando o score cair abaixo de</span>
                  <NumInput
                    value={rules.alert_threshold}
                    onChange={(v) => set({ alert_threshold: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Marcar como crítico abaixo de</span>
                  <NumInput
                    value={rules.alert_critical}
                    onChange={(v) => set({ alert_critical: v })}
                  />
                </div>
                <div className="text-[10.5px]" style={MUT}>
                  O alerta aparece na aba Alertas do detalhe da loja e no dashboard operacional.
                </div>
              </div>
            </div>
          </>
        )}

        {(msg || err) && (
          <div
            className="mt-3 rounded-[8px] border px-3 py-2 text-[11.5px] leading-[1.5]"
            style={
              err
                ? { borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }
                : { borderColor: "var(--ops-border)", color: "var(--ops-sec)" }
            }
            role={err ? "alert" : "status"}
          >
            {err ?? msg}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={restoreDefaults}
              disabled={!data?.defaults}
              className="h-[31px] rounded-[8px] border border-dashed bg-transparent px-3 text-[12px] font-medium disabled:opacity-50"
              style={{ borderColor: "var(--ops-border)", ...SEC }}
            >
              Restaurar padrão
            </button>
            <button
              onClick={recompute}
              disabled={recomputing}
              className="inline-flex h-[31px] items-center gap-1.5 rounded-[8px] border bg-transparent px-3 text-[12px] font-medium disabled:opacity-60"
              style={{ borderColor: "var(--ops-border)", ...TITLE }}
            >
              <RefreshCw className={`h-3 w-3 ${recomputing ? "animate-spin" : ""}`} />
              {recomputing ? "Recalculando…" : "Recalcular agora"}
            </button>
          </div>
          <div className="flex gap-2">
            <ModalBtn onClick={onClose}>Fechar</ModalBtn>
            <ModalBtn primary disabled={!rules || saving} onClick={save}>
              {saving ? "Salvando…" : "Salvar regras"}
            </ModalBtn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
