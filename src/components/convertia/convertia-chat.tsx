"use client"

/**
 * ConvertIA — assistente interno (design Claude Design ai-assistant.jsx
 * v3 "nativo": tipografia primeiro, quase sem caixas, composer-herói).
 *
 * Tudo real: conversas em ai_chat_conversations, respostas via
 * /api/ai/convertia/chat (OpenRouter + tool-calling streaming),
 * conectores por loja (credenciais reais), skills do banco e
 * servidores MCP externos. O menu de conectores mostra o estado REAL
 * da loja selecionada — sem credencial, o conector aparece desligado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowUp,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Filter,
  Briefcase,
  PanelLeft,
  Plus,
  RotateCcw,
  Sparkles,
  ThumbsUp,
  Trash2,
  Activity,
  Workflow,
} from "lucide-react"
import {
  CONVERTIA_DEFAULT_MODEL,
  CONVERTIA_MODELS,
  resolveConvertiaModel,
} from "@/lib/ai/convertia-models"
import { ConvertiaManageDialogs, type ManageKind } from "./convertia-manage"

// ── Vocabulário do design ───────────────────────────────────────────

export const AI_CONN: Record<string, { n: string; c: string; g: string }> = {
  shopify: { n: "Shopify", c: "#96BF48", g: "S" },
  omnisend: { n: "Omnisend", c: "#5C6AC4", g: "O" },
  klaviyo: { n: "Klaviyo", c: "#111827", g: "K" },
  crm: { n: "CRM Convertfy", c: "#4E62D8", g: "C" },
  metricas: { n: "Métricas", c: "#0E7490", g: "M" },
}
const MCP_DOT = { c: "#7C3AED", g: "X" }
const BRAND = "#4E62D8"

const SUGESTOES: Record<Ws, Array<[React.ElementType, string, string]>> = {
  operacional: [
    [BarChart3, "Relatório de performance", "Como foi a performance de email das lojas nos últimos 30 dias? Destaque quedas e o que vale escalar."],
    [Activity, "Diagnóstico de queda", "Alguma loja teve queda de open rate ou receita recente? Investigue o porquê."],
    [Sparkles, "Ideias de campanha", "Sugira 3 ideias de campanha de email para este mês com base no que performou melhor."],
    [Workflow, "Auditoria de fluxos", "Audite as automações (flows) ativas: o que está com performance fraca e o que falta?"],
  ],
  comercial: [
    [Calendar, "Briefing de reunião", "Prepara um briefing para minha próxima reunião comercial com os dados do negócio."],
    [Briefcase, "Pipeline parado", "Quais negócios estão parados há mais de 7 dias no pipeline? O que fazer com cada um?"],
    [FileText, "Rascunho de proposta", "Rascunhe uma proposta no padrão Convertfy para um lead de e-commerce."],
    [Filter, "Análise de perdas", "Analise os negócios perdidos recentes: motivos e padrões."],
  ],
}

type Ws = "operacional" | "comercial"

// ── Tipos ───────────────────────────────────────────────────────────

interface BootstrapStore {
  id: string
  name: string
  connectors: { shopify: boolean; omnisend: boolean; klaviyo: boolean }
}
interface BootstrapSkill {
  id: string
  name: string
  description: string | null
  icon: string | null
  workspace: string
  is_active: boolean
}
interface BootstrapMcp {
  id: string
  name: string
  store_id: string | null
  is_active: boolean
  allow_write: boolean
  tool_count: number | null
  last_status: string | null
}
interface Conversation {
  id: string
  title: string
  context: Record<string, unknown> | null
  last_message_at: string | null
  created_at: string
}
interface Bootstrap {
  user_name: string | null
  conversations: Conversation[]
  stores: BootstrapStore[]
  skills: BootstrapSkill[]
  mcp_servers: BootstrapMcp[]
  schema_missing: string[]
}

export interface Source {
  connector: string
  connector_name: string
  tool: string
  label: string
  summary: string | null
  write: boolean
}
interface UiMessage {
  id: string
  role: "user" | "assistant"
  content: string
  sources: Source[]
  streaming?: boolean
  pendingTools?: number
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Erro ${res.status}`)
  return body
}

// ── Átomos ──────────────────────────────────────────────────────────

export function ConnDot({
  k,
  size = 15,
  title,
}: {
  k: string
  size?: number
  title?: string
}) {
  const c = k.startsWith("mcp:") ? MCP_DOT : (AI_CONN[k] ?? MCP_DOT)
  return (
    <span
      title={title ?? (k.startsWith("mcp:") ? "MCP externo" : AI_CONN[k]?.n)}
      className="inline-flex shrink-0 items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: c.c,
        fontSize: size * 0.56,
      }}
    >
      {c.g}
    </span>
  )
}

function IaMark({ s = 20 }: { s?: number }) {
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center bg-[#16181D] text-white dark:bg-[#EDEEF2] dark:text-[#16181D]"
      style={{ width: s, height: s, borderRadius: s * 0.3 }}
    >
      <Sparkles style={{ width: Math.round(s * 0.58), height: Math.round(s * 0.58) }} />
    </span>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className="relative shrink-0 rounded-[9px] transition-colors"
      style={{ width: 30, height: 17, background: on ? BRAND : "var(--ops-track, #D3D7DF)" }}
    >
      <span
        className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white shadow transition-all"
        style={{ left: on ? 15 : 2 }}
      />
    </span>
  )
}

const HAIR = "var(--ops-border)"

function greeting(name: string | null): string {
  const h = new Date().getHours()
  const p = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
  const first = name?.split(" ")[0]
  return first ? `${p}, ${first}` : p
}

function groupConversations(convs: Conversation[]): Array<[string, Conversation[]]> {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  const weekAgo = Date.now() - 7 * 86_400_000
  const groups = new Map<string, Conversation[]>()
  for (const c of convs) {
    const d = new Date(c.last_message_at ?? c.created_at)
    const key =
      d.toDateString() === today
        ? "Hoje"
        : d.toDateString() === yesterday
          ? "Ontem"
          : d.getTime() > weekAgo
            ? "7 dias"
            : "Antigas"
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  return ["Hoje", "Ontem", "7 dias", "Antigas"]
    .filter((k) => groups.has(k))
    .map((k) => [k, groups.get(k)!])
}

// ── Componente principal ────────────────────────────────────────────

export function ConvertiaChat({ ws }: { ws: Ws }) {
  const { data: boot, mutate: mutateBoot } = useSWR<Bootstrap>(
    `/api/ai/convertia/bootstrap?workspace=${ws}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const [convId, setConvId] = useState<string | null>(null)
  const [convTitle, setConvTitle] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [railOpen, setRailOpen] = useState(true)
  const [input, setInput] = useState("")
  const [focus, setFocus] = useState(false)
  const [menu, setMenu] = useState<"model" | "conns" | "skills" | "store" | null>(null)
  const [model, setModel] = useState(CONVERTIA_DEFAULT_MODEL)
  const [storeId, setStoreId] = useState<string | null | undefined>(undefined) // undefined = ainda não inicializado
  const [connOn, setConnOn] = useState<Record<string, boolean>>({})
  const [skillOn, setSkillOn] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)
  const [manage, setManage] = useState<ManageKind | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Rail fechada por padrão em tela estreita (o toggle continua no header)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setRailOpen(false)
  }, [])

  // Retorno do fluxo OAuth de MCP (?mcp_connected / ?mcp_error)
  const [oauthNotice, setOauthNotice] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("mcp_connected")
    const errorMsg = params.get("mcp_error")
    if (connected) {
      const tools = params.get("mcp_tools")
      setOauthNotice({
        ok: true,
        text: `${connected} conectado via OAuth${tools ? ` — ${tools} tools disponíveis` : ""}. Ligue-o no menu Conectores · MCP.`,
      })
    } else if (errorMsg) {
      setOauthNotice({ ok: false, text: errorMsg })
    }
    if (connected || errorMsg) {
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  const stores = useMemo(() => boot?.stores ?? [], [boot])
  const skills = useMemo(
    () => (boot?.skills ?? []).filter((s) => s.is_active),
    [boot],
  )
  const store = stores.find((s) => s.id === storeId) ?? null

  // primeira loja como default (design abre com uma loja no chip)
  useEffect(() => {
    if (storeId === undefined && stores.length > 0) setStoreId(stores[0].id)
    if (storeId === undefined && boot && stores.length === 0) setStoreId(null)
  }, [stores, storeId, boot])

  // Conectores possíveis nesta conversa (ordem do design por workspace)
  const connectorEntries = useMemo(() => {
    const builtin: Array<{ key: string; name: string; sub: string; available: boolean }> =
      ws === "comercial"
        ? [
            { key: "crm", name: AI_CONN.crm.n, sub: "interno", available: true },
            {
              key: "shopify",
              name: AI_CONN.shopify.n,
              sub: store ? (store.connectors.shopify ? "loja conectada" : "loja sem credencial") : "selecione uma loja",
              available: Boolean(store?.connectors.shopify),
            },
            { key: "metricas", name: AI_CONN.metricas.n, sub: "interno", available: true },
          ]
        : [
            {
              key: "shopify",
              name: AI_CONN.shopify.n,
              sub: store ? (store.connectors.shopify ? "loja conectada" : "loja sem credencial") : "selecione uma loja",
              available: Boolean(store?.connectors.shopify),
            },
            {
              key: "omnisend",
              name: AI_CONN.omnisend.n,
              sub: store ? (store.connectors.omnisend ? "loja conectada" : "loja sem credencial") : "selecione uma loja",
              available: Boolean(store?.connectors.omnisend),
            },
            {
              key: "klaviyo",
              name: AI_CONN.klaviyo.n,
              sub: store ? (store.connectors.klaviyo ? "loja conectada" : "loja sem credencial") : "selecione uma loja",
              available: Boolean(store?.connectors.klaviyo),
            },
            { key: "metricas", name: AI_CONN.metricas.n, sub: "interno", available: true },
          ]
    const mcps = (boot?.mcp_servers ?? [])
      .filter((m) => m.is_active && (m.store_id === null || m.store_id === storeId))
      .map((m) => ({
        key: `mcp:${m.id}`,
        name: m.name,
        sub: m.store_id ? "MCP da loja" : "MCP da organização",
        available: m.last_status === "ok" || (m.tool_count ?? 0) > 0,
      }))
    return [...builtin, ...mcps]
  }, [ws, store, boot, storeId])

  // Default: TUDO que está disponível nasce ligado. A disponibilidade
  // chega em ondas (bootstrap → loja selecionada), então um conector
  // que FICOU disponível liga sozinho — exceto se o usuário já mexeu
  // nele nesta sessão (escolha manual é soberana). Sem o touchedRef,
  // a primeira renderização (loja ainda não carregada) gravava false e
  // os conectores da loja nunca religavam — só "Métricas" ficava ativa.
  const touchedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    setConnOn((prev) => {
      const next = { ...prev }
      for (const c of connectorEntries) {
        if (!c.available) next[c.key] = false
        else if (!touchedRef.current.has(c.key)) next[c.key] = true
      }
      return next
    })
  }, [connectorEntries])

  useEffect(() => {
    setSkillOn((prev) => {
      const next = { ...prev }
      for (const s of skills) if (!(s.id in next)) next[s.id] = true
      return next
    })
  }, [skills])

  const activeConns = connectorEntries.filter((c) => connOn[c.key] && c.available)
  const nSkills = skills.filter((s) => skillOn[s.id]).length
  const mSel = resolveConvertiaModel(model)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }, [])

  // ── Abrir conversa existente ─────────────────────────────────────
  const openConversation = async (c: Conversation) => {
    abortRef.current?.abort()
    setConvId(c.id)
    setConvTitle(c.title)
    setMessages([])
    const ctx = c.context ?? {}
    if (typeof ctx.model === "string") setModel(ctx.model)
    if (typeof ctx.store_id === "string") setStoreId(ctx.store_id)
    try {
      const body = await fetcher(`/api/ai/conversations/${c.id}`)
      const msgs = ((body as { messages?: Array<{ id: string; role: string; content: string; meta?: { sources?: Source[] } }> }).messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          sources: m.meta?.sources ?? [],
        }))
      setMessages(msgs)
      scrollToBottom()
    } catch {
      setMessages([])
    }
  }

  const novaConversa = () => {
    abortRef.current?.abort()
    setConvId(null)
    setConvTitle(null)
    setMessages([])
    setInput("")
  }

  const deleteConversation = async (c: Conversation) => {
    if (!window.confirm(`Excluir a conversa "${c.title}"?`)) return
    await fetch(`/api/ai/conversations/${c.id}`, { method: "DELETE" }).catch(() => {})
    if (c.id === convId) novaConversa()
    void mutateBoot()
  }

  // ── Envio (streaming SSE) ────────────────────────────────────────
  const send = async (text?: string) => {
    const message = (text ?? input).trim()
    if (!message || sending) return
    setInput("")
    if (inputRef.current) inputRef.current.style.height = "auto"
    setSending(true)
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: message,
      sources: [],
    }
    const draft: UiMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      sources: [],
      streaming: true,
      pendingTools: 0,
    }
    setMessages((m) => [...m, userMsg, draft])
    scrollToBottom()

    const controller = new AbortController()
    abortRef.current = controller
    const patchDraft = (fn: (d: UiMessage) => UiMessage) =>
      setMessages((m) => m.map((x) => (x.id === draft.id ? fn(x) : x)))

    try {
      const res = await fetch("/api/ai/convertia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: convId,
          message,
          model,
          workspace: ws,
          store_id: storeId ?? null,
          connectors: activeConns.map((c) => c.key),
          skills: skills.filter((s) => skillOn[s.id]).map((s) => s.id),
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const b = await res.json().catch(() => ({}))
        throw new Error((b as { error?: string })?.error || `Erro ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith("data:")) continue
          const payload = t.slice(5).trim()
          if (!payload || payload === "[DONE]") continue
          let ev: Record<string, unknown>
          try {
            ev = JSON.parse(payload) as Record<string, unknown>
          } catch {
            continue
          }
          if (ev.type === "meta") {
            if (!convId && typeof ev.conversation_id === "string") {
              setConvId(ev.conversation_id)
              setConvTitle((ev.title as string) ?? message.slice(0, 64))
            }
          } else if (ev.type === "delta") {
            patchDraft((d) => ({ ...d, content: d.content + String(ev.text ?? "") }))
            scrollToBottom()
          } else if (ev.type === "tool") {
            if (ev.status === "start") {
              patchDraft((d) => ({
                ...d,
                pendingTools: (d.pendingTools ?? 0) + 1,
                sources: [
                  ...d.sources,
                  {
                    connector: String(ev.connector ?? ""),
                    connector_name: String(ev.connector_name ?? ""),
                    tool: String(ev.name ?? ""),
                    label: String(ev.label ?? ev.name ?? ""),
                    summary: null,
                    write: ev.write === true,
                  },
                ],
              }))
            } else {
              patchDraft((d) => ({
                ...d,
                pendingTools: Math.max(0, (d.pendingTools ?? 1) - 1),
                sources: d.sources.map((s, i) =>
                  i === d.sources.length - 1 && s.summary == null
                    ? { ...s, summary: (ev.summary as string) ?? "ok" }
                    : s,
                ),
              }))
            }
            scrollToBottom()
          } else if (ev.type === "done") {
            patchDraft((d) => ({
              ...d,
              streaming: false,
              sources: Array.isArray(ev.sources) ? (ev.sources as Source[]) : d.sources,
            }))
          } else if (ev.type === "error") {
            patchDraft((d) => ({
              ...d,
              streaming: false,
              content: d.content || `⚠️ ${String(ev.message ?? "Erro inesperado")}`,
            }))
          }
        }
      }
      patchDraft((d) => ({ ...d, streaming: false }))
      void mutateBoot()
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        patchDraft((d) => ({
          ...d,
          streaming: false,
          content: d.content || `⚠️ ${err instanceof Error ? err.message : "Falha no envio"}`,
        }))
      }
    } finally {
      setSending(false)
      scrollToBottom()
    }
  }

  const refazer = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")
    if (lastUser) void send(lastUser.content)
  }

  const view = messages.length > 0 ? "conversa" : "novo"

  // ── menu flutuante (padrão do design) ───────────────────────────
  const menuCard = (children: React.ReactNode, right?: boolean) => (
    <>
      <div onClick={() => setMenu(null)} className="fixed inset-0 z-[60]" />
      <div
        className="absolute z-[70] w-[264px] overflow-y-auto rounded-[11px] border p-[5px] shadow-xl"
        style={{
          [view === "novo" ? "top" : "bottom"]: "calc(100% + 6px)",
          [right ? "right" : "left"]: 0,
          maxHeight: "min(340px, 46vh)",
          background: "var(--ops-card)",
          borderColor: HAIR,
        }}
      >
        {children}
      </div>
    </>
  )

  const menuHeader = (t: string) => (
    <div className="px-2.5 pb-[5px] pt-[7px] text-[10px] font-[650] uppercase tracking-[0.06em]" style={{ color: "var(--ops-mut)" }}>
      {t}
    </div>
  )

  const menuRow = (props: {
    key: string
    dot: React.ReactNode
    name: string
    sub: string
    on: boolean
    disabled?: boolean
    onClick: () => void
  }) => (
    <button
      key={props.key}
      onClick={props.onClick}
      disabled={props.disabled}
      className="flex w-full items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] text-left hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/[0.04]"
    >
      {props.dot}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium" style={{ color: props.on ? "var(--ops-title)" : "var(--ops-sec)" }}>
          {props.name}
        </span>
        <span className="mt-px block truncate text-[10px]" style={{ color: "var(--ops-mut)" }}>
          {props.sub}
        </span>
      </span>
      <Toggle on={props.on} />
    </button>
  )

  // ── Composer (herói e rodapé — mesmo componente) ────────────────
  const composer = (autoFocus: boolean) => (
    <div className="mx-auto w-full max-w-[680px]">
      <div
        className="relative rounded-[16px] border px-3.5 pb-[11px] pt-[13px] transition-shadow"
        style={{
          background: "var(--ops-card)",
          borderColor: focus ? "#8B9BE8" : HAIR,
          boxShadow: focus
            ? "0 0 0 3px rgba(78,98,216,0.10)"
            : "0 2px 12px rgba(17,24,39,0.06)",
        }}
      >
        <textarea
          ref={inputRef}
          autoFocus={autoFocus}
          rows={1}
          value={input}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => {
            setInput(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Como posso ajudar?"
          className="w-full resize-none border-0 bg-transparent px-0.5 pb-3.5 pt-px text-[14.5px] outline-none"
          style={{ color: "var(--ops-title)" }}
        />
        <div className="flex items-center gap-1.5">
          {/* Loja */}
          <div className="relative min-w-0 shrink">
            <button
              onClick={() => setMenu(menu === "store" ? null : "store")}
              className="inline-flex h-[27px] min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[8px] border px-2.5 text-[11px] font-medium"
              style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
            >
              <ConnDot k={ws === "comercial" ? "crm" : "shopify"} size={13} />
              <span className="truncate">{store?.name ?? "Visão geral"}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>
            {menu === "store" &&
              menuCard(
                <>
                  {menuHeader("Loja da conversa")}
                  <button
                    onClick={() => {
                      setStoreId(null)
                      setMenu(null)
                    }}
                    className="flex w-full items-center gap-2 rounded-[7px] px-[9px] py-[7px] text-left text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    style={{ color: storeId === null ? "var(--ops-title)" : "var(--ops-sec)" }}
                  >
                    <ConnDot k="metricas" size={15} /> Visão geral (todas as lojas)
                    {storeId === null && <Check className="ml-auto h-3 w-3" style={{ color: BRAND }} />}
                  </button>
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setStoreId(s.id)
                        setMenu(null)
                      }}
                      className="flex w-full items-center gap-2 rounded-[7px] px-[9px] py-[7px] text-left text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      style={{ color: s.id === storeId ? "var(--ops-title)" : "var(--ops-sec)" }}
                    >
                      <ConnDot k="shopify" size={15} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.id === storeId && <Check className="h-3 w-3 shrink-0" style={{ color: BRAND }} />}
                    </button>
                  ))}
                </>,
              )}
          </div>
          {/* Conectores · MCP */}
          <div className="relative">
            <button
              title="Conectores ativos nesta conversa"
              onClick={() => setMenu(menu === "conns" ? null : "conns")}
              className="inline-flex h-[27px] items-center gap-1.5 rounded-[8px] border px-2.5 text-[11px] font-medium"
              style={{
                borderColor: menu === "conns" ? "#8B9BE8" : HAIR,
                background: menu === "conns" ? "rgba(78,98,216,0.06)" : "transparent",
                color: "var(--ops-sec)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v6a6 6 0 0012 0V3M6 3h12M9 21v-4M15 21v-4M9 17h6" />
              </svg>
              {activeConns.length}/{connectorEntries.length}
            </button>
            {menu === "conns" &&
              menuCard(
                <>
                  {menuHeader("Conectores · MCP")}
                  {connectorEntries.map((c) =>
                    menuRow({
                      key: c.key,
                      dot: <ConnDot k={c.key} size={17} title={c.name} />,
                      name: c.name,
                      sub: c.sub,
                      on: Boolean(connOn[c.key] && c.available),
                      disabled: !c.available,
                      onClick: () => {
                        touchedRef.current.add(c.key)
                        setConnOn((s) => ({ ...s, [c.key]: !s[c.key] }))
                      },
                    }),
                  )}
                  <div className="mx-[5px] mt-1 flex items-center justify-between border-t px-[5px] pb-[3px] pt-[7px]" style={{ borderColor: HAIR }}>
                    <span className="text-[10px]" style={{ color: "var(--ops-mut)" }}>
                      valem só para esta conversa
                    </span>
                    <button onClick={() => { setMenu(null); setManage("mcp") }} className="text-[10.5px] font-medium" style={{ color: BRAND }}>
                      gerenciar conexões
                    </button>
                  </div>
                </>,
              )}
          </div>
          {/* Skills */}
          <div className="relative">
            <button
              title="Skills ativas da ConvertIA"
              onClick={() => setMenu(menu === "skills" ? null : "skills")}
              className="inline-flex h-[27px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-2.5 text-[11px] font-medium"
              style={{
                borderColor: menu === "skills" ? "#8B9BE8" : HAIR,
                background: menu === "skills" ? "rgba(78,98,216,0.06)" : "transparent",
                color: "var(--ops-sec)",
              }}
            >
              <Sparkles className="h-3 w-3" />
              Skills <span className="opacity-70 tabular-nums">{nSkills}</span>
            </button>
            {menu === "skills" &&
              menuCard(
                <>
                  {menuHeader(`Skills da ConvertIA · ${ws === "comercial" ? "Comercial" : "Operacional"}`)}
                  {skills.length === 0 && (
                    <div className="px-2.5 py-2 text-[11px]" style={{ color: "var(--ops-mut)" }}>
                      Nenhuma skill ainda — crie a primeira.
                    </div>
                  )}
                  {skills.map((s) =>
                    menuRow({
                      key: s.id,
                      dot: (
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border" style={{ borderColor: HAIR, color: skillOn[s.id] ? "var(--ops-title)" : "var(--ops-mut)" }}>
                          <Sparkles className="h-3 w-3" />
                        </span>
                      ),
                      name: s.name,
                      sub: s.description ?? "skill própria",
                      on: Boolean(skillOn[s.id]),
                      onClick: () => setSkillOn((x) => ({ ...x, [s.id]: !x[s.id] })),
                    }),
                  )}
                  <div className="mx-[5px] mt-1 flex items-center justify-between border-t px-[5px] pb-[3px] pt-[7px]" style={{ borderColor: HAIR }}>
                    <span className="text-[10px]" style={{ color: "var(--ops-mut)" }}>
                      a ConvertIA só usa skills ativas
                    </span>
                    <button onClick={() => { setMenu(null); setManage("skills") }} className="text-[10.5px] font-medium" style={{ color: BRAND }}>
                      criar skill
                    </button>
                  </div>
                </>,
                true,
              )}
          </div>
          <span className="flex-1" />
          {/* Modelo */}
          <div className="relative">
            <button
              onClick={() => setMenu(menu === "model" ? null : "model")}
              className="inline-flex h-[27px] max-w-[150px] items-center gap-1 whitespace-nowrap rounded-[8px] px-2 text-[11.5px] font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{ color: "var(--ops-sec)" }}
            >
              <span className="truncate">{mSel.name.replace("Claude ", "")}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>
            {menu === "model" &&
              menuCard(
                <>
                  {menuHeader("Modelo · via OpenRouter")}
                  {CONVERTIA_MODELS.map((m) => {
                    const on = m.id === model
                    return (
                      <button
                        key={m.id}
                        onClick={() => {
                          setModel(m.id)
                          setMenu(null)
                        }}
                        className="flex w-full items-start gap-[9px] rounded-[7px] px-[9px] py-[7px] text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        style={{ background: on ? "rgba(78,98,216,0.07)" : undefined }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--ops-title)" }}>
                            {m.name}
                            {m.tag && (
                              <span className="rounded-[4px] px-[5px] py-[1.5px] text-[8.5px] font-bold uppercase tracking-[0.05em]" style={{ color: BRAND, background: "rgba(78,98,216,0.10)" }}>
                                {m.tag}
                              </span>
                            )}
                          </span>
                          <span className="mt-px block text-[10px]" style={{ color: "var(--ops-mut)" }}>
                            {m.description}
                          </span>
                        </span>
                        {on && <Check className="mt-0.5 h-[13px] w-[13px]" style={{ color: BRAND }} />}
                      </button>
                    )
                  })}
                </>,
                true,
              )}
          </div>
          <button
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            title="Enviar"
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
            style={{ background: BRAND }}
          >
            <ArrowUp className="h-[13px] w-[13px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  )

  const wsLabel = ws === "comercial" ? "Comercial" : "Operacional"

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex h-[100dvh] min-w-0 overflow-hidden"
      style={{ background: "var(--ops-card)" }}
    >
      {/* Rail de conversas */}
      {railOpen && (
        <aside
          className="flex min-h-0 w-[225px] shrink-0 flex-col border-r bg-[#FAFAFB] dark:bg-white/[0.022]"
          style={{ borderColor: HAIR }}
        >
          <div className="px-3.5 pb-1 pt-4">
            <button
              onClick={novaConversa}
              className="flex h-8 w-full items-center gap-[9px] rounded-[8px] px-[9px] text-left text-[12.5px] font-semibold hover:bg-[rgba(78,98,216,0.06)]"
              style={{ color: BRAND }}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-[6px]" style={{ background: "rgba(78,98,216,0.10)" }}>
                <Plus className="h-3 w-3" />
              </span>
              Nova conversa
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
            {groupConversations(boot?.conversations ?? []).map(([g, items]) => (
              <div key={g} className="mt-3.5">
                <div className="px-2 pb-[5px] text-[10px] font-semibold" style={{ color: "var(--ops-mut)" }}>
                  {g}
                </div>
                {items.map((c) => {
                  const on = c.id === convId
                  return (
                    <div key={c.id} className="group relative">
                      <button
                        onClick={() => void openConversation(c)}
                        className="block w-full truncate rounded-[7px] px-2 py-[6.5px] pr-6 text-left text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                        style={{
                          background: on ? "rgba(17,24,39,0.05)" : undefined,
                          color: on ? "var(--ops-title)" : "var(--ops-sec)",
                        }}
                      >
                        {c.title}
                      </button>
                      <button
                        title="Excluir conversa"
                        onClick={() => void deleteConversation(c)}
                        className="absolute right-1 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[5px] hover:bg-black/[0.06] group-hover:flex dark:hover:bg-white/[0.08]"
                        style={{ color: "var(--ops-mut)" }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Coluna principal */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {oauthNotice && (
          <div
            className="mx-4 mt-3 flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[11.5px]"
            style={
              oauthNotice.ok
                ? { borderColor: "var(--ops-pos)", color: "var(--ops-pos)" }
                : { borderColor: "var(--ops-neg)", color: "var(--ops-neg)" }
            }
            role="status"
          >
            <span className="min-w-0 flex-1">{oauthNotice.text}</span>
            <button onClick={() => setOauthNotice(null)} aria-label="Fechar">
              ×
            </button>
          </div>
        )}
        <div className="flex h-[50px] shrink-0 items-center gap-[9px] px-4">
          <button
            title="Histórico"
            onClick={() => setRailOpen(!railOpen)}
            className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
            style={{ color: "var(--ops-mut)" }}
          >
            <PanelLeft className="h-[15px] w-[15px]" />
          </button>
          {view === "conversa" ? (
            <span className="truncate text-[12.5px] font-medium" style={{ color: "var(--ops-sec)" }}>
              {convTitle ?? "Conversa"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--ops-title)" }}>
              <IaMark s={17} />
              ConvertIA <span style={{ color: "var(--ops-mut)", fontWeight: 450 }}>· {wsLabel}</span>
            </span>
          )}
          <span className="flex-1" />
          <div className="flex items-center">
            {activeConns.map((c, i) => (
              <span key={c.key} className="flex rounded-[5px] border-2" style={{ marginLeft: i ? -4 : 0, borderColor: "var(--ops-card)" }}>
                <ConnDot k={c.key} size={15} title={c.name} />
              </span>
            ))}
          </div>
        </div>

        {view === "novo" ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-8 pb-16 pt-7">
            <div className="mx-auto w-full max-w-[680px]">
              <div className="mb-[26px] flex items-center justify-center gap-[13px]">
                <IaMark s={30} />
                <h1 className="m-0 text-[26px] font-medium tracking-[-0.022em]" style={{ color: "var(--ops-title)" }}>
                  {greeting(boot?.user_name ?? null)}
                </h1>
              </div>
              {composer(true)}
              <div className="mt-4 flex flex-wrap justify-center gap-[7px]">
                {SUGESTOES[ws].map(([Icon, t, prompt]) => (
                  <button
                    key={t}
                    onClick={() => void send(prompt)}
                    className="inline-flex h-8 items-center gap-[7px] rounded-[16px] border px-[13px] text-[12px] font-medium hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
                  >
                    <Icon className="h-[13px] w-[13px] opacity-75" />
                    {t}
                  </button>
                ))}
              </div>
              <div className="mt-10 text-center text-[11px]" style={{ color: "var(--ops-mut)" }}>
                ConvertIA roda {mSel.name} via OpenRouter · conectado a{" "}
                {activeConns.map((c) => c.name).join(" · ") || "nenhuma fonte"}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 pb-2 pt-5">
              <div className="mx-auto max-w-[680px]">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="mb-7 flex justify-end">
                      <div
                        className="max-w-[80%] whitespace-pre-wrap rounded-[16px] px-[15px] py-2.5 text-[13.5px] leading-[1.6] dark:bg-white/[0.065]"
                        style={{ background: "#F1F2F5", color: "var(--ops-title)" }}
                      >
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <AssistantMessage key={m.id} msg={m} onRefazer={refazer} />
                  ),
                )}
              </div>
            </div>
            <div className="shrink-0 px-8 pb-4 pt-2">
              {composer(false)}
              <div className="mt-2 text-center text-[10px]" style={{ color: "var(--ops-mut)" }}>
                O assistente consulta dados reais dos clientes — confira números críticos antes de enviar ao cliente.
              </div>
            </div>
          </>
        )}
      </main>

      <ConvertiaManageDialogs
        kind={manage}
        ws={ws}
        stores={stores}
        onClose={() => {
          setManage(null)
          void mutateBoot()
        }}
      />
    </div>
  )
}

// ── Mensagem do assistente (fontes + markdown + ações) ─────────────

function AssistantMessage({ msg, onRefazer }: { msg: UiMessage; onRefazer: () => void }) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [useful, setUseful] = useState(false)

  const copy = () => {
    void navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="mb-7 flex items-start gap-3">
      <span className="mt-[3px]">
        <IaMark s={22} />
      </span>
      <div className="min-w-0 flex-1">
        {msg.sources.length > 0 && (
          <>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="mb-3.5 inline-flex h-7 items-center gap-[7px] rounded-[14px] border px-[11px] text-[11px] font-medium"
              style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
            >
              {(msg.pendingTools ?? 0) > 0 ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
              ) : (
                <Check className="h-[11px] w-[11px]" style={{ color: "var(--ops-pos)" }} />
              )}
              Consultou {msg.sources.length} fonte{msg.sources.length === 1 ? "" : "s"}
              <span className="-ml-px flex">
                {[...new Set(msg.sources.map((s) => s.connector))].slice(0, 5).map((k, i) => (
                  <span key={k} className="flex" style={{ marginLeft: i ? -3 : 0 }}>
                    <ConnDot k={k} size={13} />
                  </span>
                ))}
              </span>
              <ChevronDown
                className="h-[11px] w-[11px] opacity-60 transition-transform"
                style={{ transform: toolsOpen ? "rotate(180deg)" : "none" }}
              />
            </button>
            {toolsOpen && (
              <div className="-mt-1.5 mb-4 flex flex-col gap-[7px] border-l-2 pl-[13px]" style={{ borderColor: HAIR }}>
                {msg.sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11.5px]">
                    <ConnDot k={s.connector} size={14} />
                    <span style={{ color: "var(--ops-text)" }}>
                      {s.label}
                      {s.write && (
                        <span className="ml-1.5 rounded-[4px] px-1 text-[8.5px] font-bold uppercase" style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
                          executou
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
                      {s.summary ?? "…"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="convertia-md text-[14px] leading-[1.75]" style={{ color: "var(--ops-title)" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || (msg.streaming ? "…" : "")}</ReactMarkdown>
        </div>
        {!msg.streaming && msg.content && (
          <div className="mt-4 flex items-center gap-1">
            <span className="flex-1" />
            <button
              title="Copiar"
              onClick={copy}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{ color: copied ? "var(--ops-pos)" : "var(--ops-mut)" }}
            >
              {copied ? <Check className="h-[13.5px] w-[13.5px]" /> : <Copy className="h-[13.5px] w-[13.5px]" />}
            </button>
            <button
              title="Refazer"
              onClick={onRefazer}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{ color: "var(--ops-mut)" }}
            >
              <RotateCcw className="h-[13.5px] w-[13.5px]" />
            </button>
            <button
              title="Útil"
              onClick={() => setUseful(!useful)}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{ color: useful ? BRAND : "var(--ops-mut)" }}
            >
              <ThumbsUp className="h-[13.5px] w-[13.5px]" fill={useful ? "currentColor" : "none"} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
