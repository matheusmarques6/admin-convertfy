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
import {
  AlertTriangle,
  ArrowUp,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Filter,
  Briefcase,
  ImageIcon,
  Mic,
  PanelLeft,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Square,
  Telescope,
  ThumbsUp,
  Trash2,
  Activity,
  Workflow,
  Brain,
  Leaf,
} from "lucide-react"
import { fmtMs, fmtTokens, type TurnUsageSummary } from "@/lib/ai/convertia/telemetry"
import type { PendingConfirmation } from "@/lib/ai/convertia/types"
import { ConvertiaMarkdown } from "./convertia-markdown"
import {
  CONVERTIA_DEFAULT_MODEL,
  CONVERTIA_MODELS,
  resolveConvertiaModel,
} from "@/lib/ai/convertia-models"
import { ConvertiaManageDialogs, type ManageKind } from "./convertia-manage"
import { ROUTES } from "@/lib/routes"

// ── Vocabulário do design ───────────────────────────────────────────

export const AI_CONN: Record<string, { n: string; c: string; g: string }> = {
  shopify: { n: "Shopify", c: "#96BF48", g: "S" },
  omnisend: { n: "Omnisend", c: "#5C6AC4", g: "O" },
  klaviyo: { n: "Klaviyo", c: "#111827", g: "K" },
  crm: { n: "CRM Convertfy", c: "#4E62D8", g: "C" },
  metricas: { n: "Métricas", c: "#0E7490", g: "M" },
  imagem: { n: "Geração de imagem", c: "#D97706", g: "I" },
  relatorio: { n: "Relatório da loja", c: "#0F766E", g: "R" },
  conhecimento: { n: "Conhecimento", c: "#7C3AED", g: "K" },
  memoria: { n: "Memória", c: "#BE185D", g: "L" },
}
const ADVISOR_DOT = { c: "#0F766E", g: "A" }
/** Modelo barato das rodadas de consulta (roteamento por rodada). */
const ECONOMY_KEY = "convertia:economy"
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
  budget?: {
    today_cost_cents: number
    daily_limit_cents: number
    exceeded: boolean
  }
  /** Base de conhecimento do Obsidian (notas aprovadas + advisors). */
  knowledge?: {
    available: boolean
    notes: number
    advisors: Array<{ path: string; title: string; excerpt: string | null }>
  }
  /** Memórias propostas pela IA aguardando revisão. */
  memories?: { pending: number }
  schema_missing: string[]
}

export interface Source {
  connector: string
  connector_name: string
  tool: string
  label: string
  summary: string | null
  /** O QUE foi consultado ("period: 30d · status: paid"). */
  args_summary?: string | null
  write: boolean
  /** Duração da execução (ms). */
  ms?: number
  /** Código do erro estruturado quando falhou. */
  error_code?: string | null
  retries?: number
  confirmation_id?: string | null
}

interface Continuation {
  job_id: string
  status: "queued" | "running" | "done" | "failed"
  reason?: string
}
interface UiAttachment {
  name: string
  mime: string
  kind: "image" | "text"
  data_url?: string
  text?: string
}

interface UiMessage {
  id: string
  role: "user" | "assistant"
  content: string
  sources: Source[]
  attachments?: Array<{ name: string; kind: "image" | "text" }>
  streaming?: boolean
  pendingTools?: number
  /** id REAL em ai_chat_messages (feedback persiste por ele). */
  dbId?: string
  feedback?: "up" | null
  /**
   * Narração das rodadas que chamaram ferramentas ("vou buscar o
   * popup atual…") — é processo, não resposta. Fica no painel
   * recolhível junto com as fontes; `content` é só a resposta final.
   */
  progress?: string[]
  /**
   * A linha veio do banco ainda com meta.streaming=true: o turno está
   * (ou estava) rodando no servidor. O chat repõe a resposta por
   * polling até ela fechar.
   */
  generating?: boolean
  startedAt?: string | null
  /** Telemetria do turno (rodadas, tools, tokens, cache, custo). */
  usage?: TurnUsageSummary | null
  /** Ação irreversível aguardando o Confirmar do usuário. */
  pendingConfirmation?: PendingConfirmation | null
  /** Turno continuando em segundo plano (orçamento da rota acabou). */
  continuation?: Continuation | null
  status?: string | null
}

/** Chave do localStorage: última conversa aberta por workspace. */
const lastConvKey = (ws: Ws) => `convertia:last-conversa:${ws}`
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Depois disso uma linha ainda "streaming" é turno morto (maxDuration é 300s). */
const GENERATING_STALE_MS = 6 * 60_000
/** Com continuação em job o turno pode durar mais (cron retoma a cada minuto). */
const CONTINUATION_STALE_MS = 25 * 60_000

function isLive(m: { generating?: boolean; startedAt?: string | null; continuation?: Continuation | null }): boolean {
  if (!m.generating) return false
  if (!m.startedAt) return true
  const age = Date.now() - new Date(m.startedAt).getTime()
  const continuing = m.continuation?.status === "queued" || m.continuation?.status === "running"
  return age < (continuing ? CONTINUATION_STALE_MS : GENERATING_STALE_MS)
}

/** Superfície mínima da Web Speech API (sem lib de tipos do DOM). */
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult:
    | ((e: {
        resultIndex: number
        results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>>
      }) => void)
    | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

/** Bolha do usuário mostra só o que foi digitado — os anexos viram chips. */
function displayUserContent(content: string): string {
  return content
    .replace(/\n\n\[Arquivo anexado: [^\]]+\]\n```[\s\S]*?```/g, "")
    .replace(/\n\n\[Imagem anexada: [^\]]+\]/g, "")
    .trim()
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

function isPinned(c: Conversation): boolean {
  return c.context?.pinned === true
}

