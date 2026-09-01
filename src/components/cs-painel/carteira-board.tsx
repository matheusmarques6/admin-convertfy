"use client"

/**
 * Gestão de Carteira — board de LOJAS por etapa de saúde (design
 * ago/2026, Claude Design · carteira.jsx). Cada card é uma loja (deal
 * da pipeline "Gestao de Carteira"): % que a Convertfy gera, status da
 * mensalidade, régua de calls, motivo de pausa/churn.
 *
 * Dados: GET /api/crm/carteira (payload consolidado). Ações reusam as
 * rotas existentes: move de deal, PATCH (motivo de pausa), POST de call
 * da loja, CRUD de etapas da pipeline.
 *
 * Honestidades vs mock do design: sem linha "Comissão" (o sistema não
 * modela comissão por loja — só em crm_partners) e sem delta numérico
 * no "Convertfy gera" (não há fonte de % do período anterior no cache).
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Settings2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import {
  pctTone,
  type MensalidadeMes,
  type MensalidadeStatus,
} from "@/lib/services/cs-carteira"

// ── Tipos do payload ────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  color: string | null
  order: number
  stage_type: string
  description: string | null
}

interface Card {
  deal_id: string
  stage_id: string
  deal_status: string
  store_id: string
  store_name: string
  client_id: string | null
  client_name: string | null
  csm_name: string | null
  mrr: number
  health_score: number | null
  since: string | null
  pct: number | null
  attributed_brl: number
  total_brl: number
  revenue_synced: boolean
  mensalidade: MensalidadeStatus
  mensalidade_history: MensalidadeMes[]
  call_days: number | null
  call_tone: { tone: "ok" | "warn" | "neg"; agendar: boolean }
  next_call: string | null
  motivo: string | null
  stage_changed_at: string | null
  manual_stage: boolean
  custom_fields: Record<string, unknown>
}

interface CarteiraPayload {
  pipeline: { id: string; name: string } | null
  stages: Stage[]
  cards: Card[]
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
  return body as CarteiraPayload
}

// Motivos padrão do design — texto livre continua possível via "Outro".
const MOTIVOS: Record<"pausada" | "churn", string[]> = {
  pausada: ["Pausa financeira", "Reestruturação da loja", "Férias / sazonalidade", "A pedido do cliente", "Outro"],
  churn: ["Corte de budget", "Insatisfação com resultado", "Fechou a loja", "Migrou de agência", "Outro"],
}

const TNUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums lining-nums" }

const fmtK = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
    : v >= 1000
      ? `R$ ${Math.round(v / 1000)}K`
      : `R$ ${Math.round(v)}`
const brl0 = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`

const STAGE_FALLBACK_COLORS: Record<string, string> = {
  open: "#059669",
  lost: "#374151",
  archived: "#6B7280",
}

function stageColor(s: Stage): string {
  return s.color || STAGE_FALLBACK_COLORS[s.stage_type] || "#0E7490"
}

function isPauseStage(s: Stage): boolean {
  return s.stage_type === "archived" || /pausad/i.test(s.name)
}
function isChurnStage(s: Stage): boolean {
  return s.stage_type === "lost"
}

function CsAvatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const h = name.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const palette = [
    ["#EEF0FB", "#4E62D8"],
    ["#ECFDF5", "#065F46"],
    ["#FFFBEB", "#92400E"],
    ["#F3E8FF", "#7C3AED"],
    ["#FEF2F2", "#991B1B"],
  ]
  const [bg, fg] = palette[h % palette.length]
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initials || "?"}
    </span>
  )
}

// ── Board ───────────────────────────────────────────────────────────

export function CarteiraBoard({ pipelineId, onBack }: { pipelineId?: string; onBack: () => void }) {
  const { data, error, isLoading, mutate } = useSWR<CarteiraPayload>(
    pipelineId ? `/api/crm/carteira?pipeline_id=${pipelineId}` : "/api/crm/carteira",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15_000 },
  )

  const [sel, setSel] = useState<string | null>(null) // deal_id do drawer
  const [menuId, setMenuId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ card: Card; stage: Stage; kind: "pausada" | "churn" } | null>(null)
  const [motivo, setMotivo] = useState("")
  const [motivoLivre, setMotivoLivre] = useState("")
  const [callModal, setCallModal] = useState<Card | null>(null)
  const [callData, setCallData] = useState("")
  const [callNota, setCallNota] = useState("")
  const [editCols, setEditCols] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const stages = data?.stages ?? []
  const cards = useMemo(() => data?.cards ?? [], [data])
  const selCard = sel ? cards.find((c) => c.deal_id === sel) ?? null : null

  // ── Ações (rotas existentes) ─────────────────────────────────────

  const doMove = async (
    card: Card,
    stage: Stage,
    opts?: { reason?: string; reactivate?: boolean },
  ) => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/crm/deals/${card.deal_id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stage.id,
          ...(opts?.reason ? { lost_reason: opts.reason } : {}),
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as { error?: string })?.error || "Não foi possível mover")
      }
      // Move manual é soberano: manual_stage=true impede o cron de
      // health de desfazer a escolha do CSM. "Reativar" limpa a flag e
      // devolve a loja ao auto-manage por score. O PATCH substitui
      // custom_fields inteiro — por isso o merge com o objeto vindo do
      // payload. Pausa (archived): o move não grava lost_reason — vai
      // junto aqui; sair de pausa/churn pra etapa aberta limpa o motivo.
      const patch: Record<string, unknown> = {
        custom_fields: { ...card.custom_fields, manual_stage: !opts?.reactivate },
      }
      if (opts?.reactivate) patch.lost_reason = null
      else if (opts?.reason) patch.lost_reason = opts.reason
      else if (stage.stage_type === "open" && card.motivo) patch.lost_reason = null
      await fetch(`/api/crm/deals/${card.deal_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      await mutate()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível mover")
    } finally {
      setBusy(false)
    }
  }

  const mover = (card: Card, stage: Stage) => {
    setMenuId(null)
    if (isPauseStage(stage) || isChurnStage(stage)) {
      setPending({ card, stage, kind: isChurnStage(stage) ? "churn" : "pausada" })
      setMotivo("")
      setMotivoLivre("")
      return
    }
    void doMove(card, stage)
  }

  const confirmarMove = async () => {
    if (!pending) return
    const texto = motivo === "Outro" ? motivoLivre.trim() || "Outro" : motivo
    await doMove(pending.card, pending.stage, { reason: texto })
    setPending(null)
  }

  const reativar = (card: Card) => {
    const first = stages.find((s) => s.stage_type === "open")
    if (first) void doMove(card, first, { reactivate: true })
  }

  // "Pausar loja": o seed da carteira não traz etapa de pausa — cria a
  // "Pausada" (archived) sob demanda na primeira vez e abre o modal de
  // motivo. Idempotente: se já existe (por tipo ou nome), só reusa.
  const pausar = async (card: Card) => {
    let stage = stages.find(isPauseStage)
    if (!stage && data?.pipeline) {
      setBusy(true)
      setActionError(null)
      try {
        const res = await fetch(`/api/crm/pipelines/${data.pipeline.id}/stages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Pausada", color: "#6B7280", stage_type: "archived" }),
        })
        const b = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error((b as { error?: string })?.error || "Não foi possível criar a etapa Pausada")
        }
        stage = (b as { stage?: Stage }).stage
        await mutate()
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Não foi possível criar a etapa Pausada")
        return
      } finally {
        setBusy(false)
      }
    }
    if (!stage) return
    setPending({ card, stage, kind: "pausada" })
    setMotivo("")
    setMotivoLivre("")
  }

  const registrarCall = async () => {
    if (!callModal || !callData) return
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/stores/${callModal.store_id}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conducted_at: `${callData}T12:00:00`,
          notes: callNota.trim() || null,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as { error?: string })?.error || "Não foi possível registrar a call")
      }
      setCallModal(null)
      await mutate()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível registrar a call")
    } finally {
      setBusy(false)
    }
  }

  // ── Estados de carga ─────────────────────────────────────────────

  if (isLoading && !data) {
    return (
      <div className="flex gap-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex w-[250px] shrink-0 flex-col gap-2.5">
            <SkeletonShimmer className="h-5 w-28 rounded-[4px]" />
            {Array.from({ length: 2 }).map((_, j) => (
              <SkeletonShimmer key={j} className="h-[150px] rounded-[9px]" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] font-medium" style={{ color: "var(--ops-title)" }}>
          Não foi possível carregar a carteira
        </p>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
          {error instanceof Error ? error.message : "Tente novamente."}
        </p>
        <button
          onClick={() => mutate()}
          className="mt-3 h-[30px] rounded-[8px] border px-3 text-[11.5px] font-medium"
          style={{ borderColor: "var(--ops-border)", color: "var(--ops-text)" }}
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (!data?.pipeline) {
    return (
      <div className="py-16 text-center text-[12px]" style={{ color: "var(--ops-sec)" }}>
        A pipeline &ldquo;Gestão de Carteira&rdquo; ainda não existe nesta base (seed do CRM fase 1).
      </div>
    )
  }

  return (
    // Sangra o padding do corpo do shell (px-4 md:px-7 pt-5 pb-12) pra
    // ocupar a área inteira como no protótipo — o drawer encosta na
    // borda direita e desce até o fim.
    <div
      className="-mx-4 md:-mx-7 -mt-5 -mb-12 flex min-h-[calc(100dvh-96px)] min-w-0"
      style={{ fontFamily: "inherit" }}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-3.5 md:px-7">
        {/* Header da pipeline */}
        <div className="flex shrink-0 items-start gap-3 pb-3.5">
          <div className="min-w-0 flex-1">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium"
              style={{ color: "var(--ops-mut)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ops-title)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ops-mut)")}
            >
              ‹ Pipelines CS
            </button>
            <div className="mt-1.5 flex items-baseline gap-2">
              <h2
                className="m-0 whitespace-nowrap text-[17px] font-[650] tracking-[-0.015em]"
                style={{ color: "var(--ops-title)" }}
              >
                Gestão de Carteira
              </h2>
              <span className="text-[11.5px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
                {cards.length} lojas
              </span>
            </div>
            <div className="mt-[3px] truncate text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
              Cada loja vive em uma etapa — o estado da conta. Pausar tira a loja da carteira ativa e registra o motivo.
            </div>
          </div>
          <button
            onClick={() => setEditCols(true)}
            className="mt-3.5 inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[11.5px] font-medium"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)", color: "var(--ops-sec)" }}
          >
            <Settings2 className="h-[13px] w-[13px]" /> Editar etapas
          </button>
        </div>

        {actionError && (
          <div
            className="mb-3 flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[11.5px]"
            style={{ borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }}
            role="alert"
          >
            <span className="min-w-0 flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} aria-label="Fechar aviso">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Board */}
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex h-full items-stretch gap-3">
            {stages.map((col) => {
              const colCards = cards.filter((c) => c.stage_id === col.id)
              const cor = stageColor(col)
              return (
                <div key={col.id} className="flex min-h-0 w-[250px] shrink-0 flex-col">
                  <div className="shrink-0 px-1 pb-2.5 pt-0.5">
                    <div className="flex items-center gap-[7px]">
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: cor }} />
                      <span className="text-[11.5px] font-[650]" style={{ color: "var(--ops-title)" }}>
                        {col.name}
                      </span>
                      <span className="text-[11px] font-medium" style={{ color: "var(--ops-mut)", ...TNUM }}>
                        {colCards.length}
                      </span>
                    </div>
                    <div className="mt-2 h-[2px] rounded-[1px] opacity-55" style={{ background: cor }} />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-0.5 pb-2">
                    {colCards.map((c) => (
                      <StoreCard
                        key={c.deal_id}
                        card={c}
                        stage={col}
                        stages={stages}
                        selected={sel === c.deal_id}
                        menuOpen={menuId === c.deal_id}
                        onToggleMenu={() => setMenuId(menuId === c.deal_id ? null : c.deal_id)}
                        onCloseMenu={() => setMenuId(null)}
                        onSelect={() => setSel(c.deal_id)}
                        onMove={(stage) => mover(c, stage)}
                      />
                    ))}
                    {colCards.length === 0 && (
                      <div
                        className="rounded-[9px] border border-dashed px-2 py-4 text-center text-[11px]"
                        style={{ borderColor: "var(--ops-border)", color: "var(--ops-mut)" }}
                      >
                        Vazio
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Drawer da loja */}
      {selCard && (
        <CarteiraDrawer
          card={selCard}
          stages={stages}
          onClose={() => setSel(null)}
          onPausar={() => void pausar(selCard)}
          onReativar={() => reativar(selCard)}
          onRegistrarCall={() => {
            setCallModal(selCard)
            setCallData(new Date().toISOString().slice(0, 10))
            setCallNota("")
          }}
          busy={busy}
        />
      )}

      {/* Modal de motivo (pausa/churn) */}
      {pending && (
        <Modal onClose={() => setPending(null)} width={400}>
          <div className="text-[14.5px] font-[650]" style={{ color: "var(--ops-title)" }}>
            {pending.kind === "pausada" ? "Pausar" : "Marcar churn"} · {pending.card.store_name}
          </div>
          <div className="mt-1 text-[11.5px] leading-[1.5]" style={{ color: "var(--ops-sec)" }}>
            {pending.kind === "pausada"
              ? "A loja sai da carteira ativa. As cobranças você gerencia no financeiro do cliente."
              : "A loja sai da carteira ativa. Registre o motivo para o histórico."}
          </div>
          <div className="mt-3.5 text-[9.5px] font-[650] uppercase tracking-[0.07em]" style={{ color: "var(--ops-mut)" }}>
            Motivo
          </div>
          <div className="mt-2 flex flex-col gap-[5px]">
            {MOTIVOS[pending.kind].map((m) => {
              const on = motivo === m
              return (
                <button
                  key={m}
                  onClick={() => setMotivo(m)}
                  className="flex items-center gap-[9px] rounded-[8px] border px-[11px] py-2 text-left text-[12px]"
                  style={{
                    borderColor: on ? "#8B9BE8" : "var(--ops-border)",
                    background: on ? "rgba(78,98,216,0.08)" : "transparent",
                    fontWeight: on ? 600 : 450,
                    color: "var(--ops-title)",
                  }}
                >
                  <span
                    className="h-[13px] w-[13px] shrink-0 rounded-full"
                    style={{
                      border: `1.5px solid ${on ? "#4E62D8" : "var(--ops-border)"}`,
                      background: on ? "#4E62D8" : "transparent",
                      boxShadow: on ? "inset 0 0 0 2.5px var(--ops-card)" : "none",
                    }}
                  />
                  {m}
                </button>
              )
            })}
            {motivo === "Outro" && (
              <input
                autoFocus
                value={motivoLivre}
                onChange={(e) => setMotivoLivre(e.target.value)}
                placeholder="Descreva o motivo…"
                className="mt-1 h-[34px] w-full rounded-[8px] border bg-transparent px-2.5 text-[12px] outline-none"
                style={{ borderColor: "var(--ops-border)", color: "var(--ops-title)" }}
              />
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <ModalBtn onClick={() => setPending(null)}>Cancelar</ModalBtn>
            <ModalBtn
              primary
              danger={pending.kind === "churn"}
              disabled={!motivo || busy}
              onClick={confirmarMove}
            >
              {pending.kind === "pausada" ? "Pausar loja" : "Confirmar churn"}
            </ModalBtn>
          </div>
        </Modal>
      )}

      {/* Modal registrar call */}
      {callModal && (
        <Modal onClose={() => setCallModal(null)} width={380}>
          <div className="text-[14.5px] font-[650]" style={{ color: "var(--ops-title)" }}>
            Registrar call · {callModal.store_name}
          </div>
          <div className="mt-1 text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
            Call de alinhamento com o cliente.
          </div>
          <div className="mt-3.5 text-[9.5px] font-[650] uppercase tracking-[0.07em]" style={{ color: "var(--ops-mut)" }}>
            Data da call
          </div>
          <input
            type="date"
            value={callData}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setCallData(e.target.value)}
            className="mt-[7px] box-border h-[34px] w-full rounded-[8px] border px-2.5 text-[12.5px] outline-none"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-page)", color: "var(--ops-title)" }}
          />
          {callData && (
            <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
              {(() => {
                const dias = Math.max(0, Math.round((Date.now() - new Date(`${callData}T12:00:00`).getTime()) / 86_400_000))
                return dias === 0 ? "hoje" : `há ${dias} dia${dias > 1 ? "s" : ""}`
              })()}
            </div>
          )}
          <div className="mt-3 text-[9.5px] font-[650] uppercase tracking-[0.07em]" style={{ color: "var(--ops-mut)" }}>
            Resumo (opcional)
          </div>
          <textarea
            value={callNota}
            onChange={(e) => setCallNota(e.target.value)}
            placeholder="ex.: alinhamos meta de setembro e novo fluxo de boas-vindas"
            rows={2}
            className="mt-[7px] box-border w-full resize-none rounded-[8px] border px-2.5 py-2 text-[12px] leading-[1.5] outline-none"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-page)", color: "var(--ops-title)" }}
          />
          <div className="mt-3.5 flex justify-end gap-2">
            <ModalBtn onClick={() => setCallModal(null)}>Cancelar</ModalBtn>
            <ModalBtn primary disabled={!callData || busy} onClick={registrarCall}>
              Registrar
            </ModalBtn>
          </div>
        </Modal>
      )}

      {/* Editor de etapas */}
      {editCols && data?.pipeline && (
        <StageEditor
          pipelineId={data.pipeline.id}
          stages={stages}
          counts={new Map(stages.map((s) => [s.id, cards.filter((c) => c.stage_id === s.id).length]))}
          onClose={() => {
            setEditCols(false)
            void mutate()
          }}
        />
      )}
    </div>
  )
}

// ── Card de loja ────────────────────────────────────────────────────

function StoreCard({
  card: c,
  stage,
  stages,
  selected,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onSelect,
  onMove,
}: {
  card: Card
  stage: Stage
  stages: Stage[]
  selected: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onSelect: () => void
  onMove: (stage: Stage) => void
}) {
  const paused = isPauseStage(stage)
  const churn = isChurnStage(stage)
  const tone = c.call_tone
  const destaque = !paused && tone.agendar

  const row = (label: string, val: React.ReactNode, cor?: string, bold?: boolean) => (
    <div key={label} className="flex items-baseline justify-between gap-2.5">
      <span className="shrink-0 text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
        {label}
      </span>
      <span
        className="overflow-hidden text-ellipsis whitespace-nowrap text-right text-[11px]"
        style={{ fontWeight: bold ? 650 : 550, color: cor || "var(--ops-title)", ...TNUM }}
      >
        {val}
      </span>
    </div>
  )

  const toneColor = (t: "pos" | "warn" | "neg" | "mut" | "ok") =>
    t === "pos" ? "var(--ops-pos)" : t === "warn" ? "var(--ops-warn)" : t === "neg" ? "var(--ops-neg)" : t === "mut" ? "var(--ops-mut)" : "var(--ops-title)"

  const mensTxt =
    c.mensalidade === "paga" ? "Paga" : c.mensalidade === "pendente" ? "Pendente" : c.mensalidade === "atrasada" ? "Atrasada" : "—"
  const mensCor =
    c.mensalidade === "paga" ? "var(--ops-pos)" : c.mensalidade === "pendente" ? "var(--ops-warn)" : c.mensalidade === "atrasada" ? "var(--ops-neg)" : "var(--ops-mut)"

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className="relative cursor-pointer rounded-[9px] border px-3 py-[11px] shadow-sm transition-shadow hover:shadow-md"
      style={{
        background: "var(--ops-card)",
        borderColor: selected ? "#8B9BE8" : destaque ? "var(--ops-warn)" : "var(--ops-border)",
      }}
    >
      <div className="flex items-center gap-[9px]">
        <CsAvatar name={c.store_name} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold" style={{ color: "var(--ops-title)" }}>
            {c.store_name}
          </div>
          <div className="mt-px truncate text-[10px]" style={{ color: "var(--ops-mut)" }}>
            {c.csm_name ? `${c.csm_name.split(" ")[0]} · CS · ` : ""}
            {fmtK(c.mrr)}/mês
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleMenu()
          }}
          aria-label="Mover loja de etapa"
          className="h-5 w-5 shrink-0 rounded-[5px] border-0 bg-transparent text-[13px] leading-none"
          style={{ color: "var(--ops-mut)" }}
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <>
          <div
            onClick={(e) => {
              e.stopPropagation()
              onCloseMenu()
            }}
            className="fixed inset-0 z-40"
          />
          <div
            className="absolute right-2 top-8 z-50 w-[172px] rounded-[9px] border p-1 shadow-lg"
            style={{ background: "var(--ops-card)", borderColor: "var(--ops-border)" }}
          >
            <div className="px-[9px] pb-[3px] pt-[5px] text-[9px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--ops-mut)" }}>
              Mover para
            </div>
            {stages
              .filter((s) => s.id !== c.stage_id)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onMove(s)
                  }}
                  className="flex w-full items-center gap-[7px] rounded-[6px] px-[9px] py-1.5 text-left text-[11.5px] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                  style={{ color: "var(--ops-text)" }}
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: stageColor(s) }} />
                  {s.name}
                </button>
              ))}
          </div>
        </>
      )}

      <div className="mt-2.5 flex flex-col gap-1.5 border-t pt-[9px]" style={{ borderColor: "var(--ops-border)" }}>
        {paused ? (
          <>
            {row(
              "Pausada em",
              c.stage_changed_at
                ? new Date(c.stage_changed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                : "—",
            )}
            {c.motivo && row("Motivo", c.motivo)}
            {row("Carteira", "Fora da ativa", "var(--ops-mut)")}
          </>
        ) : (
          <>
            {row(
              "Convertfy gera",
              c.pct != null ? `${c.pct.toFixed(1).replace(".", ",")}%` : c.revenue_synced ? "—" : "sem sync",
              toneColor(pctTone(c.pct)),
              true,
            )}
            {row("Mensalidade", mensTxt, mensCor)}
            {row(
              "Última call",
              c.call_days == null ? "nunca" : c.call_days === 0 ? "hoje" : `há ${c.call_days}d${destaque ? " · agendar" : ""}`,
              c.call_days == null ? "var(--ops-mut)" : toneColor(tone.tone),
              destaque,
            )}
            {churn && c.motivo && row("Motivo", c.motivo, "var(--ops-neg)")}
          </>
        )}
      </div>
    </div>
  )
}

