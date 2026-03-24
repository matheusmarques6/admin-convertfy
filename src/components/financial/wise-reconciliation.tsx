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
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
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

  const [reconcileDialog, setReconcileDialog] = useState<{
    open: boolean
    payment: Payment | null
  }>({ open: false, payment: null })
  const [selectedClient, setSelectedClient] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [localReconciled, setLocalReconciled] = useState<Set<string>>(new Set())

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

  const payments: Payment[] = (transactionsData as Record<string, unknown>)?.payments as Payment[] || []
  const clients: Client[] = (transactionsData as Record<string, unknown>)?.clients as Client[] || []
  const balances: Balance[] = (balancesData as Record<string, unknown>)?.balances as Balance[] || []

  const reconciled = useMemo(() => {
    const refs = new Set<string>(
      ((reconciledData as Record<string, unknown>)?.reconciliations as Array<{ transaction_reference: string }> || []).map(
        (r) => r.transaction_reference
      )
    )
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

  const formatCurrencyValue = (value: number, currency: string) => {
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
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-[#5C6378]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27]">
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <AlertCircle className="h-12 w-12 text-[#991B1B] dark:text-[#FCA5A5] mb-4" />
          <h3 className="font-semibold text-lg text-gray-900 dark:text-[#EAEDF3] mb-2">Erro ao carregar dados</h3>
          <p className="text-gray-500 dark:text-[#8B92A5] mb-4">{error}</p>
          <Button onClick={handleRefresh}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  // Flatten Payment for DataTable (accessorKey must be top-level key)
  type FlatPayment = Payment & {
    id: string
    _description: string
    _amount: string
    _status: string
    _action: string
  }

  const flatPayments: FlatPayment[] = filteredPayments.map((p) => ({
    ...p,
    id: p.transaction.referenceNumber,
    _description: p.transaction.details.description || p.transaction.details.paymentReference || "—",
    _amount: formatCurrencyValue(p.transaction.amount.value, p.currency),
    _status: reconciled.has(p.transaction.referenceNumber) ? "reconciled" : "pending",
    _action: "",
  }))

  const flatColumns: ColumnDef<FlatPayment>[] = [
    {
      accessorKey: "transaction",
      header: "Data",
      type: "date",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-sm font-mono tabular-nums text-gray-600 dark:text-[#8B92A5]">
          {format(new Date(row.transaction.date), "dd/MM/yyyy", { locale: ptBR })}
        </span>
      ),
    },
    {
      accessorKey: "currency",
      header: "Remetente",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
          <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
            {row.transaction.details.senderName || "—"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "_description",
      header: "Descrição",
      type: "text",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) => (
        <span className="text-sm text-gray-600 dark:text-[#8B92A5] truncate max-w-[200px] block">
          {row._description}
        </span>
      ),
    },
    {
      accessorKey: "_amount",
      header: "Valor",
      type: "currency",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-sm font-medium font-mono tabular-nums text-emerald-600 dark:text-emerald-400 text-right">
          +{formatCurrencyValue(row.transaction.amount.value, row.currency)}
        </span>
      ),
    },
    {
      accessorKey: "_status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => {
        const isRecon = reconciled.has(row.transaction.referenceNumber)
        return isRecon ? (
          <Badge variant="positive">
            <Check className="h-3 w-3 mr-1" />
            Reconciliado
          </Badge>
        ) : (
          <Badge variant="neutral">Pendente</Badge>
        )
      },
    },
    {
      accessorKey: "_action",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      width: "100px",
      cell: (row) => {
        const isRecon = reconciled.has(row.transaction.referenceNumber)
        if (isRecon) return null
        return (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openReconcileDialog(row)}
          >
            <Link2 className="h-4 w-4 mr-1" />
            Atribuir
          </Button>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#EAEDF3]">
            Wise - Conciliação
          </h2>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Balance Cards — DS v3.0 Rule 2 */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(totalByCurrency).map(([currency, amount]) => (
            <div
              key={currency}
              className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4"
            >
              <p className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5] mb-1">
                Saldo {currency}
              </p>
              <p className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                {formatCurrencyValue(amount, currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
            <Input
              placeholder="Buscar remetente, descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              className="w-full sm:w-auto justify-start text-left font-normal"
            >
              <Calendar className="mr-2 h-4 w-4" />
              <span className="font-mono tabular-nums text-sm">
                {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
              </span>
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

      {/* Transactions count */}
      <div className="flex items-center gap-2">
        <ArrowDownRight className="h-4 w-4 text-emerald-500" />
        <span className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3]">
          Pagamentos Recebidos
        </span>
        <Badge variant="neutral" className="font-mono tabular-nums">
          {filteredPayments.length}
        </Badge>
      </div>

      {/* DataTable — DS v3.0 Rule 5 */}
      <DataTable
        columns={flatColumns}
        data={flatPayments}
        emptyMessage="Nenhum pagamento encontrado no período"
        rowKey="id"
      />

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
              <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] p-4 bg-gray-50 dark:bg-[#0F1117]">
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-[#8B92A5]">Valor:</span>
                    <span className="font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatCurrencyValue(
                        reconcileDialog.payment.transaction.amount.value,
                        reconcileDialog.payment.currency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-[#8B92A5]">Remetente:</span>
                    <span className="text-gray-900 dark:text-[#EAEDF3]">
                      {reconcileDialog.payment.transaction.details.senderName || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-[#8B92A5]">Data:</span>
                    <span className="font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
                      {format(
                        new Date(reconcileDialog.payment.transaction.date),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </span>
                  </div>
                  {reconcileDialog.payment.transaction.details.paymentReference && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-[#8B92A5]">Referência:</span>
                      <span className="text-gray-900 dark:text-[#EAEDF3]">
                        {reconcileDialog.payment.transaction.details.paymentReference}
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
                            <span className="text-xs text-gray-400 dark:text-[#5C6378]">
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
              variant="secondary"
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
