"use client"

import { useState, useMemo } from "react"
import { useWiseTransactions, useWiseBalances, useWiseReconciled } from "@/lib/hooks/use-api-data"
import {
  Wallet,
  RefreshCw,
  Loader2,
  Search,
  Check,
  AlertCircle,
  Calendar,
  Link2,
  X,
  ArrowDownRight,
  Building2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { WiseTransaction } from "@/lib/integrations/types"
import { toast } from "@/lib/hooks/use-toast"

interface Client {
  id: string
  name: string
  email: string
  company?: string
}

interface Payment {
  currency: string
  transaction: WiseTransaction
}

interface Balance {
  id: number
  currency: string
  amount: { value: number; currency: string }
}

export function WiseReconciliation() {
  const [searchTerm, setSearchTerm] = useState("")
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  })

  // Reconciliation dialog
  const [reconcileDialog, setReconcileDialog] = useState<{
    open: boolean
    payment: Payment | null
  }>({ open: false, payment: null })
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [localReconciled, setLocalReconciled] = useState<Set<string>>(new Set())

  // SWR hooks for all 3 data sources
  const {
    data: transactionsData,
    error: transactionsError,
    isLoading: transactionsLoading,
    isValidating: transactionsValidating,
    mutate: mutateTransactions,
  } = useWiseTransactions(dateRange.from.toISOString(), dateRange.to.toISOString())

  const {
    data: balancesData,
    isLoading: balancesLoading,
    mutate: mutateBalances,
  } = useWiseBalances()

  const {
    data: reconciledData,
    isLoading: reconciledLoading,
    mutate: mutateReconciled,
  } = useWiseReconciled()

  // Derive state from SWR data
  const payments: Payment[] = (transactionsData as Record<string, unknown>)?.payments as Payment[] || []
  const clients: Client[] = (transactionsData as Record<string, unknown>)?.clients as Client[] || []
  const balances: Balance[] = (balancesData as Record<string, unknown>)?.balances as Balance[] || []

  const reconciled = useMemo(() => {
    const refs = new Set<string>(
      ((reconciledData as Record<string, unknown>)?.reconciliations as Array<{ transaction_reference: string }> || []).map(
        (r) => r.transaction_reference
      )
    )
    // Merge locally added reconciliations (optimistic)
    localReconciled.forEach(ref => refs.add(ref))
    return refs
  }, [reconciledData, localReconciled])

  const loading = transactionsLoading || balancesLoading || reconciledLoading
  const refreshing = transactionsValidating
  const error = transactionsError ? (transactionsError instanceof Error ? transactionsError.message : "Failed to load data") : null

  const handleRefresh = () => {
    mutateTransactions()
    mutateBalances()
    mutateReconciled()
  }

  const openReconcileDialog = (payment: Payment) => {
    setReconcileDialog({ open: true, payment })
    setSelectedClient("")
    setNotes("")

    // Try to auto-match client by sender name
    const senderName = payment.transaction.details.senderName?.toLowerCase() || ""
    const matchedClient = clients.find(
      (c) =>
        c.name.toLowerCase().includes(senderName) ||
        senderName.includes(c.name.toLowerCase()) ||
        (c.company && senderName.includes(c.company.toLowerCase()))
    )
    if (matchedClient) {
      setSelectedClient(matchedClient.id)
    }
  }

  const handleReconcile = async () => {
    if (!reconcileDialog.payment || !selectedClient) return

    setSaving(true)
    try {
      const res = await fetch("/api/integrations/wise/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_reference: reconcileDialog.payment.transaction.referenceNumber,
          client_id: selectedClient,
          amount: reconcileDialog.payment.transaction.amount.value,
          currency: reconcileDialog.payment.currency,
          transaction_date: reconcileDialog.payment.transaction.date,
          notes,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to reconcile")
      }

      // Optimistic update + revalidate
      setLocalReconciled((prev) =>
        new Set(Array.from(prev).concat([reconcileDialog.payment!.transaction.referenceNumber]))
      )
      mutateReconciled()

      toast({
        title: "Pagamento reconciliado",
        description: "O pagamento foi atribuído ao cliente com sucesso.",
      })
      setReconcileDialog({ open: false, payment: null })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao reconciliar",
        description: err instanceof Error ? err.message : "Erro ao reconciliar pagamento",
      })
    } finally {
      setSaving(false)
    }
  }

  const filteredPayments = payments.filter((p) => {
    const searchLower = searchTerm.toLowerCase()
    return (
      p.transaction.details.senderName?.toLowerCase().includes(searchLower) ||
      p.transaction.details.description?.toLowerCase().includes(searchLower) ||
      p.transaction.details.paymentReference?.toLowerCase().includes(searchLower) ||
      p.transaction.referenceNumber.toLowerCase().includes(searchLower)
    )
  })

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(value)
  }

  const totalByCurrency = balances.reduce((acc, b) => {
    acc[b.currency] = (acc[b.currency] || 0) + b.amount.value
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="font-semibold text-lg mb-2">Erro ao carregar dados</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleRefresh}>Tentar novamente</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with balances */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[#9FE870]" />
            Wise - Conciliação de Pagamentos
          </h2>
          <p className="text-sm text-muted-foreground">
            Atribua pagamentos recebidos aos clientes
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Balance Cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(totalByCurrency).map(([currency, amount]) => (
            <GlowCard key={currency} color="success" intensity="moderate">
              <CardHeader className="pb-2">
                <CardDescription>Saldo {currency}</CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(amount, currency)}
                </CardTitle>
              </CardHeader>
            </GlowCard>
          ))}
        </div>
      )}

      {/* Filters */}
      <GlowCard color="primary" intensity="subtle">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Nome do remetente, descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Label>Período</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full sm:w-[280px] justify-start text-left font-normal"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                    {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to })
                      }
                    }}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </GlowCard>

      {/* Transactions Table */}
      <GlowCard color="primary" intensity="subtle">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-success" />
            Pagamentos Recebidos
            <Badge variant="secondary" className="ml-2">
              {filteredPayments.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Pagamentos do período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum pagamento encontrado no período selecionado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Remetente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => {
                  const isReconciled = reconciled.has(
                    payment.transaction.referenceNumber
                  )
                  return (
                    <TableRow key={payment.transaction.referenceNumber}>
                      <TableCell>
                        {format(
                          new Date(payment.transaction.date),
                          "dd/MM/yyyy",
                          { locale: ptBR }
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {payment.transaction.details.senderName || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {payment.transaction.details.description ||
                          payment.transaction.details.paymentReference ||
                          "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-success">
                        +{formatCurrency(
                          payment.transaction.amount.value,
                          payment.currency
                        )}
                      </TableCell>
                      <TableCell>
                        {isReconciled ? (
                          <Badge
                            variant="default"
                            className="bg-success/10 text-success hover:bg-success/20"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Reconciliado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isReconciled && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReconcileDialog(payment)}
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Atribuir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlowCard>

      {/* Reconcile Dialog */}
      <Dialog
        open={reconcileDialog.open}
        onOpenChange={(open) =>
          setReconcileDialog({ open, payment: reconcileDialog.payment })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Pagamento a Cliente</DialogTitle>
            <DialogDescription>
              Selecione o cliente correspondente a este pagamento
            </DialogDescription>
          </DialogHeader>

          {reconcileDialog.payment && (
            <div className="space-y-4">
              {/* Payment Info */}
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor:</span>
                    <span className="font-semibold text-success">
                      {formatCurrency(
                        reconcileDialog.payment.transaction.amount.value,
                        reconcileDialog.payment.currency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remetente:</span>
                    <span>
                      {reconcileDialog.payment.transaction.details.senderName ||
                        "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data:</span>
                    <span>
                      {format(
                        new Date(reconcileDialog.payment.transaction.date),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </span>
                  </div>
                  {reconcileDialog.payment.transaction.details
                    .paymentReference && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Referência:</span>
                      <span>
                        {
                          reconcileDialog.payment.transaction.details
                            .paymentReference
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Selection */}
              <div className="space-y-2">
                <Label htmlFor="client">Cliente</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        <div className="flex flex-col">
                          <span>{client.name}</span>
                          {client.company && (
                            <span className="text-xs text-muted-foreground">
                              {client.company}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Adicione observações sobre este pagamento..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setReconcileDialog({ open: false, payment: null })
              }
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleReconcile}
              disabled={!selectedClient || saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
