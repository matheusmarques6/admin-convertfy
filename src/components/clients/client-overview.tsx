"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  Pencil,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  ArrowRight,
  ShoppingCart,
  TrendingUp,
  Mail,
  Users,
  RefreshCw,
  ExternalLink,
  FileText,
  Eraser,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useSWRConfig } from "swr"
import { useAsaasPayments, useAsaasSubscriptions } from "@/lib/hooks/use-api-data"
import { useClientPerformanceContext, PERIODS } from "@/lib/hooks/use-client-performance"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Client, Contract, Meeting, User as UserType, Activity } from "@/types"

// ─── Types ────────────────────────────────────────────────

export interface ClientWithRelations extends Client {
  owner?: UserType
  contracts?: Contract[]
  client_stores?: { id: string; store_name: string; platform: string; is_active: boolean }[]
}

interface ClientOverviewProps {
  client: ClientWithRelations
  ltv?: number
}

// ─── helpers ──────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "agora mesmo"
  if (diffMin < 60) return `há ${diffMin} min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays} dia${diffDays > 1 ? "s" : ""}`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

const activityDotColors: Record<string, string> = {
  note_added: "bg-[#4E62D8]",
  email_sent: "bg-[#065F46]",
  whatsapp_sent: "bg-[#065F46]",
  status_changed: "bg-[#92400E]",
  payment_received: "bg-[#065F46]",
  payment_overdue: "bg-[#991B1B]",
  meeting_scheduled: "bg-[#4E62D8]",
  meeting_completed: "bg-[#065F46]",
  client_created: "bg-[#4E62D8]",
  client_updated: "bg-gray-400",
  report_uploaded: "bg-[#92400E]",
  deal_created: "bg-[#4E62D8]",
  deal_won: "bg-[#065F46]",
  deal_lost: "bg-[#991B1B]",
}

interface AsaasFinancialData {
  totalPaid: number
  totalPending: number
  totalOverdue: number
  hasSubscription: boolean
  subscriptionValue?: number
  nextDueDate?: string
}

// ─── Mini KPI Card ────────────────────────────────────────

