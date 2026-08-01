"use client"

/**
 * Lista de conversas do inbox (apresentacional) — busca, filtro de
 * status, "apenas meus" e badge de janela de 24h aberta (dot verde).
 */

import { Clock, Filter, MessageSquare, Search } from "lucide-react"
import { formatWait, waitingInfo } from "@/lib/services/crm-inbox-sla"
import { cn } from "@/lib/utils"
import type { ThreadSummary } from "@/types/crm-inbox"
import { ThreadTagChips, useTagRegistry } from "./thread-tags"

export type StatusFilter = "open" | "pending" | "resolved" | "all"

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
}: ConversationListProps) {
  const tagRegistry = useTagRegistry()
  return (
    <aside
      className={cn(
        "flex flex-col border-r w-full md:w-[320px] md:shrink-0",
        activeThreadId && "hidden md:flex",
      )}
      style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-0)" }}
    >
      <div className="border-b px-3 py-3" style={{ borderColor: "var(--crm-gray-200)" }}>
        <div className="flex items-center justify-between mb-2">
          <h2
            style={{
              fontSize: "var(--crm-text-md)",
              fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
              color: "var(--crm-gray-900)",
            }}
          >
            Inbox
            {totalUnread > 0 && (
              <span
                className="ml-2"
                style={{
                  fontSize: "var(--crm-text-xs)",
                  color: "var(--crm-brand-fg)",
                  background: "var(--crm-brand)",
                  padding: "2px 8px",
                  borderRadius: "var(--crm-radius-full)",
                  fontFamily: "var(--crm-font-mono)",
                }}
              >
                {totalUnread}
              </span>
            )}
          </h2>
        </div>

        <div className="relative mb-2">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
            style={{ color: "var(--crm-gray-400)" }}
          />
          <input
            type="text"
            className="crm-input w-full"
            style={{ paddingLeft: 30 }}
            placeholder="Buscar contato..."
            aria-label="Buscar conversas por contato"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Filtrar por status">
          {(["open", "pending", "resolved", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onStatusFilterChange(s)}
              aria-pressed={statusFilter === s}
              style={{
                fontSize: "var(--crm-text-xs)",
                fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
                padding: "4px 8px",
                borderRadius: "var(--crm-radius-sm)",
                background: statusFilter === s ? "var(--crm-gray-900)" : "var(--crm-gray-100)",
                color: statusFilter === s ? "var(--crm-gray-0)" : "var(--crm-gray-700)",
                cursor: "pointer",
                border: "none",
                textTransform: "capitalize",
              }}
            >
              {s === "open" ? "Abertos" : s === "pending" ? "Pendentes" : s === "resolved" ? "Resolvidos" : "Todos"}
            </button>
          ))}
          <button
            onClick={() => onMineOnlyChange(!mineOnly)}
            title="Apenas meus"
            aria-pressed={mineOnly}
            aria-label="Filtrar apenas conversas atribuidas a mim"
            style={{
              marginLeft: "auto",
              padding: 4,
              borderRadius: "var(--crm-radius-sm)",
              background: mineOnly ? "var(--crm-gray-900)" : "transparent",
              color: mineOnly ? "var(--crm-gray-0)" : "var(--crm-gray-500)",
              border: mineOnly ? "none" : "1px solid var(--crm-gray-200)",
              cursor: "pointer",
            }}
          >
            <Filter className="h-3 w-3" />
          </button>
        </div>

        {/* Recentes = ordem de chegada; Fila = quem espera resposta há
            mais tempo primeiro (SLA), pra ninguém esfriar esquecido. */}
        <div className="mt-2 flex items-center gap-1" role="group" aria-label="Ordenação">
          {([
            { mode: "recent" as const, label: "Recentes" },
            { mode: "queue" as const, label: "Fila" },
          ]).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => onOrderModeChange(mode)}
              aria-pressed={orderMode === mode}
              style={{
                fontSize: "var(--crm-text-xs)",
                fontWeight: "var(--crm-weight-medium)" as React.CSSProperties["fontWeight"],
                padding: "3px 8px",
                borderRadius: "var(--crm-radius-sm)",
                background: orderMode === mode ? "var(--crm-blue-50)" : "transparent",
                color: orderMode === mode ? "var(--crm-brand)" : "var(--crm-gray-500)",
                border: orderMode === mode ? "1px solid var(--crm-blue-100)" : "1px solid transparent",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {mode === "queue" && <Clock className="h-3 w-3" />}
              {label}
            </button>
          ))}
        </div>

        {/* Filtro por tag — só aparece quando a org tem tags */}
        {tagRegistry.length > 0 && (
          <select
            className="crm-input w-full"
            style={{ marginTop: 8, height: 28, fontSize: "var(--crm-text-xs)" }}
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
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-safe">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-[4px] mb-2"
              style={{ background: "var(--crm-gray-100)", color: "var(--crm-gray-400)" }}
            >
              <MessageSquare className="h-4 w-4" />
            </div>
            <p style={{ fontSize: "var(--crm-text-sm)", fontWeight: 530, color: "var(--crm-gray-700)" }}>
              {hasActiveFilters ? "Nenhuma conversa encontrada" : "Inbox vazia"}
            </p>
            <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", marginTop: 4 }}>
              {hasActiveFilters
                ? "Ajuste os filtros para ver mais resultados."
                : "Conversas do WhatsApp e do Instagram chegam aqui."}
            </p>
          </div>
        ) : (
          threads.map((t) => {
            const windowOpen =
              Boolean(t.is_window_open) &&
              Boolean(t.window_expires_at) &&
              new Date(t.window_expires_at as string).getTime() > Date.now()
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                className="w-full text-left"
                style={{
                  borderBottom: "1px solid var(--crm-gray-100)",
                  padding: "10px 12px",
                  background: activeThreadId === t.id ? "var(--crm-gray-100)" : "transparent",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="relative shrink-0">
                    <div
                      className="flex h-8 w-8 items-center justify-center text-xs font-medium"
                      style={{
                        background: "var(--crm-gray-200)",
                        color: "var(--crm-gray-700)",
                        borderRadius: "var(--crm-radius-full)",
                      }}
                    >
                      {(t.contact_name || t.contact_external_id).slice(0, 2).toUpperCase()}
                    </div>
                    {windowOpen && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full"
                        style={{ background: "#10B981", border: "2px solid var(--crm-gray-0)" }}
                        title="Janela de 24h aberta"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className="truncate"
                        style={{
                          fontSize: "var(--crm-text-sm)",
                          fontWeight: (t.unread_count > 0
                            ? "var(--crm-weight-medium)"
                            : "var(--crm-weight-regular)") as React.CSSProperties["fontWeight"],
                          color: "var(--crm-gray-900)",
                        }}
                      >
                        {t.contact_name || t.contact_external_id}
                      </span>
                      {t.unread_count > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            background: "var(--crm-brand)",
                            color: "var(--crm-brand-fg)",
                            borderRadius: "var(--crm-radius-full)",
                            padding: "1px 6px",
                            fontFamily: "var(--crm-font-mono)",
                          }}
                        >
                          {t.unread_count}
                        </span>
                      )}
                    </div>
                    <p
                      className="truncate"
                      style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", marginTop: 2 }}
                    >
                      {t.last_message_direction === "outbound" ? "Voce: " : ""}
                      {t.last_message_preview || "Sem mensagens"}
                    </p>
                    {(t.tags?.length ?? 0) > 0 && (
                      <div className="mt-1">
                        <ThreadTagChips tags={t.tags ?? []} registry={tagRegistry} max={2} size="sm" />
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span
                        className="flex min-w-0 items-center gap-1"
                        style={{ fontSize: 10, color: "var(--crm-gray-400)" }}
                      >
                        {/* Ponto do canal: com WhatsApp e Instagram na
                            mesma lista, saber a origem antes de abrir
                            muda o tom da resposta. */}
                        <span
                          aria-hidden
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background:
                              t.channel?.type === "instagram"
                                ? "#E1306C"
                                : t.channel?.type === "whatsapp"
                                  ? "#25D366"
                                  : "var(--crm-gray-400)",
                          }}
                        />
                        <span className="truncate">
                          {t.channel?.type === "instagram"
                            ? isCommentThread(t)
                              ? "Instagram · comentário"
                              : "Instagram · direct"
                            : t.channel?.display_name || "—"}
                          {t.channel?.type === "whatsapp"
                            ? t.channel?.provider === "evolution"
                              ? " · QR"
                              : " · Oficial"
                            : ""}
                          {t.assignee?.name ? ` · ${t.assignee.name.split(" ")[0]}` : ""}
                        </span>
                      </span>
                      <ThreadTimeCell thread={t} />
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

/**
 * Horário relativo + badge de espera. O badge só existe quando a bola
 * está com o time (última mensagem do contato, conversa não resolvida):
 * âmbar aos 15min, vermelho a 1h — lead de rede social esfria em minutos.
 */
function ThreadTimeCell({
  thread,
}: {
  thread: { status: string; last_message_at: string; last_message_direction: string | null }
}) {
  const w = waitingInfo(thread, Date.now())
  if (!w.waiting || w.level === "ok") {
    return (
      <span style={{ fontSize: 10, color: "var(--crm-gray-400)" }}>
        {formatRelativeTime(thread.last_message_at)}
      </span>
    )
  }
  const isCritical = w.level === "critical"
  return (
    <span
      title={`Aguardando resposta há ${formatWait(w.minutes)}`}
      style={{
        fontSize: 10,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "1px 6px",
        borderRadius: "var(--crm-radius-full)",
        background: isCritical ? "var(--crm-neg-bg)" : "var(--crm-warn-bg)",
        color: isCritical ? "var(--crm-neg)" : "var(--crm-warn)",
        border: `1px solid ${isCritical ? "var(--crm-neg-border)" : "var(--crm-warn-border)"}`,
      }}
    >
      <Clock style={{ width: 10, height: 10 }} />
      {formatWait(w.minutes)}
    </span>
  )
}

/**
 * Comentário de post vem com contact_external_id "comment:{media_id}"
 * (o webhook agrupa por publicação) — é o que distingue de um direct.
 */
function isCommentThread(t: { contact_external_id?: string | null }): boolean {
  return typeof t.contact_external_id === "string" && t.contact_external_id.startsWith("comment:")
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
