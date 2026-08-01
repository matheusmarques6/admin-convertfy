"use client"

/**
 * Inbox unificado (WhatsApp + Instagram) — orquestrador.
 *
 * Composição: ConversationList (filtros/busca) + ChatPanel (mensagens,
 * janela 24h, mídia, templates, atribuição). Dados via SWR; realtime
 * via Supabase postgres_changes (use-realtime-inbox) com o polling SWR
 * relaxado pra 30s como fallback quando conectado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { sortThreadsAsQueue } from "@/lib/services/crm-inbox-sla"
import useSWR from "swr"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import { useRealtimeInbox } from "@/hooks/use-realtime-inbox"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import type { ThreadDetail, ThreadSummary } from "@/types/crm-inbox"
import { CrmEmptyState } from "./crm-empty-state"
import { ChatPanel } from "./inbox/chat-panel"
import { ConversationList, type StatusFilter } from "./inbox/conversation-list"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function InboxView({ initialThreadId }: { initialThreadId?: string | null }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")
  const [mineOnly, setMineOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const debouncedSearch = useDebounce(search, 250)
  // initialThreadId = deep-link ?thread=<id> vindo das notificações do
  // sino; o SWR de detail busca por id direto, então funciona mesmo se
  // a thread não estiver na lista filtrada atual.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId ?? null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  const params = new URLSearchParams()
  params.set("status", statusFilter)
  if (mineOnly) params.set("mine", "1")
  if (debouncedSearch) params.set("search", debouncedSearch)
  if (tagFilter) params.set("tag", tagFilter)

  // Com realtime conectado o polling vira fallback lento; sem realtime
  // mantém a cadência antiga.
  const { data: threadsData, mutate: mutateThreads } = useSWR<{ threads: ThreadSummary[] }>(
    `/api/crm/inbox/threads?${params.toString()}`,
    fetcher,
    { refreshInterval: realtimeConnected ? 30000 : 10000 },
  )

  const { data: detailData, mutate: mutateDetail } = useSWR<ThreadDetail>(
    activeThreadId ? `/api/crm/inbox/threads/${activeThreadId}` : null,
    fetcher,
    { refreshInterval: realtimeConnected ? 30000 : 5000 },
  )

  const onThreadsUpdate = useCallback(() => {
    mutateThreads()
  }, [mutateThreads])
  const onDetailUpdate = useCallback(() => {
    mutateDetail()
  }, [mutateDetail])

  const { realtimeConnected: rtConnected } = useRealtimeInbox({
    onThreadsUpdate,
    onDetailUpdate,
    activeThreadId,
  })

  useEffect(() => setRealtimeConnected(rtConnected), [rtConnected])

  // "recent" preserva o comportamento de sempre; "queue" ordena como
  // fila de atendimento — quem espera resposta ha mais tempo primeiro.
  const [orderMode, setOrderMode] = useState<"recent" | "queue">("recent")

  const threads = useMemo(() => {
    const list = threadsData?.threads || []
    if (orderMode === "queue") return sortThreadsAsQueue(list, Date.now())
    return list
  }, [threadsData, orderMode])
  const detail = detailData

  // Marca como lida ao abrir (zera unread + read receipt na Meta)
  useEffect(() => {
    if (activeThreadId) {
      fetch(`/api/crm/inbox/threads/${activeThreadId}/read`, { method: "POST" })
        .then(() => mutateThreads())
        .catch(() => {})
    }
  }, [activeThreadId, mutateThreads])

  // Mensagem inbound que chega com a conversa JÁ aberta não passa pelo
  // effect acima (activeThreadId não muda) e deixaria unread_count e a
  // notificação do sino pendurados — re-marca como lida uma vez por
  // mensagem (dedup por id via ref).
  const lastReadInboundRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activeThreadId || !detailData?.messages?.length) return
    const last = detailData.messages[detailData.messages.length - 1]
    if (last.direction !== "inbound") return
    if (lastReadInboundRef.current === last.id) return
    lastReadInboundRef.current = last.id
    fetch(`/api/crm/inbox/threads/${activeThreadId}/read`, { method: "POST" })
      .then(() => mutateThreads())
      .catch(() => {})
  }, [activeThreadId, detailData, mutateThreads])

  const totalUnread = useMemo(
    () => threads.reduce((sum, t) => sum + (t.unread_count || 0), 0),
    [threads],
  )

  const hasActiveFilters =
    Boolean(debouncedSearch) || statusFilter !== "open" || mineOnly || Boolean(tagFilter)

  return (
    <div
      className="flex h-full"
      style={{ background: "var(--crm-gray-50)", fontFamily: "var(--crm-font-sans)" }}
    >
      <ConversationList
        threads={threads}
        orderMode={orderMode}
        onOrderModeChange={setOrderMode}
        activeThreadId={activeThreadId}
        onSelect={setActiveThreadId}
        totalUnread={totalUnread}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        mineOnly={mineOnly}
        onMineOnlyChange={setMineOnly}
        search={search}
        onSearchChange={setSearch}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Painel da conversa — em mobile só aparece quando há thread ativa.
          min-h-0 é essencial: sem ele o container de mensagens (flex-1
          overflow-auto) não recebe altura limitada e o composer some/rola. */}
      <main className={cn("min-h-0 min-w-0 flex-1 flex-col", activeThreadId ? "flex" : "hidden md:flex")}>
        {!activeThreadId ? (
          <div className="flex flex-1 items-center justify-center">
            <CrmEmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="Selecione uma conversa"
              description="Clique em qualquer thread a esquerda para abrir."
            />
          </div>
        ) : !detail ? (
          <div className="flex flex-1 flex-col gap-3 p-6" aria-label="Carregando conversa">
            <SkeletonShimmer className="h-8 w-48 rounded-[4px]" />
            <SkeletonShimmer className="h-3 w-32 rounded-[4px]" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonShimmer
                  key={i}
                  className="h-12 rounded-[6px]"
                  style={{ width: i % 2 === 0 ? "70%" : "55%", marginLeft: i % 2 === 0 ? 0 : "auto" }}
                />
              ))}
            </div>
          </div>
        ) : (
          <ChatPanel
            detail={detail}
            onBack={() => setActiveThreadId(null)}
            onRefresh={mutateDetail}
            onThreadsRefresh={mutateThreads}
          />
        )}
      </main>
    </div>
  )
}
