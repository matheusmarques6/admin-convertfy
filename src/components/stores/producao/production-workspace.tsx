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
  Lock,
  Mail,
  Package,
  Plus,
  Send,
  ShoppingCart,
  TrendingDown,
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
import { BrandResourceView } from "./brand-resource-view"
import { BriefingResourceView } from "./briefing-resource-view"

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${r.status}`)
  }
  return json
}

interface WorkspaceResponse {
  store: {
    id: string
    store_name: string
    store_url: string | null
    platform: string | null
    niche: string | null
    clients?: { id: string; name: string }
  }
  brand: StoreBrandIdentity | null
  briefing: StoreBriefing | null
  flows: EmailFlow[]
}

interface ProductionWorkspaceProps {
  storeId: string
  initialResource: string | null
  initialFlow: string | null
  initialEmail: string | null
}

// Tipo da seleção atual
type Selection =
  | { kind: "resource"; resource: "brand" | "briefing" }
  | { kind: "email"; flowId: string; emailId: string }
  | { kind: "none" }

const FLOW_ICONS: Record<FlowType, typeof Send> = {
  welcome: Send,
  abandoned_cart: ShoppingCart,
  browse_abandonment: TrendingDown,
  post_purchase: Package,
  win_back: Heart,
  custom: Mail,
}

export function ProductionWorkspace({
  storeId,
  initialResource,
  initialFlow,
  initialEmail,
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
  const flows = useMemo(() => resp?.flows ?? [], [resp?.flows])

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

  // Auto-select primeiro item disponível quando carrega
  useEffect(() => {
    if (!resp || selection.kind !== "none") return
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
  }, [resp, selection.kind, brand, briefing, flows])

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
      className="flex h-full flex-col"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
        overflow: "hidden",
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
            Workspace de produção
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
          <button
            onClick={() => router.push(`/admin/stores/${storeId}`)}
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
            title="Fechar workspace"
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
            {flows.length === 0 && (
              <InitFlowsCta storeId={storeId} onCreated={() => mutate()} />
            )}
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
              onChanged={() => mutate()}
            />
          )}
          {selection.kind === "resource" && selection.resource === "briefing" && (
            <BriefingResourceView
              storeId={storeId}
              briefing={briefing}
              onChanged={() => mutate()}
            />
          )}
          {selection.kind === "email" && currentEmail && currentFlow && (
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
  selection,
  onSelectEmail,
  onCreated,
  onFlowChanged,
}: {
  flow: EmailFlow
  selection: Selection
  onSelectEmail: (emailId: string) => void
  onCreated: (newEmailId: string) => void
  onFlowChanged: () => void
}) {
  const FlowIcon = FLOW_ICONS[flow.flow_type] ?? Mail
  const isBlocked = flow.status === "blocked"
  const expanded = !isBlocked
  const [open, setOpen] = useState(expanded)
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
          />
        )}
        <FlowIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">{flow.name}</span>
        {isBlocked ? (
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
        ) : total > 0 ? (
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
            return (
              <button
                key={email.id}
                onClick={() => onSelectEmail(email.id)}
                className="cf-focusable w-full flex items-center gap-2 text-left"
                style={{
                  padding: "6px 10px 6px 14px",
                  borderRadius: 6,
                  background: isActive ? "var(--crm-blue-50)" : "transparent",
                  color: isActive
                    ? "var(--crm-brand)"
                    : "var(--crm-gray-700)",
                  border: 0,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = "var(--crm-gray-50)"
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = "transparent"
                }}
              >
                <EmailStatusDot status={email.status} />
                <span className="flex-1 truncate">
                  E-mail #{String(email.number).padStart(2, "0")} -{" "}
                  {email.name}
                </span>
                {email.progress_percent > 0 &&
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
                {(email.status === "ready" ||
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
  const color = {
    draft: "var(--crm-gray-300)",
    in_progress: "var(--crm-brand)",
    ready: "var(--crm-pos)",
    approved: "var(--crm-pos)",
    live: "var(--crm-pos)",
  }[status]
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
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

function InitFlowsCta({
  storeId,
  onCreated,
}: {
  storeId: string
  onCreated: () => void
}) {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const handle = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/init-flows`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || body?.error || "Falha ao inicializar")
      }
      const json = await res.json()
      const created = json?.data?.created ?? json?.created ?? 0
      toast.toast({
        title: `${created} flow(s) criados`,
        description: "Welcome ja esta em andamento — outros vem bloqueados",
      })
      onCreated()
    } catch (e) {
      toast.toast({
        variant: "destructive",
        title: "Erro ao inicializar flows",
        description: (e as Error).message,
      })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      style={{
        padding: "12px 10px",
        background: "var(--crm-gray-50)",
        border: "1px dashed var(--crm-border)",
        borderRadius: 6,
        textAlign: "center",
        marginBottom: 4,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--crm-gray-600)",
          marginBottom: 8,
          lineHeight: 1.4,
        }}
      >
        Esta loja ainda não tem os 5 flows padrão de onboarding.
      </div>
      <button
        onClick={handle}
        disabled={busy}
        className="cf-focusable"
        style={{
          width: "100%",
          height: 28,
          background: busy ? "var(--crm-gray-100)" : "var(--crm-brand)",
          color: busy ? "var(--crm-gray-400)" : "var(--crm-brand-fg)",
          border: 0,
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <Plus className="h-3 w-3" />
        {busy ? "Criando..." : "Inicializar flows"}
      </button>
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
