"use client"

import { useState, useEffect } from "react"
import { useAsaasCharges } from "@/lib/hooks/use-api-data"
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Calendar,
  CreditCard,
  Receipt,
  Ban,
  ChevronDown,
  Filter,
  Search,
  RotateCcw,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { RefundDialog, type RefundCharge } from "@/components/financial/refund-dialog"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface Charge {
  id: string
  value: number
  netValue?: number
  status: string
  statusLabel: string
  billingType: string
  billingTypeLabel: string
  dueDate: string
  paymentDate?: string
  description?: string
  invoiceUrl?: string
  asaas_id?: string | null
  subscription_id?: string | null
  refund_total?: number
  client: {
    id: string
    name: string
    company?: string
  } | null
  isOverdue: boolean
  daysOverdue: number
}

interface ChargesSummary {
  overdue: { count: number; value: number }
  pending: { count: number; value: number }
  upcoming: { count: number; value: number }
  received: { count: number; value: number }
  total: { count: number; value: number }
}

interface ChargesData {
  success: boolean
  connected: boolean
  summary: ChargesSummary
  overdue: Charge[]
  pending: Charge[]
  upcoming: Charge[]
  received: Charge[]
  all: Charge[]
}

export function ChargesManager() {
  const [searchQuery, setSearchQuery] = useState("")
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({})
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundCharge, setRefundCharge] = useState<RefundCharge | null>(null)

  const startDate = dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : null
  const endDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : null
  const { data: rawData, error: fetchError, isLoading, isValidating: isRefreshing, mutate } = useAsaasCharges(startDate, endDate)
  const data = rawData as ChargesData | undefined

  useEffect(() => {
    if (fetchError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar faturas",
        description: "Não foi possível carregar as faturas. Tente novamente.",
      })
    }
  }, [fetchError])

  const handleCancelCharge = async () => {
    if (!selectedCharge) return

    setIsCancelling(true)
    try {
      const res = await fetch(`/api/integrations/asaas/charges?payment_id=${selectedCharge.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        toast({
          title: "Fatura cancelada",
          description: "A fatura foi cancelada com sucesso.",
        })
        mutate()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao cancelar",
        description: error instanceof Error ? error.message : "Erro ao cancelar fatura",
      })
    } finally {
      setIsCancelling(false)
      setCancelDialogOpen(false)
      setSelectedCharge(null)
    }
  }

  const filterCharges = (charges: Charge[]) => {
    if (!searchQuery) return charges
    const query = searchQuery.toLowerCase()
    return charges.filter(c =>
      c.client?.name.toLowerCase().includes(query) ||
      c.client?.company?.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query)
    )
  }

  const getStatusBadge = (charge: Charge) => {
    if (charge.isOverdue) {
      return (
        <Badge variant="negative" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Vencido ({charge.daysOverdue}d)
        </Badge>
      )
    }

    switch (charge.status) {
      case "PENDING":
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="h-3 w-3" />
            Pendente
          </Badge>
        )
      case "RECEIVED":
      case "CONFIRMED":
      case "RECEIVED_IN_CASH":
        return (
          <Badge variant="positive" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Recebido
          </Badge>
        )
      case "REFUNDED":
        return (
          <Badge className="gap-1 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800">
            <RotateCcw className="h-3 w-3" />
            Reembolsado
          </Badge>
        )
      default:
        if ((charge.refund_total ?? 0) > 0 && charge.status !== "REFUNDED") {
          return (
            <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
              <RotateCcw className="h-3 w-3" />
              Reembolso parcial
            </Badge>
          )
        }
        return <Badge variant="neutral">{charge.statusLabel}</Badge>
    }
  }

  const getBillingTypeIcon = (type: string) => {
    switch (type) {
      case "PIX":
        return <Receipt className="h-4 w-4" />
      case "CREDIT_CARD":
        return <CreditCard className="h-4 w-4" />
      case "BOLETO":
        return <Receipt className="h-4 w-4" />
      default:
        return <Receipt className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Asaas não conectado</h3>
          <p className="text-muted-foreground text-center mb-4">
            Conecte sua conta Asaas para gerenciar faturas
          </p>
          <Button asChild>
            <Link href="/admin/settings/integrations">Configurar Integração</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const ChargesTable = ({ charges, showActions = true }: { charges: Charge[]; showActions?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Status</TableHead>
          {showActions && <TableHead className="w-[100px]">Ações</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {charges.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showActions ? 7 : 6} className="text-center text-muted-foreground py-8">
              Nenhuma fatura encontrada
            </TableCell>
          </TableRow>
        ) : (
          charges.map((charge) => (
            <TableRow key={charge.id} className={charge.isOverdue ? "bg-destructive/10" : ""}>
              <TableCell>
                {charge.client ? (
                  <Link href={`/admin/clients/${charge.client.id}`} className="hover:underline">
                    <div className="font-medium">{charge.client.name}</div>
                    {charge.client.company && (
                      <div className="text-xs text-muted-foreground">{charge.client.company}</div>
                    )}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {charge.description || "Fatura"}
              </TableCell>
              <TableCell className="font-medium">
                {formatCurrency(charge.value)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDate(charge.dueDate)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getBillingTypeIcon(charge.billingType)}
                  <span className="text-sm">{charge.billingTypeLabel}</span>
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(charge)}</TableCell>
              {showActions && (
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {charge.invoiceUrl && (
                        <DropdownMenuItem asChild>
                          <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver Fatura
                          </a>
                        </DropdownMenuItem>
                      )}
                      {(charge.status === "PENDING" || charge.status === "OVERDUE") && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setSelectedCharge(charge)
                            setCancelDialogOpen(true)
                          }}
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Cancelar Fatura
                        </DropdownMenuItem>
                      )}
                      {(charge.status === "RECEIVED" || charge.status === "CONFIRMED" || charge.status === "RECEIVED_IN_CASH") && (
                        <DropdownMenuItem
                          onClick={() => {
                            setRefundCharge({
                              id: charge.id,
                              amount: charge.value,
                              description: charge.description,
                              asaas_id: charge.asaas_id,
                              subscription_id: charge.subscription_id,
                              refund_total: charge.refund_total,
                              client_name: charge.client?.name,
                            })
                            setRefundDialogOpen(true)
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reembolsar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Vencidas</span>
            <div className="rounded-full p-1.5 bg-red-500/10">
              <AlertCircle className="h-3 w-3 text-red-500" />
            </div>
          </div>
          <div className="text-xl font-semibold text-foreground">
            {formatCurrency(data.summary.overdue.value)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.summary.overdue.count} faturas
          </p>
        </Card>

        <Card className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Pendentes</span>
            <div className="rounded-full p-1.5 bg-amber-500/10">
              <Clock className="h-3 w-3 text-amber-500" />
            </div>
          </div>
          <div className="text-xl font-semibold text-foreground">
            {formatCurrency(data.summary.pending.value)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.summary.pending.count} faturas
          </p>
        </Card>

        <Card className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Próximos 7 dias</span>
            <div className="rounded-full p-1.5 bg-blue-500/10">
              <Calendar className="h-3 w-3 text-blue-500" />
            </div>
          </div>
          <div className="text-xl font-semibold text-foreground">
            {formatCurrency(data.summary.upcoming.value)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.summary.upcoming.count} faturas
          </p>
        </Card>

        <Card className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Recebidas</span>
            <div className="rounded-full p-1.5 bg-emerald-500/10">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            </div>
          </div>
          <div className="text-xl font-semibold text-foreground">
            {formatCurrency(data.summary.received.value)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {data.summary.received.count} faturas
          </p>
        </Card>
      </div>

      {/* Filters and Table */}
      <Card className="rounded-xl border">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Gerenciamento de Faturas</CardTitle>
              <CardDescription>
                Visualize e gerencie todas as faturas do sistema
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-4">
                    <h4 className="font-medium">Filtrar por período</h4>
                    <CalendarComponent
                      mode="range"
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      locale={ptBR}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDateRange({})}
                      >
                        Limpar
                      </Button>
                      <Button size="sm" onClick={() => mutate()}>
                        Aplicar
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => mutate()}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overdue">
            <TabsList className="mb-4">
              <TabsTrigger value="overdue" className="gap-2">
                <AlertCircle className="h-4 w-4" />
                Vencidas
                {data.summary.overdue.count > 0 && (
                  <Badge variant="negative" className="ml-1">
                    {data.summary.overdue.count}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="h-4 w-4" />
                Pendentes
                {data.summary.pending.count > 0 && (
                  <Badge variant="warning" className="ml-1">
                    {data.summary.pending.count}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="gap-2">
                <Calendar className="h-4 w-4" />
                Próximas
              </TabsTrigger>
              <TabsTrigger value="received" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Recebidas
              </TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>

            <TabsContent value="overdue">
              <ChargesTable charges={filterCharges(data.overdue)} />
            </TabsContent>

            <TabsContent value="pending">
              <ChargesTable charges={filterCharges(data.pending)} />
            </TabsContent>

            <TabsContent value="upcoming">
              <ChargesTable charges={filterCharges(data.upcoming)} />
            </TabsContent>

            <TabsContent value="received">
              <ChargesTable charges={filterCharges(data.received)} showActions={false} />
            </TabsContent>

            <TabsContent value="all">
              <ChargesTable charges={filterCharges(data.all)} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Fatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta fatura?
              {selectedCharge && (
                <div className="mt-2 p-3 rounded-lg bg-muted">
                  <p><strong>Cliente:</strong> {selectedCharge.client?.name || "—"}</p>
                  <p><strong>Valor:</strong> {formatCurrency(selectedCharge.value)}</p>
                  <p><strong>Vencimento:</strong> {formatDate(selectedCharge.dueDate)}</p>
                </div>
              )}
              <p className="mt-2 text-warning">
                Esta ação não pode ser desfeita.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Não, manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelCharge}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Sim, cancelar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund Dialog */}
      <RefundDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        charge={refundCharge}
        onSuccess={() => {
          setRefundCharge(null)
          mutate()
        }}
      />
    </div>
  )
}
