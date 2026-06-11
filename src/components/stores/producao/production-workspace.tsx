"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import useSWR from "swr"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Heart,
  Loader2,
  Lock,
  Mail,
  Package,
  Plus,
  RefreshCw,
  Send,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Truck,
  Wand2,
  X,
} from "lucide-react"
import { useToast } from "@/lib/hooks/use-toast"
import type {
  EmailFlow,
  EmailFlowEmail,
  FlowType,
  StoreBrandIdentity,
  StoreBriefing,
} from "@/types/email-workspace"
import { EmailDetailView } from "./email-detail-view"
import { ImplementationView } from "./implementation-view"
import { BrandResourceView } from "./brand-resource-view"
import { BriefingResourceView } from "./briefing-resource-view"
import { StartOnboardingButton } from "@/components/stores/start-onboarding-button"
import { RerenderButton } from "./rerender-button"
import { filterFlowsByMode } from "./filter-flows-by-mode"
import type {
  WorkspaceMode,
  AllowedEmailRef,
} from "./production-workspace-types"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

interface TopProductSyncItem {
  rank: number
  title: string
  price: number | null
  currency: string | null
  handle: string | null
  image_url: string | null
  captured_at?: string | null
}

interface WorkspaceResponse {
  store: {
    id: string
    store_name: string
    store_url: string | null
    platform: string | null
    /** ESP onde os flows são montados (Etapa 6 / implementação). */
    email_platform: "klaviyo" | "omnisend" | null
    niche: string | null
    language_label: string | null
    created_at: string | null
    // Campos de marca canônicos em client_stores (lidos pela tab Marca).
    slogan: string | null
    diferencial: string | null
    persona: string | null
    posicionamento_preco: "popular" | "medio" | "premium" | null
    hashtags: string[] | null
    brand_thesis: string | null
    brand_about: string | null
    brand_pillars:
      | Array<{ number: string; label: string; text: string }>
      | null
    tone_use_words: string[] | null
    tone_avoid_words: string[] | null
    tone_do: string[] | null
    tone_dont: string[] | null
    devolucao_politica: string | null
    frete_cobertura: string | null
    frete_prazo: string | null
    frete_gratis_acima_cents: number | null
    clients?: { id: string; name: string }
  }
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  flows: EmailFlow[]
  top_products_sync: {
    captured_at: string | null
    items: TopProductSyncItem[]
  } | null
}

export type { WorkspaceMode, AllowedEmailRef }

interface ProductionWorkspaceProps {
  storeId: string
  initialResource: string | null
  initialFlow: string | null
  initialEmail: string | null
  /** "preview" filtra a sidebar pros emails-piloto definidos em allowedEmails. */
  mode?: WorkspaceMode
  /** Em modo preview, restringe quais emails aparecem na sidebar. */
  allowedEmails?: AllowedEmailRef[]
  /**
   * Quando embedded em modal, sobrescreve o botão de fechar (que por
   * default navega pra /admin/stores/[id]). Se passar, o X chama isso.
   */
  onClose?: () => void
  /**
   * Quando o workspace é aberto a partir de uma task, contexto pra exibir
   * o badge "Task atribuída a você" no topbar. `assigneeId` é o profile_id
   * do responsável; comparado com `currentUserId` pra decidir se mostra.
   */
  taskContext?: {
    taskTitle: string
    assigneeId: string | null
    currentUserId: string | null
  }
}

// Tipo da seleção atual
type Selection =
  | { kind: "resource"; resource: "brand" | "briefing" }
  | { kind: "email"; flowId: string; emailId: string }
  | { kind: "none" }

const FLOW_ICONS: Record<FlowType, typeof Send> = {
  welcome: Send,
  site_abandoned: FileText,
  abandoned_cart: ShoppingCart,
  browse_abandonment: TrendingDown,
  upsell: Sparkles,
  win_back: Heart,
  shipping_stages: Truck,
  post_purchase: Package,
  custom: Mail,
}

