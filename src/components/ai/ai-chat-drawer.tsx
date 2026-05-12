"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  Sparkles,
  Send,
  Plus,
  Loader2,
  X,
  Square,
  History,
  Trash2,
  ChevronLeft,
} from "lucide-react"
import { useAiChatStore } from "./ai-chat-store"
import { AiChatMessage } from "./ai-chat-message"
import type { AiChatMessage as Message } from "@/types/ai"

interface QuickPrompt {
  emoji: string
  label: string
  prompt: string
}

const STORE_PROMPTS: QuickPrompt[] = [
  {
    emoji: "📊",
    label: "Relatório semanal desta loja",
    prompt:
      "Gere um relatório semanal da loja em contexto: receita, top flows, taxa de abertura, comparativo com a semana anterior e 3 ações sugeridas.",
  },
  {
    emoji: "✍️",
    label: "Copy de campanha",
    prompt:
      "Gere uma copy de email promocional para a loja em contexto. Inclua 3 opções de assunto (max 50 chars), preview text e body em HTML simples com CTA claro.",
  },
  {
    emoji: "📈",
    label: "Insights do mês desta loja",
    prompt:
      "Quais foram os principais insights de performance da loja em contexto nos últimos 30 dias? Cite números reais. O que melhorou, o que piorou e por que.",
  },
  {
    emoji: "🔄",
    label: "Próximas automações",
    prompt:
      "Sugira 3 automações novas que essa loja pode implementar, em ordem de prioridade, com justificativa baseada nos números atuais.",
  },
  {
    emoji: "📋",
    label: "Briefing de call",
    prompt:
      "Gere um briefing de 5 minutos pra uma call de acompanhamento desta loja: contexto rápido, sucessos, pontos de atenção e próximos passos.",
  },
]

const CLIENT_PROMPTS: QuickPrompt[] = [
  {
    emoji: "📋",
    label: "Resumo do cliente",
    prompt:
      "Faça um resumo executivo do cliente em contexto: lojas, MRR, status, health score. Aponte 2 oportunidades e 2 riscos.",
  },
  {
    emoji: "📞",
    label: "Briefing pra call",
    prompt:
      "Gere um briefing de 5 minutos pra call mensal do cliente em contexto. Tom direto, foco em resultados.",
  },
  {
    emoji: "📈",
    label: "Performance consolidada",
    prompt:
      "Performance consolidada das lojas deste cliente nos últimos 30 dias. Qual loja está bombando, qual precisa de atenção?",
  },
]

const GENERAL_PROMPTS: QuickPrompt[] = [
  {
    emoji: "💡",
    label: "Ideias de campanha",
    prompt:
      "Liste 5 ideias de campanha que faz sentido testar agora pra e-commerces, considerando sazonalidade brasileira atual.",
  },
  {
    emoji: "✍️",
    label: "Copy genérica de promoção",
    prompt:
      "Gere 3 templates de assunto + preview text pra campanhas promocionais que funcionam em qualquer nicho de e-commerce.",
  },
  {
    emoji: "🔧",
    label: "Best practices Omnisend",
    prompt:
      "Quais são as 5 best practices mais subestimadas no Omnisend que poucas lojas aplicam? Seja específico, com exemplos.",
  },
  {
    emoji: "📊",
    label: "Como interpretar métricas",
    prompt:
      "Quais são os benchmarks atuais de open rate, click rate e conversion rate pra campanhas de e-commerce no Brasil em 2026?",
  },
  {
    emoji: "🎯",
    label: "Sugestão de segmentação",
    prompt:
      "Liste 8 segmentos avançados que toda loja de e-commerce deveria ter no Omnisend, com a definição de cada um.",
  },
]