// ── Drawer ──────────────────────────────────────────────────────────

function CarteiraDrawer({
  card: c,
  stages,
  onClose,
  onPausar,
  onReativar,
  onRegistrarCall,
  busy,
}: {
  card: Card
  stages: Stage[]
  onClose: () => void
  onPausar: () => void
  onReativar: () => void
  onRegistrarCall: () => void
  busy: boolean
}) {
  const stage = stages.find((s) => s.id === c.stage_id)
  const paused = stage ? isPauseStage(stage) : false
  const churn = stage ? isChurnStage(stage) : false

  const secTitle = (t: string) => (
    <div className="text-[9.5px] font-[650] uppercase tracking-[0.08em]" style={{ color: "var(--ops-mut)" }}>
      {t}
    </div>
  )

  const stCor = (st: string) =>
    st === "paga"
      ? "var(--ops-pos)"
      : st === "em aberto"
        ? "var(--ops-warn)"
        : st === "atrasada"
          ? "var(--ops-neg)"
          : "var(--ops-mut)"

  return (
    <aside
      className="relative w-[300px] shrink-0 overflow-y-auto border-l px-[18px] pb-[22px] pt-[18px]"
      style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
      aria-label={`Detalhes de ${c.store_name}`}
    >
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute right-3.5 top-3.5 flex h-[26px] w-[26px] items-center justify-center rounded-[7px]"
        style={{ background: "var(--ops-hover, rgba(0,0,0,0.05))", color: "var(--ops-sec)" }}
      >
        <X className="h-[13px] w-[13px]" />
      </button>

      <div className="flex items-center gap-[11px]">
        <CsAvatar name={c.store_name} size={42} />
        <div className="min-w-0">
          <div className="text-[14px] font-[650]" style={{ color: "var(--ops-title)" }}>
            {c.store_name}
          </div>
          <div className="mt-px text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
            {c.since ? `desde ${c.since}` : c.client_name || ""}
            {c.csm_name ? ` · CS ${c.csm_name.split(" ")[0]}` : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-[7px]">
        {stage && (
          <span
            className="inline-flex h-[25px] items-center gap-1.5 rounded-[13px] border px-[11px] text-[11px] font-semibold"
            style={{ borderColor: "var(--ops-border)", color: "var(--ops-title)" }}
          >
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: stageColor(stage) }} />
            {stage.name}
          </span>
        )}
        <span className="text-[11px]" style={{ color: "var(--ops-sec)", ...TNUM }}>
          {fmtK(c.mrr)}/mês
        </span>
      </div>

      {paused && (
        <div
          className="mt-3 rounded-[8px] border px-[11px] py-[9px] text-[11px] leading-[1.5]"
          style={{ borderColor: "var(--ops-warn)", color: "var(--ops-warn)", background: "rgba(251,191,36,0.08)" }}
        >
          Pausada{c.motivo ? ` — ${c.motivo.toLowerCase()}` : ""} — fora da carteira ativa. Cobranças seguem no financeiro do cliente.
        </div>
      )}

      {/* Resultado 30d */}
      <div className="mt-[18px]">
        {secTitle("Resultado · 30d")}
        {c.pct != null ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-[25px] font-[650] tracking-[-0.02em]"
                style={{ color: pctTone(c.pct) === "pos" ? "var(--ops-pos)" : "var(--ops-warn)", ...TNUM }}
              >
                {c.pct.toFixed(1).replace(".", ",")}%
              </span>
              <span className="text-[11px]" style={{ color: "var(--ops-sec)" }}>
                da receita gerada pela Convertfy
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5 text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
              <span className="flex justify-between">
                <span>Receita total da loja</span>
                <strong className="font-semibold" style={{ color: "var(--ops-title)", ...TNUM }}>
                  {brl0(c.total_brl)}
                </strong>
              </span>
              <span className="flex justify-between">
                <span>Atribuída à Convertfy</span>
                <strong className="font-semibold" style={{ color: "var(--ops-pos)", ...TNUM }}>
                  {brl0(c.attributed_brl)}
                </strong>
              </span>
            </div>
          </>
        ) : (
          <div className="mt-2 text-[11.5px]" style={{ color: "var(--ops-mut)" }}>
            {c.revenue_synced ? "Sem receita no período." : "Sem sincronização de receita nos últimos 30d."}
          </div>
        )}
        <Link
          href={`/admin/stores/${c.store_id}`}
          className="mt-2 inline-block text-[11px] font-medium"
          style={{ color: "#4E62D8" }}
        >
          Ver detalhe da loja →
        </Link>
      </div>

      {/* Pagamentos */}
      <div className="mt-[18px] border-t pt-[15px]" style={{ borderColor: "var(--ops-border)" }}>
        {secTitle("Pagamentos")}
        <div className="mt-2 flex items-center gap-[9px]">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              background:
                c.mensalidade === "paga"
                  ? "var(--ops-pos)"
                  : c.mensalidade === "pendente"
                    ? "var(--ops-warn)"
                    : c.mensalidade === "atrasada"
                      ? "var(--ops-neg)"
                      : "var(--ops-track, rgba(0,0,0,0.1))",
            }}
          />
          <span className="flex-1 text-[11.5px]" style={{ color: "var(--ops-text)" }}>
            Mensalidade
          </span>
          <span
            className="text-[11.5px] font-semibold capitalize"
            style={{
              color:
                c.mensalidade === "paga"
                  ? "var(--ops-pos)"
                  : c.mensalidade === "pendente"
                    ? "var(--ops-warn)"
                    : c.mensalidade === "atrasada"
                      ? "var(--ops-neg)"
                      : "var(--ops-mut)",
            }}
          >
            {c.mensalidade === "none" ? "—" : c.mensalidade}
          </span>
          <span className="w-[56px] text-right text-[11.5px]" style={{ color: "var(--ops-sec)", ...TNUM }}>
            {c.mrr > 0 ? fmtK(c.mrr) : "—"}
          </span>
        </div>

        <div className="mt-[13px] text-[9.5px] font-[650] uppercase tracking-[0.08em]" style={{ color: "var(--ops-mut)" }}>
          Histórico · mensalidade
        </div>
        {c.mensalidade_history.length > 0 ? (
          <div className="mt-2 overflow-hidden rounded-[8px] border" style={{ borderColor: "var(--ops-border)" }}>
            {c.mensalidade_history.map((m, i) => (
              <div
                key={`${m.month}-${i}`}
                className="flex items-center gap-2 px-2.5 py-[6.5px]"
                style={{
                  borderTop: i ? "1px solid var(--ops-border)" : "none",
                  background: m.status === "atrasada" ? "rgba(248,113,113,0.06)" : "transparent",
                }}
              >
                <span className="w-[38px] text-[10.5px] font-semibold" style={{ color: "var(--ops-title)", ...TNUM }}>
                  {m.month}
                </span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stCor(m.status) }} />
                <span className="flex-1 text-[10.5px] font-semibold capitalize" style={{ color: stCor(m.status) }}>
                  {m.status}
                </span>
                <span className="text-[10px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
                  {m.detail}
                </span>
                <span className="text-[10px]" style={{ color: "var(--ops-sec)", ...TNUM }}>
                  {fmtK(m.amount)}
                </span>
              </div>
            ))}
            {c.client_id && (c.mensalidade === "atrasada" || c.mensalidade === "pendente") && (
              <div
                className="flex items-center gap-2 border-t px-2.5 py-[7px]"
                style={{ borderColor: "var(--ops-border)", background: "var(--ops-hover, rgba(0,0,0,0.02))" }}
              >
                <span className="flex-1 text-[10px]" style={{ color: "var(--ops-sec)" }}>
                  {c.mensalidade === "atrasada" ? "Fatura vencida — cobre pelo financeiro" : "Fatura em aberto"}
                </span>
                <Link
                  href={`/admin/clients/${c.client_id}`}
                  className="text-[10.5px] font-semibold"
                  style={{ color: "#4E62D8" }}
                >
                  {c.mensalidade === "atrasada" ? "Cobrar agora" : "Ver fatura"}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[11px]" style={{ color: "var(--ops-mut)" }}>
            Nenhuma fatura registrada para este cliente.
          </div>
        )}
      </div>

      {/* Relacionamento */}
      <div className="mt-[18px] border-t pt-[15px]" style={{ borderColor: "var(--ops-border)" }}>
        {secTitle("Relacionamento")}
        <div className="mt-2 flex flex-col gap-1.5 text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
          <span className="flex justify-between">
            <span>Última call de alinhamento</span>
            <strong
              className="font-semibold"
              style={{ color: (c.call_days ?? 0) >= 21 ? "var(--ops-warn)" : "var(--ops-title)", ...TNUM }}
            >
              {c.call_days == null ? "nunca" : c.call_days === 0 ? "hoje" : `há ${c.call_days}d`}
            </strong>
          </span>
          <span className="flex justify-between">
            <span>Próxima call</span>
            <strong className="font-semibold" style={{ color: "var(--ops-title)", ...TNUM }}>
              {c.next_call ?? "—"}
            </strong>
          </span>
        </div>
        <button
          onClick={onRegistrarCall}
          className="mt-2.5 h-[29px] rounded-[7px] border px-3 text-[11.5px] font-medium"
          style={{ borderColor: "var(--ops-border)", color: "var(--ops-title)" }}
        >
          Registrar call
        </button>
      </div>

      {/* Ações */}
      <div className="mt-[18px] flex flex-col gap-[7px] border-t pt-[15px]" style={{ borderColor: "var(--ops-border)" }}>
        {paused || churn ? (
          <button
            onClick={onReativar}
            disabled={busy}
            className="h-8 rounded-[8px] border-0 text-[12px] font-semibold text-white disabled:opacity-60"
            style={{ background: "#4E62D8" }}
          >
            Reativar loja
          </button>
        ) : (
          <>
            <button
              onClick={onPausar}
              disabled={busy}
              className="h-8 rounded-[8px] border bg-transparent text-[12px] font-medium disabled:opacity-60"
              style={{ borderColor: "var(--ops-border)", color: "var(--ops-title)" }}
            >
              Pausar loja
            </button>
            <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ops-mut)" }}>
              Ao pausar, a loja sai da carteira ativa e o motivo fica registrado no histórico.
            </span>
          </>
        )}
      </div>
    </aside>
  )
}

