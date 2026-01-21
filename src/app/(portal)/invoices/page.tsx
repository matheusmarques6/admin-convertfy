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
  Download,
  RefreshCw,
  Filter,
  Search,
  ExternalLink,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Invoice {
  id: string
  amount: number
  due_date: string
  payment_date?: string
  status: string
  description?: string
  asaas_id?: string
  payment_link?: string
  created_at: string
}

interface InvoicesResponse {
  invoices: Invoice[]
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

const statusConfig = {
  pending: {
    label: "Pendente",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: Clock,
  },
  paid: {
    label: "Paga",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: CheckCircle,
  },
  overdue: {
    label: "Vencida",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Cancelada",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: AlertTriangle,
  },
  refunded: {
    label: "Reembolsada",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    icon: DollarSign,
  },
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

function isOverdue(dueDate: string, status: string): boolean {
  if (status === "paid" || status === "cancelled" || status === "refunded") return false
  return new Date(dueDate) < new Date()
}

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [stats, setStats] = useState<InvoicesResponse["stats"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

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

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={fetchInvoices}>Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Faturas</h1>
          <p className="text-muted-foreground">
            Acompanhe seus pagamentos e histórico financeiro
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchInvoices}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {formatCurrency(stats.totalPending)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.pending} fatura{stats.pending !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vencidas</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats.totalOverdue)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.overdue} fatura{stats.overdue !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pagas (Mês)</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.totalPaid)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.paid} fatura{stats.paid !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Faturas</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Histórico completo
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou valor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="overdue">Vencidas</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="cancelled">Canceladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Faturas</CardTitle>
          <CardDescription>
            Todas as suas faturas ordenadas por data de vencimento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-1">Nenhuma fatura encontrada</p>
              <p className="text-sm">
                {search || statusFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Suas faturas aparecerão aqui"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const overdue = isOverdue(invoice.due_date, invoice.status)
                    const effectiveStatus = overdue ? "overdue" : invoice.status
                    const config = statusConfig[effectiveStatus as keyof typeof statusConfig] || statusConfig.pending
                    const StatusIcon = config.icon

                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {invoice.description || "Mensalidade Convertfy"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ID: {invoice.id.slice(0, 8)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatCurrency(invoice.amount)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(invoice.due_date)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {invoice.payment_date ? (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              {formatDate(invoice.payment_date)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={config.color}
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice.payment_link && invoice.status !== "paid" && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                            >
                              <a
                                href={invoice.payment_link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Pagar
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações de Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>
                As faturas são geradas automaticamente todo mês com base no seu plano contratado.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
              <span>
                Você receberá um lembrete por email alguns dias antes do vencimento.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <span>
                Em caso de atraso, entre em contato conosco para negociar as condições de pagamento.
              </span>
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t">
            <p>
              Dúvidas sobre cobranças?{" "}
              <a
                href="mailto:financeiro@convertfy.com.br"
                className="text-primary hover:underline"
              >
                Entre em contato
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