function groupConversations(convs: Conversation[]): Array<[string, Conversation[]]> {
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86_400_000).toDateString()
  const weekAgo = Date.now() - 7 * 86_400_000
  const groups = new Map<string, Conversation[]>()
  for (const c of convs) {
    const d = new Date(c.last_message_at ?? c.created_at)
    const key = isPinned(c)
      ? "Fixadas"
      : d.toDateString() === today
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
  return ["Fixadas", "Hoje", "Ontem", "7 dias", "Antigas"]
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
  const [menu, setMenu] = useState<"model" | "plus" | "store" | null>(null)
  const [model, setModel] = useState(CONVERTIA_DEFAULT_MODEL)
  const [storeId, setStoreId] = useState<string | null | undefined>(undefined) // undefined = ainda não inicializado
  const [connOn, setConnOn] = useState<Record<string, boolean>>({})
  const [skillOn, setSkillOn] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)
  const [manage, setManage] = useState<ManageKind | null>(null)
  const [attachments, setAttachments] = useState<UiAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [railSearch, setRailSearch] = useState("")
  const [deep, setDeep] = useState(false)
  // Roteamento por rodada: modelo barato consulta, o escolhido responde.
  const [economy, setEconomy] = useState(false)
  const [advisorOn, setAdvisorOn] = useState<Record<string, boolean>>({})
  // Botão Parar: pedido enviado, aguardando o servidor fechar o turno
  const [stopping, setStopping] = useState(false)
  const stopRequestedRef = useRef(false)
  const draftDbIdRef = useRef<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recogRef = useRef<{ stop: () => void } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Rail fechada por padrão em tela estreita (o toggle continua no header)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setRailOpen(false)
  }, [])

  // Retorno do fluxo OAuth de MCP (?mcp_connected / ?mcp_error) +
  // contexto por rota (?store=uuid pré-seleciona a loja — o botão
  // "ConvertIA" no detalhe da loja chega por aqui)
  const [oauthNotice, setOauthNotice] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("mcp_connected")
    const errorMsg = params.get("mcp_error")
    const storeParam = params.get("store")
    if (connected) {
      const tools = params.get("mcp_tools")
      setOauthNotice({
        ok: true,
        text: `${connected} conectado via OAuth${tools ? ` — ${tools} tools disponíveis` : ""}. Ligue-o no menu Conectores · MCP.`,
      })
    } else if (errorMsg) {
      setOauthNotice({ ok: false, text: errorMsg })
    }
    if (storeParam && UUID_RE.test(storeParam)) {
      // vence o default "primeira loja" (o effect de default só roda
      // enquanto storeId === undefined)
      setStoreId(storeParam)
    }
    if (connected || errorMsg || storeParam) {
      // Limpa SÓ esses params — `?conversa=` fica (é o que faz o F5
      // voltar na mesma conversa).
      for (const k of ["mcp_connected", "mcp_error", "mcp_tools", "store"]) params.delete(k)
      const qs = params.toString()
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
    }
  }, [])

  // Ditado por voz: Web Speech API (Chrome/Edge/Safari) — feature-detect
  useEffect(() => {
    if (typeof window === "undefined") return
    const w = window as unknown as Record<string, unknown>
    setVoiceSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition))
    try {
      setEconomy(localStorage.getItem(ECONOMY_KEY) === "1")
    } catch {
      /* storage bloqueado */
    }
    return () => recogRef.current?.stop()
  }, [])
  const toggleEconomy = () => {
    setEconomy((v) => {
      try {
        localStorage.setItem(ECONOMY_KEY, v ? "0" : "1")
      } catch {
        /* storage bloqueado */
      }
      return !v
    })
  }

  const stores = useMemo(() => boot?.stores ?? [], [boot])
  const skills = useMemo(
    () => (boot?.skills ?? []).filter((s) => s.is_active),
    [boot],
  )
  const store = stores.find((s) => s.id === storeId) ?? null
  // Quantas lojas têm plataforma de email ligada — o conector nasce
  // ativo nelas; o resto precisa da chave cadastrada na loja.
  const storesComEmail = useMemo(
    () => stores.filter((s) => s.connectors.omnisend || s.connectors.klaviyo).length,
    [stores],
  )

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
    // Base de conhecimento do Obsidian (org-level): só aparece quando há
    // notas aprovadas sincronizadas.
    const knowledge = boot?.knowledge?.available
      ? [
          {
            key: "conhecimento",
            name: AI_CONN.conhecimento.n,
            sub: `base do Obsidian · ${boot.knowledge.notes} nota${boot.knowledge.notes === 1 ? "" : "s"}`,
            available: true,
          },
        ]
      : []
    return [...builtin, ...knowledge, ...mcps]
  }, [ws, store, boot, storeId])
  const advisors = useMemo(() => boot?.knowledge?.advisors ?? [], [boot])
  const activeAdvisors = advisors.filter((a) => advisorOn[a.path])

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

  // Guard-rail de custo diário (vem do bootstrap; o servidor reforça)
  const budget = boot?.budget
  const budgetPct =
    budget && budget.daily_limit_cents > 0
      ? budget.today_cost_cents / budget.daily_limit_cents
      : 0

  // ── Anexos: imagem (multimodal) + arquivos de texto como referência ─
  // ref espelho pro loop async não perder adds concorrentes
  const attachmentsRef = useRef<UiAttachment[]>([])
  const addFiles = useCallback(async (files: FileList | File[]) => {
    setAttachError(null)
    for (const file of Array.from(files)) {
      if (attachmentsRef.current.length >= 3) {
        setAttachError("Máximo de 3 anexos por mensagem.")
        break
      }
      const isImage = file.type.startsWith("image/")
      const isText =
        /\.(html?|txt|md|csv|json|xml)$/i.test(file.name) ||
        /^(text\/|application\/(json|xml))/.test(file.type)
      if (!isImage && !isText) {
        setAttachError(`"${file.name}": só imagens ou arquivos de texto (html, csv, md, txt, json).`)
        continue
      }
      if (isImage && file.size > 2 * 1024 * 1024) {
        setAttachError(`"${file.name}": imagem acima de 2MB.`)
        continue
      }
      if (!isImage && file.size > 300 * 1024) {
        setAttachError(`"${file.name}": arquivo de texto acima de 300KB.`)
        continue
      }
      const att: UiAttachment | null = await new Promise<UiAttachment>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error("leitura falhou"))
        if (isImage) {
          reader.onload = () =>
            resolve({
              name: file.name || "imagem.png",
              mime: file.type,
              kind: "image",
              data_url: String(reader.result),
            })
          reader.readAsDataURL(file)
        } else {
          reader.onload = () =>
            resolve({ name: file.name, mime: file.type || "text/plain", kind: "text", text: String(reader.result) })
          reader.readAsText(file)
        }
      }).catch(() => null)
      if (att) {
        attachmentsRef.current = [...attachmentsRef.current, att]
        setAttachments(attachmentsRef.current)
      }
    }
  }, [])
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    })
  }, [])

  // ── Abrir conversa existente ─────────────────────────────────────
  // sharedBy != null → conversa de OUTRA pessoa aberta por link
  // compartilhado: somente leitura (sem composer/refazer/feedback).
  const [sharedBy, setSharedBy] = useState<string | null>(null)
  const [convShared, setConvShared] = useState(false)
  // Conversa aberta no momento (ref pro polling não repor uma conversa
  // que o usuário já trocou) e polling ativo.
  const convIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendingRef = useRef(false)

  interface ConversationBody {
    conversation?: { title?: string; context?: Record<string, unknown> | null }
    is_owner?: boolean
    owner_name?: string | null
    messages?: Array<{
      id: string
      role: string
      content: string
      created_at?: string
      meta?: {
        sources?: Source[]
        attachments?: Array<{ name: string; kind: "image" | "text" }>
        feedback?: { rating?: string } | null
        progress?: string[]
        streaming?: boolean
        started_at?: string
        usage?: TurnUsageSummary | null
        pending_confirmation?: PendingConfirmation | null
        continuation?: Continuation | null
        status?: string | null
      } | null
    }>
  }

  const toUiMessages = useCallback((body: ConversationBody): UiMessage[] => {
    return (body.messages ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const startedAt = m.meta?.started_at ?? m.created_at ?? null
        const generating = m.meta?.streaming === true
        return {
          id: m.id,
          dbId: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          sources: m.meta?.sources ?? [],
          attachments: m.meta?.attachments,
          feedback: (m.meta?.feedback?.rating === "up" ? "up" : null) as "up" | null,
          progress: m.meta?.progress ?? [],
          usage: m.meta?.usage ?? null,
          pendingConfirmation: m.meta?.pending_confirmation ?? null,
          continuation: m.meta?.continuation ?? null,
          status: m.meta?.status ?? null,
          generating,
          startedAt,
          // turno vivo no servidor: a bolha mostra o spinner como se
          // estivesse recebendo o stream
          streaming: generating,
          pendingTools: generating ? (m.meta?.sources ?? []).filter((s) => s.summary == null).length : 0,
        }
      })
  }, [])

  /**
   * Re-lê a conversa enquanto alguma resposta está em geração no
   * servidor (F5 no meio do turno). Para quando a linha fecha, quando
   * o usuário troca de conversa/envia, ou quando o turno passou do
   * tempo máximo (aí é turno morto — a UI marca como interrompida).
   */
  const scheduleGeneratingPoll = useCallback(
    (id: string, msgs: UiMessage[]) => {
      if (pollRef.current) clearTimeout(pollRef.current)
      const live = msgs.filter(isLive)
      if (live.length === 0) return
      pollRef.current = setTimeout(async () => {
        if (convIdRef.current !== id || sendingRef.current) return
        try {
          const body = (await fetcher(`/api/ai/conversations/${id}`)) as ConversationBody
          if (convIdRef.current !== id || sendingRef.current) return
          const next = toUiMessages(body)
          setMessages(next)
          scrollToBottom()
          scheduleGeneratingPoll(id, next)
        } catch {
          /* próxima tentativa só se o usuário reabrir */
        }
      }, 2_500)
    },
    [scrollToBottom, toUiMessages],
  )

  const openConversationById = useCallback(
    async (id: string, fallbackTitle?: string) => {
      abortRef.current?.abort()
      if (pollRef.current) clearTimeout(pollRef.current)
      convIdRef.current = id
      setConvId(id)
      setConvTitle(fallbackTitle ?? null)
      setMessages([])
      setSharedBy(null)
      setConvShared(false)
      try {
        const body = (await fetcher(`/api/ai/conversations/${id}`)) as ConversationBody
        if (convIdRef.current !== id) return
        const conv = body.conversation
        if (conv?.title) setConvTitle(conv.title)
        const ctx = conv?.context ?? {}
        if (typeof ctx.model === "string") setModel(ctx.model)
        if (typeof ctx.store_id === "string") setStoreId(ctx.store_id)
        setConvShared(ctx.shared === true)
        if (body.is_owner === false) setSharedBy(body.owner_name ?? "outra pessoa")
        const msgs = toUiMessages(body)
        setMessages(msgs)
        scrollToBottom()
        scheduleGeneratingPoll(id, msgs)
      } catch {
        // Conversa excluída ou compartilhamento desativado — avisa em
        // vez de deixar um convId órfão com composer ativo (todo envio
        // daria "Conversa não encontrada").
        convIdRef.current = null
        setConvId(null)
        setConvTitle(null)
        setMessages([])
        setOauthNotice({
          ok: false,
          text: "Não consegui abrir a conversa — ela pode ter sido excluída ou o compartilhamento desativado.",
        })
      }
    },
    [scrollToBottom, toUiMessages, scheduleGeneratingPoll],
  )

  // ── F5 volta na MESMA conversa ─────────────────────────────────
  // A conversa aberta vive em `?conversa=` (também é o link de
  // compartilhar) e, como reserva, no localStorage por workspace. Nova
  // conversa limpa os dois.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    // No primeiro render convId ainda é null — gravar aqui apagaria o
    // `?conversa=`/localStorage ANTES do effect de abertura ler.
    if (!hydratedRef.current) return
    const params = new URLSearchParams(window.location.search)
    if (convId) {
      params.set("conversa", convId)
      try {
        localStorage.setItem(lastConvKey(ws), convId)
      } catch {
        /* storage bloqueado */
      }
    } else {
      params.delete("conversa")
      try {
        localStorage.removeItem(lastConvKey(ws))
      } catch {
        /* storage bloqueado */
      }
    }
    const qs = params.toString()
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`)
  }, [convId, ws])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  const openConversation = async (c: Conversation) => {
    await openConversationById(c.id, c.title)
  }

  const novaConversa = () => {
    abortRef.current?.abort()
    if (pollRef.current) clearTimeout(pollRef.current)
    convIdRef.current = null
    setConvId(null)
    setConvTitle(null)
    setMessages([])
    setInput("")
    setSharedBy(null)
    setConvShared(false)
  }

  // Abertura no mount: `?conversa=uuid` (link compartilhado OU a
  // própria conversa depois de um F5) → senão a última aberta neste
  // workspace (localStorage). Sem nada, tela de nova conversa.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    let conversa = params.get("conversa")
    if (!conversa || !UUID_RE.test(conversa)) {
      try {
        conversa = localStorage.getItem(lastConvKey(ws))
      } catch {
        conversa = null
      }
    }
    hydratedRef.current = true
    if (conversa && UUID_RE.test(conversa)) {
      void openConversationById(conversa)
    }
    // roda uma vez no mount, com a função já estável (useCallback)
  }, [openConversationById, ws])

  // Compartilhar com a org: liga context.shared (PATCH é replace — o
  // context atual vem do GET pra não perder nada) e copia o link.
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const toggleShare = async () => {
    if (!convId || sharedBy) return
    try {
      const body = (await fetcher(`/api/ai/conversations/${convId}`)) as {
        conversation?: { context?: Record<string, unknown> | null }
      }
      const ctx = body.conversation?.context ?? {}
      const next = { ...ctx, shared: !convShared }
      const resp = await fetch(`/api/ai/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: next }),
      })
      if (!resp.ok) throw new Error("PATCH falhou")
      setConvShared(!convShared)
      if (!convShared) {
        const link = `${window.location.origin}/admin/${ws}/ia?conversa=${convId}`
        try {
          await navigator.clipboard.writeText(link)
          setShareNotice("Link copiado — qualquer pessoa da organização abre em modo leitura.")
        } catch {
          setShareNotice(`Compartilhada com a organização: ${link}`)
        }
      } else {
        setShareNotice("Compartilhamento desativado — só você vê esta conversa.")
      }
      setTimeout(() => setShareNotice(null), 5000)
    } catch {
      setShareNotice("Não consegui alterar o compartilhamento — tente de novo.")
      setTimeout(() => setShareNotice(null), 5000)
    }
  }

  const deleteConversation = async (c: Conversation) => {
    if (!window.confirm(`Excluir a conversa "${c.title}"?`)) return
    await fetch(`/api/ai/conversations/${c.id}`, { method: "DELETE" }).catch(() => {})
    if (c.id === convId) novaConversa()
    void mutateBoot()
  }

  // Fixar/desafixar: o PATCH de context é REPLACE total — busca o
  // context FRESCO no GET antes de mesclar (o objeto do rail vem do
  // bootstrap e pode estar stale: mesclar sobre ele apagaria um
  // `shared` ligado depois do último refresh, matando o link dos
  // colegas em silêncio).
  const togglePin = async (c: Conversation) => {
    let ctx: Record<string, unknown> = c.context ?? {}
    try {
      const body = (await fetcher(`/api/ai/conversations/${c.id}`)) as {
        conversation?: { context?: Record<string, unknown> | null }
      }
      ctx = body.conversation?.context ?? ctx
    } catch {
      /* sem GET, mescla sobre o context do rail mesmo */
    }
    const next = { ...ctx, pinned: ctx.pinned !== true }
    await fetch(`/api/ai/conversations/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: next }),
    }).catch(() => {})
    void mutateBoot()
  }

  // Feedback 👍 persistido no meta da mensagem (toggle)
  const sendFeedback = useCallback((dbId: string, rating: "up" | null) => {
    void fetch("/api/ai/convertia/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: dbId, rating }),
    }).catch(() => {})
  }, [])

  // Ditado por voz (pt-BR): resultado final entra no input
  const toggleVoice = useCallback(() => {
    if (recording) {
      recogRef.current?.stop()
      return
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) return
    try {
      const recog = new Ctor()
      recog.lang = "pt-BR"
      recog.continuous = true
      recog.interimResults = false
      recog.onresult = (e) => {
        let finalText = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        }
        const t = finalText.trim()
        if (t) setInput((prev) => (prev ? `${prev.replace(/\s+$/, "")} ${t}` : t))
      }
      recog.onend = () => setRecording(false)
      recog.onerror = (e) => {
        setRecording(false)
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setAttachError("Microfone sem permissão no navegador — libere o acesso e tente de novo.")
        }
      }
      recogRef.current = recog
      recog.start()
      setRecording(true)
    } catch {
      setRecording(false)
    }
  }, [recording])

  // ── Botão Parar ─────────────────────────────────────────────────
  // O fetch NÃO é abortado: o servidor precisa fechar o turno direito
  // (gravar o que saiu, contabilizar custo, mandar o `done`). O pedido
  // vai por uma rota própria que marca a flag lida pelo loop.
  const requestStop = useCallback(async (messageId: string) => {
    try {
      await fetch("/api/ai/convertia/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: messageId }),
      })
    } catch {
      /* o turno termina sozinho pelo orçamento */
    }
  }, [])
  const stopTurn = () => {
    if (!sending || stopping) return
    setStopping(true)
    stopRequestedRef.current = true
    if (draftDbIdRef.current) void requestStop(draftDbIdRef.current)
    // sem message_id ainda (meta não chegou): o handler do meta dispara
  }

  // ── Envio (streaming SSE) ────────────────────────────────────────
  const send = async (
    text?: string,
    opts?: { approve?: { message_id: string; confirmation_id: string } },
  ) => {
    const message = (text ?? input).trim()
    if (!message || sending) return
    const atts = opts?.approve ? [] : attachments
    if (!opts?.approve) {
      setInput("")
      setAttachments([])
    }
    setAttachError(null)
    if (inputRef.current) inputRef.current.style.height = "auto"
    setSending(true)
    setStopping(false)
    stopRequestedRef.current = false
    draftDbIdRef.current = null
    sendingRef.current = true
    if (pollRef.current) clearTimeout(pollRef.current)
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: message,
      sources: [],
      attachments: atts.map((a) => ({ name: a.name, kind: a.kind })),
    }
    const draft: UiMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "",
      sources: [],
      streaming: true,
      pendingTools: 0,
      progress: [],
    }
    setMessages((m) => [
      ...(opts?.approve
        ? m.map((x) =>
            x.dbId === opts.approve?.message_id && x.pendingConfirmation
              ? { ...x, pendingConfirmation: { ...x.pendingConfirmation, resolved_at: new Date().toISOString(), resolution: "approved" as const } }
              : x,
          )
        : m),
      userMsg,
      draft,
    ])
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
          deep,
          economy,
          advisors: activeAdvisors.map((a) => a.path),
          ...(opts?.approve ? { approve: { ...opts.approve, decision: "approve" } } : {}),
          attachments: atts.map((a) => ({
            name: a.name,
            mime: a.mime,
            ...(a.kind === "image" ? { data_url: a.data_url } : { text: a.text }),
          })),
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
              convIdRef.current = ev.conversation_id
              setConvId(ev.conversation_id)
              setConvTitle((ev.title as string) ?? message.slice(0, 64))
              // a conversa nova já existe no banco — aparece no rail
              void mutateBoot()
            }
            if (typeof ev.message_id === "string") {
              draftDbIdRef.current = ev.message_id
              patchDraft((d) => ({ ...d, dbId: ev.message_id as string }))
              // Parar clicado antes do id existir: dispara agora
              if (stopRequestedRef.current) void requestStop(ev.message_id)
            }
          } else if (ev.type === "delta") {
            patchDraft((d) => ({ ...d, content: d.content + String(ev.text ?? "") }))
            scrollToBottom()
          } else if (ev.type === "round_end") {
            // A rodada terminou chamando ferramentas: o que foi
            // escrito era narração ("vou buscar…"). Vai pro processo e
            // a bolha fica limpa pra resposta final.
            patchDraft((d) => ({
              ...d,
              progress: d.content.trim() ? [...(d.progress ?? []), d.content.trim()] : d.progress,
              content: "",
            }))
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
                    args_summary:
                      typeof ev.args_summary === "string" ? ev.args_summary : null,
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
                    ? {
                        ...s,
                        summary: (ev.summary as string) ?? "ok",
                        ms: typeof ev.ms === "number" ? ev.ms : s.ms,
                        error_code: typeof ev.error_code === "string" ? ev.error_code : null,
                        retries: typeof ev.retries === "number" ? ev.retries : undefined,
                      }
                    : s,
                ),
              }))
            }
            scrollToBottom()
          } else if (ev.type === "confirm") {
            // Ação irreversível: o card com Confirmar/Cancelar entra na
            // bolha — nada foi executado.
            patchDraft((d) => ({ ...d, pendingConfirmation: (ev.confirmation as PendingConfirmation) ?? null }))
            scrollToBottom()
          } else if (ev.type === "notice") {
            patchDraft((d) => ({
              ...d,
              content: `${d.content}${d.content.trim() ? "\n\n" : ""}_${String(ev.text ?? "")}_`,
            }))
          } else if (ev.type === "done") {
            const continuation = (ev.continuation as Continuation | null) ?? null
            const continuing = continuation?.status === "queued" || continuation?.status === "running"
            patchDraft((d) => ({
              ...d,
              streaming: continuing,
              generating: continuing,
              pendingTools: 0,
              dbId: typeof ev.message_id === "string" ? ev.message_id : d.dbId,
              sources: Array.isArray(ev.sources) ? (ev.sources as Source[]) : d.sources,
              progress: Array.isArray(ev.progress) ? (ev.progress as string[]) : d.progress,
              usage: (ev.usage as TurnUsageSummary | null) ?? d.usage ?? null,
              pendingConfirmation: (ev.pending_confirmation as PendingConfirmation | null) ?? d.pendingConfirmation ?? null,
              continuation,
              status: typeof ev.status === "string" ? ev.status : d.status,
              startedAt: d.startedAt ?? new Date().toISOString(),
              // texto consolidado do servidor vence o montado por deltas
              content: typeof ev.content === "string" && ev.content.trim() ? ev.content : d.content,
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
      patchDraft((d) => (d.continuation ? d : { ...d, streaming: false }))
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
      setStopping(false)
      stopRequestedRef.current = false
      sendingRef.current = false
      scrollToBottom()
      // Turno que continua em job: o polling (mesmo caminho do F5) repõe
      // a resposta quando o cron terminar.
      if (convIdRef.current) {
        setMessages((cur) => {
          scheduleGeneratingPoll(convIdRef.current as string, cur)
          return cur
        })
      }
    }
  }

  // Gate de confirmação: aprovar dispara um turno novo com a ação já
  // autorizada; cancelar só registra (sem turno).
  const resolveConfirmation = async (msg: UiMessage, decision: "approve" | "reject") => {
    if (!msg.dbId || !msg.pendingConfirmation || sending) return
    if (decision === "approve") {
      // O servidor grava "✅ Confirmado: <resumo>" — a bolha mostra o mesmo.
      await send(`✅ Confirmado: ${msg.pendingConfirmation.summary}`, {
        approve: { message_id: msg.dbId, confirmation_id: msg.pendingConfirmation.id },
      })
      return
    }
    const conf = msg.pendingConfirmation
    setMessages((m) =>
      m.map((x) =>
        x.id === msg.id && x.pendingConfirmation
          ? { ...x, pendingConfirmation: { ...x.pendingConfirmation, resolved_at: new Date().toISOString(), resolution: "rejected" } }
          : x,
      ),
    )
    try {
      await fetch("/api/ai/convertia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: convId,
          message: "Cancelar a ação.",
          model,
          workspace: ws,
          store_id: storeId ?? null,
          approve: { message_id: msg.dbId, confirmation_id: conf.id, decision: "reject" },
        }),
      })
      setMessages((m) => [
        ...m,
        { id: `u-${Date.now()}`, role: "user", content: `[Cancelado] ${conf.summary}`, sources: [] },
      ])
      scrollToBottom()
    } catch {
      /* já marcado na UI; o servidor rejeita reuso do token de qualquer jeito */
    }
  }

  const refazer = () => {
    // Só o que foi DIGITADO: anexos inline (até 300 KB) estourariam o
    // limite da rota, e turno de confirmação não se repete como prompt.
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === "user" && !/^(✅ Confirmado:|\[Cancelado\])/.test(m.content))
    const text = lastUser ? displayUserContent(lastUser.content) : ""
    if (text) void send(text)
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
          maxHeight: "min(440px, 60vh)",
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
        {(attachments.length > 0 || attachError) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-[8px] border px-2 py-1 text-[10.5px]"
                style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
              >
                {a.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  aria-label={`Remover ${a.name}`}
                  onClick={() => setAttachments((s) => s.filter((_, j) => j !== i))}
                  style={{ color: "var(--ops-mut)" }}
                >
                  ×
                </button>
              </span>
            ))}
            {attachError && (
              <span className="text-[10.5px]" style={{ color: "var(--ops-neg)" }}>
                {attachError}
              </span>
            )}
          </div>
        )}
        <textarea
          ref={inputRef}
          autoFocus={autoFocus}
          rows={1}
          value={input}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData?.items ?? [])
              .filter((it) => it.type.startsWith("image/"))
              .map((it) => it.getAsFile())
              .filter((f): f is File => f !== null)
            if (imgs.length > 0) {
              e.preventDefault()
              void addFiles(imgs)
            }
          }}
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
          {/* "+" — anexos, conectores e skills num lugar só (padrão
              Claude): o rodapé fica com loja à esquerda e modelo à
              direita, e o resto sai do caminho. */}
          <div className="relative">
            <button
              title="Anexar arquivo, conectores e skills"
              aria-label="Anexar arquivo, conectores e skills"
              onClick={() => setMenu(menu === "plus" ? null : "plus")}
              className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border transition-transform hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{
                borderColor: menu === "plus" ? "#8B9BE8" : HAIR,
                color: menu === "plus" ? BRAND : "var(--ops-sec)",
                transform: menu === "plus" ? "rotate(45deg)" : "none",
              }}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
            {menu === "plus" &&
              menuCard(
                <>
                  <button
                    onClick={() => {
                      setMenu(null)
                      fileInputRef.current?.click()
                    }}
                    className="flex w-full items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border" style={{ borderColor: HAIR, color: "var(--ops-title)" }}>
                      <Paperclip className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium" style={{ color: "var(--ops-title)" }}>
                        Anexar imagem ou arquivo
                      </span>
                      <span className="mt-px block truncate text-[10px]" style={{ color: "var(--ops-mut)" }}>
                        html, csv, md, txt, json · até 3 por mensagem
                      </span>
                    </span>
                  </button>

                  <div className="mx-[5px] mt-1 border-t" style={{ borderColor: HAIR }} />
                  {menuHeader(`Conectores · MCP · ${activeConns.length}/${connectorEntries.length} ativos`)}
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
                  {/* Conector indisponível por falta de credencial não
                      é algo que se resolva aqui — o caminho é cadastrar
                      a chave na loja. Sem este atalho, "loja sem
                      credencial" era um beco sem saída. */}
                  {store && connectorEntries.some((c) => !c.available && c.sub.includes("sem credencial")) && (
                    <div className="px-[9px] pb-1 pt-[3px]">
                      <a
                        href={`${ROUTES.ADMIN.STORES.DETAIL(store.id)}?tab=setup`}
                        className="text-[10.5px] font-medium hover:underline"
                        style={{ color: BRAND }}
                      >
                        Cadastrar a chave em {store.name} →
                      </a>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-[9px] pb-[3px] pt-[3px]">
                    <span className="text-[10px]" style={{ color: "var(--ops-mut)" }}>
                      valem só para esta conversa
                    </span>
                    <button onClick={() => { setMenu(null); setManage("mcp") }} className="text-[10.5px] font-medium" style={{ color: BRAND }}>
                      gerenciar conexões
                    </button>
                  </div>

                  {advisors.length > 0 && (
                    <>
                      <div className="mx-[5px] mt-1 border-t" style={{ borderColor: HAIR }} />
                      {menuHeader(`Advisors · ${activeAdvisors.length}/${advisors.length} ativos`)}
                      {advisors.map((a) =>
                        menuRow({
                          key: a.path,
                          dot: (
                            <span
                              className="inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] text-[9.5px] font-bold text-white"
                              style={{ background: ADVISOR_DOT.c }}
                            >
                              {ADVISOR_DOT.g}
                            </span>
                          ),
                          name: a.title,
                          sub: a.excerpt ?? "persona da base de conhecimento",
                          on: Boolean(advisorOn[a.path]),
                          onClick: () => setAdvisorOn((x) => ({ ...x, [a.path]: !x[a.path] })),
                        }),
                      )}
                      <div className="px-[9px] pb-[3px] pt-[3px] text-[10px]" style={{ color: "var(--ops-mut)" }}>
                        a ConvertIA responde como o advisor ligado responderia
                      </div>
                    </>
                  )}

                  <div className="mx-[5px] mt-1 border-t" style={{ borderColor: HAIR }} />
                  {menuHeader(`Skills · ${nSkills}/${skills.length} ativas`)}
                  {skills.length === 0 && (
                    <div className="px-2.5 py-1.5 text-[11px]" style={{ color: "var(--ops-mut)" }}>
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
                  <div className="flex items-center justify-between px-[9px] pb-[3px] pt-[3px]">
                    <span className="text-[10px]" style={{ color: "var(--ops-mut)" }}>
                      a ConvertIA só usa skills ativas
                    </span>
                    <button onClick={() => { setMenu(null); setManage("skills") }} className="text-[10.5px] font-medium" style={{ color: BRAND }}>
                      criar skill
                    </button>
                  </div>

                  <div className="mx-[5px] mt-1 border-t" style={{ borderColor: HAIR }} />
                  {/* Memória entre conversas: a IA propõe, alguém aprova. */}
                  <button
                    onClick={() => {
                      setMenu(null)
                      setManage("memories")
                    }}
                    className="flex w-full items-center gap-[9px] rounded-[7px] px-[9px] py-[7px] text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border" style={{ borderColor: HAIR, color: "var(--ops-title)" }}>
                      <Brain className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium" style={{ color: "var(--ops-title)" }}>
                        Memórias
                        {(boot?.memories?.pending ?? 0) > 0 && (
                          <span className="ml-1.5 rounded-[4px] px-[5px] py-[1px] text-[9px] font-bold" style={{ background: "rgba(190,24,93,0.12)", color: "#BE185D" }}>
                            {boot?.memories?.pending} para revisar
                          </span>
                        )}
                      </span>
                      <span className="mt-px block truncate text-[10px]" style={{ color: "var(--ops-mut)" }}>
                        o que a ConvertIA lembra entre conversas · por loja ou organização
                      </span>
                    </span>
                  </button>
                </>,
              )}
          </div>
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
                  {menuHeader(
                    ws === "comercial"
                      ? "Loja da conversa"
                      : `Loja da conversa · ${storesComEmail}/${stores.length} com plataforma de email`,
                  )}
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
                      {/* Loja sem plataforma de email não tem o que a
                          ConvertIA consulta e executa — é o que faz o
                          conector nascer desligado. Ver isso ANTES de
                          escolher a loja evita descobrir no meio da
                          conversa. */}
                      {ws !== "comercial" &&
                        !s.connectors.omnisend &&
                        !s.connectors.klaviyo && (
                          <span
                            className="shrink-0 text-[9.5px]"
                            style={{ color: "var(--ops-warn)" }}
                            title="Sem chave de Omnisend/Klaviyo — cadastre nas integrações da loja"
                          >
                            sem email
                          </span>
                        )}
                      {s.id === storeId && <Check className="h-3 w-3 shrink-0" style={{ color: BRAND }} />}
                    </button>
                  ))}
                </>,
              )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.html,.htm,.txt,.md,.csv,.json,.xml"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files)
              e.target.value = ""
            }}
          />
          {/* Ditado por voz (só aparece onde a Web Speech API existe) */}
          {voiceSupported && (
            <button
              title={recording ? "Parar ditado" : "Ditar por voz (pt-BR)"}
              onClick={toggleVoice}
              className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-[8px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={
                recording
                  ? { color: "#DC2626", background: "rgba(220,38,38,0.08)" }
                  : { color: "var(--ops-mut)" }
              }
            >
              <Mic className={`h-3.5 w-3.5 ${recording ? "animate-pulse" : ""}`} />
            </button>
          )}
          <span className="flex-1" />
          {/* Modelo */}
          <div className="relative">
            <button
              onClick={() => setMenu(menu === "model" ? null : "model")}
              title={deep ? `${mSel.name} · análise profunda ligada` : mSel.name}
              className="inline-flex h-[27px] max-w-[170px] items-center gap-1 whitespace-nowrap rounded-[8px] px-2 text-[11.5px] font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{ color: deep ? BRAND : "var(--ops-sec)" }}
            >
              {deep && <Telescope className="h-3 w-3 shrink-0" />}
              <span className="truncate">{mSel.name.replace("Claude ", "")}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>
            {menu === "model" &&
              menuCard(
                <>
                  {(["claude", "outros"] as const).map((group) => (
                    <div key={group}>
                      {menuHeader(group === "claude" ? "Claude · via OpenRouter" : "Outros modelos")}
                      {CONVERTIA_MODELS.filter((m) => m.group === group).map((m) => {
                        const on = m.id === model
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              setModel(m.id)
                              setMenu(null)
                            }}
                            className="flex w-full items-start gap-[9px] rounded-[7px] px-[9px] py-[6px] text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
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
                    </div>
                  ))}
                  {/* Análise profunda mora junto do modelo (padrão do
                      Claude): é um MODO do modelo — plano → coleta
                      ampla → resposta completa, com raciocínio
                      estendido onde o modelo aceita. */}
                  <div className="mx-[5px] mt-1 border-t" style={{ borderColor: HAIR }} />
                  {menuRow({
                    key: "deep",
                    dot: (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border" style={{ borderColor: HAIR, color: deep ? BRAND : "var(--ops-mut)" }}>
                        <Telescope className="h-3 w-3" />
                      </span>
                    ),
                    name: "Análise profunda",
                    sub: mSel.reasoning
                      ? "plano + consulta ampla + resposta completa · mais lenta e mais cara"
                      : "este modelo não tem raciocínio estendido",
                    on: deep && mSel.reasoning,
                    disabled: !mSel.reasoning,
                    onClick: () => setDeep(!deep),
                  })}
                  {/* Roteamento por rodada: as rodadas de CONSULTA rodam
                      num modelo barato; escrita e resposta final ficam
                      com o modelo escolhido. */}
                  {menuRow({
                    key: "economy",
                    dot: (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border" style={{ borderColor: HAIR, color: economy ? "var(--ops-pos)" : "var(--ops-mut)" }}>
                        <Leaf className="h-3 w-3" />
                      </span>
                    ),
                    name: "Modo econômico",
                    sub: "consultas com Kimi K3 · escrita e resposta com o modelo escolhido",
                    on: economy,
                    disabled: mSel.id === "moonshotai/kimi-k3",
                    onClick: toggleEconomy,
                  })}
                </>,
                true,
              )}
          </div>
          {sending ? (
            // Gerando: o botão vira o PARAR (padrão Claude — quadrado
            // dentro do círculo). O servidor fecha o turno direito.
            <button
              onClick={stopTurn}
              disabled={stopping}
              title={stopping ? "Parando… fechando o turno" : "Parar a geração"}
              aria-label={stopping ? "Parando" : "Parar a geração"}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-60"
              style={{ background: stopping ? "var(--ops-mut)" : "var(--ops-title)" }}
            >
              {stopping ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Square className="h-[11px] w-[11px]" fill="currentColor" strokeWidth={0} />
              )}
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim() || budget?.exceeded === true}
              title={budget?.exceeded ? "Limite diário de IA atingido" : "Enviar"}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              <ArrowUp className="h-[13px] w-[13px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
      {sending && (
        <div
          className="mt-1.5 flex items-center justify-center gap-2 text-center text-[10.5px] font-medium"
          style={{ color: BRAND }}
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: BRAND }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: BRAND }} />
          </span>
          {stopping
            ? "Parando — a ConvertIA fecha o turno e guarda o que já foi gerado."
            : "ConvertIA está gerando a resposta — clique no quadrado para parar."}
        </div>
      )}
      {budget && budgetPct >= 0.8 && (
        <div
          className="mt-1.5 text-center text-[10.5px]"
          style={{ color: budget.exceeded ? "var(--ops-neg)" : "#B45309" }}
        >
          {budget.exceeded
            ? `Limite diário de IA atingido (US$ ${(budget.daily_limit_cents / 100).toFixed(2)}) — libera de novo amanhã.`
            : `Uso de IA hoje: US$ ${(budget.today_cost_cents / 100).toFixed(2)} de US$ ${(budget.daily_limit_cents / 100).toFixed(2)} (${Math.round(budgetPct * 100)}% do limite diário).`}{" "}
          <a href="/admin/ai-usage" className="font-medium underline" style={{ color: "inherit" }}>
            ajustar limite
          </a>
        </div>
      )}
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
            <div
              className="mt-1.5 flex h-[27px] items-center gap-1.5 rounded-[7px] border px-2"
              style={{ borderColor: HAIR, background: "var(--ops-card)" }}
            >
              <Search className="h-3 w-3 shrink-0" style={{ color: "var(--ops-mut)" }} />
              <input
                value={railSearch}
                onChange={(e) => setRailSearch(e.target.value)}
                placeholder="Buscar conversa"
                className="w-full min-w-0 border-0 bg-transparent text-[11.5px] outline-none"
                style={{ color: "var(--ops-title)" }}
              />
              {railSearch && (
                <button
                  aria-label="Limpar busca"
                  onClick={() => setRailSearch("")}
                  className="text-[12px]"
                  style={{ color: "var(--ops-mut)" }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-1">
            {railSearch.trim() &&
              groupConversations(
                (boot?.conversations ?? []).filter((c) =>
                  c.title.toLowerCase().includes(railSearch.trim().toLowerCase()),
                ),
              ).length === 0 && (
                <div className="px-2 pt-3 text-[11px]" style={{ color: "var(--ops-mut)" }}>
                  Nenhuma conversa com “{railSearch.trim()}”.
                </div>
              )}
            {groupConversations(
              railSearch.trim()
                ? (boot?.conversations ?? []).filter((c) =>
                    c.title.toLowerCase().includes(railSearch.trim().toLowerCase()),
                  )
                : (boot?.conversations ?? []),
            ).map(([g, items]) => (
              <div key={g} className="mt-3.5">
                <div className="px-2 pb-[5px] text-[10px] font-semibold" style={{ color: "var(--ops-mut)" }}>
                  {g}
                </div>
                {items.map((c) => {
                  const on = c.id === convId
                  const pinned = isPinned(c)
                  return (
                    <div key={c.id} className="group relative">
                      <button
                        onClick={() => void openConversation(c)}
                        className="block w-full truncate rounded-[7px] px-2 py-[6.5px] pr-11 text-left text-[12px] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                        style={{
                          background: on ? "rgba(17,24,39,0.05)" : undefined,
                          color: on ? "var(--ops-title)" : "var(--ops-sec)",
                        }}
                      >
                        {c.title}
                      </button>
                      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-px group-hover:flex">
                        <button
                          title={pinned ? "Desafixar conversa" : "Fixar conversa"}
                          onClick={() => void togglePin(c)}
                          className="flex h-5 w-5 items-center justify-center rounded-[5px] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                          style={{ color: pinned ? BRAND : "var(--ops-mut)" }}
                        >
                          {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </button>
                        <button
                          title="Excluir conversa"
                          onClick={() => void deleteConversation(c)}
                          className="flex h-5 w-5 items-center justify-center rounded-[5px] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                          style={{ color: "var(--ops-mut)" }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {pinned && (
                        <Pin
                          className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 group-hover:hidden"
                          style={{ color: "var(--ops-mut)" }}
                        />
                      )}
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
            <span className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--ops-sec)" }}>
              <span className="truncate">{convTitle ?? "Conversa"}</span>
              {sharedBy ? (
                <span
                  className="shrink-0 rounded-[5px] px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.05em]"
                  style={{ background: "rgba(78,98,216,0.10)", color: BRAND }}
                >
                  leitura
                </span>
              ) : (
                convId && (
                  <button
                    title={
                      convShared
                        ? "Compartilhada com a organização — clique para tornar privada"
                        : "Compartilhar com a organização (link de leitura)"
                    }
                    onClick={() => void toggleShare()}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                    style={{ color: convShared ? BRAND : "var(--ops-mut)" }}
                  >
                    <Share2 className="h-[13px] w-[13px]" />
                  </button>
                )
              )}
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
                      <div className="flex max-w-[80%] flex-col items-end gap-1.5">
                        {(m.attachments?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {m.attachments!.map((a, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 rounded-[8px] border px-2 py-1 text-[10.5px]"
                                style={{ borderColor: "var(--ops-border)", color: "var(--ops-sec)" }}
                              >
                                {a.kind === "image" ? (
                                  <ImageIcon className="h-3 w-3" />
                                ) : (
                                  <FileText className="h-3 w-3" />
                                )}
                                {a.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div
                          className="whitespace-pre-wrap rounded-[16px] px-[15px] py-2.5 text-[13.5px] leading-[1.6] dark:bg-white/[0.065]"
                          style={{ background: "#F1F2F5", color: "var(--ops-title)" }}
                        >
                          {displayUserContent(m.content)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      msg={m}
                      readOnly={sharedBy !== null}
                      busy={sending}
                      onConfirm={(decision) => void resolveConfirmation(m, decision)}
                      onRefazer={refazer}
                      onFeedback={(next) => {
                        setMessages((all) =>
                          all.map((x) => (x.id === m.id ? { ...x, feedback: next ? "up" : null } : x)),
                        )
                        if (m.dbId) sendFeedback(m.dbId, next ? "up" : null)
                      }}
                    />
                  ),
                )}
              </div>
            </div>
            {shareNotice && (
              <div className="px-8 pb-1 text-center text-[10.5px]" style={{ color: BRAND }} role="status">
                {shareNotice}
              </div>
            )}
            {sharedBy ? (
              <div className="shrink-0 px-8 pb-5 pt-2">
                <div
                  className="mx-auto max-w-[680px] rounded-[10px] border px-4 py-2.5 text-center text-[11.5px]"
                  style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
                >
                  Conversa compartilhada por <strong>{sharedBy}</strong> — somente leitura.
                  Para conversar com a ConvertIA, abra uma{" "}
                  <button onClick={novaConversa} className="font-semibold underline" style={{ color: BRAND }}>
                    nova conversa
                  </button>
                  .
                </div>
              </div>
            ) : (
              <div className="shrink-0 px-8 pb-4 pt-2">
                {composer(false)}
                {!sending && (
                  <div className="mt-2 text-center text-[10px]" style={{ color: "var(--ops-mut)" }}>
                    O assistente consulta dados reais dos clientes — confira números críticos antes de enviar ao cliente.
                  </div>
                )}
              </div>
            )}
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

function AssistantMessage({
  msg,
  readOnly = false,
  busy = false,
  onConfirm,
  onRefazer,
  onFeedback,
}: {
  msg: UiMessage
  readOnly?: boolean
  busy?: boolean
  onConfirm: (decision: "approve" | "reject") => void
  onRefazer: () => void
  onFeedback: (next: boolean) => void
}) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const useful = msg.feedback === "up"
  const usage = msg.usage ?? null
  const continuing = msg.continuation?.status === "queued" || msg.continuation?.status === "running"
  const confirmation = msg.pendingConfirmation ?? null
  const confirmOpen = Boolean(confirmation && !confirmation.resolved_at)
  // Consulta em andamento: a última fonte sem summary é a que roda agora
  const running =
    (msg.pendingTools ?? 0) > 0
      ? [...msg.sources].reverse().find((s) => s.summary == null)
      : undefined
  const progress = msg.progress ?? []
  const lastProgress = progress.length > 0 ? progress[progress.length - 1] : null
  // Turno que veio do banco ainda "streaming" mas velho demais pra
  // estar vivo: a função foi morta — marca como interrompido.
  const stale = msg.generating === true && Boolean(msg.startedAt) && !isLive(msg)
  const isStreaming = msg.streaming === true && !stale
  const hasProcess = msg.sources.length > 0 || progress.length > 0

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
        {hasProcess && (
          <>
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="mb-3.5 inline-flex h-7 items-center gap-[7px] rounded-[14px] border px-[11px] text-[11px] font-medium"
              style={{ borderColor: HAIR, color: "var(--ops-sec)" }}
            >
              {(msg.pendingTools ?? 0) > 0 && isStreaming ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
              ) : (
                <Check className="h-[11px] w-[11px]" style={{ color: "var(--ops-pos)" }} />
              )}
              {msg.sources.length > 0
                ? `Consultou ${msg.sources.length} fonte${msg.sources.length === 1 ? "" : "s"}`
                : "Processo"}
              {progress.length > 0 && (
                <span style={{ color: "var(--ops-mut)" }}>
                  · {progress.length} etapa{progress.length === 1 ? "" : "s"}
                </span>
              )}
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
            {/* consulta em andamento: o QUE está sendo buscado agora */}
            {!toolsOpen && running && isStreaming && (
              <div className="-mt-1.5 mb-3 flex items-center gap-2 text-[11px]" style={{ color: "var(--ops-mut)" }}>
                <ConnDot k={running.connector} size={12} />
                <span className="truncate">
                  {running.label}
                  {running.args_summary ? ` — ${running.args_summary}` : ""}…
                </span>
              </div>
            )}
            {/* Última narração enquanto ainda não há resposta final:
                o usuário vê O QUE ela está fazendo, sem a parede de
                texto de antes. */}
            {!toolsOpen && isStreaming && !running && lastProgress && !msg.content.trim() && (
              <div className="-mt-1.5 mb-3 text-[11.5px] italic" style={{ color: "var(--ops-mut)" }}>
                {lastProgress.length > 220 ? `${lastProgress.slice(0, 220)}…` : lastProgress}
              </div>
            )}
            {toolsOpen && (
              <div className="-mt-1.5 mb-4 flex flex-col gap-[7px] border-l-2 pl-[13px]" style={{ borderColor: HAIR }}>
                {progress.length > 0 && (
                  <div className="mb-1 flex flex-col gap-1.5">
                    {progress.map((p, i) => (
                      <div key={i} className="flex gap-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--ops-sec)" }}>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--ops-mut)" }}>
                          {i + 1}.
                        </span>
                        <span className="min-w-0 whitespace-pre-wrap">{p}</span>
                      </div>
                    ))}
                  </div>
                )}
                {usage && usage.rounds.length > 0 && (
                  <div className="mb-1 flex flex-col gap-[3px] text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
                    {usage.rounds.map((r) => (
                      <div key={r.n} className="flex items-center gap-2 tabular-nums">
                        <span className="w-[22px] shrink-0">R{r.n}</span>
                        <span className="truncate" style={{ color: "var(--ops-sec)" }}>
                          {r.model.replace(/^[^/]+\//, "")}
                          {r.role === "cheap" ? " · econômico" : ""}
                        </span>
                        <span>{fmtMs(r.ms)}</span>
                        <span>
                          {fmtTokens(r.tokens_input)} in
                          {r.tokens_input > 0 && r.tokens_cached > 0
                            ? ` (${Math.round((r.tokens_cached / r.tokens_input) * 100)}% cache)`
                            : ""}
                          {" · "}
                          {fmtTokens(r.tokens_output)} out
                        </span>
                        <span>
                          {r.outcome === "final"
                            ? "resposta"
                            : r.outcome === "tools"
                              ? `${r.tool_calls} tool${r.tool_calls === 1 ? "" : "s"}`
                              : r.outcome === "nudged"
                                ? "descartada (sem consulta)"
                                : r.outcome === "rerouted"
                                  ? "refeita no modelo forte"
                                  : r.outcome}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.sources.map((s, i) => (
                  <div key={i} className="flex flex-col gap-px text-[11.5px]">
                    <div className="flex items-center gap-2">
                      <ConnDot k={s.connector} size={14} />
                      <span style={{ color: "var(--ops-text)" }}>
                        {s.label}
                        {s.write && (
                          <span className="ml-1.5 rounded-[4px] px-1 text-[8.5px] font-bold uppercase" style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
                            executou
                          </span>
                        )}
                      </span>
                      <span
                        className="tabular-nums text-[10.5px]"
                        style={{ color: s.error_code ? "var(--ops-neg)" : "var(--ops-mut)" }}
                      >
                        {s.summary ?? "…"}
                      </span>
                      {typeof s.ms === "number" && (
                        <span className="ml-auto shrink-0 tabular-nums text-[10px]" style={{ color: "var(--ops-mut)" }}>
                          {fmtMs(s.ms)}
                          {s.retries ? ` · ${s.retries}× retry` : ""}
                        </span>
                      )}
                    </div>
                    {s.args_summary && (
                      <span className="pl-[22px] text-[10px]" style={{ color: "var(--ops-mut)" }}>
                        {s.args_summary}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {isStreaming && !msg.content.trim() && (
          <div className="mb-2 flex items-center gap-2 text-[12px]" style={{ color: "var(--ops-mut)" }} role="status">
            <span className="flex gap-[3px]">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full"
                  style={{ background: BRAND, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            {msg.generating ? "Resposta em andamento — atualizando…" : "Gerando resposta…"}
          </div>
        )}
        {stale && (
          <div className="mb-2 text-[11.5px]" style={{ color: "#B45309" }}>
            Resposta interrompida — o turno passou do tempo limite. O que foi gerado está abaixo; peça
            para continuar se faltou algo.
          </div>
        )}
        {continuing && !stale && (
          <div className="mb-2 flex items-center gap-2 text-[11.5px]" style={{ color: BRAND }} role="status">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            Continuando em segundo plano — o tempo do turno acabou e a ConvertIA segue trabalhando; a
            resposta aparece aqui quando terminar.
          </div>
        )}
        {msg.continuation?.status === "failed" && (
          <div className="mb-2 text-[11.5px]" style={{ color: "var(--ops-neg)" }}>
            A continuação em segundo plano falhou{msg.continuation.reason ? ` (${msg.continuation.reason})` : ""}.
            Peça para continuar de onde parou.
          </div>
        )}
        {confirmation && (
          <div
            className="mb-3 rounded-[10px] border px-3.5 py-3"
            style={{
              borderColor: confirmOpen ? "#DC2626" : HAIR,
              background: confirmOpen ? "rgba(220,38,38,0.05)" : "transparent",
            }}
            role="group"
            aria-label="Confirmação de ação irreversível"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-[2px] h-[14px] w-[14px] shrink-0" style={{ color: confirmOpen ? "#DC2626" : "var(--ops-mut)" }} />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold" style={{ color: "var(--ops-title)" }}>
                  {confirmOpen ? "Ação irreversível — confirmar?" : confirmation.resolution === "approved" ? "Ação confirmada" : "Ação cancelada"}
                </div>
                <div className="mt-0.5 text-[12px] leading-[1.5]" style={{ color: "var(--ops-text)" }}>
                  {confirmation.summary}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--ops-mut)" }}>
                  <ConnDot k={confirmation.connector} size={12} />
                  <span className="truncate">{confirmation.label}</span>
                  {Object.keys(confirmation.args ?? {}).length > 0 && (
                    <span className="truncate">
                      · {Object.entries(confirmation.args).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ").slice(0, 140)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {confirmOpen && !readOnly && (
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  onClick={() => onConfirm("reject")}
                  disabled={busy}
                  className="h-[29px] rounded-[8px] border px-3 text-[12px] font-medium disabled:opacity-50"
                  style={{ borderColor: HAIR, color: "var(--ops-text)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => onConfirm("approve")}
                  disabled={busy}
                  className="h-[29px] rounded-[8px] px-3.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "#DC2626" }}
                >
                  Confirmar e executar
                </button>
              </div>
            )}
          </div>
        )}
        <div className="convertia-md text-[14px] leading-[1.75]" style={{ color: "var(--ops-title)" }}>
          <ConvertiaMarkdown content={msg.content} streaming={isStreaming} />
        </div>
        {!isStreaming && msg.content && (
          <div className="mt-4 flex items-center gap-1">
            {/* Telemetria do turno (padrão Claude: uma linha discreta) */}
            {usage && (
              <span
                className="truncate tabular-nums text-[10.5px]"
                style={{ color: "var(--ops-mut)" }}
                title={`${usage.rounds.length} rodada(s) · ${usage.tools.length} tool(s) · ${usage.tokens_input} tokens de entrada (${usage.tokens_cached} do cache) · ${usage.tokens_output} de saída`}
              >
                {usage.rounds.length} rodada{usage.rounds.length === 1 ? "" : "s"}
                {usage.tools.length > 0 ? ` · ${usage.tools.length} tool${usage.tools.length === 1 ? "" : "s"}` : ""}
                {" · "}
                {fmtTokens(usage.tokens_input)} in
                {usage.cache_hit_ratio > 0 ? ` (${Math.round(usage.cache_hit_ratio * 100)}% cache)` : ""}
                {" · "}
                {fmtTokens(usage.tokens_output)} out
                {usage.cost_usd > 0 ? ` · US$ ${usage.cost_usd.toFixed(usage.cost_usd < 0.01 ? 4 : 3)}` : ""}
                {" · "}
                {fmtMs(usage.duration_ms)}
                {msg.status === "cancelled" ? " · interrompida" : ""}
              </span>
            )}
            <span className="flex-1" />
            <button
              title="Copiar"
              onClick={copy}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
              style={{ color: copied ? "var(--ops-pos)" : "var(--ops-mut)" }}
            >
              {copied ? <Check className="h-[13.5px] w-[13.5px]" /> : <Copy className="h-[13.5px] w-[13.5px]" />}
            </button>
            {!readOnly && (
              <>
                <button
                  title="Refazer"
                  onClick={onRefazer}
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  style={{ color: "var(--ops-mut)" }}
                >
                  <RotateCcw className="h-[13.5px] w-[13.5px]" />
                </button>
                <button
                  title={useful ? "Remover marcação de útil" : "Marcar como útil"}
                  onClick={() => onFeedback(!useful)}
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                  style={{ color: useful ? BRAND : "var(--ops-mut)" }}
                >
                  <ThumbsUp className="h-[13.5px] w-[13.5px]" fill={useful ? "currentColor" : "none"} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