function MiniKpiCard({
  icon: KpiIcon,
  label,
  value,
  sub,
  loading,
}: {
  icon: typeof ShoppingCart
  label: string
  value: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border bg-white dark:bg-[#1A1D27]",
        "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
        "p-4",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-[#8B92A5]">
          <KpiIcon className="h-3.5 w-3.5" />
          {label}
        </span>
      </div>
      {loading ? (
        <SkeletonShimmer className="h-7 w-32" />
      ) : (
        <p className="text-[20px] leading-tight font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
          {value}
        </p>
      )}
      {sub && !loading && (
        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-1">
          {sub}
        </p>
      )}
    </div>
  )
}

// ─── Performance Section (4 KPIs + Atribuição bar) ────────

export function ClientOverviewPerformance({ activeStoresCount }: { clientId: string; clientName: string; activeStoresCount?: number }) {
  const { data, loading, error, period, setPeriod, refresh, isValidating } =
    useClientPerformanceContext()

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Inicializa periodo da URL se existir
  useEffect(() => {
    const p = searchParams.get("perf_period")
    if (p && PERIODS.some((per) => per.value === p) && p !== period) {
      setPeriod(p)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persiste periodo na URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (period === "30d") params.delete("perf_period")
    else params.set("perf_period", period)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, pathname])

  const storeRevenue = data?.totals.storeRevenue ?? 0
  const attributedRevenue = data?.totals.attributedRevenue ?? data?.totals.klaviyoRevenue ?? 0
  const recoveryRate = data?.totals.recoveryRate ?? 0
  const totalCampaigns = (data?.totals.totalCampaigns ?? 0) + (data?.totals.totalFlows ?? 0)
  const orders = data?.totals.storeOrders ?? 0
  const avgOpen = data?.totals.avgOpenRate ?? 0
  const avgClick = data?.totals.avgClickRate ?? 0

  // Leads na base: usar Klaviyo (engaged + total) se disponível
  const totalLeads = useMemo(() => {
    if (!data?.stores) return 0
    return data.stores.reduce((acc, s) => acc + (s.klaviyo ? (s.klaviyo as unknown as Record<string, number>).totalLeads ?? 0 : 0), 0)
  }, [data])

  return (
    <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-semibold">Performance Convertfy · últimos {periodLabel(period)}</CardTitle>
          <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
            {activeStoresCount != null && activeStoresCount > 0
              ? `Resultados consolidados das ${activeStoresCount} loja${activeStoresCount !== 1 ? "s" : ""} ativa${activeStoresCount !== 1 ? "s" : ""}`
              : "Sem lojas ativas no período"}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <div className="inline-flex rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-[4px] transition-colors",
                  period === p.value
                    ? "bg-[#EEF0FB] text-[#2137B6] dark:bg-[#141C3D] dark:text-[#7B8CEA]"
                    : "text-gray-500 dark:text-[#8B92A5] hover:text-gray-900 dark:hover:text-[#EAEDF3]",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading || isValidating}
            className="h-7 w-7"
            title="Atualizar"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-[6px] p-3 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniKpiCard
            icon={ShoppingCart}
            label="Receita Total"
            value={formatCurrency(storeRevenue)}
            sub={orders > 0 ? `${orders.toLocaleString("pt-BR")} pedidos` : "sem pedidos no período"}
            loading={loading}
          />
          <MiniKpiCard
            icon={TrendingUp}
            label="Receita Atribuída"
            value={formatCurrency(attributedRevenue)}
            sub={storeRevenue > 0 ? `${recoveryRate.toFixed(2)}% do total` : undefined}
            loading={loading}
          />
          <MiniKpiCard
            icon={Mail}
            label="Campanhas & Flows"
            value={`${data?.totals.totalCampaigns ?? 0} / ${data?.totals.totalFlows ?? 0}`}
            sub={
              totalCampaigns > 0
                ? `Open ${avgOpen.toFixed(2)}% · CTR ${avgClick.toFixed(2)}%`
                : "sem envios"
            }
            loading={loading}
          />
          <MiniKpiCard
            icon={Users}
            label="Leads na base"
            value={totalLeads.toLocaleString("pt-BR")}
            sub={totalLeads > 0 ? `${totalLeads.toLocaleString("pt-BR")} contatos` : "sem dados"}
            loading={loading}
          />
        </div>

        {/* Atribuição bar */}
        {storeRevenue > 0 && (
          <div>
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <span className="text-gray-500 dark:text-[#8B92A5]">
                Atribuição Convertfy no faturamento
              </span>
              <span className="font-semibold text-[#2137B6] dark:text-[#7B8CEA] tabular-nums">
                {recoveryRate.toFixed(2)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.06)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#4E62D8] to-[#2137B6] rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, recoveryRate)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-[#5C6378] mt-1 tabular-nums">
              <span>R$ 0</span>
              <span>{formatRevenueShort(storeRevenue)} total</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function periodLabel(period: string): string {
  switch (period) {
    case "today": return "hoje"
    case "yesterday": return "ontem"
    case "7d": return "7 dias"
    case "15d": return "15 dias"
    case "30d": return "30 dias"
    case "90d": return "90 dias"
    case "custom": return "período"
    default: return period
  }
}

// R$ 1.449k em vez de R$ 1.449.000
function formatRevenueShort(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`
  return `R$ ${value.toFixed(0)}`
}

// ─── Linked Stores Card ───────────────────────────────────

interface OverviewStore {
  id: string
  store_name: string
  platform?: string | null
  currency?: string | null
  is_active: boolean
  store_url?: string | null
  health_score?: number | null
  revenue30d?: number
}

function StoreSummaryRow({
  store,
  clientId,
  onAbrir,
}: {
  store: OverviewStore
  clientId: string
  onAbrir: () => void
}) {
  const isOnboarding = !store.is_active
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 first:pt-0 last:pb-0",
        "border-b last:border-b-0 border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
      )}
    >
      <div className="w-9 h-9 rounded-[6px] bg-[#1F1F1F] dark:bg-[#0B0B0B] flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
        {store.store_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
            {store.store_name}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-semibold rounded-[4px]",
              isOnboarding
                ? "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]"
                : "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]",
            )}
          >
            <span className={cn("w-1 h-1 rounded-full", isOnboarding ? "bg-[#F59E0B]" : "bg-[#10B981]")} />
            {isOnboarding ? "Onboarding" : "Ativa"}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-0.5 truncate">
          {[store.platform, store.currency].filter(Boolean).join(" · ")}
          {store.store_url && (
            <>
              {" · "}
              <a
                href={store.store_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#4E62D8] dark:hover:text-[#7B8CEA] inline-flex items-center gap-0.5"
              >
                {store.store_url.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </>
          )}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
          Receita 30D
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
          {store.revenue30d && store.revenue30d > 0 ? formatCurrency(store.revenue30d) : "—"}
        </p>
      </div>
      {store.health_score != null && (
        <div className="text-right ml-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
            Saúde
          </p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              store.health_score >= 70
                ? "text-[#065F46] dark:text-[#6EE7B7]"
                : store.health_score >= 50
                  ? "text-[#92400E] dark:text-[#FCD34D]"
                  : "text-[#991B1B] dark:text-[#FCA5A5]",
            )}
          >
            {store.health_score}/100
          </p>
        </div>
      )}
      <Link
        href={`/admin/stores/${store.id}`}
        onClick={onAbrir}
        className="ml-3 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] text-xs font-medium text-gray-700 dark:text-[#EAEDF3] hover:bg-[#F3F4F6] dark:hover:bg-[rgba(255,255,255,0.04)] transition-colors"
      >
        Abrir
        <ArrowRight className="h-3 w-3" />
      </Link>
      <span className="sr-only">Cliente {clientId}</span>
    </div>
  )
}

// ─── NextStepCard: sugestao baseada no estado do cliente ──

function NextStepCard({
  client,
  activeContract,
  nextMeeting,
  pendingAmount,
  hasOnboardingStore,
}: {
  client: ClientWithRelations
  activeContract: Contract | null
  nextMeeting: Meeting | null
  pendingAmount: number
  hasOnboardingStore: boolean
}) {
  const suggestions: { icon: typeof CalendarDays; label: string; description: string; href: string; tone: "critical" | "warning" | "info" | "positive" }[] = []
  const healthScore = client.health_score ?? 50

  if (pendingAmount > 0) {
    suggestions.push({
      icon: AlertCircle,
      label: "Cobrar fatura pendente",
      description: `Há ${formatCurrency(pendingAmount)} em aberto. Reenvie o link ou marque como pago.`,
      href: `/admin/clients/${client.id}?tab=financial`,
      tone: "critical",
    })
  }

  if (hasOnboardingStore) {
    suggestions.push({
      icon: ExternalLink,
      label: "Concluir onboarding da loja",
      description: "Há ao menos 1 loja em onboarding aguardando configuração de integrações.",
      href: `/admin/clients/${client.id}?tab=stores&stores_filter=onboarding`,
      tone: "warning",
    })
  }

  if (!activeContract) {
    suggestions.push({
      icon: Pencil,
      label: "Criar contrato",
      description: "Cliente sem contrato ativo. Crie um para começar a cobrar.",
      href: `/admin/clients/${client.id}?tab=financial&fin_view=contracts`,
      tone: "warning",
    })
  }

  if (!nextMeeting) {
    suggestions.push({
      icon: CalendarDays,
      label: "Agendar próxima reunião",
      description: "Sem reunião agendada. Marque uma check-in periódica.",
      href: `/admin/meetings/new?clientId=${client.id}`,
      tone: "info",
    })
  }

  if (healthScore < 50) {
    suggestions.push({
      icon: AlertCircle,
      label: "Investigar risco de churn",
      description: `Health score em ${healthScore}/100. Revise métricas e abra um plano de retenção.`,
      href: `/admin/clients/${client.id}?tab=overview`,
      tone: "critical",
    })
  }

  // Se está tudo certo, sugere otimização
  if (suggestions.length === 0) {
    suggestions.push({
      icon: CheckCircle2,
      label: "Tudo em dia",
      description: "Sem ações urgentes. Bora gerar um relatório de performance?",
      href: `/admin/reports/new?clientId=${client.id}`,
      tone: "positive",
    })
  }

  const next = suggestions[0]
  const toneClasses = {
    critical: "bg-[#FEF2F2] dark:bg-[#3B1111] border-[#FECACA] dark:border-[rgba(252,165,165,0.3)] text-[#991B1B] dark:text-[#FCA5A5]",
    warning: "bg-[#FFFBEB] dark:bg-[#3D2A0D] border-[#FDE68A] dark:border-[rgba(252,211,77,0.3)] text-[#92400E] dark:text-[#FCD34D]",
    info: "bg-[#EEF0FB] dark:bg-[#141C3D] border-[#C7CDEF] dark:border-[rgba(123,140,234,0.3)] text-[#2137B6] dark:text-[#7B8CEA]",
    positive: "bg-[#ECFDF5] dark:bg-[#0B2C24] border-[#A7F3D0] dark:border-[rgba(110,231,183,0.3)] text-[#065F46] dark:text-[#6EE7B7]",
  }[next.tone]
  const NextIcon = next.icon

  return (
    <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Próximo passo sugerido</CardTitle>
        {suggestions.length > 1 && (
          <span className="text-[10px] text-gray-400 dark:text-[#5C6378]">
            +{suggestions.length - 1} {suggestions.length - 1 > 1 ? "sugestões" : "sugestão"}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <Link
          href={next.href}
          className={cn(
            "block rounded-[6px] border p-3 transition-colors hover:brightness-95",
            toneClasses,
          )}
        >
          <div className="flex items-start gap-2.5">
            <NextIcon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-tight">{next.label}</p>
              <p className="text-[11px] mt-1 leading-snug opacity-90">
                {next.description}
              </p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 mt-1 shrink-0" />
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

// ─── ClientOverview (new design) ──────────────────────────

export function ClientOverview({ client, ltv }: ClientOverviewProps) {
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [localTotalPaid, setLocalTotalPaid] = useState(0)
  const [localPendingAmount, setLocalPendingAmount] = useState(0)
  const [activeSubsCount, setActiveSubsCount] = useState(0)
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const clientCustomFields = client.custom_fields as Record<string, unknown> | null
  const [notes, setNotes] = useState((clientCustomFields?.notes as string) ?? "")
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [storeMetrics, setStoreMetrics] = useState<Record<string, { revenue30d: number; health: number }>>({})

  const { mutate: swrMutate } = useSWRConfig()
  const customFields = client.custom_fields as Record<string, string> | null
  const hasAsaasId = !!customFields?.asaas_customer_id
  const currentYear = useMemo(() => new Date().getFullYear(), [])

  const { data: paymentsRaw, isLoading: paymentsLoading } = useAsaasPayments(
    hasAsaasId ? client.id : null,
    currentYear,
  )
  const { data: subscriptionsRaw } = useAsaasSubscriptions(hasAsaasId ? client.id : null)

  const paymentsData = paymentsRaw as Record<string, unknown> | undefined
  const subscriptionsData = subscriptionsRaw as Record<string, unknown> | undefined

  const asaasData = useMemo<AsaasFinancialData | null>(() => {
    if (!paymentsData) return null
    const summary = (paymentsData.summary || (paymentsData.data as Record<string, unknown>)?.summary) as Record<string, number> | undefined
    if (!summary) return null
    const subs = (subscriptionsData?.subscriptions || (subscriptionsData?.data as Record<string, unknown>)?.subscriptions) as Array<{ isActive: boolean; value?: number; nextDueDate?: string }> | undefined
    const activeSub = subs?.find((s) => s.isActive)
    return {
      totalPaid: summary.paidValue || 0,
      totalPending: summary.pendingValue || 0,
      totalOverdue: summary.overdueValue || 0,
      hasSubscription: !!activeSub,
      subscriptionValue: activeSub?.value,
      nextDueDate: activeSub?.nextDueDate,
    }
  }, [paymentsData, subscriptionsData])

  const isLoadingAsaas = hasAsaasId && paymentsLoading

  // Load local data
  useEffect(() => {
    async function loadLocalData() {
      const supabase = createClient()
      const [contractsRes, invoicesRes, meetingsRes, activitiesRes, storesRes, subsRes] = await Promise.all([
        supabase.from("contracts").select("*").eq("client_id", client.id).eq("status", "active").limit(1),
        supabase.from("unified_invoices").select("amount, status").eq("client_id", client.id).limit(50),
        supabase
          .from("meetings")
          .select("*")
          .eq("client_id", client.id)
          .eq("status", "scheduled")
          .gt("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1),
        supabase
          .from("activities")
          .select("*")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("store_revenue_summary")
          .select("store_id, store_total_revenue, period_label")
          .eq("period_label", "30d")
          .in(
            "store_id",
            (client.client_stores ?? []).map((s) => s.id),
          ),
        supabase
          .from("client_subscriptions")
          .select("id, status")
          .eq("client_id", client.id)
          .eq("status", "active"),
      ])
      setActiveContract(contractsRes.data?.[0] || null)
      const invoices = invoicesRes.data || []
      setLocalTotalPaid(
        invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.amount), 0),
      )
      setLocalPendingAmount(
        invoices
          .filter((i) => i.status === "pending" || i.status === "overdue")
          .reduce((sum, i) => sum + Number(i.amount), 0),
      )
      setNextMeeting(meetingsRes.data?.[0] || null)
      setActivities(activitiesRes.data || [])
      setActiveSubsCount(subsRes.data?.length ?? 0)
      setLocalLoading(false)
      setActivitiesLoading(false)

      // Store metrics map
      const metrics: Record<string, { revenue30d: number; health: number }> = {}
      for (const row of storesRes.data ?? []) {
        metrics[row.store_id] = {
          revenue30d: Number(row.store_total_revenue ?? 0),
          health: 0,
        }
      }
      setStoreMetrics(metrics)
    }
    loadLocalData()
  }, [client.id, client.client_stores])

  const totalPaid = asaasData?.totalPaid ?? localTotalPaid
  const pendingAmount = asaasData
    ? asaasData.totalPending + asaasData.totalOverdue
    : localPendingAmount

  async function handleSaveNotes() {
    setIsSavingNotes(true)
    try {
      const supabase = createClient()
      const updatedFields = { ...(client.custom_fields ?? {}), notes }
      await supabase.from("clients").update({ custom_fields: updatedFields }).eq("id", client.id)
      setIsEditingNotes(false)
    } finally {
      setIsSavingNotes(false)
    }
  }

  async function handleClearCache() {
    setIsClearingCache(true)
    try {
      // Invalida cache de relatórios das lojas (cache 35min do Omnisend)
      const storeIds = (client.client_stores ?? []).map((s) => s.id)
      const results = await Promise.allSettled(
        storeIds.flatMap((id) => [
          fetch(`/api/integrations/email-platform/report?store_id=${id}&period=30d&force_refresh=true`, {
            cache: "no-store",
          }),
          fetch(`/api/integrations/shopify/report?store_id=${id}&period=30d&force_refresh=true`, {
            cache: "no-store",
          }),
        ]),
      )
      const failed = results.filter((r) => r.status === "rejected").length

      // Invalida SWR cache de todas queries deste cliente (revalida sem reload)
      await swrMutate(
        (key) => typeof key === "string" && (
          key.includes(`store_id=${storeIds.join(",")}`) ||
          key.includes(`/api/integrations/`) ||
          key.includes(`/api/clients/${client.id}`) ||
          storeIds.some((id) => key.includes(`store_id=${id}`))
        ),
        undefined,
        { revalidate: true },
      )

      if (failed > 0) {
        toast({
          variant: "destructive",
          title: "Cache parcialmente limpo",
          description: `${failed} requisição(ões) falharam, mas o resto foi atualizado.`,
        })
      } else {
        toast({
          title: "Cache limpo",
          description: "Métricas recarregadas.",
        })
      }
    } catch {
      toast({ variant: "destructive", title: "Erro ao limpar cache" })
    } finally {
      setIsClearingCache(false)
    }
  }

  function handleGenerateReport() {
    setIsGeneratingReport(true)
    // Redirect to report builder with client preselected
    window.location.href = `/admin/reports/new?clientId=${client.id}`
  }

  // Stores list
  const linkedStores: OverviewStore[] = (client.client_stores ?? []).map((s) => ({
    id: s.id,
    store_name: s.store_name,
    platform: s.platform,
    is_active: s.is_active,
    health_score: undefined,
    revenue30d: storeMetrics[s.id]?.revenue30d,
  }))

  // Build address string
  const addressObj = clientCustomFields?.address as Record<string, string> | undefined
  const addressParts = addressObj
    ? [
        [addressObj.street, addressObj.number].filter(Boolean).join(", "),
        addressObj.complement,
        addressObj.neighborhood,
        [addressObj.city, addressObj.state].filter(Boolean).join(" - "),
        addressObj.postal_code,
      ].filter(Boolean)
    : []

  // Custom fields
  const displayCustomFields = client.custom_fields
    ? Object.entries(client.custom_fields).filter(
        ([key]) =>
          !key.startsWith("asaas_") &&
          key !== "cpf_cnpj" &&
          key !== "address" &&
          key !== "notes",
      )
    : []

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Visão Geral
          </h2>
          <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
            Snapshot estratégico de {client.name.split(" ")[0]} · performance consolidada de {linkedStores.length} loja{linkedStores.length !== 1 ? "s" : ""}, atividade recente e relacionamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearCache}
            disabled={isClearingCache}
          >
            {isClearingCache ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Eraser className="h-3.5 w-3.5 mr-1.5" />
            )}
            Limpar cache
          </Button>
          <Button
            size="sm"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
          >
            {isGeneratingReport ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 mr-1.5" />
            )}
            Gerar relatório
          </Button>
        </div>
      </div>

    <div className="grid gap-5 lg:grid-cols-5">
      {/* Left column 3/5 — Performance, Stores, Activity */}
      <div className="lg:col-span-3 space-y-5">
        <ClientOverviewPerformance
          clientId={client.id}
          clientName={client.name}
          activeStoresCount={(client.client_stores ?? []).filter((s) => s.is_active).length}
        />

        {/* Lojas vinculadas */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">
                Lojas vinculadas{" "}
                <span className="text-gray-400 dark:text-[#5C6378] font-normal">
                  ({linkedStores.length})
                </span>
              </CardTitle>
              <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                Performance e status de cada loja deste cliente
              </p>
            </div>
            <Link
              href={`/admin/clients/${client.id}?tab=stores`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
            >
              Ver todas
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {linkedStores.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-6">
                Nenhuma loja vinculada.
              </p>
            ) : (
              <div>
                {linkedStores.map((store) => (
                  <StoreSummaryRow
                    key={store.id}
                    store={store}
                    clientId={client.id}
                    onAbrir={() => {}}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Atividades recentes */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Atividade recente</CardTitle>
              <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                Últimas interações do time com este cliente
              </p>
            </div>
            <Link
              href={`/admin/clients/${client.id}?tab=timeline`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
            >
              Ver timeline
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {activitiesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <SkeletonShimmer className="w-2 h-2 rounded-full mt-2 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <SkeletonShimmer className="h-4 w-full" />
                      <SkeletonShimmer className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-6">
                Nenhuma atividade registrada.
              </p>
            ) : (
              <div className="space-y-0">
                {activities.map((activity, index) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0 mt-2",
                          activityDotColors[activity.type] ?? "bg-gray-300",
                        )}
                      />
                      {index < activities.length - 1 && (
                        <div className="w-px flex-1 bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.08)] min-h-[24px]" />
                      )}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-[#EAEDF3] leading-snug">
                        {activity.description}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                        {formatRelativeTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Endereço */}
        {addressParts.length > 0 && (
          <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Endereço</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 dark:text-[#EAEDF3] leading-relaxed">
                {addressParts.join(" — ")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Notas */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Notas internas</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={isEditingNotes ? handleSaveNotes : () => setIsEditingNotes(true)}
              disabled={isSavingNotes}
            >
              {isSavingNotes ? (
                <Icon icon={Loader2} customSize={14} className="animate-spin mr-1" />
              ) : (
                <Icon icon={isEditingNotes ? Check : Pencil} customSize={14} className="mr-1" />
              )}
              {isEditingNotes ? "Salvar" : "Editar"}
            </Button>
          </CardHeader>
          <CardContent>
            {isEditingNotes ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(
                  "w-full min-h-[100px] rounded-[6px] px-3 py-2 text-sm resize-y",
                  "bg-white border border-[rgba(0,0,0,0.08)] text-gray-700",
                  "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)] dark:text-[#EAEDF3]",
                  "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
                  "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
                  "placeholder:text-gray-400 dark:placeholder:text-[#5C6378]",
                )}
                placeholder="Adicionar notas sobre o cliente..."
              />
            ) : (
              <p
                className={cn(
                  "text-sm leading-relaxed whitespace-pre-wrap",
                  notes
                    ? "text-gray-700 dark:text-[#EAEDF3]"
                    : "text-gray-400 dark:text-[#5C6378] italic",
                )}
              >
                {notes || "Nenhuma nota adicionada."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right column 2/5 — Sidebar */}
      <div className="lg:col-span-2 space-y-5">
        {/* Próximo passo sugerido */}
        <NextStepCard
          client={client}
          activeContract={activeContract}
          nextMeeting={nextMeeting}
          pendingAmount={pendingAmount}
          hasOnboardingStore={(client.client_stores ?? []).some((s) => !s.is_active)}
        />

        {/* Próxima reunião */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Próxima reunião</CardTitle>
          </CardHeader>
          <CardContent>
            {localLoading ? (
              <SkeletonShimmer className="h-16 w-full" />
            ) : nextMeeting ? (
              <div>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-[6px] bg-[#EEF0FB] dark:bg-[#141C3D] flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-semibold uppercase text-[#2137B6] dark:text-[#7B8CEA]">
                      {new Date(nextMeeting.scheduled_at)
                        .toLocaleDateString("pt-BR", { month: "short" })
                        .replace(".", "")}
                    </span>
                    <span className="text-base font-semibold text-[#2137B6] dark:text-[#7B8CEA] leading-none">
                      {new Date(nextMeeting.scheduled_at).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                        {nextMeeting.title}
                      </p>
                      {(() => {
                        const days = Math.ceil(
                          (new Date(nextMeeting.scheduled_at).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24),
                        )
                        if (days < 0) return null
                        return (
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-medium px-1.5 py-0 rounded-[4px] border",
                              days === 0
                                ? "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA] dark:bg-[#3B1111] dark:text-[#FCA5A5] dark:border-[rgba(252,165,165,0.3)]"
                                : days <= 3
                                  ? "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A] dark:bg-[#3D2A0D] dark:text-[#FCD34D] dark:border-[rgba(252,211,77,0.3)]"
                                  : "bg-[#EEF0FB] text-[#2137B6] border-[#C7CDEF] dark:bg-[#141C3D] dark:text-[#7B8CEA] dark:border-[rgba(123,140,234,0.3)]",
                            )}
                          >
                            {days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days}d`}
                          </span>
                        )
                      })()}
                    </div>
                    <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                      {new Date(nextMeeting.scheduled_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {client.owner && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={client.owner.avatar_url} />
                          <AvatarFallback className="text-[8px]">
                            {getInitials(client.owner.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] text-gray-500 dark:text-[#8B92A5]">
                          {client.owner.name.split(" ")[0]} · Google Meet
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {nextMeeting.meeting_url ? (
                    <Button variant="primary" size="sm" className="flex-1" asChild>
                      <a href={nextMeeting.meeting_url} target="_blank" rel="noopener noreferrer">
                        <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                        Adicionar à agenda
                      </a>
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" className="flex-1" asChild>
                      <Link href={`/admin/meetings?meetingId=${nextMeeting.id}`}>
                        <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                        Ver reunião
                      </Link>
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/admin/meetings?meetingId=${nextMeeting.id}`}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Reagendar
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-sm text-gray-400 dark:text-[#5C6378] mb-2">
                  Nenhuma reunião agendada
                </p>
                <Button variant="secondary" size="sm" asChild>
                  <Link href={`/admin/meetings/new?clientId=${client.id}`}>
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                    Agendar reunião
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plano & Cobrança */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">Plano & Cobrança</CardTitle>
              {isLoadingAsaas ? (
                <Icon icon={Loader2} customSize={14} className="animate-spin text-gray-400" />
              ) : hasAsaasId ? (
                <Badge variant="positive" className="text-[10px]">
                  <Icon icon={CheckCircle2} customSize={12} className="mr-1" /> Asaas
                </Badge>
              ) : null}
            </div>
            <Link
              href={`/admin/clients/${client.id}?tab=financial`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
            >
              Ver financeiro
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {isLoadingAsaas ? (
              <div className="space-y-3">
                <SkeletonShimmer className="h-5 w-32" />
                <SkeletonShimmer className="h-5 w-24" />
                <SkeletonShimmer className="h-4 w-20" />
              </div>
            ) : (
              <div className="space-y-3">
                {(activeContract || asaasData?.hasSubscription || hasAsaasId) && (
                  <div className="rounded-[6px] p-3 bg-[#ECFDF5] dark:bg-[#0B2C24] border border-[#A7F3D0] dark:border-[rgba(110,231,183,0.3)]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#065F46] dark:text-[#6EE7B7]" />
                      <p className="text-[12px] font-medium text-[#065F46] dark:text-[#6EE7B7]">
                        {asaasData?.hasSubscription ? "Assinatura ativa via Asaas" : activeContract ? "Contrato ativo" : "Cliente cadastrado no Asaas"}
                      </p>
                    </div>
                    {hasAsaasId && (
                      <p className="text-[10px] font-mono mt-1 text-[#065F46] dark:text-[#6EE7B7] truncate">
                        {customFields?.asaas_customer_id}
                      </p>
                    )}
                  </div>
                )}

                <dl className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Plano</dt>
                    <dd className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                      {activeContract?.plan_name ?? (asaasData?.hasSubscription ? "Assinatura Asaas" : "—")}
                      {activeContract?.end_date && (
                        <span className="text-gray-400 dark:text-[#5C6378] ml-1">
                          · {Math.max(0, Math.ceil((new Date(activeContract.end_date).getTime() - Date.now()) / (1000*60*60*24*30)))}m
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">MRR</dt>
                    <dd className="text-[13px] font-semibold text-[#065F46] dark:text-[#6EE7B7] tabular-nums">
                      {formatCurrency(asaasData?.subscriptionValue || activeContract?.monthly_value || 0)}
                    </dd>
                  </div>
                  <div className="flex justify-between items-center">
                    <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Total pago</dt>
                    <dd className="text-[13px] font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
                      {formatCurrency(totalPaid)}
                    </dd>
                  </div>
                  {pendingAmount > 0 && (
                    <div className="flex justify-between items-center">
                      <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Pendente</dt>
                      <dd className="text-[13px] font-semibold text-[#92400E] dark:text-[#FCD34D] tabular-nums">
                        {formatCurrency(pendingAmount)}
                      </dd>
                    </div>
                  )}
                  {asaasData?.nextDueDate && (
                    <div className="flex justify-between items-center">
                      <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Próxima fatura</dt>
                      <dd className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3] tabular-nums">
                        {formatCurrency(asaasData.subscriptionValue ?? 0)}
                        <span className="text-gray-400 dark:text-[#5C6378] ml-1">
                          · {formatDate(asaasData.nextDueDate)}
                        </span>
                      </dd>
                    </div>
                  )}
                  {activeSubsCount > 0 && (
                    <div className="flex justify-between items-center">
                      <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Assinaturas</dt>
                      <dd className="text-[13px] font-medium text-gray-900 dark:text-[#EAEDF3]">
                        {activeSubsCount} ativa{activeSubsCount !== 1 ? "s" : ""}
                      </dd>
                    </div>
                  )}
                  {ltv != null && ltv > 0 && (
                    <div className="flex justify-between items-center">
                      <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">LTV acumulado</dt>
                      <dd className="text-[13px] font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
                        {formatCurrency(ltv)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campos personalizados */}
        {displayCustomFields.length > 0 && (
          <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Campos personalizados</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5">
                {displayCustomFields.map(([key, value]) => (
                  <div key={key} className="flex justify-between items-start gap-3">
                    <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5] capitalize">
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd className="text-[12px] font-medium text-gray-900 dark:text-[#EAEDF3] text-right truncate max-w-[60%]">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </dd>
                  </div>
                ))}
                {client.tags && client.tags.length > 0 && (
                  <div className="flex justify-between items-start gap-3">
                    <dt className="text-[12px] text-gray-500 dark:text-[#8B92A5]">Tags</dt>
                    <dd className="text-[12px] font-medium text-gray-900 dark:text-[#EAEDF3] text-right">
                      {client.tags.join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
    </div>
  )
}
