"use client"

import { useState, useEffect, useMemo } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { useAsaasPayments, useAsaasSubscriptions } from "@/lib/hooks/use-api-data"
import Image from "next/image"
import {
  DollarSign,
  Plus,
  RefreshCw,
  Loader2,
  Receipt,
  CreditCard,
  QrCode,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Copy,
  ExternalLink,
  Repeat,
  Edit2,
  Building2,
  Wallet,
  MoreVertical,
  Trash2,
  Ban,
  Send,
  Download,
  Store,
  Tags,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  CHARGE_TYPE_LABELS,
  describeCharge,
  inferChargeType,
  inferReferenceMonths,
  isChargeType,
  monthsLabel,
  type ChargeType,
} from "@/lib/services/charge-description"
import { defaultReferenceMonths, monthLabel, monthOptionsFor } from "@/lib/services/call-coverage"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/lib/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { centsToReais } from "@/lib/currency"
import { CurrencyInput } from "@/components/ui/currency-input"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface ClientFinancialProps {
  clientId: string
  clientName: string
}

interface Payment {
  id: string
  value: number
  status: string
  billingType: string
  dueDate: string
  paymentDate?: string
  description?: string
  invoiceUrl?: string
  paymentMethod?: string
  manualStatus?: string
}

interface Subscription {
  id: string
  value: number
  status: string
  statusLabel: string
  cycle: string
  cycleLabel: string
  nextDueDate: string
  description?: string
  isActive: boolean
  paymentMethod?: string
}

interface LocalSubscription {
  id: string
  client_id: string
  name: string
  value: number
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY"
  payment_method: "asaas" | "pix_direto" | "wise" | "boleto"
  status: "active" | "inactive" | "cancelled"
  start_date: string
  next_due_date: string
  notes?: string
  created_at: string
  asaas_subscription_id?: string | null
}

interface LocalCharge {
  id: string
  client_id: string
  subscription_id?: string
  description: string
  value: number
  due_date: string
  payment_date?: string
  status: "pending" | "paid" | "overdue" | "cancelled"
  payment_method: "asaas" | "pix_direto" | "wise" | "boleto" | "cartao"
  actual_payment_method?: string
  notes?: string
  created_at: string
  charge_type?: ChargeType | null
  reference_months?: string[] | null
  store_id?: string | null
  /** Várias lojas (comissão conjunta — migration 20261118). Vence store_id. */
  store_ids?: string[] | null
}

/** Lojas efetivas de uma cobrança: `store_ids` vence; senão `[store_id]`. */
function storeIdsOf(row: { store_id?: string | null; store_ids?: string[] | null } | null | undefined): string[] {
  if (!row) return []
  if (Array.isArray(row.store_ids) && row.store_ids.length > 0) return row.store_ids
  return row.store_id ? [row.store_id] : []
}

/** Loja do cliente (para vincular assinatura/cobrança). */
interface ClientStoreLite {
  id: string
  store_name: string
  is_active: boolean | null
}

/** Classificação do espelho local de uma fatura Asaas (`invoices`). */
interface InvoiceMeta {
  id: string
  charge_type: ChargeType | null
  reference_months: string[] | null
  store_id: string | null
  store_ids: string[] | null
}

/**
 * Chips de mês (YYYY-MM) — "esta cobrança é referente a que mês?".
 * Opções: o mês do vencimento e os 11 anteriores, mais recente primeiro.
 */
