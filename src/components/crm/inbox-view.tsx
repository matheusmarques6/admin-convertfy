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
import { AlertTriangle, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import { useRealtimeInbox } from "@/hooks/use-realtime-inbox"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import type { ThreadDetail, ThreadSummary } from "@/types/crm-inbox"
import { CrmEmptyState } from "./crm-empty-state"
import { ChatPanel } from "./inbox/chat-panel"
import {
  ConversationList,
  type ChannelTypeFilter,
  type InboxChannelOption,
  type StatusFilter,
} from "./inbox/conversation-list"

/**
 * Lança em não-2xx: com `r.json()` puro, um 500 virava `undefined` e a
 * lista mostrava "Inbox vazia" — falha de servidor era indistinguível
 * de zero conversas.
 */
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = (body as { error?: unknown })?.error
    throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
  }
  return body
}

const PAGE_SIZE = 50

export function InboxView({ initialThreadId }: { initialThreadId?: string | null }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open")
  const [mineOnly, setMineOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  // Separação por canal: só WhatsApp / só Instagram, e conta específica
  // quando a org tem mais de uma do mesmo tipo.
  const [channelType, setChannelType] = useState<ChannelTypeFilter>("all")
  const [channelId, setChannelId] = useState("")
  const debouncedSearch = useDebounce(search, 250)

  const pickChannelType = (t: ChannelTypeFilter) => {
    setChannelType(t)
    setChannelId("") // trocar de tipo zera a conta selecionada
  }

  const { data: channelsData } = useSWR<{
    channels: Array<InboxChannelOption & { is_active?: boolean }>
  }>("/api/crm/channels", fetcher, { revalidateOnFocus: false })
  const channels = useMemo(
    () => (channelsData?.channels ?? []).filter((c) => c.is_active !== false),
    [channelsData],
  )
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
  if (channelType !== "all") params.set("channel_type", channelType)
  if (channelId) params.set("channel_id", channelId)

  // Com realtime conectado o polling vira fallback lento; sem realtime
  // mantém a cadência antiga.
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  params.set("limit", String(pageSize))

  const {
    data: threadsData,
    error: threadsError,
    isLoading: threadsLoading,
    mutate: mutateThreads,
  } = useSWR<{
    org_id?: string
    threads: ThreadSummary[]
    total?: number
    has_more?: boolean
    total_unread?: number
    no_channel_of_type?: string
  }>(`/api/crm/inbox/threads?${params.toString()}`, fetcher, {
    refreshInterval: realtimeConnected ? 30000 : 10000,
    keepPreviousData: true,
  })

  const {
    data: detailData,
    error: detailError,
    mutate: mutateDetail,
  } = useSWR<ThreadDetail>(
    activeThreadId ? `/api/crm/inbox/threads/${activeThreadId}` : null,
    fetcher,
    { refreshInterval: realtimeConnected ? 30000 : 5000, keepPreviousData: true },
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
    // Sem o filtro por org, o canal acorda com evento de QUALQUER
    // organização (e entrega ao browser a atividade alheia).
    orgId: threadsData?.org_id ?? null,
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
  // Detalhe de OUTRA conversa (keepPreviousData) não pode ser exibido
  // como se fosse a atual.
  const detail = detailData?.thread?.id === activeThreadId ? detailData : undefined

  const threadsRef = useRef<ThreadSummary[]>([])
  useEffect(() => {
    threadsRef.current = threads
  }, [threads])

  // Marca como lida ao abrir (zera unread + read receipt na Meta).
  // Só quando há não-lidas: abrir conversa já lida não precisa de POST
  // nem de read receipt na Meta.
  useEffect(() => {
    if (!activeThreadId) return
    const known = threadsRef.current.find((t) => t.id === activeThreadId)
    if (known && (known.unread_count || 0) === 0) return
    fetch(`/api/crm/inbox/threads/${activeThreadId}/read`, { method: "POST" })
      .then(() => mutateThreads())
      .catch(() => {})
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

  // Não-lidas de toda a org (vem da API) — o badge tem de bater com o
  // do sino, e não mudar conforme o filtro da lista.
  const totalUnread = threadsData?.total_unread ?? 0
  const totalThreads = threadsData?.total ?? threads.length
  const hasMore = Boolean(threadsData?.has_more)

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    statusFilter !== "open" ||
    mineOnly ||
    Boolean(tagFilter) ||
    channelType !== "all" ||
    Boolean(channelId)

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
        channelType={channelType}
        onChannelTypeChange={pickChannelType}
        channelId={channelId}
        onChannelIdChange={setChannelId}
        channels={channels}
        loading={threadsLoading && !threadsData}
        error={threadsError instanceof Error ? threadsError.message : null}
        onRetry={() => mutateThreads()}
        total={totalThreads}
        hasMore={hasMore}
        onLoadMore={() => setPageSize((n) => n + PAGE_SIZE)}
        noChannelOfType={threadsData?.no_channel_of_type ?? null}
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
        ) : detailError ? (
          /* Sem isto, um deep-link para conversa inexistente ou de outra
             org deixava o skeleton girando para sempre. */
          <div className="flex flex-1 items-center justify-center p-6">
            <CrmEmptyState
              icon={<AlertTriangle className="h-5 w-5" />}
              title="Não foi possível abrir a conversa"
              description={
                detailError instanceof Error ? detailError.message : "Tente novamente em instantes."
              }
              action={
                <div className="flex items-center gap-2">
                  <button onClick={() => mutateDetail()} className="crm-button-secondary">
                    Tentar de novo
                  </button>
                  <button onClick={() => setActiveThreadId(null)} className="crm-button-ghost">
                    Voltar para a lista
                  </button>
                </div>
              }
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