interface ConversationListItem {
  id: string
  title: string
  last_message_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function AiChatDrawer() {
  const {
    open,
    setOpen,
    context,
    activeConversationId,
    setActiveConversationId,
  } = useAiChatStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [loadingConv, setLoadingConv] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { data: convData, mutate: mutateConversations } = useSWR<{
    conversations?: ConversationListItem[]
  }>(open ? "/api/ai/conversations" : null, fetcher)
  const conversations = convData?.conversations ?? []

  const stopStreaming = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open])

  // Quando o user seleciona uma conversa, carrega as mensagens dela.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    setLoadingConv(true)
    fetch(`/api/ai/conversations/${activeConversationId}`)
      .then((r) => r.json())
      .then(
        (j: {
          messages?: Array<{
            id: string
            role: "user" | "assistant"
            content: string
            created_at: string
          }>
        }) => {
          const list = j.messages ?? []
          setMessages(
            list.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: new Date(m.created_at).getTime(),
            })),
          )
        },
      )
      .finally(() => setLoadingConv(false))
  }, [activeConversationId])

  const ensureConversation = async (
    firstUserMessage: string,
  ): Promise<string | null> => {
    if (activeConversationId) return activeConversationId
    // Cria conversa com title derivado do 1o input (max 60 chars)
    const title = firstUserMessage.slice(0, 60).trim() || "Nova conversa"
    const res = await fetch("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, context }),
    })
    if (!res.ok) return null
    const j = await res.json()
    const id = j.conversation?.id ?? j.data?.conversation?.id ?? null
    if (id) {
      setActiveConversationId(id)
      mutateConversations()
    }
    return id
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    }
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    }
    const nextMessages = [...messages, userMsg]
    setMessages([...nextMessages, assistantMsg])
    setInput("")
    setStreaming(true)

    const conversationId = await ensureConversation(text)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context,
          conversation_id: conversationId,
        }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        const errText = j.error ?? "falha no servidor"
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: `Erro: ${errText}` } : m,
          ),
        )
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue
          const payload = line.slice(6).trim()
          if (payload === "[DONE]") continue
          try {
            const j = JSON.parse(payload)
            if (j.text) {
              acc += j.text
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: acc } : m,
                ),
              )
            } else if (j.error) {
              acc += `\n\n_Erro: ${j.error}_`
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: acc } : m,
                ),
              )
            }
          } catch {
            // ignore
          }
        }
      }
      // Refresca lista de conversas (last_message_at mudou)
      mutateConversations()
    } catch (err) {
      const isAbort =
        (err as Error)?.name === "AbortError" ||
        String(err).includes("aborted")
      if (!isAbort) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content:
                    m.content +
                    `\n\n_Erro de rede: ${(err as Error)?.message ?? "desconhecido"}_`,
                }
              : m,
          ),
        )
      }
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const newConversation = () => {
    stopStreaming()
    setActiveConversationId(null)
    setMessages([])
    setInput("")
    setShowHistory(false)
  }

  const deleteConversation = async (id: string) => {
    if (!confirm("Apagar essa conversa permanentemente?")) return
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" })
    if (id === activeConversationId) {
      newConversation()
    }
    mutateConversations()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-[500px] sm:max-w-[500px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            {showHistory && (
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                title="Voltar"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">
                {showHistory ? "Histórico" : "Assistente IA"}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-white/55 truncate">
                Claude Sonnet ·{" "}
                {context.store_id
                  ? "Loja em foco"
                  : context.client_id
                    ? "Cliente em foco"
                    : "Convertfy"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!showHistory && (
              <>
                <button
                  type="button"
                  onClick={() => setShowHistory(true)}
                  title="Histórico de conversas"
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                >
                  <History className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={newConversation}
                  title="Nova conversa"
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* History view */}
        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-3">
            {conversations.length === 0 ? (
              <p className="text-[12px] text-slate-500 dark:text-white/55 text-center py-8">
                Nenhuma conversa salva ainda.
              </p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <div
                      className={
                        "group flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2 transition-colors " +
                        (c.id === activeConversationId
                          ? "bg-orange-50 dark:bg-orange-500/10 border-orange-300 dark:border-orange-500/40"
                          : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] hover:border-slate-300")
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveConversationId(c.id)
                          setShowHistory(false)
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate">
                          {c.title}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-white/55 mt-0.5">
                          {new Date(c.last_message_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConversation(c.id)}
                        title="Apagar"
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            >
              {loadingConv ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="text-center py-4">
                    <div className="mx-auto h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white mb-3">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                      Como posso ajudar?
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-white/55 mt-1 max-w-[280px] mx-auto leading-relaxed">
                      Sou treinado nos dados da Convertfy. Pode me pedir para
                      gerar copies, analisar métricas ou preparar briefings.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {(context.store_id
                      ? STORE_PROMPTS
                      : context.client_id
                        ? CLIENT_PROMPTS
                        : GENERAL_PROMPTS
                    ).map((qp) => (
                      <button
                        key={qp.label}
                        type="button"
                        onClick={() => sendMessage(qp.prompt)}
                        className="w-full text-left rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] px-3 py-2 transition-colors"
                      >
                        <p className="text-[12.5px] font-medium text-slate-800 dark:text-white/85">
                          <span className="mr-1.5">{qp.emoji}</span>
                          {qp.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-white/55 mt-0.5 line-clamp-2">
                          {qp.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <AiChatMessage key={m.id} message={m} />
                  ))}
                  {streaming && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-white/55 px-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Gerando resposta...
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/40 dark:bg-white/[0.02] px-3 py-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={streaming}
                  placeholder="Pergunte qualquer coisa..."
                  rows={1}
                  className="flex-1 resize-none max-h-[120px] rounded-[8px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-[#1A1D27] px-3 py-2 text-[13px] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-slate-400 dark:focus:border-white/30 disabled:opacity-50"
                />
                {streaming ? (
                  <button
                    type="button"
                    onClick={stopStreaming}
                    aria-label="Parar resposta"
                    title="Parar resposta"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-slate-700 hover:bg-slate-800 text-white"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    aria-label="Enviar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