function MonthChips({
  reference,
  value,
  onChange,
  disabled,
}: {
  reference: string
  value: string[]
  onChange: (months: string[]) => void
  disabled?: boolean
}) {
  const options = monthOptionsFor(`${reference}T12:00:00`, 12)
  const toggle = (m: string) =>
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort())
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((m) => {
        const on = value.includes(m)
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => toggle(m)}
            className={cn(
              "h-7 px-2.5 rounded-[6px] border text-[12px] font-medium tabular-nums transition-colors",
              on
                ? "bg-[#1F1F1F] text-white border-[#1F1F1F]"
                : "bg-white dark:bg-transparent text-gray-700 dark:text-[#EAEDF3] border-[rgba(0,0,0,0.12)] dark:border-[rgba(255,255,255,0.12)] hover:bg-gray-50",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {monthLabel(m)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Linha "Lojas" do card da assinatura: quais lojas ela cobre. Sem
 * vínculo em cliente multi-loja é o caso que a carteira não consegue
 * atribuir — por isso o aviso e o botão.
 */
function SubscriptionStoresRow({
  storeIds,
  storeNameById,
  clientStoreCount,
  onLink,
}: {
  storeIds: string[]
  storeNameById: Record<string, string>
  clientStoreCount: number
  onLink: () => void
}) {
  return (
    <div className="flex justify-between gap-2 pt-1.5 mt-1.5 border-t border-dashed border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
      <span className="text-muted-foreground shrink-0">Lojas</span>
      <span className="flex flex-wrap justify-end gap-1 min-w-0">
        {storeIds.length > 0 ? (
          storeIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-medium rounded-[4px] bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.06)] text-gray-700 dark:text-[#EAEDF3]"
            >
              <Store className="h-3 w-3" />
              {storeNameById[id] ?? "Loja"}
            </span>
          ))
        ) : (
          <button
            type="button"
            onClick={onLink}
            className={cn(
              "text-[11px] font-medium underline-offset-2 hover:underline",
              clientStoreCount > 1 ? "text-[#92400E] dark:text-[#FCD34D]" : "text-[#4E62D8]",
            )}
          >
            {clientStoreCount > 1 ? "Sem loja — vincular" : "Vincular loja"}
          </button>
        )}
      </span>
    </div>
  )
}

/** Checkboxes das lojas do cliente (vínculo de assinatura). */
function StoreCheckboxList({
  stores,
  value,
  onChange,
}: {
  stores: ClientStoreLite[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="rounded-[6px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] divide-y divide-[rgba(0,0,0,0.06)] dark:divide-[rgba(255,255,255,0.06)]">
      {stores.map((s) => {
        const checked = value.includes(s.id)
        return (
          <label
            key={s.id}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer hover:bg-gray-50 dark:hover:bg-[rgba(255,255,255,0.03)]"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) =>
                onChange(v ? [...value, s.id] : value.filter((id) => id !== s.id))
              }
            />
            <span className={cn("flex-1", s.is_active === false && "text-muted-foreground")}>
              {s.store_name}
              {s.is_active === false ? " (inativa)" : ""}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Badge do tipo + meses + loja(s) de uma cobrança. */
function ChargeClassBadges({
  chargeType,
  months,
  storeNames,
}: {
  chargeType?: ChargeType | null
  months?: string[] | null
  /** Uma loja, ou várias quando a comissão cobre mais de uma. */
  storeNames?: string[]
}) {
  const label = chargeType && isChargeType(chargeType) ? CHARGE_TYPE_LABELS[chargeType] : null
  const ml = monthsLabel(months)
  const storeName = storeNames && storeNames.length > 0 ? storeNames.join(" · ") : null
  if (!label && !ml && !storeName) return null
  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {label && (
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0 text-[10px] font-semibold rounded-[4px] border",
            chargeType === "commission"
              ? "bg-[#EEF0FB] text-[#2137B6] border-[#C7CDEF]"
              : chargeType === "subscription"
                ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
                : "bg-[#F3F4F6] text-gray-600 border-[#E5E7EB]",
          )}
        >
          {label}
          {ml ? ` · ${ml}` : ""}
        </span>
      )}
      {storeName && (
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-[#8B92A5]" title={storeName}>
          <Store className="h-3 w-3" />
          {storeName}
          {(storeNames?.length ?? 0) > 1 ? ` (${storeNames!.length} lojas)` : ""}
        </span>
      )}
    </div>
  )
}

interface Contract {
  id: string
  plan_name: string
  monthly_value: number
  status: string
  start_date: string
  end_date?: string
}

interface PaymentSummary {
  total: number
  totalValue: number
  paid: number
  paidValue: number
  pending: number
  pendingValue: number
  overdue: number
  overdueValue: number
}

interface MrrPoint {
  month: string
  monthShort: string
  mrr: number
}

const cycleLabels: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUALLY: "Semestral",
  YEARLY: "Anual",
}

const paymentMethodLabels: Record<string, { label: string; icon: typeof Building2 }> = {
  asaas: { label: "Asaas (Automático)", icon: Building2 },
  pix_direto: { label: "PIX Direto", icon: QrCode },
  wise: { label: "Transferência Wise", icon: Wallet },
  boleto: { label: "Boleto", icon: FileText },
  cartao: { label: "Cartão de Crédito", icon: CreditCard },
}

// ─── KPI Card ─────────────────────────────────────────────

function FinancialKpi({
  label,
  value,
  sub,
  variant = "neutral",
  loading,
}: {
  label: string
  value: string
  sub?: string
  variant?: "neutral" | "positive" | "warning" | "negative" | "info"
  loading?: boolean
}) {
  const dotMap: Record<string, string> = {
    neutral: "bg-gray-400",
    positive: "bg-[#10B981]",
    warning: "bg-[#F59E0B]",
    negative: "bg-[#EF4444]",
    info: "bg-[#4E62D8]",
  }
  return (
    <div
      className={cn(
        "rounded-[8px] border bg-white dark:bg-[#1A1D27]",
        "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
        "p-4",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-gray-500 dark:text-[#8B92A5]">
          {label}
        </span>
        <span className={cn("w-1.5 h-1.5 rounded-full", dotMap[variant])} />
      </div>
      {loading ? (
        <div className="h-6 w-32 rounded bg-gray-100 dark:bg-[rgba(255,255,255,0.04)] animate-pulse" />
      ) : (
        <p className="text-[20px] leading-tight font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
          {value}
        </p>
      )}
      {sub && !loading && (
        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-1">{sub}</p>
      )}
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────

function getStatusBadge(status: string) {
  const statusMap: Record<
    string,
    { label: string; bg: string; text: string; border: string; dot: string; icon: typeof CheckCircle2 }
  > = {
    RECEIVED: {
      label: "Pago",
      bg: "bg-[#ECFDF5]",
      text: "text-[#065F46]",
      border: "border-[#A7F3D0]",
      dot: "bg-[#10B981]",
      icon: CheckCircle2,
    },
    CONFIRMED: {
      label: "Confirmado",
      bg: "bg-[#ECFDF5]",
      text: "text-[#065F46]",
      border: "border-[#A7F3D0]",
      dot: "bg-[#10B981]",
      icon: CheckCircle2,
    },
    RECEIVED_IN_CASH: {
      label: "Recebido",
      bg: "bg-[#ECFDF5]",
      text: "text-[#065F46]",
      border: "border-[#A7F3D0]",
      dot: "bg-[#10B981]",
      icon: CheckCircle2,
    },
    paid: {
      label: "Pago",
      bg: "bg-[#ECFDF5]",
      text: "text-[#065F46]",
      border: "border-[#A7F3D0]",
      dot: "bg-[#10B981]",
      icon: CheckCircle2,
    },
    PENDING: {
      label: "Pendente",
      bg: "bg-[#FFFBEB]",
      text: "text-[#92400E]",
      border: "border-[#FDE68A]",
      dot: "bg-[#F59E0B]",
      icon: Clock,
    },
    pending: {
      label: "Pendente",
      bg: "bg-[#FFFBEB]",
      text: "text-[#92400E]",
      border: "border-[#FDE68A]",
      dot: "bg-[#F59E0B]",
      icon: Clock,
    },
    OVERDUE: {
      label: "Vencido",
      bg: "bg-[#FEF2F2]",
      text: "text-[#991B1B]",
      border: "border-[#FECACA]",
      dot: "bg-[#EF4444]",
      icon: AlertCircle,
    },
    overdue: {
      label: "Vencido",
      bg: "bg-[#FEF2F2]",
      text: "text-[#991B1B]",
      border: "border-[#FECACA]",
      dot: "bg-[#EF4444]",
      icon: AlertCircle,
    },
    cancelled: {
      label: "Cancelado",
      bg: "bg-[#F3F4F6]",
      text: "text-gray-500",
      border: "border-[#E5E7EB]",
      dot: "bg-gray-400",
      icon: XCircle,
    },
    REFUNDED: {
      label: "Estornado",
      bg: "bg-[#F3F4F6]",
      text: "text-gray-500",
      border: "border-[#E5E7EB]",
      dot: "bg-gray-400",
      icon: XCircle,
    },
  }
  const info = statusMap[status] ?? {
    label: status,
    bg: "bg-[#EEF0FB]",
    text: "text-[#2137B6]",
    border: "border-[#C7CDEF]",
    dot: "bg-[#4E62D8]",
    icon: Clock,
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] border",
        info.bg,
        info.text,
        info.border,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", info.dot)} />
      {info.label}
    </span>
  )
}

/** Rótulo do meio de cobrança — "UNDEFINED" do Asaas é "o cliente escolhe na fatura". */
function billingMethodLabel(type: string | undefined | null): string {
  switch (type) {
    case "UNDEFINED":
      return "Cliente escolhe"
    case "CREDIT_CARD":
      return "Cartão de crédito"
    case "BOLETO":
      return "Boleto"
    case "PIX":
      return "PIX"
    case undefined:
    case null:
    case "":
      return "—"
    default:
      return paymentMethodLabels[type]?.label ?? type
  }
}

function getMethodIcon(type: string) {
  switch (type) {
    case "PIX":
    case "pix_direto":
      return <QrCode className="h-3.5 w-3.5" />
    case "BOLETO":
    case "boleto":
      return <FileText className="h-3.5 w-3.5" />
    case "CREDIT_CARD":
    case "cartao":
      return <CreditCard className="h-3.5 w-3.5" />
    case "wise":
      return <Wallet className="h-3.5 w-3.5" />
    case "asaas":
      return <Building2 className="h-3.5 w-3.5" />
    case "UNDEFINED":
      return <Receipt className="h-3.5 w-3.5" />
    default:
      return <Receipt className="h-3.5 w-3.5" />
  }
}

// ─── Main Component ────────────────────────────────────────

export function ClientFinancial({ clientId, clientName }: ClientFinancialProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const yearParam = searchParams.get("fin_year")
  const viewParam = searchParams.get("fin_view") as "charges" | "subscriptions" | "contracts" | null
  const validView = viewParam && ["charges", "subscriptions", "contracts"].includes(viewParam)
    ? viewParam
    : "charges"
  const currentYearStr = new Date().getFullYear().toString()
  const initialYear = yearParam && /^20\d\d$/.test(yearParam) ? yearParam : currentYearStr

  const [localSubscriptions, setLocalSubscriptions] = useState<LocalSubscription[]>([])
  const [localCharges, setLocalCharges] = useState<LocalCharge[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  // Lojas do cliente + classificação das faturas Asaas (espelho local)
  // + lojas vinculadas por assinatura (migration 20261113).
  const [clientStores, setClientStores] = useState<ClientStoreLite[]>([])
  const [invoiceMetaByAsaasId, setInvoiceMetaByAsaasId] = useState<Record<string, InvoiceMeta>>({})
  const [storeIdsBySub, setStoreIdsBySub] = useState<Record<string, string[]>>({})
  // Dialog "Classificar cobrança" (tipo / meses / loja) — Asaas ou local.
  const [classifyTarget, setClassifyTarget] = useState<{
    source: "asaas" | "local"
    id: string
    description: string
    dueDate: string
    chargeType: ChargeType
    months: string[]
    /** Comissão aceita VÁRIAS lojas (fatura conjunta); os outros tipos usam só a 1ª. */
    storeIds: string[]
  } | null>(null)
  const [isClassifying, setIsClassifying] = useState(false)
  // Dialog "Vincular lojas" de uma assinatura.
  const [linkTarget, setLinkTarget] = useState<{
    localId: string | null
    asaasId: string | null
    name: string
    value: number
    cycle: string
    storeIds: string[]
  } | null>(null)
  const [isLinking, setIsLinking] = useState(false)
  const activeStores = useMemo(() => clientStores.filter((s) => s.is_active !== false), [clientStores])
  const storeNameById = useMemo(
    () => Object.fromEntries(clientStores.map((s) => [s.id, s.store_name])) as Record<string, string>,
    [clientStores],
  )
  const storeNamesOf = (row: { store_id?: string | null; store_ids?: string[] | null } | null | undefined) =>
    storeIdsOf(row).map((id) => storeNameById[id] ?? "Loja")
  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [activeView, setActiveView] = useState<"charges" | "subscriptions" | "contracts">(validView)

  // Persiste filtros do financeiro na URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (selectedYear === currentYearStr) params.delete("fin_year")
    else params.set("fin_year", selectedYear)
    if (activeView === "charges") params.delete("fin_view")
    else params.set("fin_view", activeView)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, activeView, pathname])
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [selectedCharge, setSelectedCharge] = useState<LocalCharge | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  // Modal "Marcar como pago" (anexa comprovante)
  const [paidModalOpen, setPaidModalOpen] = useState(false)
  const [paidTarget, setPaidTarget] = useState<{
    source: "asaas" | "local"
    id: string
    value: number
  } | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [createdPayment, setCreatedPayment] = useState<{
    id: string
    invoiceUrl?: string
    bankSlipUrl?: string
    pixQrCode?: { encodedImage: string; payload: string }
  } | null>(null)

  const {
    data: paymentsRaw,
    error: paymentsError,
    isLoading: paymentsLoading,
    mutate: mutatePayments,
  } = useAsaasPayments(clientId, parseInt(selectedYear))

  const { data: subscriptionsRaw, mutate: mutateSubscriptions } = useAsaasSubscriptions(clientId)

  const paymentsData = paymentsRaw as Record<string, unknown> | undefined
  const subscriptionsData = subscriptionsRaw as Record<string, unknown> | undefined

  const payments: Payment[] = useMemo(
    () => (paymentsData?.payments as Payment[]) || [],
    [paymentsData],
  )
  const subscriptions: Subscription[] = useMemo(
    () => (subscriptionsData?.subscriptions as Subscription[]) || [],
    [subscriptionsData],
  )
  const summary: PaymentSummary | null = (paymentsData?.summary as PaymentSummary) || null
  const isLoading = paymentsLoading

  const error = paymentsError
    ? "Erro ao carregar dados financeiros"
    : paymentsData?.error
      ? String(paymentsData.error).includes("não ativa")
        ? "Integração Asaas não está ativa. Configure nas configurações."
        : String(paymentsData.error)
      : null

  const [chargeForm, setChargeForm] = useState({
    value: 0,
    billingType: "PIX",
    dueDate: new Date().toISOString().split("T")[0],
    description: "",
    installmentCount: "1",
    paymentMethod: "asaas",
    // Classificação: tipo, meses de referência (comissão), loja e
    // assinatura (quando é mensalidade de uma assinatura local).
    chargeType: "subscription" as ChargeType,
    referenceMonths: [] as string[],
    storeId: "",
    subscriptionId: "",
  })

  const [subscriptionForm, setSubscriptionForm] = useState({
    name: "",
    value: 0,
    cycle: "MONTHLY" as LocalSubscription["cycle"],
    paymentMethod: "asaas" as LocalSubscription["payment_method"],
    billingType: "UNDEFINED" as "UNDEFINED" | "PIX" | "CREDIT_CARD" | "BOLETO",
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
    storeIds: [] as string[],
  })

  const [statusForm, setStatusForm] = useState({
    status: "paid" as LocalCharge["status"],
    actualPaymentMethod: "",
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
  })

  // Load local data
  useEffect(() => {
    loadLocalData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, selectedYear])

  // Defaults dependem das lojas carregadas (loja única já escolhida,
  // mês anterior pré-marcado) — aplicados na ABERTURA do dialog.
  useEffect(() => {
    if (createDialogOpen) resetForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createDialogOpen])
  useEffect(() => {
    if (subscriptionDialogOpen) resetSubscriptionForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionDialogOpen])

  async function loadLocalData() {
    try {
      const supabase = createClient()
      const [subsResult, chargesResult, contractsResult, storesResult, invoicesResult] = await Promise.all([
        supabase
          .from("client_subscriptions")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_charges")
          .select("*")
          .eq("client_id", clientId)
          .order("due_date", { ascending: false })
          .limit(100),
        supabase
          .from("contracts")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_stores")
          .select("id, store_name, is_active")
          .eq("client_id", clientId)
          .order("store_name"),
        // Espelho local das faturas Asaas — é onde mora a classificação.
        // Sem a migration 20261118 o select com store_ids falha → cai no antigo.
        supabase
          .from("invoices")
          .select("id, asaas_id, charge_type, reference_months, store_id, store_ids")
          .eq("client_id", clientId)
          .not("asaas_id", "is", null)
          .limit(500)
          .then(async (r) =>
            r.error
              ? supabase
                  .from("invoices")
                  .select("id, asaas_id, charge_type, reference_months, store_id")
                  .eq("client_id", clientId)
                  .not("asaas_id", "is", null)
                  .limit(500)
              : r,
          ),
      ])

      if (subsResult.data) setLocalSubscriptions(subsResult.data)
      if (chargesResult.data) setLocalCharges(chargesResult.data)
      if (contractsResult.data) setContracts(contractsResult.data)
      if (storesResult.data) setClientStores(storesResult.data as ClientStoreLite[])
      if (invoicesResult.data) {
        const map: Record<string, InvoiceMeta> = {}
        for (const r of invoicesResult.data as Array<InvoiceMeta & { asaas_id: string | null }>) {
          if (r.asaas_id) {
            map[r.asaas_id] = {
              id: r.id,
              charge_type: r.charge_type ?? null,
              reference_months: r.reference_months ?? null,
              store_id: r.store_id ?? null,
              store_ids: r.store_ids ?? null,
            }
          }
        }
        setInvoiceMetaByAsaasId(map)
      }
      // Lojas vinculadas por assinatura (tabela pode não existir ainda).
      const subIds = (subsResult.data ?? []).map((s: { id: string }) => s.id)
      if (subIds.length > 0) {
        const { data: links } = await supabase
          .from("client_subscription_stores")
          .select("subscription_id, store_id")
          .in("subscription_id", subIds)
        const map: Record<string, string[]> = {}
        for (const l of (links ?? []) as Array<{ subscription_id: string; store_id: string }>) {
          ;(map[l.subscription_id] ??= []).push(l.store_id)
        }
        setStoreIdsBySub(map)
      } else {
        setStoreIdsBySub({})
      }
    } catch (err) {
      console.error("Error loading local data:", err)
    }
  }

  async function handleCreateCharge() {
    if (chargeForm.value <= 0 || !chargeForm.dueDate) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Preencha o valor e a data de vencimento" })
      return
    }
    if (chargeForm.chargeType === "commission" && chargeForm.referenceMonths.length === 0) {
      toast({
        variant: "destructive",
        title: "Mês de referência",
        description: "Comissão precisa dizer a que mês (ou meses) se refere.",
      })
      return
    }
    setIsCreating(true)
    // Descrição padrão segue a convenção que o parser lê de volta
    // ("Comissão de jul/26 — Loja") — sem isso o Asaas mostraria
    // "Fatura - Cliente" e ninguém saberia do que era.
    const storeName = chargeForm.storeId ? storeNameById[chargeForm.storeId] : null
    const description =
      chargeForm.description.trim() ||
      describeCharge({
        type: chargeForm.chargeType,
        months: chargeForm.chargeType === "other" ? null : chargeForm.referenceMonths,
        storeName,
        clientName,
      })
    const classification = {
      charge_type: chargeForm.chargeType,
      reference_months: chargeForm.chargeType === "other" ? null : chargeForm.referenceMonths,
      store_id: chargeForm.storeId || null,
    }
    try {
      if (chargeForm.paymentMethod === "asaas") {
        const response = await fetch("/api/integrations/asaas/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            value: centsToReais(chargeForm.value),
            billingType: chargeForm.billingType,
            dueDate: chargeForm.dueDate,
            description,
            installmentCount: parseInt(chargeForm.installmentCount),
            ...classification,
          }),
        })
        const result = await response.json()
        if (response.ok && result.payment) {
          setCreatedPayment(result.payment)
          toast({ title: "Fatura criada!" })
          mutatePayments()
          mutateSubscriptions()
          loadLocalData()
        } else {
          toast({ variant: "destructive", title: "Erro ao criar fatura", description: result.error })
        }
      } else {
        const res = await fetch("/api/client-charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            description,
            value: centsToReais(chargeForm.value),
            due_date: chargeForm.dueDate,
            status: "pending",
            payment_method: chargeForm.paymentMethod,
            subscription_id:
              chargeForm.chargeType === "subscription" && chargeForm.subscriptionId
                ? chargeForm.subscriptionId
                : undefined,
            ...classification,
          }),
        })
        const resData = await res.json()
        if (!res.ok) throw new Error(resData.error || "Erro ao criar fatura")
        toast({ title: "Fatura criada" })
        loadLocalData()
        setCreateDialogOpen(false)
        resetForm()
      }
    } catch (err) {
      console.error("Error creating charge:", err)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao criar fatura" })
    } finally {
      setIsCreating(false)
    }
  }

  async function handleCreateSubscription() {
    if (!subscriptionForm.name || subscriptionForm.value <= 0) {
      toast({ variant: "destructive", title: "Campos obrigatórios", description: "Preencha o nome e o valor" })
      return
    }
    setIsCreating(true)
    try {
      if (subscriptionForm.paymentMethod === "asaas") {
        const response = await fetch("/api/integrations/asaas/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            value: centsToReais(subscriptionForm.value),
            cycle: subscriptionForm.cycle,
            nextDueDate: subscriptionForm.startDate,
            description: subscriptionForm.name,
            billingType: subscriptionForm.billingType,
            storeIds: subscriptionForm.storeIds,
          }),
        })
        const result = await response.json()
        if (response.ok && result.subscription) {
          toast({
            title: "Assinatura criada",
            description:
              subscriptionForm.storeIds.length > 0 && result.stores_linked === false
                ? "Criada no Asaas, mas as lojas não foram vinculadas — vincule pelo card."
                : `ID: ${result.subscription?.id}`,
          })
          mutatePayments()
          mutateSubscriptions()
          loadLocalData()
          setSubscriptionDialogOpen(false)
          resetSubscriptionForm()
        } else {
          toast({ variant: "destructive", title: "Erro", description: result.error })
        }
      } else {
        const res = await fetch("/api/client-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            name: subscriptionForm.name,
            value: centsToReais(subscriptionForm.value),
            cycle: subscriptionForm.cycle,
            payment_method: subscriptionForm.paymentMethod,
            status: "active",
            start_date: subscriptionForm.startDate,
            next_due_date: subscriptionForm.startDate,
            notes: subscriptionForm.notes || null,
            store_ids: subscriptionForm.storeIds,
          }),
        })
        const resData = await res.json()
        if (!res.ok) throw new Error(resData.error || "Erro ao criar assinatura")
        toast({ title: "Assinatura criada" })
        loadLocalData()
        setSubscriptionDialogOpen(false)
        resetSubscriptionForm()
      }
    } catch (err) {
      console.error("Error creating subscription:", err)
      toast({ variant: "destructive", title: "Erro", description: "Erro ao criar assinatura" })
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDeleteCharge(charge: LocalCharge) {
    if (!confirm("Tem certeza que deseja excluir esta fatura?")) return
    try {
      const res = await fetch(`/api/client-charges?id=${charge.id}`, { method: "DELETE" })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || "Erro ao excluir fatura")
      toast({ title: "Fatura excluída" })
      loadLocalData()
    } catch (err) {
      console.error("Error deleting charge:", err)
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleCancelCharge(charge: LocalCharge) {
    if (!confirm("Tem certeza que deseja cancelar esta fatura?")) return
    try {
      const res = await fetch("/api/client-charges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: charge.id }),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || "Erro ao cancelar fatura")
      toast({ title: "Fatura cancelada" })
      loadLocalData()
    } catch (err) {
      console.error("Error cancelling charge:", err)
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleDeleteSubscription(sub: LocalSubscription) {
    if (!confirm("Tem certeza que deseja excluir esta assinatura?")) return
    try {
      const res = await fetch(`/api/client-subscriptions?id=${sub.id}`, { method: "DELETE" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao excluir assinatura")
      toast({ title: "Assinatura excluída" })
      loadLocalData()
    } catch (err) {
      console.error("Error deleting subscription:", err)
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleCancelSubscription(sub: LocalSubscription) {
    if (!confirm("Tem certeza que deseja cancelar esta assinatura?")) return
    try {
      const res = await fetch("/api/client-subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sub.id }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao cancelar assinatura")
      toast({ title: "Assinatura cancelada" })
      loadLocalData()
    } catch (err) {
      console.error("Error cancelling subscription:", err)
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleCancelAsaasSubscription(subId: string) {
    if (!confirm("Tem certeza que deseja cancelar esta assinatura no Asaas?")) return
    try {
      const response = await fetch(`/api/integrations/asaas/subscriptions?subscription_id=${subId}`, {
        method: "DELETE",
      })
      const result = await response.json()
      if (response.ok) {
        toast({ title: "Assinatura cancelada" })
        mutatePayments()
        mutateSubscriptions()
      } else {
        toast({ variant: "destructive", title: "Erro", description: result.error })
      }
    } catch (err) {
      console.error("Error cancelling Asaas subscription:", err)
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleCancelAsaasPayment(paymentId: string) {
    if (!confirm("Tem certeza que deseja cancelar esta fatura?")) return
    try {
      const response = await fetch(`/api/integrations/asaas/charges?payment_id=${paymentId}`, {
        method: "DELETE",
      })
      const result = await response.json()
      if (response.ok) {
        toast({ title: "Fatura cancelada" })
        mutatePayments()
        mutateSubscriptions()
      } else {
        toast({ variant: "destructive", title: "Erro", description: result.error })
      }
    } catch (err) {
      console.error("Error cancelling Asaas payment:", err)
      toast({ variant: "destructive", title: "Erro" })
    }
  }

  async function handleUpdateChargeStatus() {
    if (!selectedCharge) return
    setIsCreating(true)
    try {
      const res = await fetch("/api/client-charges", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charge_id: selectedCharge.id,
          status: statusForm.status,
          actual_payment_method: statusForm.actualPaymentMethod || null,
          payment_date: statusForm.status === "paid" ? statusForm.paymentDate : null,
          notes: statusForm.notes || selectedCharge.notes,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao atualizar status")
      toast({ title: "Status atualizado" })
      loadLocalData()
      setStatusDialogOpen(false)
      setSelectedCharge(null)
    } catch (err) {
      console.error("Error updating charge status:", err)
      toast({ variant: "destructive", title: "Erro" })
    } finally {
      setIsCreating(false)
    }
  }

  function resetForm() {
    const today = new Date().toISOString().split("T")[0]
    setChargeForm({
      value: 0,
      billingType: "PIX",
      dueDate: today,
      description: "",
      installmentCount: "1",
      paymentMethod: "asaas",
      chargeType: "subscription",
      // Convenção da casa: a cobrança fala do mês ANTERIOR (comissão de
      // julho vence em agosto).
      referenceMonths: defaultReferenceMonths(`${today}T12:00:00`),
      // Cliente com uma loja só: já vem escolhida.
      storeId: activeStores.length === 1 ? activeStores[0].id : "",
      subscriptionId: "",
    })
    setCreatedPayment(null)
  }

  function resetSubscriptionForm() {
    setSubscriptionForm({
      name: "",
      value: 0,
      cycle: "MONTHLY",
      paymentMethod: "asaas",
      billingType: "UNDEFINED",
      startDate: new Date().toISOString().split("T")[0],
      notes: "",
      storeIds: activeStores.length === 1 ? [activeStores[0].id] : [],
    })
  }

  // Abre "Classificar cobrança" com a sugestão do parser quando a
  // linha ainda não foi classificada.
  function openClassify(target: {
    source: "asaas" | "local"
    id: string
    description: string
    dueDate: string
    chargeType?: ChargeType | null
    months?: string[] | null
    storeIds?: string[] | null
    hasSubscription?: boolean
  }) {
    const chargeType =
      target.chargeType && isChargeType(target.chargeType) && target.chargeType !== "other"
        ? target.chargeType
        : inferChargeType(target.description, { hasSubscription: target.hasSubscription })
    const months =
      target.months && target.months.length > 0
        ? target.months
        : inferReferenceMonths(target.description, target.dueDate)
    setClassifyTarget({
      source: target.source,
      id: target.id,
      description: target.description,
      dueDate: target.dueDate,
      chargeType,
      months,
      storeIds:
        target.storeIds && target.storeIds.length > 0
          ? target.storeIds
          : activeStores.length === 1
            ? [activeStores[0].id]
            : [],
    })
  }

  async function handleClassify() {
    if (!classifyTarget) return
    if (classifyTarget.chargeType === "commission" && classifyTarget.months.length === 0) {
      toast({ variant: "destructive", title: "Comissão precisa do mês de referência" })
      return
    }
    setIsClassifying(true)
    try {
      const res = await fetch("/api/financial/charge-classification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: classifyTarget.source,
          id: classifyTarget.id,
          charge_type: classifyTarget.chargeType,
          reference_months: classifyTarget.chargeType === "other" ? null : classifyTarget.months,
          // Comissão pode ser de várias lojas numa fatura só; os outros
          // tipos ficam com uma (a 1ª selecionada).
          store_ids:
            classifyTarget.storeIds.length === 0
              ? null
              : classifyTarget.chargeType === "commission"
                ? classifyTarget.storeIds
                : [classifyTarget.storeIds[0]],
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao classificar")
      toast({ title: "Cobrança classificada" })
      setClassifyTarget(null)
      loadLocalData()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao classificar",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setIsClassifying(false)
    }
  }

  async function handleLinkStores() {
    if (!linkTarget) return
    setIsLinking(true)
    try {
      let localId = linkTarget.localId
      // Assinatura só do Asaas (sem stub local): cria o stub primeiro —
      // é nele que o vínculo mora.
      if (!localId && linkTarget.asaasId) {
        const res = await fetch("/api/client-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            name: linkTarget.name,
            value: linkTarget.value,
            cycle: linkTarget.cycle,
            payment_method: "asaas",
            asaas_subscription_id: linkTarget.asaasId,
          }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || "Erro ao preparar a assinatura")
        localId = result.subscription?.id ?? null
      }
      if (!localId) throw new Error("Assinatura não encontrada")
      const res = await fetch(`/api/client-subscriptions/${localId}/stores`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_ids: linkTarget.storeIds }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao vincular lojas")
      toast({ title: "Lojas vinculadas" })
      setLinkTarget(null)
      loadLocalData()
      mutateSubscriptions()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao vincular",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setIsLinking(false)
    }
  }

  function openStatusDialog(charge: LocalCharge, initialStatus?: LocalCharge["status"]) {
    setSelectedCharge(charge)
    setStatusForm({
      status: initialStatus ?? charge.status,
      actualPaymentMethod: charge.actual_payment_method || "",
      paymentDate: charge.payment_date || new Date().toISOString().split("T")[0],
      notes: charge.notes || "",
    })
    setStatusDialogOpen(true)
  }

  // "Marcar como pago" → abre o modal para anexar o comprovante (PNG/JPG/PDF).
  function openPaidModal(payment?: { source: "asaas" | "local"; id: string; value?: number }) {
    let target = payment
    if (!target) {
      target = [
        ...payments
          .filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
          .map((p) => ({ source: "asaas" as const, id: p.id, value: p.value })),
        ...localCharges
          .filter((c) => c.status === "pending" || c.status === "overdue")
          .map((c) => ({ source: "local" as const, id: c.id, value: c.value })),
      ][0]
    }
    if (!target) {
      toast({ variant: "destructive", title: "Nenhuma fatura pendente" })
      return
    }
    setPaidTarget({ source: target.source, id: target.id, value: target.value ?? 0 })
    setProofFile(null)
    setPaidModalOpen(true)
  }

  // Confirma o pagamento: sobe o comprovante (se houver) e marca a fatura paga.
  async function handleConfirmPaid() {
    if (!paidTarget) return
    setIsMarkingPaid(true)
    try {
      // 1. Upload do comprovante (opcional)
      let proofPath: string | undefined
      if (proofFile) {
        const fd = new FormData()
        fd.append("file", proofFile)
        fd.append("client_id", clientId)
        const up = await fetch("/api/upload/payment-proof", { method: "POST", body: fd })
        const upData = await up.json()
        if (!up.ok) throw new Error(upData.error || "Erro ao enviar comprovante")
        proofPath = upData.path
      }

      // 2. Marca como pago conforme a origem
      const today = new Date().toISOString().split("T")[0]
      if (paidTarget.source === "asaas") {
        const res = await fetch("/api/integrations/asaas/charges", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentId: paidTarget.id,
            value: paidTarget.value,
            paymentDate: today,
            proofPath,
          }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || "Erro ao marcar como pago")
      } else {
        const res = await fetch("/api/client-charges", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ charge_id: paidTarget.id, status: "paid", payment_date: today }),
        })
        const result = await res.json()
        if (!res.ok) throw new Error(result.error || "Erro ao marcar como pago")
        // Comprovante em chamada separada (best-effort — coluna pode não existir)
        if (proofPath) {
          await fetch("/api/client-charges", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ charge_id: paidTarget.id, payment_proof_path: proofPath }),
          }).catch(() => {})
        }
      }

      toast({ title: "Fatura marcada como paga" })
      setPaidModalOpen(false)
      setPaidTarget(null)
      setProofFile(null)
      mutatePayments()
      mutateSubscriptions()
      loadLocalData()
    } catch (err) {
      console.error("Error marking as paid:", err)
      toast({
        variant: "destructive",
        title: "Erro ao marcar como pago",
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setIsMarkingPaid(false)
    }
  }

  // Desfaz a baixa manual (RECEIVED_IN_CASH) — a fatura volta a pendente
  // no Asaas e no espelho local.
  async function handleUndoManualPayment(paymentId: string) {
    if (!confirm("Desfazer o pagamento manual? A fatura volta a pendente no Asaas.")) return
    try {
      const res = await fetch("/api/integrations/asaas/charges", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, action: "undo" }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao desfazer")
      toast({ title: "Pagamento manual desfeito" })
      mutatePayments()
      loadLocalData()
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao desfazer pagamento",
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  async function handleResendLink(payment?: { invoiceUrl?: string }) {
    let target = payment
    if (!target) {
      const found = payments
        .filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]
      target = found ? { invoiceUrl: found.invoiceUrl } : undefined
    }
    if (!target?.invoiceUrl) {
      toast({ variant: "destructive", title: "Sem link disponível" })
      return
    }
    await navigator.clipboard.writeText(target.invoiceUrl)
    toast({ title: "Link copiado", description: "Cole no seu canal de comunicação." })
  }

  function handleExportFinancial() {
    const csv = ["Tipo;Descrição;Método;Valor;Vencimento;Status"]

    for (const p of payments) {
      csv.push(
        `Asaas;${p.description || "Fatura"};${p.billingType};${p.value.toFixed(2)};${new Date(p.dueDate).toLocaleDateString("pt-BR")};${p.status}`,
      )
    }
    for (const c of localCharges) {
      csv.push(
        `Local;${c.description};${c.payment_method};${c.value.toFixed(2)};${new Date(c.due_date).toLocaleDateString("pt-BR")};${c.status}`,
      )
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `financeiro-${clientName.toLowerCase().replace(/\s+/g, "-")}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString())

  const computedSummary = useMemo(() => {
    const localPaid = localCharges.filter((c) => c.status === "paid")
    const localPending = localCharges.filter((c) => c.status === "pending")
    const localOverdue = localCharges.filter((c) => c.status === "overdue")
    const activeLocal = localSubscriptions.filter((s) => s.status === "active")
    const activeAsaas = subscriptions.filter((s) => s.isActive)
    const activeContracts = contracts.filter((c) => c.status === "active")

    return {
      paidValue: (summary?.paidValue || 0) + localPaid.reduce((acc, c) => acc + c.value, 0),
      paidCount: (summary?.paid || 0) + localPaid.length,
      pendingValue: (summary?.pendingValue || 0) + localPending.reduce((acc, c) => acc + c.value, 0),
      pendingCount: (summary?.pending || 0) + localPending.length,
      overdueValue: (summary?.overdueValue || 0) + localOverdue.reduce((acc, c) => acc + c.value, 0),
      overdueCount: (summary?.overdue || 0) + localOverdue.length,
      activeSubsCount: activeAsaas.length + activeLocal.length,
      activeSubsValue:
        activeAsaas.reduce((acc, s) => acc + s.value, 0) +
        activeLocal.reduce((acc, s) => acc + s.value, 0),
      activeContractsCount: activeContracts.length,
      nextContractEnd: activeContracts
        .map((c) => c.end_date)
        .filter(Boolean)
        .sort()[0],
    }
  }, [summary, localCharges, localSubscriptions, subscriptions, contracts])

  // Build MRR history (last 8 months) from paid invoices + active subscriptions
  const mrrData = useMemo<MrrPoint[]>(() => {
    const months: MrrPoint[] = []
    const now = new Date()
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const monthShort = d
        .toLocaleDateString("pt-BR", { month: "short" })
        .replace(".", "")
        .toUpperCase()

      // Sum paid invoices in this month for "spot revenue"
      const spotMrr = [
        ...payments.filter((p) => {
          if (p.status !== "RECEIVED" && p.status !== "CONFIRMED") return false
          const paid = p.paymentDate || p.dueDate
          return paid?.startsWith(monthKey)
        }),
        ...localCharges.filter((c) => c.status === "paid" && c.payment_date?.startsWith(monthKey)),
      ].reduce((acc, x) => acc + (x as { value: number }).value, 0)

      months.push({
        month: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        monthShort,
        mrr: spotMrr,
      })
    }
    return months
  }, [payments, localCharges])

  const currentMrr =
    computedSummary.activeSubsValue || (mrrData[mrrData.length - 1]?.mrr ?? 0)
  const previousMrr = mrrData[mrrData.length - 3]?.mrr ?? currentMrr
  const mrrGrowth = previousMrr > 0 ? ((currentMrr - previousMrr) / previousMrr) * 100 : 0

  // Next payment for "Próxima cobrança" card
  const nextPayment = useMemo(() => {
    const allPending = [
      ...payments
        .filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
        .map((p) => ({
          id: p.id,
          value: p.value,
          dueDate: p.dueDate,
          method: p.billingType,
          source: "asaas" as const,
          invoiceUrl: p.invoiceUrl,
          isAuto: true,
        })),
      ...localCharges
        .filter((c) => c.status === "pending" || c.status === "overdue")
        .map((c) => ({
          id: c.id,
          value: c.value,
          dueDate: c.due_date,
          method: c.payment_method,
          source: "local" as const,
          invoiceUrl: undefined as string | undefined,
          isAuto: false,
        })),
    ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

    // Se não há fatura pendente, considera próximo vencimento de assinatura ativa
    if (allPending.length === 0) {
      const upcomingSubs = [
        ...subscriptions
          .filter((s) => s.isActive && s.nextDueDate)
          .map((s) => ({
            id: s.id,
            value: s.value,
            dueDate: s.nextDueDate,
            method: "Asaas",
            source: "asaas" as const,
            invoiceUrl: undefined as string | undefined,
            isAuto: true,
          })),
        ...localSubscriptions
          .filter((s) => s.status === "active" && s.next_due_date)
          .map((s) => ({
            id: s.id,
            value: s.value,
            dueDate: s.next_due_date,
            method: s.payment_method,
            source: "local" as const,
            invoiceUrl: undefined as string | undefined,
            isAuto: false,
          })),
      ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      return upcomingSubs[0]
    }

    return allPending[0]
  }, [payments, localCharges, subscriptions, localSubscriptions])

  // Build year filter
  if (error && localSubscriptions.length === 0 && localCharges.length === 0) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium text-destructive">Erro ao carregar</h3>
          <p className="text-muted-foreground text-center mt-1">{error}</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              mutatePayments()
              mutateSubscriptions()
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-[18px] font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Financeiro
          </h2>
          <p className="text-[13px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
            Faturas, assinaturas e cobranças sincronizadas com Asaas em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" size="sm" onClick={handleExportFinancial}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSubscriptionDialogOpen(true)}>
            <Repeat className="h-3.5 w-3.5 mr-1.5" />
            Nova assinatura
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm()
              setCreateDialogOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nova fatura
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <FinancialKpi
          label="Total Recebido"
          value={formatCurrency(computedSummary.paidValue)}
          sub={`${computedSummary.paidCount} fatura${computedSummary.paidCount !== 1 ? "s" : ""} paga${computedSummary.paidCount !== 1 ? "s" : ""}`}
          variant="positive"
          loading={isLoading}
        />
        <FinancialKpi
          label="Pendente"
          value={formatCurrency(computedSummary.pendingValue)}
          sub={`${computedSummary.pendingCount} fatura${computedSummary.pendingCount !== 1 ? "s" : ""} pendente${computedSummary.pendingCount !== 1 ? "s" : ""}`}
          variant="warning"
          loading={isLoading}
        />
        <FinancialKpi
          label="Vencido"
          value={formatCurrency(computedSummary.overdueValue)}
          sub={`${computedSummary.overdueCount} fatura${computedSummary.overdueCount !== 1 ? "s" : ""} vencida${computedSummary.overdueCount !== 1 ? "s" : ""}`}
          variant="negative"
          loading={isLoading}
        />
        <FinancialKpi
          label="Assinaturas"
          value={computedSummary.activeSubsCount.toString()}
          sub={`${formatCurrency(computedSummary.activeSubsValue)} / mês`}
          variant="info"
          loading={isLoading}
        />
        <FinancialKpi
          label="Contratos ativos"
          value={computedSummary.activeContractsCount.toString()}
          sub={
            computedSummary.nextContractEnd
              ? `próx. venc. ${new Date(computedSummary.nextContractEnd).toLocaleDateString("pt-BR")}`
              : "sem contrato ativo"
          }
          variant="neutral"
          loading={isLoading}
        />
      </div>

      {/* MRR chart + Next payment */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* MRR Chart */}
        <Card className="lg:col-span-2 rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Evolução do MRR</CardTitle>
                <p className="text-[12px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                  Receita recorrente mensal nos últimos 8 meses
                </p>
              </div>
              {currentMrr > 0 && (
                <div
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[6px] border",
                    mrrGrowth >= 0
                      ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
                      : "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      mrrGrowth >= 0 ? "bg-[#10B981]" : "bg-[#EF4444]",
                    )}
                  />
                  {mrrGrowth >= 0 ? "+" : ""}
                  {mrrGrowth.toFixed(1)}% em 2 meses
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2 mb-3">
              <div>
                <p className="text-[26px] leading-none font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
                  {formatCurrency(currentMrr)}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-1">
                  MRR atual
                </p>
              </div>
            </div>
            <div className="h-[180px] -mx-2">
              {mrrData.every((p) => p.mrr === 0) ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-gray-400 dark:text-[#5C6378]">
                      Sem histórico de cobranças nos últimos 8 meses
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                      O gráfico aparecerá após a primeira fatura paga.
                    </p>
                  </div>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mrrData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4E62D8" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#4E62D8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis
                    dataKey="monthShort"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    width={50}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [formatCurrency(Number(value)), "MRR"]}
                    contentStyle={{
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.08)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    stroke="#4E62D8"
                    strokeWidth={2}
                    fill="url(#mrrGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Next charge */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Próxima cobrança</CardTitle>
          </CardHeader>
          <CardContent>
            {nextPayment ? (
              (() => {
                const daysToDue = Math.ceil(
                  (new Date(nextPayment.dueDate).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                )
                const isOverdue = daysToDue < 0
                const isUrgent = daysToDue >= 0 && daysToDue <= 3
                // Cor do calendar tile e label baseada na urgência
                const tileBg = isOverdue
                  ? "bg-[#FEF2F2] dark:bg-[#3B1111] border-[#FECACA] dark:border-[rgba(252,165,165,0.3)]"
                  : isUrgent
                    ? "bg-[#FFFBEB] dark:bg-[#3D2A0D] border-[#FDE68A] dark:border-[rgba(252,211,77,0.3)]"
                    : "bg-[#ECFDF5] dark:bg-[#0B2C24] border-[#A7F3D0] dark:border-[rgba(110,231,183,0.3)]"
                const tileText = isOverdue
                  ? "text-[#991B1B] dark:text-[#FCA5A5]"
                  : isUrgent
                    ? "text-[#92400E] dark:text-[#FCD34D]"
                    : "text-[#065F46] dark:text-[#6EE7B7]"
                return (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className={cn("w-12 h-12 rounded-[6px] border flex flex-col items-center justify-center shrink-0", tileBg)}>
                    <span className={cn("text-[9px] font-semibold uppercase", tileText)}>
                      {new Date(nextPayment.dueDate)
                        .toLocaleDateString("pt-BR", { month: "short" })
                        .replace(".", "")}
                    </span>
                    <span className={cn("text-base font-semibold leading-none", tileText)}>
                      {new Date(nextPayment.dueDate).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[18px] font-semibold text-gray-900 dark:text-[#EAEDF3] tabular-nums">
                      {formatCurrency(nextPayment.value)}
                    </p>
                    <p className={cn(
                      "text-[11px] mt-0.5",
                      isOverdue
                        ? "text-[#991B1B] dark:text-[#FCA5A5] font-medium"
                        : "text-gray-500 dark:text-[#8B92A5]",
                    )}>
                      {isOverdue
                        ? `Vencido há ${Math.abs(daysToDue)} dia${Math.abs(daysToDue) !== 1 ? "s" : ""}`
                        : daysToDue === 0
                          ? "Vence hoje"
                          : `vence em ${daysToDue} dia${daysToDue !== 1 ? "s" : ""}`
                      }
                      {" · via "}{billingMethodLabel(nextPayment.method)}
                    </p>
                  </div>
                </div>

                {nextPayment.isAuto && (
                  <div className="rounded-[6px] p-2.5 bg-[#EEF0FB] dark:bg-[#141C3D] border border-[#C7CDEF] dark:border-[rgba(123,140,234,0.3)] flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#2137B6] dark:text-[#7B8CEA] shrink-0" />
                    <p className="text-[11px] text-[#2137B6] dark:text-[#7B8CEA]">
                      Cobrança gerada automaticamente
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleResendLink({ invoiceUrl: nextPayment.invoiceUrl })}
                    disabled={!nextPayment.invoiceUrl}
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Reenviar link
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      openPaidModal({
                        source: nextPayment.source,
                        id: nextPayment.id,
                        value: nextPayment.value,
                      })
                    }
                  >
                    <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                    Marcar como pago
                  </Button>
                </div>
              </div>
                )
              })()
            ) : (
              <div className="py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-[#10B981] mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
                  Tudo em dia
                </p>
                <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-0.5">
                  Sem cobranças pendentes
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Toggle: Faturas / Assinaturas / Contratos */}
      <div className="flex items-center gap-1 border-b border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
        {(
          [
            {
              v: "charges",
              label: "Faturas",
              count: payments.length + localCharges.length,
              icon: Receipt,
            },
            {
              v: "subscriptions",
              label: "Assinaturas",
              count: subscriptions.length + localSubscriptions.length,
              icon: Repeat,
            },
            {
              v: "contracts",
              label: "Contratos",
              count: contracts.length,
              icon: FileText,
            },
          ] as const
        ).map((t) => {
          const TabIcon = t.icon
          return (
            <button
              key={t.v}
              onClick={() => setActiveView(t.v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                activeView === t.v
                  ? "border-[#4E62D8] text-gray-900 dark:text-[#EAEDF3]"
                  : "border-transparent text-gray-500 dark:text-[#8B92A5] hover:text-gray-900 dark:hover:text-[#EAEDF3]",
              )}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {t.label} ({t.count})
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              mutatePayments()
              mutateSubscriptions()
              loadLocalData()
            }}
            disabled={isLoading}
            className="h-7"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Tab content */}
      {activeView === "charges" && (
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : payments.length === 0 && localCharges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-base font-medium">Nenhuma fatura</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Crie uma nova fatura para este cliente
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Nova fatura
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localCharges.map((charge) => (
                    <TableRow key={charge.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{charge.description}</p>
                          <ChargeClassBadges
                            chargeType={charge.charge_type}
                            months={charge.reference_months}
                            storeNames={storeNamesOf(charge)}
                          />
                          {charge.actual_payment_method && (
                            <p className="text-xs text-muted-foreground">
                              Pago via:{" "}
                              {paymentMethodLabels[charge.actual_payment_method]?.label ||
                                charge.actual_payment_method}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)] text-gray-700 dark:text-[#EAEDF3]">
                          {getMethodIcon(charge.payment_method)}
                          {paymentMethodLabels[charge.payment_method]?.label || charge.payment_method}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums text-right">
                        {formatCurrency(charge.value)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(charge.due_date).toLocaleDateString("pt-BR")}
                        {charge.payment_date && charge.status === "paid" && (
                          <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">
                            pago em {new Date(charge.payment_date).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(charge.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openStatusDialog(charge)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Alterar status
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                openClassify({
                                  source: "local",
                                  id: charge.id,
                                  description: charge.description,
                                  dueDate: charge.due_date,
                                  chargeType: charge.charge_type,
                                  months: charge.reference_months,
                                  storeIds: storeIdsOf(charge),
                                  hasSubscription: Boolean(charge.subscription_id),
                                })
                              }
                            >
                              <Tags className="mr-2 h-4 w-4" />
                              Classificar (tipo · mês · loja)
                            </DropdownMenuItem>
                            {charge.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => handleCancelCharge(charge)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar fatura
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteCharge(charge)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payments.map((payment) => {
                    const meta = invoiceMetaByAsaasId[payment.id]
                    return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {payment.description || `Fatura #${payment.id.slice(-6)}`}
                          </p>
                          <ChargeClassBadges
                            chargeType={meta?.charge_type}
                            months={meta?.reference_months}
                            storeNames={storeNamesOf(meta)}
                          />
                          <p className="text-[11px] text-muted-foreground font-mono">
                            Asaas: {payment.id}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] bg-[#F3F4F6] dark:bg-[rgba(255,255,255,0.04)] text-gray-700 dark:text-[#EAEDF3]">
                          {getMethodIcon(payment.billingType)}
                          {billingMethodLabel(payment.billingType)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums text-right">
                        {formatCurrency(payment.value)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(payment.dueDate).toLocaleDateString("pt-BR")}
                        {payment.paymentDate && (
                          <p className="text-[10px] text-gray-400 dark:text-[#5C6378]">
                            pago em {new Date(payment.paymentDate).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {payment.invoiceUrl && (
                              <DropdownMenuItem asChild>
                                <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Ver fatura
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() =>
                                openClassify({
                                  source: "asaas",
                                  id: payment.id,
                                  description: payment.description ?? "",
                                  dueDate: payment.dueDate,
                                  chargeType: meta?.charge_type,
                                  months: meta?.reference_months,
                                  storeIds: storeIdsOf(meta),
                                })
                              }
                            >
                              <Tags className="mr-2 h-4 w-4" />
                              Classificar (tipo · mês · loja)
                            </DropdownMenuItem>
                            {(payment.status === "PENDING" || payment.status === "OVERDUE") && (
                              <DropdownMenuItem
                                onClick={() =>
                                  openPaidModal({ source: "asaas", id: payment.id, value: payment.value })
                                }
                              >
                                <DollarSign className="mr-2 h-4 w-4" />
                                Marcar como pago (fora do Asaas)
                              </DropdownMenuItem>
                            )}
                            {payment.status === "RECEIVED_IN_CASH" && (
                              <DropdownMenuItem onClick={() => handleUndoManualPayment(payment.id)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Desfazer pagamento manual
                              </DropdownMenuItem>
                            )}
                            {(payment.status === "PENDING" || payment.status === "OVERDUE") && (
                              <DropdownMenuItem onClick={() => handleCancelAsaasPayment(payment.id)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar fatura
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeView === "subscriptions" && (
        <div>
          {subscriptions.length === 0 && localSubscriptions.length === 0 ? (
            <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Repeat className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-base font-medium">Nenhuma assinatura</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Crie uma nova assinatura recorrente
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setSubscriptionDialogOpen(true)}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Nova assinatura
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {localSubscriptions.map((sub) => (
                <Card
                  key={sub.id}
                  className={cn(
                    "rounded-[8px] border",
                    sub.status === "active"
                      ? "border-[#A7F3D0] dark:border-[rgba(110,231,183,0.3)]"
                      : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base tabular-nums">{formatCurrency(sub.value)}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={sub.status === "active" ? "positive" : "neutral"}
                        >
                          {sub.status === "active"
                            ? "Ativa"
                            : sub.status === "inactive"
                              ? "Inativa"
                              : "Cancelada"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                setLinkTarget({
                                  localId: sub.id,
                                  asaasId: sub.asaas_subscription_id ?? null,
                                  name: sub.name,
                                  value: Number(sub.value),
                                  cycle: sub.cycle,
                                  storeIds: storeIdsBySub[sub.id] ?? [],
                                })
                              }
                            >
                              <Store className="mr-2 h-4 w-4" />
                              Vincular lojas
                            </DropdownMenuItem>
                            {sub.status === "active" && (
                              <DropdownMenuItem onClick={() => handleCancelSubscription(sub)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteSubscription(sub)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <CardDescription>{sub.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5 text-[12px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método</span>
                        <span className="inline-flex items-center gap-1">
                          {getMethodIcon(sub.payment_method)}
                          {paymentMethodLabels[sub.payment_method]?.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ciclo</span>
                        <span>{cycleLabels[sub.cycle]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Próximo vencimento</span>
                        <span>{new Date(sub.next_due_date).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <SubscriptionStoresRow
                        storeIds={storeIdsBySub[sub.id] ?? []}
                        storeNameById={storeNameById}
                        clientStoreCount={activeStores.length}
                        onLink={() =>
                          setLinkTarget({
                            localId: sub.id,
                            asaasId: sub.asaas_subscription_id ?? null,
                            name: sub.name,
                            value: Number(sub.value),
                            cycle: sub.cycle,
                            storeIds: storeIdsBySub[sub.id] ?? [],
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
              {subscriptions.map((sub) => (
                <Card
                  key={sub.id}
                  className={cn(
                    "rounded-[8px] border",
                    sub.isActive
                      ? "border-[#A7F3D0] dark:border-[rgba(110,231,183,0.3)]"
                      : "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base tabular-nums">{formatCurrency(sub.value)}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.isActive ? "positive" : "neutral"}>{sub.statusLabel}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                setLinkTarget({
                                  localId: localSubscriptions.find((l) => l.asaas_subscription_id === sub.id)?.id ?? null,
                                  asaasId: sub.id,
                                  name: sub.description || "Assinatura Asaas",
                                  value: Number(sub.value),
                                  cycle: sub.cycle,
                                  storeIds:
                                    storeIdsBySub[
                                      localSubscriptions.find((l) => l.asaas_subscription_id === sub.id)?.id ?? ""
                                    ] ?? [],
                                })
                              }
                            >
                              <Store className="mr-2 h-4 w-4" />
                              Vincular lojas
                            </DropdownMenuItem>
                            {sub.isActive && (
                              <DropdownMenuItem
                                onClick={() => handleCancelAsaasSubscription(sub.id)}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <CardDescription>{sub.description || "Assinatura Asaas"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5 text-[12px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método</span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          Asaas
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ciclo</span>
                        <span>{sub.cycleLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Próximo vencimento</span>
                        <span>{new Date(sub.nextDueDate).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ID Asaas</span>
                        <span className="text-[10px] font-mono truncate max-w-[160px]">{sub.id}</span>
                      </div>
                      <SubscriptionStoresRow
                        storeIds={
                          storeIdsBySub[
                            localSubscriptions.find((l) => l.asaas_subscription_id === sub.id)?.id ?? ""
                          ] ?? []
                        }
                        storeNameById={storeNameById}
                        clientStoreCount={activeStores.length}
                        onLink={() =>
                          setLinkTarget({
                            localId: localSubscriptions.find((l) => l.asaas_subscription_id === sub.id)?.id ?? null,
                            asaasId: sub.id,
                            name: sub.description || "Assinatura Asaas",
                            value: Number(sub.value),
                            cycle: sub.cycle,
                            storeIds: [],
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === "contracts" && (
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardContent className="p-0">
            {contracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-base font-medium">Nenhum contrato</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Crie um contrato para este cliente na aba Contratos abaixo.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-right">Valor mensal</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Término</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm font-medium">{c.plan_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(c.monthly_value)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(c.start_date).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.end_date ? new Date(c.end_date).toLocaleDateString("pt-BR") : "Indeterminado"}
                      </TableCell>
                      <TableCell>{getStatusBadge(c.status === "active" ? "paid" : c.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Charge Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Nova Fatura
            </DialogTitle>
            <DialogDescription>Criar fatura para {clientName}</DialogDescription>
          </DialogHeader>

          {!createdPayment ? (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Método de Pagamento *</Label>
                  <Select
                    value={chargeForm.paymentMethod}
                    onValueChange={(value) =>
                      setChargeForm({ ...chargeForm, paymentMethod: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asaas">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" /> Asaas (Automático)
                        </div>
                      </SelectItem>
                      <SelectItem value="pix_direto">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4" /> PIX Direto
                        </div>
                      </SelectItem>
                      <SelectItem value="wise">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4" /> Transferência Wise
                        </div>
                      </SelectItem>
                      <SelectItem value="boleto">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Boleto Manual
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <CurrencyInput
                    value={chargeForm.value}
                    onValueChange={(cents) => setChargeForm({ ...chargeForm, value: cents })}
                  />
                </div>

                {/* Tipo · loja · mês de referência: é o que liga a
                    cobrança ao negócio (carteira por loja, comissão
                    por mês). */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Tipo de cobrança *</Label>
                    <Select
                      value={chargeForm.chargeType}
                      onValueChange={(value) => {
                        const chargeType = value as ChargeType
                        setChargeForm({
                          ...chargeForm,
                          chargeType,
                          referenceMonths:
                            chargeType === "other"
                              ? []
                              : chargeForm.referenceMonths.length > 0
                                ? chargeForm.referenceMonths
                                : defaultReferenceMonths(`${chargeForm.dueDate}T12:00:00`),
                        })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subscription">Assinatura / mensalidade</SelectItem>
                        <SelectItem value="commission">Comissão</SelectItem>
                        <SelectItem value="other">Avulsa (setup, extra…)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Loja{activeStores.length > 1 ? " *" : ""}</Label>
                    <Select
                      value={chargeForm.storeId || "_none"}
                      onValueChange={(value) =>
                        setChargeForm({ ...chargeForm, storeId: value === "_none" ? "" : value })
                      }
                      disabled={activeStores.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={activeStores.length === 0 ? "Cliente sem loja" : "Selecione"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Sem loja definida</SelectItem>
                        {activeStores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.store_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {activeStores.length > 1 && !chargeForm.storeId && (
                  <p className="text-[11px] text-[#92400E] dark:text-[#FCD34D] -mt-2">
                    Cliente com {activeStores.length} lojas: sem a loja, a Gestão de Carteira não sabe
                    em qual delas esta cobrança conta.
                  </p>
                )}

                {chargeForm.chargeType !== "other" && (
                  <div className="space-y-2">
                    <Label>
                      {chargeForm.chargeType === "commission" ? "Comissão referente a *" : "Mês de referência"}
                    </Label>
                    <MonthChips
                      reference={chargeForm.dueDate}
                      value={chargeForm.referenceMonths}
                      onChange={(months) => setChargeForm({ ...chargeForm, referenceMonths: months })}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {chargeForm.chargeType === "commission"
                        ? "Pode marcar mais de um mês (ex.: abril, maio e junho numa cobrança só)."
                        : "Opcional — qual mensalidade esta cobrança paga."}
                    </p>
                  </div>
                )}

                {chargeForm.chargeType === "subscription" &&
                  chargeForm.paymentMethod !== "asaas" &&
                  localSubscriptions.filter((s) => s.status === "active").length > 0 && (
                    <div className="space-y-2">
                      <Label>Assinatura</Label>
                      <Select
                        value={chargeForm.subscriptionId || "_none"}
                        onValueChange={(value) =>
                          setChargeForm({ ...chargeForm, subscriptionId: value === "_none" ? "" : value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— Sem assinatura</SelectItem>
                          {localSubscriptions
                            .filter((s) => s.status === "active")
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} · {formatCurrency(Number(s.value))}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                {chargeForm.paymentMethod === "asaas" && (
                  <div className="space-y-2">
                    <Label>Forma de Pagamento (Asaas) *</Label>
                    <Select
                      value={chargeForm.billingType}
                      onValueChange={(value) => setChargeForm({ ...chargeForm, billingType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PIX">
                          <div className="flex items-center gap-2">
                            <QrCode className="h-4 w-4" /> PIX
                          </div>
                        </SelectItem>
                        <SelectItem value="BOLETO">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" /> Boleto
                          </div>
                        </SelectItem>
                        <SelectItem value="CREDIT_CARD">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" /> Cartão de Crédito
                          </div>
                        </SelectItem>
                        <SelectItem value="UNDEFINED">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4" /> Cliente escolhe
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Input
                    type="date"
                    value={chargeForm.dueDate}
                    onChange={(e) => setChargeForm({ ...chargeForm, dueDate: e.target.value })}
                  />
                </div>

                {chargeForm.paymentMethod === "asaas" && chargeForm.billingType === "CREDIT_CARD" && (
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Select
                      value={chargeForm.installmentCount}
                      onValueChange={(value) =>
                        setChargeForm({ ...chargeForm, installmentCount: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                          <SelectItem key={n} value={n.toString()}>
                            {n}x{" "}
                            {chargeForm.value
                              ? formatCurrency(centsToReais(chargeForm.value) / n)
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder={describeCharge({
                      type: chargeForm.chargeType,
                      months: chargeForm.chargeType === "other" ? null : chargeForm.referenceMonths,
                      storeName: chargeForm.storeId ? storeNameById[chargeForm.storeId] : null,
                      clientName,
                    })}
                    value={chargeForm.description}
                    onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Vazio = usa o texto acima (é o que o cliente vê na fatura).
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateCharge} disabled={isCreating || chargeForm.value === 0}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Fatura
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="rounded-lg border border-success/50 bg-success/10 p-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" />
                  <p className="font-medium text-success">Fatura criada com sucesso!</p>
                </div>

                {createdPayment.pixQrCode && (
                  <div className="space-y-2">
                    <Label>QR Code PIX</Label>
                    <div className="flex flex-col items-center p-4 border rounded-lg">
                      <Image
                        src={`data:image/png;base64,${createdPayment.pixQrCode.encodedImage}`}
                        alt="QR Code PIX"
                        width={192}
                        height={192}
                        className="w-48 h-48"
                        unoptimized
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          navigator.clipboard.writeText(createdPayment.pixQrCode!.payload)
                          toast({ title: "Código PIX copiado!" })
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar código
                      </Button>
                    </div>
                  </div>
                )}

                {createdPayment.bankSlipUrl && (
                  <Button variant="secondary" className="w-full" asChild>
                    <a href={createdPayment.bankSlipUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="mr-2 h-4 w-4" />
                      Ver Boleto
                    </a>
                  </Button>
                )}

                {createdPayment.invoiceUrl && (
                  <Button variant="secondary" className="w-full" asChild>
                    <a href={createdPayment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Link de Pagamento
                    </a>
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => {
                    setCreateDialogOpen(false)
                    resetForm()
                  }}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Subscription Dialog */}
      <Dialog
        open={subscriptionDialogOpen}
        onOpenChange={(open) => {
          setSubscriptionDialogOpen(open)
          if (!open) resetSubscriptionForm()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              Nova Assinatura
            </DialogTitle>
            <DialogDescription>Criar assinatura recorrente para {clientName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Assinatura *</Label>
              <Input
                placeholder="Ex: Plano Mensal, Gestão de Tráfego..."
                value={subscriptionForm.name}
                onChange={(e) => setSubscriptionForm({ ...subscriptionForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor *</Label>
              <CurrencyInput
                value={subscriptionForm.value}
                onValueChange={(cents) =>
                  setSubscriptionForm({ ...subscriptionForm, value: cents })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Ciclo de Assinatura *</Label>
              <Select
                value={subscriptionForm.cycle}
                onValueChange={(value) =>
                  setSubscriptionForm({
                    ...subscriptionForm,
                    cycle: value as LocalSubscription["cycle"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                  <SelectItem value="BIWEEKLY">Quinzenal</SelectItem>
                  <SelectItem value="MONTHLY">Mensal</SelectItem>
                  <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                  <SelectItem value="SEMIANNUALLY">Semestral</SelectItem>
                  <SelectItem value="YEARLY">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de Pagamento *</Label>
              <Select
                value={subscriptionForm.paymentMethod}
                onValueChange={(value) =>
                  setSubscriptionForm({
                    ...subscriptionForm,
                    paymentMethod: value as LocalSubscription["payment_method"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asaas">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Asaas (Automático)
                    </div>
                  </SelectItem>
                  <SelectItem value="pix_direto">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4" /> PIX Direto
                    </div>
                  </SelectItem>
                  <SelectItem value="wise">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" /> Transferência Wise
                    </div>
                  </SelectItem>
                  <SelectItem value="boleto">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Boleto
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {subscriptionForm.paymentMethod === "asaas" && (
              <div className="space-y-2">
                <Label>Forma de cobrança no Asaas *</Label>
                <Select
                  value={subscriptionForm.billingType}
                  onValueChange={(value) =>
                    setSubscriptionForm({
                      ...subscriptionForm,
                      billingType: value as "UNDEFINED" | "PIX" | "CREDIT_CARD" | "BOLETO",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNDEFINED">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4" />
                        Pergunte ao cliente (PIX, Cartão ou Boleto)
                      </div>
                    </SelectItem>
                    <SelectItem value="PIX">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4" />
                        Somente PIX
                      </div>
                    </SelectItem>
                    <SelectItem value="CREDIT_CARD">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Somente Cartão de Crédito
                      </div>
                    </SelectItem>
                    <SelectItem value="BOLETO">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Somente Boleto
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  &quot;Pergunte ao cliente&quot; é o padrão e deixa o cliente escolher na página
                  do Asaas.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Data de Início *</Label>
              <Input
                type="date"
                value={subscriptionForm.startDate}
                onChange={(e) =>
                  setSubscriptionForm({ ...subscriptionForm, startDate: e.target.value })
                }
              />
            </div>

            {/* Lojas cobertas: é o que sincroniza "assinatura paga" com a
                loja certa na Gestão de Carteira. */}
            <div className="space-y-2">
              <Label>Lojas cobertas{activeStores.length > 1 ? " *" : ""}</Label>
              {activeStores.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  Este cliente ainda não tem loja cadastrada — vincule depois pelo card da assinatura.
                </p>
              ) : (
                <StoreCheckboxList
                  stores={activeStores}
                  value={subscriptionForm.storeIds}
                  onChange={(storeIds) => setSubscriptionForm({ ...subscriptionForm, storeIds })}
                />
              )}
              {activeStores.length > 1 && subscriptionForm.storeIds.length === 0 && (
                <p className="text-[11px] text-[#92400E] dark:text-[#FCD34D]">
                  Cliente com {activeStores.length} lojas: sem o vínculo, a carteira não sabe qual loja esta
                  assinatura paga.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Notas sobre a assinatura..."
                value={subscriptionForm.notes}
                onChange={(e) =>
                  setSubscriptionForm({ ...subscriptionForm, notes: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSubscriptionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSubscription}
              disabled={isCreating || subscriptionForm.value === 0}
            >
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Classificar cobrança: tipo · mês de referência · loja */}
      <Dialog open={classifyTarget !== null} onOpenChange={(open) => !open && setClassifyTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Classificar cobrança
            </DialogTitle>
            <DialogDescription className="truncate">{classifyTarget?.description || "Fatura"}</DialogDescription>
          </DialogHeader>
          {classifyTarget && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select
                  value={classifyTarget.chargeType}
                  onValueChange={(value) =>
                    setClassifyTarget({
                      ...classifyTarget,
                      chargeType: value as ChargeType,
                      months:
                        value === "other"
                          ? []
                          : classifyTarget.months.length > 0
                            ? classifyTarget.months
                            : defaultReferenceMonths(`${classifyTarget.dueDate}T12:00:00`),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscription">Assinatura / mensalidade</SelectItem>
                    <SelectItem value="commission">Comissão</SelectItem>
                    <SelectItem value="other">Avulsa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {classifyTarget.chargeType !== "other" && (
                <div className="space-y-2">
                  <Label>{classifyTarget.chargeType === "commission" ? "Referente a *" : "Mês de referência"}</Label>
                  <MonthChips
                    reference={classifyTarget.dueDate}
                    value={classifyTarget.months}
                    onChange={(months) => setClassifyTarget({ ...classifyTarget, months })}
                  />
                </div>
              )}
              {classifyTarget.chargeType === "commission" ? (
                // Comissão de várias lojas vem numa fatura só — marca todas.
                <div className="space-y-2">
                  <Label>Lojas da comissão</Label>
                  {clientStores.length > 0 ? (
                    <StoreCheckboxList
                      stores={clientStores}
                      value={classifyTarget.storeIds}
                      onChange={(storeIds) => setClassifyTarget({ ...classifyTarget, storeIds })}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">Este cliente ainda não tem loja cadastrada.</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {classifyTarget.storeIds.length > 1
                      ? `${classifyTarget.storeIds.length} lojas — a comissão aparece na carteira de cada uma, com o valor da fatura inteira.`
                      : "Marque mais de uma quando a fatura cobre a comissão de várias lojas."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Loja</Label>
                  <Select
                    value={classifyTarget.storeIds[0] || "_none"}
                    onValueChange={(value) =>
                      setClassifyTarget({ ...classifyTarget, storeIds: value === "_none" ? [] : [value] })
                    }
                    disabled={activeStores.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Sem loja definida</SelectItem>
                      {clientStores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.store_name}
                          {s.is_active === false ? " (inativa)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClassifyTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleClassify} disabled={isClassifying}>
              {isClassifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular lojas a uma assinatura */}
      <Dialog open={linkTarget !== null} onOpenChange={(open) => !open && setLinkTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Lojas cobertas pela assinatura
            </DialogTitle>
            <DialogDescription>
              {linkTarget?.name} · {linkTarget ? formatCurrency(linkTarget.value) : ""}
            </DialogDescription>
          </DialogHeader>
          {linkTarget && (
            <div className="space-y-3 py-2">
              {clientStores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este cliente não tem loja cadastrada.</p>
              ) : (
                <StoreCheckboxList
                  stores={clientStores}
                  value={linkTarget.storeIds}
                  onChange={(storeIds) => setLinkTarget({ ...linkTarget, storeIds })}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                A Gestão de Carteira mostra a mensalidade desta assinatura só nas lojas marcadas. Uma
                assinatura pode cobrir várias lojas (&quot;Plano 2 lojas&quot;).
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLinkTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleLinkStores} disabled={isLinking || clientStores.length === 0}>
              {isLinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog
        open={statusDialogOpen}
        onOpenChange={(open) => {
          setStatusDialogOpen(open)
          if (!open) setSelectedCharge(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Alterar Status da Fatura
            </DialogTitle>
            <DialogDescription>
              {selectedCharge?.description} -{" "}
              {selectedCharge && formatCurrency(selectedCharge.value)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Novo Status *</Label>
              <Select
                value={statusForm.status}
                onValueChange={(value) =>
                  setStatusForm({ ...statusForm, status: value as LocalCharge["status"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Vencido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {statusForm.status === "paid" && (
              <>
                <div className="space-y-2">
                  <Label>Método de Pagamento Real</Label>
                  <Select
                    value={statusForm.actualPaymentMethod || "_same"}
                    onValueChange={(value) =>
                      setStatusForm({
                        ...statusForm,
                        actualPaymentMethod: value === "_same" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione se diferente do original" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_same">Mesmo método original</SelectItem>
                      <SelectItem value="asaas">Asaas</SelectItem>
                      <SelectItem value="pix_direto">PIX Direto</SelectItem>
                      <SelectItem value="wise">Transferência Wise</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Use quando o cliente pagou por um método diferente (ex: fatura Asaas paga via Wise)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={statusForm.paymentDate}
                    onChange={(e) =>
                      setStatusForm({ ...statusForm, paymentDate: e.target.value })
                    }
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Notas sobre a alteração..."
                value={statusForm.notes}
                onChange={(e) => setStatusForm({ ...statusForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setStatusDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateChargeStatus} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marcar como pago — anexar comprovante */}
      <Dialog
        open={paidModalOpen}
        onOpenChange={(open) => {
          setPaidModalOpen(open)
          if (!open) {
            setPaidTarget(null)
            setProofFile(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Marcar como pago
            </DialogTitle>
            <DialogDescription>
              Anexe o comprovante de pagamento (PNG, JPG ou PDF)
              {paidTarget ? ` desta fatura de ${formatCurrency(paidTarget.value)}` : ""}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {paidTarget?.source === "asaas" && (
              <div className="rounded-[6px] p-2.5 bg-[#FFFBEB] dark:bg-[rgba(251,191,36,0.08)] border border-[#FDE68A] dark:border-[rgba(251,191,36,0.3)] text-[11.5px] text-[#92400E] dark:text-[#FCD34D]">
                Para pagamento recebido <strong>fora do Asaas</strong> (transferência internacional, Wise, PIX
                direto): a cobrança é baixada no Asaas como &quot;recebida em dinheiro&quot; e o cliente não é
                notificado. Dá para desfazer pelo menu da fatura.
              </div>
            )}
            <div className="space-y-2">
              <Label>Comprovante de pagamento</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              {proofFile ? (
                <p className="text-xs text-muted-foreground">
                  Selecionado: {proofFile.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Opcional, mas recomendado para registro.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setPaidModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPaid} disabled={isMarkingPaid}>
              {isMarkingPaid && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
