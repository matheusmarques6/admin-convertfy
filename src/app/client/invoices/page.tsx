"use client"

import { useState, useEffect } from "react"
import {
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Calendar,
  RefreshCw,
  TrendingUp,
  Filter,
  Search,
  ExternalLink,
  QrCode,
  Copy,
  Receipt,
  ArrowRight,
  Banknote,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// ============================================
// TYPES
// ============================================

interface Invoice {
  id: string
  amount: number
  due_date: string
  payment_date?: string
  status: "pending" | "paid" | "overdue" | "cancelled" | "refunded"
  description?: string
  asaas_id?: string
  created_at: string
  source?: "asaas" | "local"
  payment_method?: string
  actual_payment_method?: string
  subscription_id?: string
  notes?: string
  invoice_url?: string
  bank_slip_url?: string
  pix_qr_code?: {
    encodedImage: string
    payload: string
  }
  billing_type?: string
  refund_total: number
  net_amount: number
}

interface InvoicesResponse {
  invoices: Invoice[]
  nextInvoice: Invoice | null
  stats: {
    total: number
    pending: number
    paid: number
    overdue: number
    refunded: number
    totalPending: number
    totalPaid: number
    totalOverdue: number
    totalRefunded: number
  }
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_CONFIG = {
  pending: {
    label: "Pendente",
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dotColor: "bg-amber-500",
    icon: Clock,
  },
  paid: {
    label: "Paga",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dotColor: "bg-emerald-500",
    icon: CheckCircle,
  },
  overdue: {
    label: "Vencida",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    dotColor: "bg-red-500",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-muted text-muted-foreground border-border",
    dotColor: "bg-muted-foreground",
    icon: AlertTriangle,
  },
  refunded: {
    label: "Reembolsada",
    color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20",
    dotColor: "bg-violet-500",
    icon: RotateCcw,
  },
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  asaas: "Asaas",
  pix_direto: "PIX Direto",
  wise: "Wise",
  boleto: "Boleto",
  cartao: "Cartao",
}

const PAYMENT_METHOD_BADGE_COLORS: Record<string, string> = {
  asaas: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20",
  pix_direto: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  wise: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
  boleto: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20",
  cartao: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
}

function getPaymentMethodInstruction(method: string): string {
  switch (method) {
    case "pix_direto":
      return "Solicite a chave PIX com a agencia"
    case "wise":
      return "Pague via Wise — consulte os dados com a agencia"
    default:
      return "Entre em contato com a agencia para dados de pagamento"
  }
}

function isLocalNonAsaas(invoice: Invoice): boolean {
  return invoice.source === "local" && invoice.payment_method !== "asaas"
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function getDaysUntilDue(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(dateStr + "T12:00:00")
  dueDate.setHours(0, 0, 0, 0)
  const diffTime = dueDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function getDueLabel(dateStr: string, status: string): { text: string; urgent: boolean } {
  if (status === "paid") return { text: "Paga", urgent: false }
  if (status === "cancelled") return { text: "Cancelada", urgent: false }
  if (status === "refunded") return { text: "Reembolsada", urgent: false }

  const days = getDaysUntilDue(dateStr)
  if (days < 0) return { text: `Vencida há ${Math.abs(days)} dia${Math.abs(days) > 1 ? "s" : ""}`, urgent: true }
  if (days === 0) return { text: "Vence hoje!", urgent: true }
  if (days === 1) return { text: "Vence amanhã", urgent: true }
  if (days <= 5) return { text: `Vence em ${days} dias`, urgent: true }
  return { text: `Vence em ${days} dias`, urgent: false }
}

// ============================================
// COMPONENTS
// ============================================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-emerald-600",
  iconBgColor = "bg-emerald-50",
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconColor?: string
  iconBgColor?: string
}) {
  const content = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[13px] font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>}
      </div>
      <div className={`rounded-xl p-3 ${iconBgColor}`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
    </div>
  )

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-5 hover:shadow-md transition-shadow">
      {content}
    </div>
  )
}

