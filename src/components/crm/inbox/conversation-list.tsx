"use client"

/**
 * Lista de conversas do inbox — design v3 (ago/2026): segmented
 * Todas|WhatsApp|Instagram com contadores do servidor, sub-abas do
 * Instagram (Direct/Comentários), fila SLA, busca e filtros compactos.
 * Superfície nos tokens --ops-* (claro/escuro automáticos).
 */

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Filter, MessageSquare, Search } from "lucide-react"
import { formatWait, waitingInfo } from "@/lib/services/crm-inbox-sla"
import { cn } from "@/lib/utils"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import type { ThreadSummary } from "@/types/crm-inbox"
import {
  AvatarWithChannel,
  ChLabel,
  IcoBtn,
  INBOX_BRAND,
  fmtWaitShort,
  threadKind,
  TNUM,
} from "./inbox-theme"
import { ThreadTagChips, useTagRegistry } from "./thread-tags"

export type StatusFilter = "open" | "pending" | "resolved" | "all"
export type ChannelTypeFilter = "all" | "whatsapp" | "instagram"
export type KindFilter = "" | "direct" | "comment"

export interface InboxChannelOption {
  id: string
  type: string
  display_name: string
}

export interface ChannelCounts {
  whatsapp: number
  instagram: number
  instagram_direct: number
  instagram_comment: number
}

