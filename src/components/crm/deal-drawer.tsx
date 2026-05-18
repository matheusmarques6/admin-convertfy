"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  Flag,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  Sparkles,
  StickyNote,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react"
import { CustomFieldsPanel } from "./custom-fields-panel"
import type { DealFile } from "@/types/crm"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

const fmtBRL = (v: number): string =>
  "R$ " +
  Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

interface DealDrawerProps {
  dealId: string | null
  onClose: () => void
  onUpdated?: () => void
  pipelineStages?: Array<{
    id: string
    name: string
    stage_type: string | null
    color?: string | null
    order?: number
  }>
  fallbackDeal?: {
    id: string
    title: string
    value: number | null
    status: string
    pipeline_id: string
    stage_id: string
    tags?: string[] | null
    source?: string | null
    created_at?: string | null
    owner?: { id: string; name: string; avatar_url: string | null } | null
    client?: { id: string; name: string } | null
    store?: { id: string; name: string } | null
  } | null
  onMissing?: () => void
}

interface DealDetailResponse {
  success?: boolean
  deal: {
    id: string
    title: string
    value: number | null
    currency: string | null
    probability: number | null
    status: string
    source: string | null
    tags: string[] | null
    notes: string | null
    lost_reason: string | null
    won_reason: string | null
    custom_fields: Record<string, unknown> | null
    created_at: string
    updated_at: string
    last_stage_changed_at?: string | null
    expected_close_date?: string | null
    pipeline_id: string
    stage_id: string
    pipeline?: { id: string; name: string }
    stage?: { id: string; name: string; stage_type: string | null; color?: string | null }
    owner?: { id: string; name: string; avatar_url: string | null } | null
    client?: { id: string; name: string; email?: string | null; phone?: string | null; company?: string | null } | null
    store?: { id: string; name: string } | null
    lead?: { id: string; name: string; email: string | null; phone?: string | null } | null
    ai_qualification_score?: number | null
    ai_qualification_reason?: string | null
  }
  activities: Array<{
    id: string
    type: string
    content: string
    due_at: string | null
    completed_at: string | null
    is_internal: boolean
    created_at: string
    creator?: { id: string; name: string; avatar_url: string | null } | null
  }>
  history?: unknown[]
}

type ComposerTab = "note" | "task" | "call" | "email"
const COMPOSER_TABS: Array<{ id: ComposerTab; label: string; icon: typeof StickyNote }> = [
  { id: "note", label: "Nota", icon: StickyNote },
  { id: "task", label: "Tarefa", icon: CheckSquare },
  { id: "call", label: "Ligação", icon: Phone },
  { id: "email", label: "Email", icon: Mail },
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
}

function avatarColorFromName(name: string): { bg: string; fg: string } {
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "#EEF0FB", fg: "#4E62D8" },
    { bg: "#ECFDF5", fg: "#065F46" },
    { bg: "#FFFBEB", fg: "#92400E" },
    { bg: "#F3E8FF", fg: "#7C3AED" },
    { bg: "#FEF2F2", fg: "#991B1B" },
    { bg: "#F3F4F6", fg: "#4B5563" },
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86400000),
  )
}

