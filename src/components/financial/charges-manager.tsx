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
  Search,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { StatusTabs } from "@/components/ui/status-tabs"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
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
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { toast } from "@/lib/hooks/use-toast"
import { RefundDialog, type RefundCharge } from "@/components/financial/refund-dialog"
import { CHARGE_TYPE_LABELS, isChargeType, monthsLabel } from "@/lib/services/charge-description"
import Link from "next/link"

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
  /** Classificação do espelho local (migration 20261113). */
  charge_type?: string | null
  reference_months?: string[] | null
  store?: { id: string; name: string } | null
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

type ChargeTab = "overdue" | "pending" | "upcoming" | "received" | "all"

export function ChargesManager() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<ChargeTab>("overdue")
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundCharge, setRefundCharge] = useState<RefundCharge | null>(null)

  const { data: rawData, error: fetchError, isLoading, isValidating: isRefreshing, mutate } = useAsaasCharges(null, null)
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
      c.id.toLowerCase().includes(query) ||
      // "comissão", "assinatura", nome da loja e "jul/26" também filtram
      (c.charge_type && isChargeType(c.charge_type) && CHARGE_TYPE_LABELS[c.charge_type].toLowerCase().includes(query)) ||
      c.store?.name.toLowerCase().includes(query) ||
      monthsLabel(c.reference_months).toLowerCase().includes(query)
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-[#5C6378]" />
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27]">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 dark:text-[#5C6378] mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-[#EAEDF3] mb-2">Asaas não conectado</h3>
          <p className="text-gray-500 dark:text-[#8B92A5] text-center mb-4">
            Conecte sua conta Asaas para gerenciar faturas
          </p>
          <Button asChild>
            <Link href="/admin/settings/integrations">Configurar Integração</Link>
          </Button>
        </div>
      </div>
    )
  }

  // Get current tab charges
  const currentCharges = filterCharges(data[activeTab] || [])

  // StatusTabs items with counts
  const tabItems = [
    { value: "overdue" as const, label: "Vencidas", count: data.summary.overdue.count },
    { value: "pending" as const, label: "Pendentes", count: data.summary.pending.count },
    { value: "upcoming" as const, label: "Próximas", count: data.summary.upcoming.count },
    { value: "received" as const, label: "Recebidas", count: data.summary.received.count },
    { value: "all" as const, label: "Todas", count: data.summary.total.count },
  ]

  // DataTable columns
  const columns: ColumnDef<Charge>[] = [
    {
      accessorKey: "client",
      header: "Cliente",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="min-w-0">
          {row.client ? (
            <Link href={`/admin/clients/${row.client.id}`} className="hover:underline">
              <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                {row.client.name}
              </p>
              {row.client.company && (
                <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
                  {row.client.company}
                </p>
              )}
            </Link>
          ) : (
            <span className="text-sm text-gray-400 dark:text-[#5C6378]">—</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrição",
      type: "text",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) => (
        <span className="text-sm text-gray-600 dark:text-[#8B92A5] truncate max-w-[200px] block">
          {row.description || "Fatura"}
        </span>
      ),
    },
    {
      accessorKey: "value",
      header: "Valor",
      type: "currency",
      mobilePriority: "detail",
      cell: (row) => (
        <span className="text-sm font-medium font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
          {formatCurrency(row.value)}
        </span>
      ),
    },
    {
      accessorKey: "dueDate",
      header: "Vencimento",
      type: "date",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => (
        <span className={cn(
          "text-sm font-mono tabular-nums",
          row.isOverdue
            ? "text-[#991B1B] dark:text-[#FCA5A5] font-semibold"
            : "text-gray-600 dark:text-[#8B92A5]"
        )}>
          {formatDate(row.dueDate)}
          {row.isOverdue && " ⚠"}
        </span>
      ),
    },
    {
      // Tipo de NEGÓCIO (assinatura × comissão × avulsa) + mês de
      // referência + loja — vem do espelho local; "—" = ainda não
      // classificada (classifica-se no financeiro do cliente).
      accessorKey: "charge_type",
      header: "Referente a",
      type: "custom",
      mobilePriority: "detail",
      cell: (row) => {
        const label = row.charge_type && isChargeType(row.charge_type) ? CHARGE_TYPE_LABELS[row.charge_type] : null
        const months = monthsLabel(row.reference_months)
        if (!label && !row.store) {
          return <span className="text-sm text-gray-400 dark:text-[#5C6378]">—</span>
        }
        return (
          <div className="min-w-0">
            {label && (
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0 text-[11px] font-semibold rounded-[4px] border",
                  row.charge_type === "commission"
                    ? "bg-[#EEF0FB] text-[#2137B6] border-[#C7CDEF]"
                    : row.charge_type === "subscription"
                      ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
                      : "bg-[#F3F4F6] text-gray-600 border-[#E5E7EB]",
                )}
              >
                {label}
                {months ? ` · ${months}` : ""}
              </span>
            )}
            {row.store && (
              <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] truncate mt-0.5">{row.store.name}</p>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: "billingType",
      header: "Forma",
      type: "custom",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.billingType === "CREDIT_CARD" ? (
            <CreditCard className="h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
          ) : (
            <Receipt className="h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
          )}
          <span className="text-sm text-gray-600 dark:text-[#8B92A5]">{row.billingTypeLabel}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => getStatusBadge(row),
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      width: "48px",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Icon icon={MoreHorizontal} size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.invoiceUrl && (
              <DropdownMenuItem asChild>
                <a href={row.invoiceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Fatura
                </a>
              </DropdownMenuItem>
            )}
            {(row.status === "PENDING" || row.status === "OVERDUE") && (
              <DropdownMenuItem
                className="text-[#991B1B] dark:text-[#FCA5A5]"
                onClick={() => {
                  setSelectedCharge(row)
                  setCancelDialogOpen(true)
                }}
              >
                <Ban className="h-4 w-4 mr-2" />
                Cancelar Fatura
              </DropdownMenuItem>
            )}
            {(row.status === "RECEIVED" || row.status === "CONFIRMED" || row.status === "RECEIVED_IN_CASH") && (
              <DropdownMenuItem
                onClick={() => {
                  setRefundCharge({
                    id: row.id,
                    amount: row.value,
                    description: row.description,
                    asaas_id: row.asaas_id,
                    subscription_id: row.subscription_id,
                    refund_total: row.refund_total,
                    client_name: row.client?.name,
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
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards — DS v3.0 Rule 2 */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Vencidas</span>
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {formatCurrency(data.summary.overdue.value)}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
            {data.summary.overdue.count} faturas
          </p>
        </div>

        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Pendentes</span>
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {formatCurrency(data.summary.pending.value)}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
            {data.summary.pending.count} faturas
          </p>
        </div>

        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Próximos 7 dias</span>
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {formatCurrency(data.summary.upcoming.value)}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
            {data.summary.upcoming.count} faturas
          </p>
        </div>

        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Recebidas</span>
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {formatCurrency(data.summary.received.value)}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
            {data.summary.received.count} faturas
          </p>
        </div>
      </div>

      {/* Overdue Alert Banner */}
      {data.summary.overdue.count > 0 && (
        <div className="rounded-[8px] border border-[#991B1B]/30 dark:border-[#FCA5A5]/20 bg-red-50 dark:bg-red-900/10 px-5 py-3">
          <div className="flex items-center gap-4">
            <AlertCircle className="h-5 w-5 text-[#991B1B] dark:text-[#FCA5A5] shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#991B1B] dark:text-[#FCA5A5]">
                {data.summary.overdue.count} faturas vencidas totalizando {formatCurrency(data.summary.overdue.value)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* StatusTabs filter + Search — DS v3.0 Rule 18 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StatusTabs
          value={activeTab}
          onValueChange={setActiveTab}
          items={tabItems}
        />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
            <Input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => mutate()}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* DataTable — DS v3.0 Rule 5 (no zebra-striping) */}
      <DataTable
        columns={columns}
        data={currentCharges}
        emptyMessage="Nenhuma fatura encontrada"
        rowKey="id"
      />

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Fatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta fatura?
              {selectedCharge && (
                <div className="mt-2 p-3 rounded-[8px] bg-gray-50 dark:bg-[#0F1117]">
                  <p><strong>Cliente:</strong> {selectedCharge.client?.name || "—"}</p>
                  <p><strong>Valor:</strong> {formatCurrency(selectedCharge.value)}</p>
                  <p><strong>Vencimento:</strong> {formatDate(selectedCharge.dueDate)}</p>
                </div>
              )}
              <p className="mt-2 text-[#991B1B] dark:text-[#FCA5A5]">
                Esta ação não pode ser desfeita.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Não, manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelCharge}
              disabled={isCancelling}
              className="bg-[#991B1B] text-white hover:bg-[#991B1B]/90"
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