// ── Editor de etapas ────────────────────────────────────────────────

function StageEditor({
  pipelineId,
  stages: initial,
  counts,
  onClose,
}: {
  pipelineId: string
  stages: Stage[]
  counts: Map<string, number>
  onClose: () => void
}) {
  const [stages, setStages] = useState<Stage[]>(initial)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const api = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new Error((b as { error?: string })?.error || `Erro ${res.status}`)
    }
    return res.json().catch(() => ({}))
  }

  const rename = async (stage: Stage, name: string) => {
    setStages((ss) => ss.map((s) => (s.id === stage.id ? { ...s, name } : s)))
  }
  const persistRename = async (stage: Stage) => {
    const current = stages.find((s) => s.id === stage.id)
    if (!current || current.name === initial.find((s) => s.id === stage.id)?.name) return
    try {
      await api(`/api/crm/pipelines/${pipelineId}/stages/${stage.id}`, "PATCH", { name: current.name })
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível renomear")
    }
  }

  const swap = async (i: number, j: number) => {
    const next = [...stages]
    ;[next[i], next[j]] = [next[j], next[i]]
    setStages(next)
    try {
      await api(`/api/crm/pipelines/${pipelineId}/stages/reorder`, "POST", {
        stages: next.map((s, idx) => ({ id: s.id, order: idx + 1 })),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível reordenar")
      setStages(stages) // rollback
    }
  }

  const remove = async (stage: Stage) => {
    try {
      await api(`/api/crm/pipelines/${pipelineId}/stages/${stage.id}`, "DELETE", {})
      setStages((ss) => ss.filter((s) => s.id !== stage.id))
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível remover")
    }
  }

  const add = async () => {
    setSaving(true)
    setErr(null)
    try {
      await api(`/api/crm/pipelines/${pipelineId}/stages`, "POST", {
        name: "Nova etapa",
        color: "#0E7490",
      })
      // Recarrega via onClose→mutate; feedback imediato:
      setStages((ss) => [
        ...ss,
        { id: `tmp-${Date.now()}`, name: "Nova etapa", color: "#0E7490", order: ss.length + 1, stage_type: "open", description: null },
      ])
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível criar a etapa")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} width={420}>
      <div className="text-[14.5px] font-[650]" style={{ color: "var(--ops-title)" }}>
        Etapas da carteira
      </div>
      <div className="mt-1 text-[11.5px]" style={{ color: "var(--ops-sec)" }}>
        Renomeie, reordene ou crie etapas. Etapas com lojas não podem ser removidas.
      </div>
      {err && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--ops-neg)" }} role="alert">
          {err}
        </div>
      )}
      <div className="mt-3.5 flex flex-col gap-1.5">
        {stages.map((s, i) => {
          const n = counts.get(s.id) ?? 0
          const isTmp = s.id.startsWith("tmp-")
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-[8px] border px-2 py-1.5"
              style={{ borderColor: "var(--ops-border)" }}
            >
              <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: stageColor(s) }} />
              <input
                value={s.name}
                onChange={(e) => rename(s, e.target.value)}
                onBlur={() => !isTmp && persistRename(s)}
                className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] font-medium outline-none"
                style={{ color: "var(--ops-title)" }}
              />
              <span className="text-[10px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
                {n} lojas
              </span>
              <EditorBtn disabled={i === 0 || isTmp} onClick={() => swap(i, i - 1)}>
                ▲
              </EditorBtn>
              <EditorBtn disabled={i === stages.length - 1 || isTmp} onClick={() => swap(i, i + 1)}>
                ▼
              </EditorBtn>
              <EditorBtn
                disabled={n > 0 || isTmp}
                danger
                title={n > 0 ? "Mova as lojas antes de remover" : "Remover etapa"}
                onClick={() => remove(s)}
              >
                <X className="h-[11px] w-[11px]" />
              </EditorBtn>
            </div>
          )
        })}
      </div>
      <div className="mt-3.5 flex justify-between gap-2">
        <button
          onClick={add}
          disabled={saving}
          className="h-[31px] rounded-[8px] border border-dashed bg-transparent px-3 text-[12px] font-medium disabled:opacity-60"
          style={{ borderColor: "var(--ops-border)", color: "var(--ops-sec)" }}
        >
          + Nova etapa
        </button>
        <ModalBtn primary onClick={onClose}>
          Concluir
        </ModalBtn>
      </div>
    </Modal>
  )
}

