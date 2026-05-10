"use client"

import { useEffect, useRef, useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Sparkles, Send, RotateCcw, Loader2, X } from "lucide-react"
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

export function AiChatDrawer() {
  const { open, setOpen, context } = useAiChatStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

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

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          context,
        }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  content: `Erro: ${j.error ?? "falha no servidor"}`,
                }
              : m,
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
    } finally {
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
    setMessages([])
    setInput("")
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                Assistente IA
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-white/55">
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
            {messages.length > 0 && (
              <button
                type="button"
                onClick={newConversation}
                title="Nova conversa"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
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

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {messages.length === 0 ? (
            <div className="space-y-3">
              <div className="text-center py-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white mb-3">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  Como posso ajudar?
                </p>
                <p className="text-[11px] text-slate-500 dark:text-white/55 mt-1 max-w-[280px] mx-auto leading-relaxed">
                  Sou treinado nos dados da Convertfy. Pode me pedir para gerar
                  copies, analisar métricas ou preparar briefings.
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
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              aria-label="Enviar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