interface ConversationListProps {
  threads: ThreadSummary[]
  activeThreadId: string | null
  onSelect: (id: string) => void
  totalUnread: number
  statusFilter: StatusFilter
  onStatusFilterChange: (s: StatusFilter) => void
  mineOnly: boolean
  onMineOnlyChange: (v: boolean) => void
  search: string
  onSearchChange: (v: string) => void
  tagFilter: string
  onTagFilterChange: (v: string) => void
  hasActiveFilters: boolean
  orderMode: "recent" | "queue"
  onOrderModeChange: (m: "recent" | "queue") => void
  channelType: ChannelTypeFilter
  onChannelTypeChange: (t: ChannelTypeFilter) => void
  /** Sub-aba do Instagram ("" = tudo). */
  kind: KindFilter
  onKindChange: (k: KindFilter) => void
  channelCounts?: ChannelCounts | null
  /** Conta específica ("" = todas do tipo). Só aparece com 2+ contas do tipo. */
  channelId: string
  onChannelIdChange: (id: string) => void
  channels: InboxChannelOption[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  total?: number
  hasMore?: boolean
  onLoadMore?: () => void
  noChannelOfType?: string | null
  /** Largura no desktop (330 em containers largos, 296 nos estreitos). */
  width?: number
}

export function ConversationList({
  threads,
  activeThreadId,
  onSelect,
  totalUnread,
  statusFilter,
  onStatusFilterChange,
  mineOnly,
  onMineOnlyChange,
  search,
  onSearchChange,
  tagFilter,
  onTagFilterChange,
  hasActiveFilters,
  orderMode,
  onOrderModeChange,
  channelType,
  onChannelTypeChange,
  kind,
  onKindChange,
  channelCounts,
  channelId,
  onChannelIdChange,
  channels,
  loading = false,
  error = null,
  onRetry,
  total,
  hasMore = false,
  onLoadMore,
  noChannelOfType = null,
  width = 330,
}: ConversationListProps) {
  const tagRegistry = useTagRegistry()

  // Relógio da lista: sem isto os "há 14m" e os badges de SLA ficavam
  // congelados até a próxima revalidação do SWR.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const slaSummary = useMemo(() => {
    let waiting = 0
    let critical = 0
    for (const t of threads) {
      const w = waitingInfo(t, now)
      if (!w.waiting) continue
      waiting++
      if (w.level === "critical") critical++
    }
    return { waiting, critical }
  }, [threads, now])

  const accountsOfType =
    channelType === "all" ? [] : channels.filter((c) => c.type === channelType)

  const allCount = (channelCounts?.whatsapp ?? 0) + (channelCounts?.instagram ?? 0)

  const seg = (key: ChannelTypeFilter, label: string, n: number, icon?: React.ReactNode) => {
    const on = channelType === key
    return (
      <button
        key={key}
        onClick={() => onChannelTypeChange(key)}
        aria-pressed={on}
        className="flex h-[30px] min-w-0 flex-1 cursor-pointer items-center justify-center gap-[5px] overflow-hidden whitespace-nowrap rounded-[6px] border-0 px-1 text-[11px]"
        style={{
          fontWeight: on ? 600 : 450,
          background: on ? "var(--ops-card)" : "transparent",
          color: on ? "var(--ops-title)" : "var(--ops-sec)",
          boxShadow: on ? "0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px var(--ops-border)" : "none",
        }}
      >
        {icon}
        <span className="overflow-hidden text-ellipsis">{label}</span>
        <span className="shrink-0 text-[9.5px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
          {n}
        </span>
      </button>
    )
  }

  const subTabs: Array<[KindFilter, string, number]> | null =
    channelType === "instagram"
      ? [
          ["", "Tudo", channelCounts?.instagram ?? 0],
          ["direct", "Direct", channelCounts?.instagram_direct ?? 0],
          ["comment", "Comentários", channelCounts?.instagram_comment ?? 0],
        ]
      : null

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-r md:shrink-0",
        width >= 330 ? "md:w-[330px]" : "md:w-[296px]",
        activeThreadId && "hidden md:flex",
      )}
      style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)" }}
    >
      <div className="px-3.5 pt-4">
        {/* Título + status + fila */}
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[15.5px] font-[650] tracking-[-0.01em]" style={{ color: "var(--ops-title)" }}>
            Inbox
          </h1>
          {totalUnread > 0 && (
            <span
              className="rounded-full px-1.5 text-[9.5px] font-bold text-white"
              style={{ background: INBOX_BRAND, ...TNUM }}
              title="Não lidas em toda a organização"
            >
              {totalUnread}
            </span>
          )}
          <span className="ml-auto" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
            aria-label="Filtrar por status"
            className="h-[26px] rounded-[6px] border px-1.5 text-[11px] outline-none"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)", color: "var(--ops-sec)" }}
          >
            <option value="open">Abertas</option>
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidas</option>
            <option value="all">Todas</option>
          </select>
          <IcoBtn
            title="Ordenar como fila de atendimento (quem espera há mais tempo primeiro)"
            on={orderMode === "queue"}
            onClick={() => onOrderModeChange(orderMode === "queue" ? "recent" : "queue")}
            label="Fila"
          />
          <IcoBtn
            title="Apenas conversas atribuídas a mim"
            on={mineOnly}
            onClick={() => onMineOnlyChange(!mineOnly)}
          >
            <Filter className="h-3 w-3" />
          </IcoBtn>
        </div>

        {/* Segmented por canal */}
        <div
          className="mt-3 flex gap-0.5 rounded-[8px] p-0.5"
          role="group"
          aria-label="Filtrar por canal"
          style={{ background: "var(--ops-track, rgba(0,0,0,0.05))" }}
        >
          {seg("all", "Todas", allCount)}
          {seg("whatsapp", "WhatsApp", channelCounts?.whatsapp ?? 0, <WABadgeMini />)}
          {seg("instagram", "Instagram", channelCounts?.instagram ?? 0, <IGBadgeMini />)}
        </div>

        {/* Sub-abas do Instagram (Direct × Comentários) */}
        {subTabs && (
          <div className="mt-[9px] flex items-center gap-3.5 px-0.5" role="group" aria-label="Sub-filtro do Instagram">
            {subTabs.map(([k, l, n]) => {
              const on = kind === k
              return (
                <button
                  key={k || "tudo"}
                  onClick={() => onKindChange(k)}
                  aria-pressed={on}
                  className="inline-flex cursor-pointer items-center gap-[5px] border-0 bg-transparent pb-[5px] text-[11px]"
                  style={{
                    fontWeight: on ? 600 : 450,
                    color: on ? "var(--ops-title)" : "var(--ops-sec)",
                    boxShadow: on ? `inset 0 -2px 0 ${INBOX_BRAND}` : "none",
                  }}
                >
                  {l}
                  <span className="text-[9.5px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
                    {n}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Conta específica (2+ contas do mesmo tipo) */}
        {accountsOfType.length >= 2 && (
          <select
            className="mt-2 h-[26px] w-full rounded-[6px] border px-1.5 text-[11px] outline-none"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)", color: "var(--ops-sec)" }}
            value={channelId}
            onChange={(e) => onChannelIdChange(e.target.value)}
            aria-label="Filtrar por conta do canal"
          >
            <option value="">Todas as contas ({accountsOfType.length})</option>
            {accountsOfType.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
        )}

        {/* Busca */}
        <div className="relative mt-2.5">
          <Search
            className="absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2"
            style={{ color: "var(--ops-mut)" }}
          />
          <input
            placeholder="Buscar…"
            aria-label="Buscar conversas por contato"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="box-border h-[31px] w-full rounded-[7px] border bg-transparent px-2.5 pl-[30px] text-[12px] outline-none"
            style={{ borderColor: "var(--ops-border)", color: "var(--ops-title)" }}
          />
        </div>

        {/* Filtro por tag — só quando a org tem tags */}
        {tagRegistry.length > 0 && (
          <select
            className="mt-2 h-[26px] w-full rounded-[6px] border px-1.5 text-[11px] outline-none"
            style={{ borderColor: "var(--ops-border)", background: "var(--ops-card)", color: "var(--ops-sec)" }}
            aria-label="Filtrar conversas por tag"
            value={tagFilter}
            onChange={(e) => onTagFilterChange(e.target.value)}
          >
            <option value="">Todas as tags</option>
            {tagRegistry.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        {/* Resumo da fila */}
        <div className="flex min-h-[30px] items-center px-0.5 py-1">
          {slaSummary.waiting > 0 ? (
            <button
              onClick={() => onOrderModeChange("queue")}
              title="Ver primeiro quem espera há mais tempo"
              className="flex cursor-pointer items-center gap-[5px] border-0 bg-transparent p-0 text-[10.5px]"
              style={{ color: slaSummary.critical > 0 ? "var(--ops-neg)" : "var(--ops-warn)" }}
            >
              <span className="h-[5px] w-[5px] rounded-full bg-current" />
              {slaSummary.waiting} aguardando resposta
              {slaSummary.critical > 0 && ` · ${slaSummary.critical} há +1h`}
            </button>
          ) : (
            <span className="text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
              Tudo respondido
            </span>
          )}
          <span className="ml-auto text-[10px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
            {typeof total === "number" && total !== threads.length
              ? `${threads.length} de ${total}`
              : `${threads.length} conversas`}
          </span>
        </div>
      </div>

      {/* Linhas */}
      <div className="min-h-0 flex-1 overflow-y-auto border-t pb-safe" style={{ borderColor: "var(--ops-border)" }}>
        {error ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-[7px]"
              style={{ background: "var(--ops-warn-bg)", color: "var(--ops-neg)" }}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--ops-title)" }}>
              Não foi possível carregar as conversas
            </p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--ops-sec)" }}>
              {error}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-2.5 h-[30px] rounded-[7px] border px-3 text-[11.5px] font-medium"
                style={{ borderColor: "var(--ops-border)", color: "var(--ops-text)" }}
              >
                Tentar de novo
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-3 p-3" aria-label="Carregando conversas">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <SkeletonShimmer className="h-[38px] w-[38px] shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <SkeletonShimmer className="h-3 w-1/2 rounded-[4px]" />
                  <SkeletonShimmer className="h-2.5 w-4/5 rounded-[4px]" />
                </div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-[7px]"
              style={{ background: "var(--ops-hover, rgba(0,0,0,0.04))", color: "var(--ops-mut)" }}
            >
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--ops-title)" }}>
              {noChannelOfType
                ? `Nenhuma conta de ${noChannelOfType === "instagram" ? "Instagram" : "WhatsApp"} conectada`
                : hasActiveFilters
                  ? "Nenhuma conversa encontrada"
                  : "Inbox vazia"}
            </p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--ops-sec)" }}>
              {noChannelOfType
                ? "Conecte a conta em Comercial → Canais para receber as conversas aqui."
                : hasActiveFilters
                  ? "Ajuste os filtros para ver mais resultados."
                  : "Conversas do WhatsApp e do Instagram chegam aqui."}
            </p>
          </div>
        ) : (
          threads.map((t) => (
            <ThreadRow
              key={t.id}
              thread={t}
              active={activeThreadId === t.id}
              onSelect={() => onSelect(t.id)}
              now={now}
              tagRegistry={tagRegistry}
            />
          ))
        )}

        {hasMore && onLoadMore && (
          <button
            onClick={onLoadMore}
            className="w-full py-3 text-center text-[11px] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            style={{ color: "var(--ops-sec)" }}
          >
            Carregar mais conversas
            {typeof total === "number" && ` (${threads.length} de ${total})`}
          </button>
        )}
      </div>
    </aside>
  )
}

function ThreadRow({
  thread: t,
  active,
  onSelect,
  now,
  tagRegistry,
}: {
  thread: ThreadSummary
  active: boolean
  onSelect: () => void
  now: number
  tagRegistry: ReturnType<typeof useTagRegistry>
}) {
  const isCom = threadKind(t) === "comment"
  const name = t.contact_name || t.contact_external_id
  const w = waitingInfo(t, now)
  const waitMin = w.waiting ? w.minutes : 0

  return (
    <button
      onClick={onSelect}
      className="relative block w-full cursor-pointer border-b px-3.5 py-[11px] text-left transition-colors"
      style={{
        borderColor: "var(--ops-border)",
        background: active ? "var(--ops-hover, rgba(0,0,0,0.045))" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--ops-hover, rgba(0,0,0,0.02))"
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent"
      }}
    >
      {active && (
        <span
          className="absolute bottom-2.5 left-0 top-2.5 w-[2.5px] rounded-r-[2px]"
          style={{ background: INBOX_BRAND }}
        />
      )}
      <div className="flex gap-2.5">
        <AvatarWithChannel
          name={name}
          avatarUrl={t.contact_avatar_url}
          canal={t.channel?.type ?? "whatsapp"}
          size={38}
          badge={15}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[12.5px]"
              style={{ fontWeight: t.unread_count > 0 ? 640 : 500, color: "var(--ops-title)" }}
            >
              {name}
            </span>
            {waitMin >= 15 ? (
              <span
                className="shrink-0 text-[9.5px] font-[650]"
                title={`Aguardando resposta há ${formatWait(waitMin)}`}
                style={{ color: waitMin >= 60 ? "var(--ops-neg)" : "var(--ops-warn)", ...TNUM }}
              >
                {fmtWaitShort(waitMin)}
              </span>
            ) : (
              <span className="shrink-0 text-[10px]" style={{ color: "var(--ops-mut)", ...TNUM }}>
                {formatRelativeTime(t.last_message_at)}
              </span>
            )}
          </div>
          <div className="mt-[2.5px] flex items-center gap-[7px]">
            <span
              className="min-w-0 flex-1 truncate text-[11.5px]"
              style={{ color: t.unread_count > 0 ? "var(--ops-text)" : "var(--ops-sec)" }}
            >
              {isCom
                ? `“${t.last_message_preview || ""}”`
                : `${t.last_message_direction === "outbound" ? "Você: " : ""}${t.last_message_preview || "Sem mensagens"}`}
            </span>
            {t.unread_count > 0 && (
              <span
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[8px] px-1 text-[9.5px] font-bold text-white"
                style={{ background: INBOX_BRAND, ...TNUM }}
              >
                {t.unread_count}
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            {isCom ? (
              <span
                className="inline-flex min-w-0 items-center gap-1.5 truncate text-[10px]"
                style={{ color: "var(--ops-mut)" }}
              >
                <span
                  className="h-[11px] w-[11px] shrink-0 rounded-[3px] opacity-85"
                  style={{ background: "linear-gradient(45deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)" }}
                />
                comentário em post · {t.channel?.display_name}
              </span>
            ) : (
              <>
                <ChLabel thread={t} />
                {t.assignee?.name && (
                  <span className="truncate text-[10px]" style={{ color: "var(--ops-mut)" }}>
                    · {t.assignee.name.split(" ")[0]}
                  </span>
                )}
              </>
            )}
          </div>
          {(t.tags?.length ?? 0) > 0 && (
            <div className="mt-1">
              <ThreadTagChips tags={t.tags ?? []} registry={tagRegistry} max={2} size="sm" />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

/** Mini logos pro segmented (13px, mesmos SVGs do ChBadge). */
function WABadgeMini() {
  return (
    <span className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full" style={{ background: "#25D366" }}>
      <svg width={9} height={9} viewBox="0 0 24 24" fill="#fff">
        <path d="M17.6 6.32A7.85 7.85 0 0012.05 4a7.94 7.94 0 00-6.88 11.89L4 20l4.2-1.1a7.93 7.93 0 003.8.97h.01a7.95 7.95 0 005.6-13.55zm-5.55 12.2h-.01a6.6 6.6 0 01-3.36-.92l-.24-.14-2.49.65.67-2.43-.16-.25a6.59 6.59 0 1112.23-3.5 6.6 6.6 0 01-6.64 6.6z" />
      </svg>
    </span>
  )
}
function IGBadgeMini() {
  return (
    <span
      className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center"
      style={{ borderRadius: "30%", background: "linear-gradient(45deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)" }}
    >
      <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    </span>
  )
}

export function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}