function EditorBtn({
  children,
  onClick,
  disabled,
  danger,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border-0 bg-transparent text-[11px]"
      style={{
        color: disabled ? "var(--ops-track, rgba(0,0,0,0.15))" : danger ? "var(--ops-neg)" : "var(--ops-sec)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  )
}

// ── Primitivas de modal ─────────────────────────────────────────────

function Modal({ children, onClose, width }: { children: React.ReactNode; onClose: () => void; width: number }) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{ background: "rgba(9,10,14,0.45)" }}
      role="dialog"
      aria-modal
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[12px] border px-[22px] py-5 shadow-2xl"
        style={{ width, background: "var(--ops-card)", borderColor: "var(--ops-border)" }}
      >
        {children}
      </div>
    </div>
  )
}

function ModalBtn({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-[31px] rounded-[8px] px-3.5 text-[12px]",
        primary ? "border-0 font-semibold text-white" : "border bg-transparent font-medium",
      )}
      style={
        primary
          ? {
              background: disabled ? "var(--ops-track, rgba(0,0,0,0.12))" : danger ? "#DC2626" : "#4E62D8",
              color: disabled ? "var(--ops-mut)" : "#fff",
              cursor: disabled ? "not-allowed" : "pointer",
            }
          : { borderColor: "var(--ops-border)", color: "var(--ops-text)" }
      }
    >
      {children}
    </button>
  )
}