function BoletoCard({ invoice, onPayClick }: { invoice: Invoice; onPayClick: () => void }) {
  const dueInfo = getDueLabel(invoice.due_date, invoice.status)
  const isOverdue = invoice.status === "overdue"
  const isPending = invoice.status === "pending"
  const canPay = isPending || isOverdue

  return (
    <div className={`
      rounded-2xl border overflow-hidden bg-card shadow-md
      ${isOverdue
        ? "border-red-200 dark:border-red-500/20"
        : "border-border"
      }
    `}>
      {/* Header */}
      <div className={`
        px-6 py-4 flex items-center justify-between border-b
        ${isOverdue
          ? "bg-gradient-to-r from-red-50 to-transparent dark:from-red-500/10 border-red-100 dark:border-red-500/20"
          : "bg-gradient-to-r from-muted to-transparent border-border"
        }
      `}>
        <div className="flex items-center gap-3">
          <div className={`
            p-2 rounded-lg
            ${isOverdue ? "bg-red-50 dark:bg-red-500/10" : "bg-emerald-50 dark:bg-emerald-500/10"}
          `}>
            <Receipt className={`h-5 w-5 ${isOverdue ? "text-red-600" : "text-emerald-600"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {isOverdue ? "Fatura em Atraso" : "Próxima Fatura"}
            </h3>
            <p className="text-sm text-muted-foreground">{invoice.description || "Mensalidade Convertfy"}</p>
          </div>
        </div>
        <Badge className={STATUS_CONFIG[invoice.status]?.color || STATUS_CONFIG.pending.color}>
          {STATUS_CONFIG[invoice.status]?.label || "Pendente"}
        </Badge>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* Amount */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {invoice.status === "refunded" ? "Valor Original" : "Valor a Pagar"}
          </p>
          <p className={`text-5xl font-bold ${isOverdue ? "text-red-600" : invoice.status === "refunded" ? "text-violet-600" : "text-emerald-600"}`}>
            {formatCurrency(invoice.amount)}
          </p>
          {invoice.refund_total > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              {invoice.status === "refunded" ? (
                <span>Reembolsado: {formatCurrency(invoice.refund_total)}</span>
              ) : (
                <>
                  <span>Reembolsado: {formatCurrency(invoice.refund_total)} de {formatCurrency(invoice.amount)}</span>
                  <span className="ml-2">Valor liquido: {formatCurrency(invoice.net_amount)}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Due Date Info */}
        <div className={`
          rounded-xl p-4 flex items-center justify-between
          ${isOverdue ? "bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20" : "bg-muted border border-border"}
        `}>
          <div className="flex items-center gap-3">
            <Calendar className={`h-5 w-5 ${isOverdue ? "text-red-600" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm text-muted-foreground">Vencimento</p>
              <p className="font-semibold text-foreground">{formatDateLong(invoice.due_date)}</p>
            </div>
          </div>
          <div className={`
            text-right px-3 py-1 rounded-lg
            ${dueInfo.urgent
              ? (isOverdue ? "bg-red-50 dark:bg-red-500/10 text-red-600" : "bg-amber-50 dark:bg-amber-500/10 text-amber-600")
              : "bg-muted text-muted-foreground"
            }
          `}>
            <p className="text-sm font-medium">{dueInfo.text}</p>
          </div>
        </div>

        {/* Payment Options — Local non-Asaas charges */}
        {canPay && isLocalNonAsaas(invoice) && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className={`text-xs ${PAYMENT_METHOD_BADGE_COLORS[invoice.payment_method || ""] || PAYMENT_METHOD_BADGE_COLORS.boleto}`}>
                {PAYMENT_METHOD_LABELS[invoice.payment_method || ""] || invoice.payment_method}
              </Badge>
            </div>
            <div className={`
              rounded-xl p-4 text-center text-sm
              ${isOverdue ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"}
            `}>
              {getPaymentMethodInstruction(invoice.payment_method || "")}
            </div>
          </div>
        )}

        {/* Payment Options — Asaas charges (or local with payment_method=asaas) */}
        {canPay && !isLocalNonAsaas(invoice) && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Opções de Pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              {/* PIX Button */}
              {invoice.pix_qr_code && (
                <Button
                  onClick={onPayClick}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-14"
                >
                  <QrCode className="h-5 w-5 mr-2" />
                  Pagar com PIX
                </Button>
              )}

              {/* Boleto Button */}
              {invoice.bank_slip_url && (
                <Button
                  variant="outline"
                  className="flex-1 bg-muted border-border text-foreground hover:bg-accent h-14"
                  asChild
                >
                  <a href={invoice.bank_slip_url} target="_blank" rel="noopener noreferrer">
                    <Banknote className="h-5 w-5 mr-2" />
                    Ver Boleto
                  </a>
                </Button>
              )}

              {/* Generic Invoice URL */}
              {invoice.invoice_url && !invoice.pix_qr_code && !invoice.bank_slip_url && (
                <Button
                  className="col-span-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-14"
                  asChild
                >
                  <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-5 w-5 mr-2" />
                    Acessar Fatura
                  </a>
                </Button>
              )}

              {/* Fallback if no payment links — only for Asaas invoices (local charges never have payment links) */}
              {!invoice.pix_qr_code && !invoice.bank_slip_url && !invoice.invoice_url && invoice.source !== "local" && (
                <div className="col-span-2 text-center py-4 text-muted-foreground text-sm">
                  Links de pagamento em processamento...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InvoiceRow({ invoice, onClick }: { invoice: Invoice; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[invoice.status] || STATUS_CONFIG.pending
  const StatusIcon = statusConfig.icon
  const isLocal = isLocalNonAsaas(invoice)
  const isLocalPending = isLocal && (invoice.status === "pending" || invoice.status === "overdue")
  const showActualMethod = isLocal && invoice.status === "paid" && invoice.actual_payment_method && invoice.actual_payment_method !== invoice.payment_method

  return (
    <div
      onClick={isLocalPending ? undefined : onClick}
      className={`flex items-center gap-4 p-4 rounded-xl bg-card border border-border transition-all group shadow-sm ${
        isLocalPending ? "cursor-default" : "hover:bg-accent/50 cursor-pointer"
      }`}
    >
      {/* Status Icon */}
      <div className={`p-2 rounded-lg ${statusConfig.color.split(" ")[0]}`}>
        <StatusIcon className={`h-5 w-5 ${statusConfig.color.split(" ")[1]}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">
            {invoice.description || "Mensalidade Convertfy"}
          </p>
          {isLocal && invoice.payment_method && (
            <Badge variant="outline" className={`text-[10px] shrink-0 ${PAYMENT_METHOD_BADGE_COLORS[invoice.payment_method] || PAYMENT_METHOD_BADGE_COLORS.boleto}`}>
              {PAYMENT_METHOD_LABELS[invoice.payment_method] || invoice.payment_method}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Vencimento: {formatDate(invoice.due_date)}
          {showActualMethod && (
            <span className="ml-2 text-xs">
              (pago via {PAYMENT_METHOD_LABELS[invoice.actual_payment_method!] || invoice.actual_payment_method})
            </span>
          )}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="font-bold text-foreground">{formatCurrency(invoice.amount)}</p>
        {invoice.refund_total > 0 && (
          <p className="text-xs text-muted-foreground">
            {invoice.status === "refunded"
              ? `Reembolsado: ${formatCurrency(invoice.refund_total)}`
              : `Liquido: ${formatCurrency(invoice.net_amount)}`
            }
          </p>
        )}
        <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Arrow — hide for local pending charges */}
      {!isLocalPending && (
        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      )}
    </div>
  )
}

function PixModal({
  invoice,
  open,
  onClose
}: {
  invoice: Invoice | null
  open: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyPixCode = async () => {
    if (invoice?.pix_qr_code?.payload) {
      await navigator.clipboard.writeText(invoice.pix_qr_code.payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!invoice?.pix_qr_code) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border text-foreground max-w-md shadow-md">
        <DialogHeader>
          <DialogTitle className="text-xl text-center text-foreground">Pagar com PIX</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Valor</p>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(invoice.amount)}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-card p-4 rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${invoice.pix_qr_code.encodedImage}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center text-sm text-muted-foreground">
            <p>Escaneie o QR Code acima com o app do seu banco</p>
            <p>ou copie o código PIX abaixo</p>
          </div>

          {/* Copy Button */}
          <Button
            onClick={copyPixCode}
            variant="outline"
            className="w-full bg-muted border-border text-foreground hover:bg-accent"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2 text-emerald-600" />
                Código copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copiar código PIX
              </>
            )}
          </Button>

          {/* Expiration Notice */}
          <p className="text-xs text-muted-foreground/70 text-center">
            Este código PIX é válido por tempo limitado
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [nextInvoice, setNextInvoice] = useState<Invoice | null>(null)
  const [stats, setStats] = useState<InvoicesResponse["stats"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showPixModal, setShowPixModal] = useState(false)
  const [revenueGenerated, setRevenueGenerated] = useState<number | null>(null)
  const [showRevenue, setShowRevenue] = useState(false)

  // Fetch revenue data from status endpoint
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/portal/invoices/status", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch status")
        return res.json()
      })
      .then((data) => {
        if (typeof data.revenueGenerated === "number") {
          setRevenueGenerated(data.revenueGenerated)
        }
        if (data.showRevenue) {
          setShowRevenue(true)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Revenue status fetch error:", err)
        }
      })
    return () => controller.abort()
  }, [])

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      let url = "/api/portal/invoices"
      const params = new URLSearchParams()
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }
      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error("Erro ao carregar faturas")
      }
      const data: InvoicesResponse = await response.json()
      setInvoices(data.invoices)
      setNextInvoice(data.nextInvoice)
      setStats(data.stats)
      setError(null)
    } catch (err) {
      console.error("Invoices fetch error:", err)
      setError("Não foi possível carregar as faturas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  // Filter invoices by search
  const filteredInvoices = invoices.filter((invoice) => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      invoice.description?.toLowerCase().includes(searchLower) ||
      invoice.id.toLowerCase().includes(searchLower) ||
      formatCurrency(invoice.amount).toLowerCase().includes(searchLower)
    )
  })

  // Get history (exclude the next invoice to avoid duplication)
  const historyInvoices = filteredInvoices.filter(
    (inv) => !nextInvoice || inv.id !== nextInvoice.id
  )

  const handlePayClick = (invoice: Invoice) => {
    if (invoice.pix_qr_code) {
      setSelectedInvoice(invoice)
      setShowPixModal(true)
    }
  }

  // ============================================
  // RENDER: Loading State
  // ============================================
  if (loading && !stats) {
    return (
      <div className="min-h-screen p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48 bg-muted" />
          <Skeleton className="h-10 w-32 bg-muted" />
        </div>
        <Skeleton className="h-64 rounded-2xl bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl bg-muted" />
      </div>
    )
  }

  // ============================================
  // RENDER: Error State
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="bg-card rounded-xl border border-border shadow-md p-8 text-center max-w-md">
          <div className="rounded-full bg-red-50 dark:bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Erro ao carregar</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={fetchInvoices} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // ============================================
  // RENDER: Main
  // ============================================
  return (
    <div className="min-h-screen text-foreground">
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">

        {/* ========== REVENUE CARD ========== */}
        {showRevenue && revenueGenerated != null && revenueGenerated > 0 && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-cyan-600 dark:from-emerald-600 dark:via-emerald-700 dark:to-cyan-700 shadow-lg shadow-emerald-500/20 dark:shadow-emerald-700/30 p-6 sm:p-8">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full" />

            <div className="relative flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              {/* Icon */}
              <div className="flex-shrink-0 rounded-2xl bg-white/15 backdrop-blur-sm p-4">
                <TrendingUp className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
              </div>

              {/* Content */}
              <div className="text-center sm:text-left flex-1">
                <p className="text-emerald-100 text-sm font-medium mb-1">
                  Receita gerada pela Convertfy nos ultimos 30 dias
                </p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight animate-pulse">
                  {formatCurrency(revenueGenerated)}
                </p>
              </div>

              {/* Decorative badge */}
              <div className="hidden lg:flex flex-shrink-0 items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-4 py-2">
                <DollarSign className="h-5 w-5 text-emerald-100" />
                <span className="text-sm font-semibold text-white whitespace-nowrap">Resultado Real</span>
              </div>
            </div>
          </div>
        )}

        {/* ========== MAIN INVOICE CARD (BOLETO STYLE) ========== */}
        {nextInvoice && (
          <BoletoCard
            invoice={nextInvoice}
            onPayClick={() => handlePayClick(nextInvoice)}
          />
        )}

        {/* ========== NO PENDING INVOICES MESSAGE ========== */}
        {!nextInvoice && stats && stats.pending === 0 && stats.overdue === 0 && (
          <div className="rounded-2xl bg-card border border-emerald-200 dark:border-emerald-500/20 shadow-sm p-8 text-center">
            <div className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 p-4 w-fit mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Tudo em dia!
            </h3>
            <p className="text-muted-foreground">
              Você não possui faturas pendentes no momento.
            </p>
          </div>
        )}

        {/* ========== STATS CARDS ========== */}
        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard
              title="Total Pendente"
              value={formatCurrency(stats.totalPending)}
              subtitle={`${stats.pending} fatura${stats.pending !== 1 ? "s" : ""}`}
              icon={Clock}
              iconColor="text-amber-600"
              iconBgColor="bg-amber-50 dark:bg-amber-500/10"
            />
            <StatCard
              title="Em Atraso"
              value={formatCurrency(stats.totalOverdue)}
              subtitle={`${stats.overdue} fatura${stats.overdue !== 1 ? "s" : ""}`}
              icon={AlertCircle}
              iconColor="text-red-600"
              iconBgColor="bg-red-50 dark:bg-red-500/10"
            />
            <StatCard
              title="Pagas"
              value={formatCurrency(stats.totalPaid)}
              subtitle={`${stats.paid} fatura${stats.paid !== 1 ? "s" : ""}`}
              icon={CheckCircle}
              iconColor="text-emerald-600"
              iconBgColor="bg-emerald-50 dark:bg-emerald-500/10"
            />
            <StatCard
              title="Total de Faturas"
              value={stats.total}
              subtitle="histórico completo"
              icon={FileText}
              iconColor="text-info"
              iconBgColor="bg-sky-50 dark:bg-sky-500/10"
            />
          </div>
        )}

        {/* ========== FILTERS ========== */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou valor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-10 bg-muted border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchInvoices}
                disabled={loading}
                className="h-10 bg-muted border-border text-foreground hover:bg-accent"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-10 bg-muted border-border text-foreground">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="cancelled">Canceladas</SelectItem>
                  <SelectItem value="refunded">Reembolsadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ========== INVOICE HISTORY ========== */}
        <div className="space-y-4">
          <h2 className="text-[15px] font-semibold text-foreground">Histórico de Faturas</h2>

          {historyInvoices.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-lg font-medium text-muted-foreground mb-1">
                Nenhuma fatura encontrada
              </p>
              <p className="text-sm text-muted-foreground/70">
                {search || statusFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Suas faturas aparecerão aqui"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyInvoices.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  onClick={() => {
                    if (invoice.status === "pending" || invoice.status === "overdue") {
                      handlePayClick(invoice)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ========== PAYMENT INFO ========== */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-6">
          <h3 className="text-[15px] font-semibold text-foreground mb-4">
            Informações de Pagamento
          </h3>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span>
                As faturas são geradas automaticamente todo mês com base no seu plano contratado.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <span>
                Você receberá um lembrete por email alguns dias antes do vencimento.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <span>
                Em caso de atraso, entre em contato conosco para negociar as condições de pagamento.
              </span>
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Dúvidas sobre assinaturas?{" "}
              <a
                href="mailto:financeiro@convertfy.com.br"
                className="text-info hover:underline"
              >
                Entre em contato
              </a>
            </p>
          </div>
        </div>

      </div>

      {/* ========== PIX MODAL ========== */}
      <PixModal
        invoice={selectedInvoice}
        open={showPixModal}
        onClose={() => setShowPixModal(false)}
      />
    </div>
  )
}