export function ProductionWorkspace({
  storeId,
  initialResource,
  initialFlow,
  initialEmail,
  mode = "full",
  allowedEmails,
  onClose,
  taskContext,
}: ProductionWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { data, isLoading, error, mutate } = useSWR<{
    data?: WorkspaceResponse
  } & WorkspaceResponse>(`/api/admin/stores/${storeId}/producao`, fetcher)

  const resp: WorkspaceResponse | undefined = data?.data ?? (data as WorkspaceResponse | undefined)
  const store = resp?.store
  const brand = resp?.brand ?? null
  const briefing = resp?.briefing ?? null
  const topProductsSync = resp?.top_products_sync ?? null
  const flows = useMemo<EmailFlow[]>(
    () => filterFlowsByMode(resp?.flows ?? [], mode, allowedEmails),
    [resp?.flows, mode, allowedEmails],
  )

  // ── Selection state (sincronizado com URL) ─────────────
  const [selection, setSelection] = useState<Selection>(() => {
    if (initialResource === "brand" || initialResource === "briefing") {
      return { kind: "resource", resource: initialResource }
    }
    if (initialFlow && initialEmail) {
      return { kind: "email", flowId: initialFlow, emailId: initialEmail }
    }
    return { kind: "none" }
  })

  // Auto-select primeiro item disponível quando carrega.
  // Em modo preview, prioriza email (motivo de abrir o workspace) sobre recursos.
  useEffect(() => {
    if (!resp || selection.kind !== "none") return
    if (mode === "preview" || mode === "implementation") {
      const firstFlowWithEmails = flows.find(
        (f) => (f.emails ?? []).length > 0,
      )
      if (firstFlowWithEmails) {
        setSelection({
          kind: "email",
          flowId: firstFlowWithEmails.id,
          emailId: firstFlowWithEmails.emails![0].id,
        })
        return
      }
      if (briefing) {
        setSelection({ kind: "resource", resource: "briefing" })
        return
      }
      return
    }
    if (brand) {
      setSelection({ kind: "resource", resource: "brand" })
      return
    }
    if (briefing) {
      setSelection({ kind: "resource", resource: "briefing" })
      return
    }
    const welcome = flows.find((f) => f.flow_type === "welcome")
    if (welcome && welcome.emails && welcome.emails.length > 0) {
      setSelection({
        kind: "email",
        flowId: welcome.id,
        emailId: welcome.emails[0].id,
      })
    }
  }, [resp, selection.kind, brand, briefing, flows, mode])

  // Sincroniza URL quando selection muda
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (selection.kind === "resource") {
      params.set("resource", selection.resource)
      params.delete("flow")
      params.delete("email")
    } else if (selection.kind === "email") {
      params.delete("resource")
      params.set("flow", selection.flowId)
      params.set("email", selection.emailId)
    } else {
      params.delete("resource")
      params.delete("flow")
      params.delete("email")
    }
    const next = params.toString()
    router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  // Total progresso geral (média de progress dos flows)
  const overallProgress = useMemo(() => {
    if (flows.length === 0) return 0
    const totalEmails = flows.flatMap((f) => f.emails ?? [])
    if (totalEmails.length === 0) return 0
    const sum = totalEmails.reduce((s, e) => s + (e.progress_percent ?? 0), 0)
    return Math.round(sum / totalEmails.length)
  }, [flows])

  // Conta emails prontos (status ready/approved/live) vs total
  // Tick pra forçar refresh do "salvo automaticamente · há X min".
  // Roda a cada minuto; o useMemo de lastUpdateMin escuta esse tick.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const emailsCounts = useMemo(() => {
    const all = flows.flatMap((f) => f.emails ?? [])
    const ready = all.filter(
      (e) => e.status === "ready" || e.status === "approved" || e.status === "live",
    ).length
    return { ready, total: all.length }
  }, [flows])

  // Busca/filtro de emails na sidebar
  const [search, setSearch] = useState("")
  const filteredFlows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return flows
    return flows
      .map((f) => {
        const flowMatches = f.name.toLowerCase().includes(q)
        const matchingEmails = (f.emails ?? []).filter((e) =>
          [e.name, e.subject, e.preheader]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
        )
        if (flowMatches) return f
        if (matchingEmails.length > 0) return { ...f, emails: matchingEmails }
        return null
      })
      .filter((f): f is EmailFlow => f !== null)
  }, [flows, search])

  // Find current email pra topbar (antes dos early returns pra manter hooks order)
  const currentEmail = useMemo(
    () =>
      selection.kind === "email"
        ? flows
            .find((f) => f.id === selection.flowId)
            ?.emails?.find((e) => e.id === selection.emailId) ?? null
        : null,
    [selection, flows],
  )
  const currentFlow = useMemo(
    () =>
      selection.kind === "email"
        ? flows.find((f) => f.id === selection.flowId) ?? null
        : null,
    [selection, flows],
  )

  // Save time relative — recalcula a cada minuto.
  const lastUpdateMin = useMemo(() => {
    if (!currentEmail) return null
    const min = Math.floor(
      (Date.now() - new Date(currentEmail.updated_at).getTime()) / 60000,
    )
    if (min < 1) return "agora"
    if (min < 60) return `há ${min} min`
    const h = Math.floor(min / 60)
    if (h < 24) return `há ${h}h`
    return `há ${Math.floor(h / 24)}d`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmail?.updated_at, tick])

  if (isLoading && !resp) {
    return <WorkspaceSkeleton />
  }

  if (error || !store) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center p-8 text-center"
        style={{ fontFamily: "var(--crm-font-sans)" }}
      >
        <h3
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
          }}
        >
          Loja não encontrada
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--crm-gray-500)",
            marginTop: 8,
          }}
        >
          Talvez tenha sido removida ou você não tem acesso.
        </p>
        <Link
          href="/admin/stores"
          className="mt-4 inline-flex items-center gap-1.5 rounded-[6px]"
          style={{
            height: 32,
            padding: "0 14px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Voltar para Lojas
        </Link>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
        overflow: "hidden",
        height: "100dvh",
      }}
    >
      {/* ─── TOPBAR ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "10px 24px",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-border)",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: 13, color: "var(--crm-gray-500)" }}
        >
          <Link href="/admin/onboarding" style={{ color: "var(--crm-gray-500)" }}>
            Onboarding
          </Link>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <Link
            href={`/admin/stores/${storeId}`}
            style={{ color: "var(--crm-gray-500)" }}
          >
            {store.store_name}
          </Link>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <span style={{ color: "var(--crm-gray-700)", fontWeight: 500 }}>
            {mode === "preview"
              ? "Produção piloto"
              : mode === "implementation"
                ? "Modo implementação"
                : "Workspace de produção"}
            {currentFlow ? ` · ${currentFlow.name}` : ""}
          </span>
          {currentFlow?.assignee?.name && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                marginLeft: 12,
                height: 22,
                padding: "0 8px",
                borderRadius: 4,
                background: "var(--crm-blue-50)",
                border: "1px solid var(--crm-blue-100)",
                color: "var(--crm-brand)",
                fontSize: 11,
                fontWeight: 600,
              }}
              title={`Responsável pelo flow: ${currentFlow.assignee.name}`}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--crm-brand)",
                }}
              />
              {currentFlow.assignee.name}
            </span>
          )}
          {taskContext &&
            taskContext.assigneeId &&
            taskContext.currentUserId &&
            taskContext.assigneeId === taskContext.currentUserId && (
              <span
                className="inline-flex items-center gap-1.5"
                style={{
                  marginLeft: 8,
                  height: 22,
                  padding: "0 8px",
                  borderRadius: 4,
                  background: "var(--crm-blue-50)",
                  border: "1px solid var(--crm-blue-100)",
                  color: "var(--crm-brand)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
                title={taskContext.taskTitle}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--crm-brand)",
                  }}
                />
                Task atribuída a você
              </span>
            )}
        </div>
        <div className="flex items-center gap-3">
          {lastUpdateMin && (
            <span
              style={{
                fontSize: 11,
                color: "var(--crm-gray-500)",
              }}
            >
              Salvo automaticamente · {lastUpdateMin}
            </span>
          )}
          {/* AE-20: Re-renderizar flow selecionado / loja inteira.
              Quando ha flow selecionado (selection.kind==='email'),
              dropdown oferece ambos os escopos. Caso contrario, so
              "loja inteira". */}
          {mode !== "implementation" && (
            <RerenderButton
              storeId={store.id}
              flowId={currentFlow?.id}
              flowName={currentFlow?.name}
            />
          )}
          <button
            onClick={
              onClose
                ? onClose
                : () => router.push(`/admin/stores/${storeId}`)
            }
            className="cf-focusable flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              border: 0,
              background: "transparent",
              color: "var(--crm-gray-500)",
              cursor: "pointer",
              borderRadius: 4,
            }}
            aria-label="Fechar"
            title={onClose ? "Voltar para a tarefa" : "Fechar workspace"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── BODY: sidebar + main ───────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* SIDEBAR */}
        <aside
          className="flex flex-col shrink-0 overflow-y-auto"
          style={{
            width: 268,
            background: "var(--crm-gray-0)",
            borderRight: "1px solid var(--crm-border)",
          }}
        >
          {/* Store hero card */}
          <div
            style={{
              padding: "16px 16px 14px",
              borderBottom: "1px solid var(--crm-gray-100)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <StoreAvatar name={store.store_name} brand={brand} />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--crm-gray-900)",
                  }}
                >
                  {store.store_name}
                </div>
                <div
                  className="truncate"
                  style={{
                    fontSize: 11,
                    color: "var(--crm-gray-500)",
                    marginTop: 1,
                  }}
                >
                  {store.niche || "—"}
                </div>
                {store.platform && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--crm-gray-400)",
                      marginTop: 2,
                      textTransform: "capitalize",
                    }}
                  >
                    {store.platform}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ações de geração — ocultas no handoff de implementação (ops só
              consome o que os designers produziram, não dispara geração). */}
          {mode !== "implementation" && (
            <>
              {/* Iniciar Onboarding (Epic AE) — pipeline completo de geracao */}
              <div style={{ padding: "12px 12px 4px" }}>
                <StartOnboardingButton
                  storeId={store.id}
                  briefingConfirmed={briefing?.status === "confirmed"}
                  className="w-full"
                />
              </div>

              {/* Gerar copies via n8n (legacy — apenas copy via webhook direto) */}
              <div style={{ padding: "4px 12px 4px" }}>
                <DispatchEmailCopiesButton storeId={store.id} flows={flows} />
              </div>

              {/* Re-sincronizar estrutura com a blueprint (sem gerar copy) */}
              <div style={{ padding: "0 12px 4px" }}>
                <ReconcileStructureButton storeId={store.id} onDone={() => mutate()} />
              </div>
            </>
          )}

          {/* Recursos do projeto */}
          <div style={{ padding: "12px 12px 8px" }}>
            <SidebarSectionLabel>Recursos do projeto</SidebarSectionLabel>
            <SidebarItem
              icon={<Heart className="h-3.5 w-3.5" />}
              label="Identidade visual"
              active={selection.kind === "resource" && selection.resource === "brand"}
              onClick={() => setSelection({ kind: "resource", resource: "brand" })}
            />
            <SidebarItem
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Briefing da loja"
              active={
                selection.kind === "resource" && selection.resource === "briefing"
              }
              onClick={() =>
                setSelection({ kind: "resource", resource: "briefing" })
              }
            />
          </div>

          {/* Estrutura dos emails */}
          <div style={{ padding: "8px 12px 16px" }}>
            <SidebarSectionLabel>Estrutura dos emails</SidebarSectionLabel>
            {/* AE-17: warning "Inicializar flows" removido — toda loja
                nova nasce com 7 flows + 38 emails via trigger SQL
                (`tr_seed_default_flows_on_store_insert`). Endpoint
                `/api/admin/stores/[id]/init-flows` continua disponível
                para reparo de loja legada (uso ops, não UI). */}
            {flows.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar email..."
                  style={{
                    width: "100%",
                    padding: "5px 10px",
                    background: "var(--crm-gray-50)",
                    border: "1px solid var(--crm-border)",
                    borderRadius: 4,
                    fontSize: 11.5,
                    color: "var(--crm-gray-800)",
                    outline: "none",
                  }}
                />
              </div>
            )}
            {filteredFlows.map((flow) => (
              <FlowItem
                key={flow.id}
                flow={flow}
                mode={mode}
                selection={selection}
                onSelectEmail={(emailId) =>
                  setSelection({ kind: "email", flowId: flow.id, emailId })
                }
                onCreated={(newEmailId) => {
                  mutate()
                  setSelection({ kind: "email", flowId: flow.id, emailId: newEmailId })
                }}
                onFlowChanged={() => mutate()}
              />
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Progresso geral */}
          <div
            style={{
              padding: "14px 16px",
              borderTop: "1px solid var(--crm-gray-100)",
            }}
          >
            <div
              className="flex items-baseline justify-between"
              style={{ marginBottom: 6 }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "var(--crm-gray-500)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Progresso geral
              </span>
              <span
                className="crm-tnum"
                style={{
                  fontSize: 11,
                  color: "var(--crm-gray-700)",
                  fontWeight: 600,
                }}
              >
                {overallProgress}%
              </span>
            </div>
            <div
              style={{
                height: 4,
                borderRadius: 2,
                background: "var(--crm-gray-100)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${overallProgress}%`,
                  background:
                    overallProgress === 100
                      ? "var(--crm-pos)"
                      : "var(--crm-brand)",
                  transition: "width 200ms ease",
                }}
              />
            </div>
            <div
              className="crm-tnum"
              style={{
                fontSize: 10,
                color: "var(--crm-gray-500)",
                marginTop: 4,
              }}
            >
              {emailsCounts.ready} de {emailsCounts.total} emails prontos
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selection.kind === "resource" && selection.resource === "brand" && (
            <BrandResourceView
              storeId={storeId}
              storeName={store.store_name}
              brand={brand}
              briefing={briefing}
              store={{
                id: store.id,
                store_name: store.store_name,
                store_url: store.store_url,
                platform: store.platform,
                niche: store.niche,
                language_label: store.language_label,
              }}
              topProductsSync={topProductsSync}
              onChanged={() => mutate()}
            />
          )}
          {selection.kind === "resource" && selection.resource === "briefing" && (
            <BriefingResourceView
              storeId={storeId}
              briefing={briefing}
              store={store}
              onChanged={() => mutate()}
            />
          )}
          {selection.kind === "email" &&
            currentEmail &&
            currentFlow &&
            mode === "implementation" && (
              <ImplementationView
                key={selection.emailId}
                storeId={storeId}
                flow={currentFlow}
                emailId={selection.emailId}
                esp={store.email_platform}
                storeName={store.store_name}
                languageLabel={store.language_label}
                onEmailUpdated={() => mutate()}
                onNavigate={(emailId) =>
                  setSelection({
                    kind: "email",
                    flowId: currentFlow.id,
                    emailId,
                  })
                }
              />
            )}
          {selection.kind === "email" &&
            currentEmail &&
            currentFlow &&
            mode !== "implementation" && (
            <EmailDetailView
              key={selection.emailId}
              storeId={storeId}
              flow={currentFlow}
              emailId={selection.emailId}
              onEmailUpdated={() => mutate()}
              onNavigate={(emailId) =>
                setSelection({
                  kind: "email",
                  flowId: currentFlow.id,
                  emailId,
                })
              }
              onEmailDeleted={() => {
                // Após delete, vai pro primeiro email do mesmo flow ou nenhum
                const others = (currentFlow.emails ?? []).filter(
                  (e) => e.id !== selection.emailId,
                )
                if (others.length > 0) {
                  setSelection({
                    kind: "email",
                    flowId: currentFlow.id,
                    emailId: others[0].id,
                  })
                } else {
                  setSelection({ kind: "none" })
                }
              }}
              onEmailDuplicated={async (newEmailId) => {
                await mutate()
                setSelection({
                  kind: "email",
                  flowId: currentFlow.id,
                  emailId: newEmailId,
                })
              }}
            />
          )}
          {selection.kind === "none" && (
            <div
              className="flex flex-1 items-center justify-center"
              style={{ color: "var(--crm-gray-500)" }}
            >
              Selecione um recurso ou e-mail na barra lateral.
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ─── Dispatch email copies (n8n) ────────────────────────────

function DispatchEmailCopiesButton({
  storeId,
  flows,
}: {
  storeId: string
  flows: EmailFlow[]
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [onlyDrafts, setOnlyDrafts] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(new Set(flows.map((f) => f.id)))
    }
  }, [open, flows])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const dispatch = async () => {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/dispatch-email-copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flow_ids: Array.from(selected),
          only_drafts: onlyDrafts,
        }),
      })
      const text = await res.text()
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(text) } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const data = (body?.data ?? body) as Record<string, unknown>
      if (!res.ok || data?.ok === false) {
        throw new Error((data?.reason as string) || (data?.error as string) || `HTTP ${res.status}`)
      }
      toast({
        title: "Geração iniciada",
        description: `${data.flow_count ?? 0} flow(s) · ${data.email_count ?? 0} email(s) enviados ao n8n.`,
      })
      setOpen(false)
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erro desconhecido"
      // Traduz os reasons crus do dispatch em mensagens acionáveis.
      const REASON_MESSAGES: Record<string, string> = {
        no_draft_emails:
          "Todos os emails desses flows já saíram de rascunho. Desmarque 'Apenas emails em draft' para regerar (substitui a copy existente).",
        no_emails:
          "Os flows selecionados não têm emails e não foi possível criar os defaults. Verifique os flows da loja.",
        no_flows: "A loja não tem flows. Inicialize os flows antes de gerar copies.",
        no_url_configured: "N8N_EMAIL_COPY_WEBHOOK_URL não configurada no ambiente.",
        store_not_found: "Loja não encontrada.",
        flows_query_failed: "Erro ao buscar flows no banco.",
        emails_query_failed: "Erro ao buscar emails no banco.",
      }
      toast({
        variant: "destructive",
        title: "Falha ao disparar",
        description: REASON_MESSAGES[raw] ?? raw,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={flows.length === 0}
        className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] text-white text-[12px] font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Wand2 className="h-3.5 w-3.5" />
        Gerar copies (n8n)
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-[440px] bg-white rounded-[10px] shadow-2xl border border-black/[0.08] flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06]">
              <h2 className="text-[15px] font-semibold text-slate-900">Disparar geração de copies</h2>
              <button
                type="button"
                onClick={() => !submitting && setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-2">
                  Flows ({selected.size} de {flows.length} selecionados)
                </label>
                <div className="space-y-1">
                  {flows.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 px-2.5 py-2 rounded-[5px] hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggle(f.id)}
                        className="h-3.5 w-3.5 rounded"
                      />
                      <span className="text-[13px] text-slate-800 flex-1">{f.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        {f.flow_type}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 px-2.5 py-2 rounded-[5px] hover:bg-slate-50 cursor-pointer border-t pt-3 border-slate-100">
                <input
                  type="checkbox"
                  checked={onlyDrafts}
                  onChange={(e) => setOnlyDrafts(e.target.checked)}
                  className="h-3.5 w-3.5 rounded"
                />
                <span className="text-[12px] text-slate-700">
                  Apenas emails em <strong>draft</strong> (não regerar copy_ready/ready)
                </span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] bg-slate-50/60">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={dispatch}
                disabled={submitting || selected.size === 0}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] text-white text-[12px] font-semibold disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? "Disparando..." : "Disparar webhook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ReconcileStructureButton({
  storeId,
  onDone,
}: {
  storeId: string
  onDone: () => void
}) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  const run = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/admin/stores/${storeId}/reconcile-blocks`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      )
      const text = await res.text()
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(text)
      } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const data = (body?.data ?? body) as Record<string, unknown>
      if (!res.ok || data?.ok === false) {
        throw new Error((data?.error as string) || `HTTP ${res.status}`)
      }
      const reconciled = (data.emails_reconciled as number) ?? 0
      const added = (data.blocks_added as number) ?? 0
      toast({
        title: reconciled > 0 ? "Estrutura atualizada" : "Já estava em dia",
        description:
          reconciled > 0
            ? `${reconciled} email(s) reconciliado(s) · ${added} bloco(s) adicionado(s). A copy existente foi preservada.`
            : "Nenhum email estava defasado em relação à blueprint.",
      })
      onDone()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Falha ao re-sincronizar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={submitting}
      title="Adiciona à estrutura os blocos que faltam da blueprint, sem gerar copy (preserva a copy existente)."
      className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-[6px] border border-black/[0.12] bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {submitting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      Re-sincronizar estrutura
    </button>
  )
}

// ─── Sidebar items ──────────────────────────────────────────

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--crm-gray-500)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "4px 8px 8px",
      }}
    >
      {children}
    </div>
  )
}

function SidebarItem({
  icon,
  label,
  active,
  onClick,
  disabled,
  rightSlot,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  rightSlot?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cf-focusable w-full flex items-center gap-2 text-left"
      style={{
        padding: "7px 10px",
        borderRadius: 6,
        background: active ? "var(--crm-blue-50)" : "transparent",
        color: disabled
          ? "var(--crm-gray-400)"
          : active
            ? "var(--crm-brand)"
            : "var(--crm-gray-700)",
        border: 0,
        cursor: disabled ? "default" : "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        marginBottom: 1,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled)
          e.currentTarget.style.background = "var(--crm-gray-50)"
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled)
          e.currentTarget.style.background = "transparent"
      }}
    >
      <span style={{ color: disabled ? "var(--crm-gray-300)" : "inherit" }}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {rightSlot}
    </button>
  )
}

function FlowItem({
  flow,
  mode,
  selection,
  onSelectEmail,
  onCreated,
  onFlowChanged,
}: {
  flow: EmailFlow
  mode: WorkspaceMode
  selection: Selection
  onSelectEmail: (emailId: string) => void
  onCreated: (newEmailId: string) => void
  onFlowChanged: () => void
}) {
  const FlowIcon = FLOW_ICONS[flow.flow_type] ?? Mail
  // Em preview, ignora status=blocked do banco: o piloto define o que aparece,
  // bloqueio real do flow nao se aplica nesse contexto. Em full, mantem.
  const isRealBlocked = mode !== "preview" && flow.status === "blocked"
  const isPreviewLocked = flow.preview_locked === true
  const isBlocked = isRealBlocked || isPreviewLocked
  // Flows sempre iniciam fechados; o usuário expande o que quiser.
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [unblocking, setUnblocking] = useState(false)
  const toast = useToast()

  const handleUnblock = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (unblocking) return
    setUnblocking(true)
    try {
      const res = await fetch(`/api/admin/email-flows/${flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao desbloquear")
      }
      toast.toast({ title: "Flow desbloqueado", description: flow.name })
      onFlowChanged()
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao desbloquear",
        description: (err as Error).message,
      })
    } finally {
      setUnblocking(false)
    }
  }

  const handleCreateEmail = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch(`/api/admin/email-flows/${flow.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao criar email")
      }
      const json = await res.json()
      const newEmail = json?.data?.email ?? json?.email
      if (newEmail?.id) {
        toast.toast({ title: "E-mail criado", description: newEmail.name })
        onCreated(newEmail.id)
      }
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao criar e-mail",
        description: (err as Error).message,
      })
    } finally {
      setCreating(false)
    }
  }

  const emails = flow.emails ?? []
  const total = emails.length
  const ready = emails.filter(
    (e) => e.status === "ready" || e.status === "approved" || e.status === "live",
  ).length

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        role={isBlocked ? undefined : "button"}
        tabIndex={isBlocked ? -1 : 0}
        onClick={() => !isBlocked && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!isBlocked && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        className="cf-focusable w-full flex items-center gap-2 text-left"
        style={{
          padding: "7px 10px",
          borderRadius: 6,
          background: "transparent",
          color: isBlocked ? "var(--crm-gray-400)" : "var(--crm-gray-700)",
          cursor: isBlocked ? "default" : "pointer",
          fontSize: 13,
          fontWeight: 500,
        }}
        onMouseEnter={(e) => {
          if (!isBlocked) e.currentTarget.style.background = "var(--crm-gray-50)"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent"
        }}
      >
        {!isBlocked ? (
          <ChevronDown
            className="h-3 w-3 shrink-0 transition-transform"
            style={{
              color: "var(--crm-gray-400)",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
        ) : (
          <Lock
            className="h-3 w-3 shrink-0"
            style={{ color: "var(--crm-gray-400)" }}
            aria-label={
              isPreviewLocked
                ? "Disponível apenas na produção completa"
                : "Flow bloqueado"
            }
          />
        )}
        <FlowIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">{flow.name}</span>
        {isRealBlocked && !isPreviewLocked ? (
          <button
            onClick={handleUnblock}
            disabled={unblocking}
            title="Desbloquear flow"
            style={{
              fontSize: 10,
              color: unblocking ? "var(--crm-gray-300)" : "var(--crm-brand)",
              fontWeight: 600,
              background: "transparent",
              border: 0,
              cursor: unblocking ? "default" : "pointer",
              padding: "0 4px",
            }}
          >
            {unblocking ? "..." : "Desbloquear"}
          </button>
        ) : !isBlocked && total > 0 ? (
          <span
            className="crm-tnum"
            style={{
              fontSize: 10,
              color: "var(--crm-gray-500)",
              fontWeight: 600,
            }}
          >
            {ready}/{total}
          </span>
        ) : null}
      </div>
      {open && !isBlocked && (
        <div style={{ paddingLeft: 12 }}>
          {emails.length === 0 && (
            <div
              style={{
                padding: "6px 10px 6px 14px",
                fontSize: 11,
                color: "var(--crm-gray-400)",
                fontStyle: "italic",
              }}
            >
              Sem emails ainda
            </div>
          )}
          {emails.map((email) => {
            const isActive =
              selection.kind === "email" && selection.emailId === email.id
            const isLocked = email.preview_locked === true
            return (
              <button
                key={email.id}
                onClick={() => !isLocked && onSelectEmail(email.id)}
                disabled={isLocked}
                title={
                  isLocked
                    ? "Disponivel apenas na producao completa"
                    : undefined
                }
                className="cf-focusable w-full flex items-center gap-2 text-left"
                style={{
                  padding: "6px 10px 6px 14px",
                  borderRadius: 6,
                  background: isActive ? "var(--crm-blue-50)" : "transparent",
                  color: isLocked
                    ? "var(--crm-gray-400)"
                    : isActive
                      ? "var(--crm-brand)"
                      : "var(--crm-gray-700)",
                  border: 0,
                  cursor: isLocked ? "default" : "pointer",
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !isLocked)
                    e.currentTarget.style.background = "var(--crm-gray-50)"
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = "transparent"
                }}
              >
                {isLocked ? (
                  <Lock
                    className="h-3 w-3 shrink-0"
                    style={{ color: "var(--crm-gray-400)" }}
                    aria-label="E-mail bloqueado no preview"
                  />
                ) : (
                  <EmailStatusDot status={email.status} />
                )}
                <span className="flex-1 truncate">
                  E-mail #{String(email.number).padStart(2, "0")} -{" "}
                  {email.name}
                </span>
                {!isLocked &&
                  email.progress_percent > 0 &&
                  email.status !== "ready" &&
                  email.status !== "approved" &&
                  email.status !== "live" && (
                    <span
                      className="crm-tnum"
                      style={{
                        fontSize: 10,
                        color: "var(--crm-gray-500)",
                      }}
                    >
                      {email.progress_percent}%
                    </span>
                  )}
                {!isLocked &&
                  (email.status === "ready" ||
                    email.status === "approved" ||
                    email.status === "live") && (
                    <span style={{ color: "var(--crm-pos)" }}>✓</span>
                  )}
              </button>
            )
          })}
          <button
            onClick={handleCreateEmail}
            disabled={creating}
            className="cf-focusable w-full flex items-center gap-2 text-left"
            style={{
              padding: "6px 10px 6px 14px",
              borderRadius: 6,
              background: "transparent",
              color: "var(--crm-gray-500)",
              border: 0,
              cursor: creating ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 500,
              fontStyle: "italic",
              opacity: creating ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!creating) e.currentTarget.style.background = "var(--crm-gray-50)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent"
            }}
          >
            <Plus className="h-3 w-3 shrink-0" />
            <span>{creating ? "Criando..." : "Adicionar e-mail"}</span>
          </button>
        </div>
      )}
    </div>
  )
}

function EmailStatusDot({
  status,
}: {
  status: EmailFlowEmail["status"]
}) {
  const color: Record<EmailFlowEmail["status"], string> = {
    draft: "var(--crm-gray-300)",
    in_progress: "var(--crm-brand)",
    copy_ready: "var(--crm-warn)",
    ready: "var(--crm-pos)",
    approved: "var(--crm-pos)",
    live: "var(--crm-pos)",
    // ── Epic AE: novos status de geracao ─────────────────
    pending: "var(--crm-gray-300)",
    copy_generating: "var(--crm-brand)",
    copy_generating_recovery: "var(--crm-brand)",
    rendering: "var(--crm-brand)",
    image_done: "var(--crm-brand)",
    qa_running: "var(--crm-brand)",
    failed: "var(--crm-neg)",
  }
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color[status],
        flexShrink: 0,
      }}
    />
  )
}

function StoreAvatar({
  name,
  brand,
}: {
  name: string
  brand: StoreBrandIdentity | null
}) {
  const primaryColor = brand?.colors_primary?.[0]?.hex ?? "#4E62D8"
  const initial = name.charAt(0).toUpperCase()
  return (
    <div
      className="flex items-center justify-center shrink-0 rounded-[8px]"
      style={{
        width: 36,
        height: 36,
        background: primaryColor,
        color: "#fff",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "-0.01em",
      }}
    >
      {initial}
    </div>
  )
}

function WorkspaceSkeleton() {
  return (
    <div
      className="flex h-full"
      style={{ background: "var(--crm-gray-50)" }}
    >
      <aside
        className="shrink-0 p-4 space-y-3"
        style={{
          width: 268,
          background: "var(--crm-gray-0)",
          borderRight: "1px solid var(--crm-border)",
        }}
      >
        <div
          className="rounded-[8px] animate-pulse"
          style={{ height: 64, background: "var(--crm-gray-100)" }}
        />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-[6px] animate-pulse"
            style={{ height: 28, background: "var(--crm-gray-100)" }}
          />
        ))}
      </aside>
      <main className="flex-1 p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded animate-pulse"
            style={{ height: 80, background: "var(--crm-gray-100)" }}
          />
        ))}
      </main>
    </div>
  )
}