export function DealDrawer({
  dealId,
  onClose,
  onUpdated,
  pipelineStages,
  fallbackDeal,
  onMissing,
}: DealDrawerProps) {
  const open = !!dealId

  const { data, isLoading, error, mutate } = useSWR<DealDetailResponse>(
    dealId ? `/api/crm/deals/${dealId}` : null,
    fetcher,
    {
      shouldRetryOnError: true,
      errorRetryCount: 1,
      errorRetryInterval: 600,
    },
  )

  // Arquivos do deal
  const { data: filesData, mutate: mutateFiles } = useSWR<{
    success?: boolean
    files?: DealFile[]
    data?: { files: DealFile[] }
  }>(
    dealId ? `/api/crm/deals/${dealId}/files` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const files: DealFile[] = filesData?.data?.files ?? filesData?.files ?? []

  const [composerTab, setComposerTab] = useState<ComposerTab>("note")
  const [composerContent, setComposerContent] = useState("")
  const [composerDueIn, setComposerDueIn] = useState<string>("24")
  const [posting, setPosting] = useState(false)
  const [showComposer, setShowComposer] = useState(false)

  useEffect(() => {
    if (!open) {
      setComposerContent("")
      setComposerTab("note")
      setShowComposer(false)
    }
  }, [open])

  const errorIs404 =
    error instanceof Error && /not.?found|nao encontrad|404/i.test(error.message)
  useEffect(() => {
    if (errorIs404 && onMissing) onMissing()
  }, [errorIs404, onMissing])

  const apiDeal = data?.deal
  const deal = apiDeal ?? (fallbackDeal as DealDetailResponse["deal"] | undefined)
  const activities = data?.activities || []

  const postActivity = async () => {
    if (!dealId || !composerContent.trim()) return
    setPosting(true)
    try {
      const payload: Record<string, unknown> = {
        type: composerTab,
        content: composerContent.trim(),
        is_internal: composerTab !== "email",
      }
      if (composerTab === "task" && composerDueIn) {
        const hours = parseInt(composerDueIn, 10)
        if (!Number.isNaN(hours)) {
          payload.due_at = new Date(Date.now() + hours * 3600000).toISOString()
        }
      }
      await fetch(`/api/crm/deals/${dealId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setComposerContent("")
      setShowComposer(false)
      await mutate()
      onUpdated?.()
    } finally {
      setPosting(false)
    }
  }

  const moveToStage = async (stageId: string) => {
    if (!dealId) return
    const res = await fetch(`/api/crm/deals/${dealId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: stageId, position: 10 }),
    })
    if (res.ok) {
      await mutate()
      onUpdated?.()
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          style={{ background: "rgba(15, 17, 23, 0.32)" }}
        />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
          style={{
            width: "var(--crm-drawer-width)",
            maxWidth: "100vw",
            background: "var(--crm-gray-25)",
            borderLeft: "1px solid var(--crm-border)",
            boxShadow: "var(--crm-shadow-drawer)",
            fontFamily: "var(--crm-font-sans)",
            animationDuration: "220ms",
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {deal?.title || "Detalhes do deal"}
          </DialogPrimitive.Title>

          {isLoading && !deal ? (
            <DrawerSkeleton onClose={onClose} />
          ) : !deal ? (
            <DrawerError onClose={onClose} onRetry={() => mutate()} message={error?.message} />
          ) : (
            <>
              <DrawerHeader
                deal={deal}
                apiDeal={apiDeal}
                pipelineStages={pipelineStages}
                onClose={onClose}
                onMoveStage={moveToStage}
                hasError={!!error && !!deal}
                errorIs404={errorIs404}
                onRetry={() => mutate()}
              />

              <div
                className="flex-1 overflow-y-auto"
                style={{ padding: "22px 22px 100px", minHeight: 0 }}
              >
                {/* Hero numbers row */}
                <HeroNumbers deal={deal} />

                {/* Composer rapido (collapsible) */}
                {apiDeal && deal.status === "open" && (
                  <QuickComposer
                    show={showComposer}
                    onToggle={() => setShowComposer((v) => !v)}
                    tab={composerTab}
                    onTabChange={setComposerTab}
                    content={composerContent}
                    onContentChange={setComposerContent}
                    dueIn={composerDueIn}
                    onDueInChange={setComposerDueIn}
                    onSubmit={postActivity}
                    posting={posting}
                  />
                )}

                {/* Últimas interações */}
                <LastInteractions activities={activities} loading={isLoading && !data} />

                {/* Próximos passos (tasks pendentes) */}
                <NextSteps activities={activities} />

                {/* Contato + Custom fields */}
                <ContactAndFields
                  deal={deal}
                  apiDeal={apiDeal}
                  onSaved={() => mutate()}
                />

                {/* Arquivos */}
                <FilesSection
                  dealId={dealId!}
                  files={files}
                  onChanged={() => mutateFiles()}
                />

                {/* AI Suggestion */}
                {(apiDeal?.ai_qualification_score ?? 0) > 0 && (
                  <AiSuggestion deal={deal} apiDeal={apiDeal} />
                )}

                {/* Banners de motivo */}
                {apiDeal?.won_reason && deal.status === "won" && (
                  <Banner
                    tone="pos"
                    icon={<Trophy className="h-3.5 w-3.5" />}
                    label={`Ganho: ${apiDeal.won_reason}`}
                  />
                )}
                {apiDeal?.lost_reason && deal.status === "lost" && (
                  <Banner
                    tone="neg"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    label={`Perdido: ${apiDeal.lost_reason}`}
                  />
                )}
              </div>

              {/* Sticky footer */}
              <DrawerFooter
                deal={deal}
                apiDeal={apiDeal}
                pipelineStages={pipelineStages}
                onMoveStage={moveToStage}
              />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── HEADER ──────────────────────────────────────────────────────

function DrawerHeader({
  deal,
  apiDeal,
  pipelineStages,
  onClose,
  onMoveStage,
  hasError,
  errorIs404,
  onRetry,
}: {
  deal: DealDetailResponse["deal"]
  apiDeal?: DealDetailResponse["deal"]
  pipelineStages?: DealDrawerProps["pipelineStages"]
  onClose: () => void
  onMoveStage: (stageId: string) => void
  hasError: boolean
  errorIs404: boolean
  onRetry: () => void
}) {
  const leadName = deal.client?.name || deal.title
  const avatarColors = avatarColorFromName(leadName)
  const score = apiDeal?.ai_qualification_score ?? 0
  const stages = pipelineStages
    ? [...pipelineStages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : []
  const currentStageIdx = stages.findIndex((s) => s.id === deal.stage_id)
  const stageDays = daysSince(deal.last_stage_changed_at)
  const isCritical = stageDays > 10
  const company = deal.client?.company || deal.store?.name || null

  return (
    <div
      style={{
        padding: "22px 28px 18px",
        background: "var(--crm-gray-0)",
        borderBottom: "1px solid var(--crm-border)",
        flexShrink: 0,
      }}
    >
      <div className="flex items-start gap-4">
        {/* Avatar 56px */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{
            background: avatarColors.bg,
            color: avatarColors.fg,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {getInitials(leadName) || "?"}
        </div>

        {/* Nome + company + critical badge */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <h2
              className="m-0 truncate"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--crm-gray-900)",
                letterSpacing: "-0.015em",
              }}
            >
              {leadName}
            </h2>
            <span
              className="crm-tnum"
              style={{ fontSize: 11, color: "var(--crm-gray-400)" }}
            >
              · #{deal.id.slice(0, 6)}
            </span>
          </div>
          {company && (
            <div
              style={{
                fontSize: 12,
                color: "var(--crm-gray-500)",
                marginTop: 1,
              }}
            >
              <span style={{ color: "var(--crm-gray-700)", fontWeight: 500 }}>
                {company}
              </span>
            </div>
          )}
          {deal.source && (
            <div
              style={{
                fontSize: 12,
                color: "var(--crm-gray-500)",
                marginTop: 1,
              }}
            >
              {deal.source}
            </div>
          )}
          {isCritical && deal.status === "open" && (
            <div
              className="cf-statusin inline-flex items-center gap-1.5"
              style={{
                marginTop: 8,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--crm-neg-bg)",
                border: "1px solid var(--crm-neg-border)",
                color: "var(--crm-neg)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Flag className="h-3 w-3" />
              Sem movimento há {stageDays} dias
            </div>
          )}
        </div>

        {/* Score donut + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex gap-1">
            <button
              className="cf-focusable flex items-center justify-center rounded-[6px]"
              style={{
                width: 30,
                height: 30,
                border: "1px solid var(--crm-border)",
                background: "var(--crm-gray-0)",
                color: "var(--crm-gray-500)",
              }}
              title="Abrir tela cheia"
              aria-label="Abrir tela cheia"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="cf-focusable flex items-center justify-center rounded-[6px]"
              style={{
                width: 30,
                height: 30,
                border: 0,
                background: "transparent",
                color: "var(--crm-gray-500)",
              }}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {score > 0 && <ScoreDonut value={score} />}
        </div>
      </div>

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
          {deal.tags.map((t) => (
            <Badge key={t} tone="info">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {/* Stage tracker — barras horizontais clicaveis */}
      {stages.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="flex items-center gap-[3px]">
            {stages.map((s, i) => {
              const done = i < currentStageIdx
              const active = i === currentStageIdx
              const isWonStage = s.stage_type === "won" && (active || done)
              const isLostStage = s.stage_type === "lost" && active
              const bg = isLostStage
                ? "var(--crm-neg)"
                : isWonStage
                  ? "var(--crm-pos)"
                  : active
                    ? "var(--crm-amber)"
                    : done
                      ? "var(--crm-pos)"
                      : "var(--crm-gray-200)"
              return (
                <button
                  key={s.id}
                  type="button"
                  title={s.name}
                  onClick={() => onMoveStage(s.id)}
                  className="cf-focusable"
                  style={{
                    flex: 1,
                    height: 18,
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: 4,
                      borderRadius: 2,
                      background: bg,
                    }}
                  />
                </button>
              )
            })}
          </div>
          <div
            className="crm-tnum flex items-center justify-between"
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "var(--crm-gray-500)",
            }}
          >
            <span>
              <b
                style={{
                  color: "var(--crm-gray-700)",
                  fontWeight: 600,
                }}
              >
                {stages[currentStageIdx]?.name ?? "—"}
              </b>{" "}
              · há {stageDays}d
            </span>
            <span>
              {currentStageIdx + 1} de {stages.length}
              {deal.expected_close_date && (
                <>
                  {" "}· prev. fech.{" "}
                  <b style={{ color: "var(--crm-gray-700)" }}>
                    {new Date(deal.expected_close_date).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </b>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Error banner */}
      {hasError && (
        <div
          className="flex items-center gap-2"
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--crm-warn-bg)",
            border: "1px solid var(--crm-warn-border)",
            color: "var(--crm-warn)",
            fontSize: 11,
          }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Mostrando dados em cache.{" "}
            {errorIs404 ? "Este deal pode ter sido removido." : "Erro ao carregar."}
          </span>
          <button
            onClick={onRetry}
            style={{ fontWeight: 600, background: "transparent", border: 0, color: "inherit" }}
          >
            Recarregar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Score Donut ────────────────────────────────────────────────

function ScoreDonut({
  value = 0,
  size = 64,
  stroke = 6,
}: {
  value?: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const C = 2 * Math.PI * r
  const off = C * (1 - value / 100)
  const tone =
    value >= 75 ? "var(--crm-pos)" : value >= 50 ? "var(--crm-amber)" : "var(--crm-neg)"
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--crm-gray-100)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeDasharray={C}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="crm-tnum"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--crm-gray-900)",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontSize: 9,
            color: "var(--crm-gray-500)",
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
        >
          SCORE
        </span>
      </div>
    </div>
  )
}

// ─── Hero numbers ────────────────────────────────────────────────

function HeroNumbers({ deal }: { deal: DealDetailResponse["deal"] }) {
  const value = deal.value || 0
  const annual = value * 12
  const owner = deal.owner
  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3"
      style={{
        padding: "16px 20px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 10,
        marginBottom: 18,
      }}
    >
      <HeroStat
        label="Valor recorrente"
        big={fmtBRL(value)}
        suffix={<span style={{ fontSize: 13, color: "var(--crm-gray-500)", fontWeight: 500 }}>/mês</span>}
      />
      <div className="w-px h-9" style={{ background: "var(--crm-gray-200)" }} />
      <HeroStat
        label="Em 12m"
        big={fmtBRL(annual)}
        bigColor="var(--crm-brand)"
        bigSize={18}
      />
      <div className="w-px h-9" style={{ background: "var(--crm-gray-200)" }} />
      <HeroStat
        label="Status"
        big={
          deal.status === "won"
            ? "Ganho"
            : deal.status === "lost"
              ? "Perdido"
              : "Aberto"
        }
        bigSize={13}
      />
      {owner && (
        <>
          <div className="w-px h-9" style={{ background: "var(--crm-gray-200)" }} />
          <div>
            <div
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Resp.
            </div>
            <div className="flex items-center gap-1.5" style={{ marginTop: 4 }}>
              <OwnerAvatar name={owner.name} size={18} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--crm-gray-900)",
                }}
              >
                {owner.name.split(" ")[0]}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function HeroStat({
  label,
  big,
  suffix,
  bigColor,
  bigSize = 26,
}: {
  label: string
  big: string
  suffix?: React.ReactNode
  bigColor?: string
  bigSize?: number
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--crm-gray-500)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        className="crm-tnum"
        style={{
          fontSize: bigSize,
          fontWeight: bigSize >= 20 ? 700 : 600,
          color: bigColor ?? "var(--crm-gray-900)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          marginTop: bigSize >= 20 ? 2 : 4,
        }}
      >
        {big}
        {suffix}
      </div>
    </div>
  )
}

// ─── Quick Composer ──────────────────────────────────────────────

function QuickComposer({
  show,
  onToggle,
  tab,
  onTabChange,
  content,
  onContentChange,
  dueIn,
  onDueInChange,
  onSubmit,
  posting,
}: {
  show: boolean
  onToggle: () => void
  tab: ComposerTab
  onTabChange: (t: ComposerTab) => void
  content: string
  onContentChange: (v: string) => void
  dueIn: string
  onDueInChange: (v: string) => void
  onSubmit: () => void
  posting: boolean
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="flex items-baseline justify-between mb-2">
        <h3
          className="m-0"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Atividade rápida
        </h3>
        <button
          onClick={onToggle}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--crm-brand)",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {show ? "Fechar" : "+ Adicionar"}
        </button>
      </div>
      {show && (
        <div
          style={{
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div className="flex items-center gap-1 mb-2">
            {COMPOSER_TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => onTabChange(t.id)}
                  className="inline-flex items-center gap-1.5"
                  style={{
                    padding: "4px 9px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 4,
                    background: active ? "var(--crm-gray-900)" : "var(--crm-gray-0)",
                    color: active ? "var(--crm-gray-0)" : "var(--crm-gray-700)",
                    border: `1px solid ${active ? "var(--crm-gray-900)" : "var(--crm-border)"}`,
                    cursor: "pointer",
                  }}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                </button>
              )
            })}
          </div>
          <textarea
            className="w-full outline-none"
            style={{
              minHeight: 64,
              padding: "8px 10px",
              fontSize: 13,
              borderRadius: 6,
              background: "var(--crm-gray-0)",
              color: "var(--crm-gray-900)",
              border: "1px solid var(--crm-border)",
              resize: "vertical",
              fontFamily: "var(--crm-font-sans)",
            }}
            placeholder={
              tab === "note"
                ? "Anote uma observação interna..."
                : tab === "task"
                  ? "Descreva a tarefa..."
                  : tab === "call"
                    ? "Resumo da ligação..."
                    : "Resumo do email..."
            }
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit()
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            {tab === "task" ? (
              <select
                style={{
                  height: 28,
                  padding: "0 8px",
                  fontSize: 12,
                  borderRadius: 4,
                  background: "var(--crm-gray-0)",
                  color: "var(--crm-gray-700)",
                  border: "1px solid var(--crm-border)",
                }}
                value={dueIn}
                onChange={(e) => onDueInChange(e.target.value)}
              >
                <option value="2">Vence em 2h</option>
                <option value="24">Vence em 24h</option>
                <option value="72">Vence em 3 dias</option>
                <option value="168">Vence em 1 semana</option>
                <option value="">Sem prazo</option>
              </select>
            ) : (
              <span style={{ fontSize: 10, color: "var(--crm-gray-400)" }}>
                ⌘/Ctrl+Enter pra enviar
              </span>
            )}
            <button
              onClick={onSubmit}
              disabled={!content.trim() || posting}
              style={{
                height: 28,
                padding: "0 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                background: "var(--crm-brand)",
                color: "var(--crm-brand-fg)",
                border: 0,
                cursor: posting ? "default" : "pointer",
                opacity: !content.trim() || posting ? 0.5 : 1,
              }}
            >
              {posting ? "Salvando..." : "Adicionar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Last interactions ───────────────────────────────────────────

const INTERACTION_ICONS: Record<
  string,
  { icon: typeof MessageSquare; color: string; bg: string }
> = {
  wa_message: { icon: MessageSquare, color: "#25D366", bg: "#E7FAEB" },
  ig_message: { icon: MessageSquare, color: "#E1306C", bg: "#FCE4EC" },
  email: { icon: Mail, color: "var(--crm-brand)", bg: "var(--crm-blue-50)" },
  meeting: { icon: Calendar, color: "var(--crm-purple)", bg: "var(--crm-purple-bg)" },
  note: { icon: StickyNote, color: "var(--crm-amber)", bg: "var(--crm-warn-bg)" },
  call: { icon: Phone, color: "var(--crm-brand)", bg: "var(--crm-blue-50)" },
  task: { icon: CheckSquare, color: "var(--crm-amber)", bg: "var(--crm-warn-bg)" },
  system: { icon: Sparkles, color: "var(--crm-gray-500)", bg: "var(--crm-gray-100)" },
  stage_change: { icon: ChevronRight, color: "var(--crm-brand)", bg: "var(--crm-blue-50)" },
  file_attached: { icon: Paperclip, color: "var(--crm-gray-500)", bg: "var(--crm-gray-100)" },
}

function LastInteractions({
  activities,
  loading,
}: {
  activities: DealDetailResponse["activities"]
  loading: boolean
}) {
  const visibleActivities = useMemo(() => activities.slice(0, 5), [activities])
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <h3
          className="m-0"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Últimas interações · {activities.length}
        </h3>
        {activities.length > 5 && (
          <button
            style={{
              background: "transparent",
              border: 0,
              color: "var(--crm-brand)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Ver todas →
          </button>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                height: 60,
                background: "var(--crm-gray-100)",
                borderRadius: 8,
              }}
            />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div
          style={{
            padding: "24px 12px",
            textAlign: "center",
            color: "var(--crm-gray-500)",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          Nenhuma interação registrada ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleActivities.map((a) => (
            <InteractionRow key={a.id} activity={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function InteractionRow({
  activity,
}: {
  activity: DealDetailResponse["activities"][number]
}) {
  const meta = INTERACTION_ICONS[activity.type] ?? INTERACTION_ICONS.note
  const Icon = meta.icon
  const when = new Date(activity.created_at)
  const whenLabel = formatRelativeOrShort(when)
  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
      }}
    >
      <span
        className="flex items-center justify-center shrink-0 rounded-[8px]"
        style={{
          width: 30,
          height: 30,
          background: meta.bg,
          color: meta.color,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="truncate"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
            }}
          >
            {activity.creator?.name ?? "Sistema"}
          </span>
          <span
            className="crm-tnum shrink-0"
            style={{ fontSize: 11, color: "var(--crm-gray-400)" }}
          >
            {whenLabel}
          </span>
        </div>
        <div
          className="line-clamp-2"
          style={{
            fontSize: 12,
            color: "var(--crm-gray-600)",
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {activity.content}
        </div>
      </div>
    </div>
  )
}

function formatRelativeOrShort(d: Date): string {
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  if (diffDays < 7) return `há ${diffDays}d`
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

// ─── Next steps ──────────────────────────────────────────────────

function NextSteps({
  activities,
}: {
  activities: DealDetailResponse["activities"]
}) {
  const tasks = useMemo(() => {
    return activities.filter(
      (a) => a.type === "task" && (a.due_at || !a.completed_at),
    )
  }, [activities])
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.completed_at).length
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="flex items-baseline justify-between mb-2">
        <h3
          className="m-0"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Próximos passos · {done}/{tasks.length}
        </h3>
      </div>
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 8,
          padding: 8,
        }}
      >
        {tasks.slice(0, 6).map((t) => {
          const isDone = !!t.completed_at
          const isOverdue =
            t.due_at && !isDone && new Date(t.due_at).getTime() < Date.now()
          return (
            <div
              key={t.id}
              className="flex items-center gap-2.5"
              style={{ padding: "6px 8px", borderRadius: 6 }}
            >
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: isDone
                    ? "var(--crm-pos)"
                    : isOverdue
                      ? "var(--crm-warn)"
                      : "transparent",
                  border: `1.5px solid ${isDone ? "var(--crm-pos)" : isOverdue ? "var(--crm-warn)" : "var(--crm-gray-300)"}`,
                  color: "white",
                }}
              >
                {isDone && <Check className="h-2.5 w-2.5" />}
              </span>
              <span
                className="flex-1 truncate"
                style={{
                  fontSize: 13,
                  color: isDone
                    ? "var(--crm-pos)"
                    : isOverdue
                      ? "var(--crm-warn)"
                      : "var(--crm-gray-900)",
                  textDecoration: isDone ? "line-through" : "none",
                  fontWeight: 500,
                }}
              >
                {t.content}
              </span>
              {t.due_at && (
                <span
                  className="crm-tnum shrink-0"
                  style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
                >
                  {new Date(t.due_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Contact + custom fields ─────────────────────────────────────

function ContactAndFields({
  deal,
  apiDeal,
  onSaved,
}: {
  deal: DealDetailResponse["deal"]
  apiDeal?: DealDetailResponse["deal"]
  onSaved: () => void
}) {
  const email = deal.client?.email ?? deal.lead?.email ?? null
  const phone = deal.client?.phone ?? deal.lead?.phone ?? null
  const company = deal.client?.company ?? null

  return (
    <div
      className="grid gap-3.5"
      style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 18 }}
    >
      {/* Contato */}
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: "16px 18px",
        }}
      >
        <h3
          className="m-0"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 12,
          }}
        >
          Contato
        </h3>
        <div className="flex flex-col gap-2">
          {email && (
            <ContactRow
              icon={<Mail className="h-3.5 w-3.5" />}
              label={email}
              href={`mailto:${email}`}
            />
          )}
          {phone && (
            <ContactRow
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              label={phone}
              href={`https://wa.me/${phone.replace(/\D/g, "")}`}
              mono
            />
          )}
          {company && (
            <ContactRow
              icon={<Building2 className="h-3.5 w-3.5" />}
              label={company}
            />
          )}
          {!email && !phone && !company && (
            <span style={{ fontSize: 12, color: "var(--crm-gray-400)" }}>
              Sem contato registrado
            </span>
          )}
        </div>
      </div>

      {/* Custom fields */}
      <div
        style={{
          background: "var(--crm-gray-0)",
          border: "1px solid var(--crm-border)",
          borderRadius: 10,
          padding: "16px 18px",
        }}
      >
        <h3
          className="m-0"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 12,
          }}
        >
          Campos do deal
        </h3>
        {apiDeal ? (
          <CustomFieldsPanel
            entityType="deal"
            entityId={apiDeal.id}
            values={apiDeal.custom_fields ?? {}}
            onSaved={onSaved}
          />
        ) : (
          <span style={{ fontSize: 12, color: "var(--crm-gray-400)" }}>
            Carregando...
          </span>
        )}
      </div>
    </div>
  )
}

function ContactRow({
  icon,
  label,
  href,
  mono,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  mono?: boolean
}) {
  const inner = (
    <>
      <span style={{ color: "var(--crm-gray-400)", flexShrink: 0 }}>
        {icon}
      </span>
      <span
        className={`truncate ${mono ? "crm-tnum" : ""}`}
        style={{ flex: 1, minWidth: 0 }}
      >
        {label}
      </span>
    </>
  )
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2"
        style={{ fontSize: 12, color: "var(--crm-gray-700)" }}
      >
        {inner}
      </a>
    )
  }
  return (
    <div
      className="flex items-center gap-2"
      style={{ fontSize: 12, color: "var(--crm-gray-700)" }}
    >
      {inner}
    </div>
  )
}

// ─── Files section ───────────────────────────────────────────────

function FilesSection({
  dealId,
  files,
  onChanged,
}: {
  dealId: string
  files: DealFile[]
  onChanged: () => void
}) {
  const handleDelete = async (fileId: string) => {
    if (!window.confirm("Excluir este arquivo?")) return
    await fetch(`/api/crm/deals/${dealId}/files/${fileId}`, { method: "DELETE" })
    onChanged()
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="flex items-baseline justify-between mb-2">
        <h3
          className="m-0"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--crm-gray-700)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Arquivos · {files.length}
        </h3>
        <button
          style={{
            background: "transparent",
            border: 0,
            color: "var(--crm-brand)",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
          title="Anexar arquivo (em breve)"
          disabled
        >
          <Paperclip className="h-3 w-3" />
          Anexar
        </button>
      </div>
      {files.length === 0 ? (
        <div
          style={{
            padding: "16px 12px",
            textAlign: "center",
            color: "var(--crm-gray-400)",
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          Nenhum arquivo anexado.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <FileRow key={f.id} file={f} onDelete={() => handleDelete(f.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileRow({
  file,
  onDelete,
}: {
  file: DealFile
  onDelete: () => void
}) {
  const fileSize = file.size_bytes
    ? file.size_bytes > 1048576
      ? `${(file.size_bytes / 1048576).toFixed(1)} MB`
      : `${Math.round(file.size_bytes / 1024)} KB`
    : null
  const when = new Date(file.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
  const tone = file.mime_type?.startsWith("image/")
    ? "var(--crm-purple)"
    : file.mime_type?.includes("pdf")
      ? "var(--crm-brand)"
      : "var(--crm-gray-500)"
  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        padding: "8px 12px",
        background: "var(--crm-gray-0)",
        border: "1px solid var(--crm-border)",
        borderRadius: 6,
      }}
    >
      <span
        className="flex items-center justify-center shrink-0 rounded-[6px]"
        style={{
          width: 28,
          height: 28,
          background: `${tone}1A`,
          color: tone,
        }}
      >
        <FileIcon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--crm-gray-900)",
          }}
        >
          {file.name}
        </div>
        <div
          className="crm-tnum"
          style={{ fontSize: 11, color: "var(--crm-gray-500)" }}
        >
          {fileSize && `${fileSize} · `}
          {when}
        </div>
      </div>
      {file.signed_url && (
        <a
          href={file.signed_url}
          target="_blank"
          rel="noopener noreferrer"
          className="cf-focusable"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--crm-gray-400)",
            display: "flex",
            cursor: "pointer",
          }}
          title="Baixar"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        onClick={onDelete}
        className="cf-focusable"
        style={{
          background: "transparent",
          border: 0,
          color: "var(--crm-gray-400)",
          display: "flex",
          cursor: "pointer",
        }}
        title="Remover"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ─── AI Suggestion ───────────────────────────────────────────────

function AiSuggestion({
  deal,
  apiDeal,
}: {
  deal: DealDetailResponse["deal"]
  apiDeal?: DealDetailResponse["deal"]
}) {
  const score = apiDeal?.ai_qualification_score ?? 0
  const reason = apiDeal?.ai_qualification_reason
  const stageDays = daysSince(deal.last_stage_changed_at)
  return (
    <div
      style={{
        padding: "16px 18px",
        background: "var(--crm-brand-gradient-diag)",
        border: "1px solid var(--crm-blue-100)",
        borderRadius: 8,
        marginBottom: 18,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="flex items-center justify-center"
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            background: "var(--crm-brand-gradient)",
            color: "var(--crm-brand-fg)",
          }}
        >
          <Zap className="h-3 w-3" />
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--crm-brand-hover)",
            letterSpacing: "0.04em",
          }}
        >
          SUGESTÃO DA CONVERTFY
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--crm-gray-700)",
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        Lead com{" "}
        <b style={{ color: "var(--crm-gray-900)" }}>score {score}</b>
        {stageDays > 0 && (
          <>
            {" "}e{" "}
            <b style={{ color: stageDays > 7 ? "var(--crm-neg)" : "var(--crm-gray-900)" }}>
              {stageDays}d sem movimento
            </b>
          </>
        )}
        . {reason || "Considere acelerar a próxima ação."}
      </div>
    </div>
  )
}

// ─── Banner generico ─────────────────────────────────────────────

function Banner({
  tone,
  icon,
  label,
}: {
  tone: "pos" | "neg" | "warn" | "info"
  icon: React.ReactNode
  label: string
}) {
  const map = {
    pos: { bg: "var(--crm-pos-bg)", c: "var(--crm-pos)", b: "var(--crm-pos-border)" },
    neg: { bg: "var(--crm-neg-bg)", c: "var(--crm-neg)", b: "var(--crm-neg-border)" },
    warn: { bg: "var(--crm-warn-bg)", c: "var(--crm-warn)", b: "var(--crm-warn-border)" },
    info: { bg: "var(--crm-info-bg)", c: "var(--crm-info)", b: "var(--crm-info-border)" },
  }
  const t = map[tone]
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: "10px 14px",
        background: t.bg,
        border: `1px solid ${t.b}`,
        color: t.c,
        borderRadius: 8,
        fontSize: 13,
        marginBottom: 12,
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </div>
  )
}

// ─── Sticky footer ───────────────────────────────────────────────

function DrawerFooter({
  deal,
  apiDeal,
  pipelineStages,
  onMoveStage,
}: {
  deal: DealDetailResponse["deal"]
  apiDeal?: DealDetailResponse["deal"]
  pipelineStages?: DealDrawerProps["pipelineStages"]
  onMoveStage: (stageId: string) => void
}) {
  const sortedStages = pipelineStages
    ? [...pipelineStages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : []
  const currentIdx = sortedStages.findIndex((s) => s.id === deal.stage_id)
  const nextStage = currentIdx >= 0 ? sortedStages[currentIdx + 1] : null

  const phone = deal.client?.phone ?? apiDeal?.lead?.phone ?? null
  const email = deal.client?.email ?? apiDeal?.lead?.email ?? null
  const waLink = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null

  return (
    <div
      className="flex items-center justify-between gap-2 absolute left-0 right-0 bottom-0"
      style={{
        padding: "14px 22px",
        background: "var(--crm-gray-0)",
        borderTop: "1px solid var(--crm-border)",
        flexShrink: 0,
      }}
    >
      <div className="flex gap-1.5">
        {waLink && (
          <FooterBtn href={waLink} icon={<MessageSquare className="h-3.5 w-3.5" />} label="WhatsApp" />
        )}
        {email && (
          <FooterBtn
            href={`mailto:${email}`}
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Email"
          />
        )}
        <FooterBtn
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Agendar"
          disabled
        />
      </div>
      {nextStage && deal.status === "open" && (
        <button
          onClick={() => onMoveStage(nextStage.id)}
          className="cf-focusable inline-flex items-center gap-1.5 rounded-[6px]"
          style={{
            height: 34,
            padding: "0 14px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontSize: 13,
            fontWeight: 500,
            border: 0,
            cursor: "pointer",
          }}
          title={`Mover para ${nextStage.name}`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Mover etapa
        </button>
      )}
    </div>
  )
}

function FooterBtn({
  icon,
  label,
  href,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  disabled?: boolean
}) {
  const style: React.CSSProperties = {
    height: 34,
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    background: "var(--crm-gray-0)",
    color: disabled ? "var(--crm-gray-400)" : "var(--crm-gray-700)",
    border: "1px solid var(--crm-border)",
    cursor: disabled ? "default" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    opacity: disabled ? 0.6 : 1,
  }
  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
        {icon}
        {label}
      </a>
    )
  }
  return (
    <button disabled={disabled} style={style}>
      {icon}
      {label}
    </button>
  )
}

// ─── Owner avatar (componente leve) ──────────────────────────────

function OwnerAvatar({ name, size = 18 }: { name: string; size?: number }) {
  const colors = avatarColorFromName(name)
  const initials = getInitials(name)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: colors.bg,
        color: colors.fg,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        fontWeight: 600,
      }}
    >
      {initials}
    </span>
  )
}

// ─── Badge ───────────────────────────────────────────────────────

function Badge({
  tone,
  children,
}: {
  tone: "info" | "neg" | "pos" | "warn" | "neut" | "purple"
  children: React.ReactNode
}) {
  const map = {
    info: { bg: "var(--crm-info-bg)", c: "var(--crm-info)", b: "var(--crm-info-border)" },
    neg: { bg: "var(--crm-neg-bg)", c: "var(--crm-neg)", b: "var(--crm-neg-border)" },
    pos: { bg: "var(--crm-pos-bg)", c: "var(--crm-pos)", b: "var(--crm-pos-border)" },
    warn: { bg: "var(--crm-warn-bg)", c: "var(--crm-warn)", b: "var(--crm-warn-border)" },
    neut: { bg: "var(--crm-neut-bg)", c: "var(--crm-neut)", b: "var(--crm-neut-border)" },
    purple: { bg: "var(--crm-purple-bg)", c: "var(--crm-purple)", b: "var(--crm-purple-border)" },
  }
  const t = map[tone]
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        padding: "1px 7px",
        borderRadius: 4,
        background: t.bg,
        border: `1px solid ${t.b}`,
        fontSize: 11,
        fontWeight: 500,
        color: t.c,
      }}
    >
      {children}
    </span>
  )
}

// ─── Skeleton + Error ───────────────────────────────────────────

function DrawerSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div
        style={{
          padding: "22px 28px 18px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="h-14 w-14 shrink-0 rounded-full animate-pulse"
            style={{ background: "var(--crm-gray-200)" }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-5 w-3/4 rounded animate-pulse"
              style={{ background: "var(--crm-gray-200)" }}
            />
            <div
              className="h-3 w-1/2 rounded animate-pulse"
              style={{ background: "var(--crm-gray-100)" }}
            />
            <div
              className="h-3 w-1/3 rounded animate-pulse"
              style={{ background: "var(--crm-gray-100)" }}
            />
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              border: 0,
              background: "transparent",
              color: "var(--crm-gray-500)",
              cursor: "pointer",
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: 80,
              background: "var(--crm-gray-100)",
              borderRadius: 10,
            }}
          />
        ))}
      </div>
    </>
  )
}

function DrawerError({
  onClose,
  onRetry,
  message,
}: {
  onClose: () => void
  onRetry: () => void
  message?: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <button
        onClick={onClose}
        className="absolute top-4 right-4"
        style={{
          width: 30,
          height: 30,
          border: 0,
          background: "transparent",
          color: "var(--crm-gray-500)",
        }}
      >
        <X className="h-4 w-4" />
      </button>
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full mb-3"
        style={{ background: "var(--crm-neg-bg)", color: "var(--crm-neg)" }}
      >
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--crm-gray-900)",
          margin: 0,
        }}
      >
        Erro ao carregar deal
      </h3>
      <p
        style={{
          fontSize: 12,
          color: "var(--crm-gray-500)",
          marginTop: 8,
          maxWidth: 280,
        }}
      >
        {message ?? "Não foi possível carregar os detalhes desse deal."}
      </p>
      <button
        onClick={onRetry}
        className="cf-focusable mt-4 inline-flex items-center gap-1.5 rounded-[6px]"
        style={{
          height: 32,
          padding: "0 14px",
          background: "var(--crm-brand)",
          color: "var(--crm-brand-fg)",
          fontSize: 13,
          fontWeight: 500,
          border: 0,
          cursor: "pointer",
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Tentar novamente
      </button>
    </div>
  )
}
