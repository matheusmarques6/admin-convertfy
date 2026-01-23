"use client"

import { useState, useEffect } from "react"
import {
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Filter,
  Search,
  ExternalLink,
  QrCode,
  Copy,
  Wallet,
  CreditCard,
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
  invoice_url?: string
  bank_slip_url?: string
  pix_qr_code?: {
    encodedImage: string
    payload: string
  }
  billing_type?: string
}

interface InvoicesResponse {
  invoices: Invoice[]
  nextInvoice: Invoice | null
  stats: {
    total: number
    pending: number
    paid: number
    overdue: number
    totalPending: number
    totalPaid: number
    totalOverdue: number
  }
}

// ============================================
// CONSTANTS
// ============================================

const STATUS_CONFIG = {
  pending: {
    label: "Pendente",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    dotColor: "bg-amber-400",
    icon: Clock,
  },
  paid: {
    label: "Paga",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    dotColor: "bg-emerald-400",
    icon: CheckCircle,
  },
  overdue: {
    label: "Vencida",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    dotColor: "bg-red-400",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    dotColor: "bg-zinc-400",
    icon: AlertTriangle,
  },
  refunded: {
    label: "Reembolsada",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    dotColor: "bg-purple-400",
    icon: DollarSign,
  },
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
  iconColor = "text-emerald-400",
  iconBgColor = "bg-emerald-400/10",
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconColor?: string
  iconBgColor?: string
}) {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-3 ${iconBgColor}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
      </div>
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
      rounded-2xl border-2 overflow-hidden
      ${isOverdue
        ? "bg-gradient-to-br from-red-950/50 to-red-900/20 border-red-500/50"
        : "bg-gradient-to-br from-emerald-950/50 to-zinc-900 border-emerald-500/50"
      }
    `}>
      {/* Header */}
      <div className={`
        px-6 py-4 flex items-center justify-between
        ${isOverdue ? "bg-red-500/10" : "bg-emerald-500/10"}
      `}>
        <div className="flex items-center gap-3">
          <div className={`
            p-2 rounded-lg
            ${isOverdue ? "bg-red-500/20" : "bg-emerald-500/20"}
          `}>
            <Receipt className={`h-5 w-5 ${isOverdue ? "text-red-400" : "text-emerald-400"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white">
              {isOverdue ? "Fatura em Atraso" : "Próxima Fatura"}
            </h3>
            <p className="text-sm text-zinc-400">{invoice.description || "Mensalidade Convertfy"}</p>
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
          <p className="text-sm text-zinc-400 mb-1">Valor a Pagar</p>
          <p className={`text-5xl font-bold ${isOverdue ? "text-red-400" : "text-emerald-400"}`}>
            {formatCurrency(invoice.amount)}
          </p>
        </div>

        {/* Due Date Info */}
        <div className={`
          rounded-xl p-4 flex items-center justify-between
          ${isOverdue ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-800/50 border border-zinc-700/50"}
        `}>
          <div className="flex items-center gap-3">
            <Calendar className={`h-5 w-5 ${isOverdue ? "text-red-400" : "text-zinc-400"}`} />
            <div>
              <p className="text-sm text-zinc-400">Vencimento</p>
              <p className="font-semibold text-white">{formatDateLong(invoice.due_date)}</p>
            </div>
          </div>
          <div className={`
            text-right px-3 py-1 rounded-lg
            ${dueInfo.urgent
              ? (isOverdue ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400")
              : "bg-zinc-700/50 text-zinc-300"
            }
          `}>
            <p className="text-sm font-medium">{dueInfo.text}</p>
          </div>
        </div>

        {/* Payment Options */}
        {canPay && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400 text-center">Opções de Pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              {/* PIX Button */}
              {invoice.pix_qr_code && (
                <Button
                  onClick={onPayClick}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-14"
                >
                  <QrCode className="h-5 w-5 mr-2" />
                  Pagar com PIX
                </Button>
              )}

              {/* Boleto Button */}
              {invoice.bank_slip_url && (
                <Button
                  variant="outline"
                  className="flex-1 bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700 h-14"
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
                  className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white h-14"
                  asChild
                >
                  <a href={invoice.invoice_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-5 w-5 mr-2" />
                    Acessar Fatura
                  </a>
                </Button>
              )}

              {/* Fallback if no payment links */}
              {!invoice.pix_qr_code && !invoice.bank_slip_url && !invoice.invoice_url && (
                <div className="col-span-2 text-center py-4 text-zinc-500 text-sm">
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

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer transition-all group"
    >
      {/* Status Icon */}
      <div className={`p-2 rounded-lg ${statusConfig.color.split(" ")[0]}`}>
        <StatusIcon className={`h-5 w-5 ${statusConfig.color.split(" ")[1]}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white truncate">
          {invoice.description || "Mensalidade Convertfy"}
        </p>
        <p className="text-sm text-zinc-500">
          Vencimento: {formatDate(invoice.due_date)}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="font-bold text-white">{formatCurrency(invoice.amount)}</p>
        <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-5 w-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
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
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl text-center">Pagar com PIX</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Amount */}
          <div className="text-center">
            <p className="text-sm text-zinc-400">Valor</p>
            <p className="text-3xl font-bold text-emerald-400">
              {formatCurrency(invoice.amount)}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl">
              <img
                src={`data:image/png;base64,${invoice.pix_qr_code.encodedImage}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center text-sm text-zinc-400">
            <p>Escaneie o QR Code acima com o app do seu banco</p>
            <p>ou copie o código PIX abaixo</p>
          </div>

          {/* Copy Button */}
          <Button
            onClick={copyPixCode}
            variant="outline"
            className="w-full bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2 text-emerald-400" />
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
          <p className="text-xs text-zinc-500 text-center">
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
      <div className="min-h-screen bg-black p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48 bg-zinc-900" />
          <Skeleton className="h-10 w-32 bg-zinc-900" />
        </div>
        <Skeleton className="h-64 rounded-2xl bg-zinc-900" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl bg-zinc-900" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl bg-zinc-900" />
      </div>
    )
  }

  // ============================================
  // RENDER: Error State
  // ============================================
  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center max-w-md">
          <div className="rounded-full bg-red-500/10 p-4 w-fit mx-auto mb-4">
            <AlertCircle className="h-10 w-10 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Erro ao carregar</h2>
          <p className="text-zinc-400 mb-6">{error}</p>
          <Button onClick={fetchInvoices} className="bg-emerald-500 hover:bg-emerald-600">
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
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">

        {/* ========== HEADER ========== */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Faturas</h1>
            <p className="text-zinc-400">
              Acompanhe seus pagamentos e histórico financeiro
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchInvoices}
            disabled={loading}
            className="bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ========== MAIN INVOICE CARD (BOLETO STYLE) ========== */}
        {nextInvoice && (
          <BoletoCard
            invoice={nextInvoice}
            onPayClick={() => handlePayClick(nextInvoice)}
          />
        )}

        {/* ========== NO PENDING INVOICES MESSAGE ========== */}
        {!nextInvoice && stats && stats.pending === 0 && stats.overdue === 0 && (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-950/30 to-zinc-900 border-2 border-emerald-500/30 p-8 text-center">
            <div className="rounded-full bg-emerald-500/10 p-4 w-fit mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Tudo em dia!
            </h3>
            <p className="text-zinc-400">
              Você não possui faturas pendentes no momento.
            </p>
          </div>
        )}

        {/* ========== STATS CARDS ========== */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Total Pendente"
              value={formatCurrency(stats.totalPending)}
              subtitle={`${stats.pending} fatura${stats.pending !== 1 ? "s" : ""}`}
              icon={Clock}
              iconColor="text-amber-400"
              iconBgColor="bg-amber-400/10"
            />
            <StatCard
              title="Em Atraso"
              value={formatCurrency(stats.totalOverdue)}
              subtitle={`${stats.overdue} fatura${stats.overdue !== 1 ? "s" : ""}`}
              icon={AlertCircle}
              iconColor="text-red-400"
              iconBgColor="bg-red-400/10"
            />
            <StatCard
              title="Pagas"
              value={formatCurrency(stats.totalPaid)}
              subtitle={`${stats.paid} fatura${stats.paid !== 1 ? "s" : ""}`}
              icon={CheckCircle}
              iconColor="text-emerald-400"
              iconBgColor="bg-emerald-400/10"
            />
            <StatCard
              title="Total de Faturas"
              value={stats.total}
              subtitle="histórico completo"
              icon={FileText}
              iconColor="text-blue-400"
              iconBgColor="bg-blue-400/10"
            />
          </div>
        )}

        {/* ========== FILTERS ========== */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Buscar por descrição ou valor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-zinc-500" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="all" className="text-white hover:bg-zinc-800">
                    Todos
                  </SelectItem>
                  <SelectItem value="pending" className="text-white hover:bg-zinc-800">
                    Pendentes
                  </SelectItem>
                  <SelectItem value="overdue" className="text-white hover:bg-zinc-800">
                    Vencidas
                  </SelectItem>
                  <SelectItem value="paid" className="text-white hover:bg-zinc-800">
                    Pagas
                  </SelectItem>
                  <SelectItem value="cancelled" className="text-white hover:bg-zinc-800">
                    Canceladas
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ========== INVOICE HISTORY ========== */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Histórico de Faturas</h2>

          {historyInvoices.length === 0 ? (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-zinc-600" />
              <p className="text-lg font-medium text-zinc-400 mb-1">
                Nenhuma fatura encontrada
              </p>
              <p className="text-sm text-zinc-500">
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
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
          <h3 className="text-base font-semibold text-white mb-4">
            Informações de Pagamento
          </h3>
          <ul className="space-y-3 text-sm text-zinc-400">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              <span>
                As faturas são geradas automaticamente todo mês com base no seu plano contratado.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>
                Você receberá um lembrete por email alguns dias antes do vencimento.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span>
                Em caso de atraso, entre em contato conosco para negociar as condições de pagamento.
              </span>
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-sm text-zinc-400">
              Dúvidas sobre cobranças?{" "}
              <a
                href="mailto:financeiro@convertfy.com.br"
                className="text-emerald-400 hover:underline"
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
