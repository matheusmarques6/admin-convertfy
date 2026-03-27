"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Calendar,
  Ban,
  Search,
  Repeat,
  User,
  MoreHorizontal,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

interface Subscription {
  id: string
  customer: string
  value: number
  status: string
  statusLabel: string
  cycle: string
  cycleLabel: string
  nextDueDate: string
  description?: string
  billingType: string
  isActive: boolean
  clientId?: string
  clientName?: string
  clientCompany?: string
}

export function SubscriptionsManager() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const loadSubscriptions = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const supabase = createClient()

      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, company, custom_fields")

      const allSubscriptions: Subscription[] = []

      const clientsWithAsaas = (clients || []).filter(
        (c) => (c.custom_fields as Record<string, string>)?.asaas_customer_id
      )

      const BATCH_SIZE = 5
      for (let i = 0; i < clientsWithAsaas.length; i += BATCH_SIZE) {
        const batch = clientsWithAsaas.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(async (client) => {
            const res = await fetch(`/api/integrations/asaas/subscriptions?client_id=${client.id}`)
            const data = await res.json()
            return { client, data }
          })
        )

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.data.success && result.value.data.subscriptions) {
            const { client, data } = result.value
            data.subscriptions.forEach((sub: Subscription) => {
              allSubscriptions.push({
                ...sub,
                clientId: client.id,
                clientName: client.name,
                clientCompany: client.company,
              })
            })
          }
        }
      }

      allSubscriptions.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime()
      })

      setSubscriptions(allSubscriptions)
    } catch (error) {
      console.error("Error loading subscriptions:", error)
      toast({
        variant: "destructive",
        title: "Erro ao carregar assinaturas",
        description: "Não foi possível carregar as assinaturas. Tente novamente.",
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  const handleCancelSubscription = async () => {
    if (!selectedSubscription) return

    setIsCancelling(true)
    try {
      const res = await fetch(`/api/integrations/asaas/subscriptions?subscription_id=${selectedSubscription.id}`, {
        method: "DELETE",
      })
      const result = await res.json()

      if (result.success) {
        toast({
          title: "Assinatura cancelada",
          description: "A assinatura foi cancelada com sucesso.",
        })
        loadSubscriptions(true)
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao cancelar",
        description: error instanceof Error ? error.message : "Erro ao cancelar assinatura",
      })
    } finally {
      setIsCancelling(false)
      setCancelDialogOpen(false)
      setSelectedSubscription(null)
    }
  }

  const filteredSubscriptions = searchQuery
    ? subscriptions.filter(s =>
        s.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.clientCompany?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : subscriptions

  const activeSubscriptions = filteredSubscriptions.filter(s => s.isActive)
  const inactiveSubscriptions = filteredSubscriptions.filter(s => !s.isActive)

  const totalMRR = activeSubscriptions.reduce((sum, s) => {
    let monthlyValue = s.value
    switch (s.cycle) {
      case "WEEKLY": monthlyValue = s.value * 4; break
      case "BIWEEKLY": monthlyValue = s.value * 2; break
      case "BIMONTHLY": monthlyValue = s.value / 2; break
      case "QUARTERLY": monthlyValue = s.value / 3; break
      case "SEMIANNUALLY": monthlyValue = s.value / 6; break
      case "YEARLY": monthlyValue = s.value / 12; break
    }
    return sum + monthlyValue
  }, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-[#5C6378]" />
      </div>
    )
  }

  const getStatusBadge = (sub: Subscription) => {
    if (sub.isActive) {
      return (
        <Badge variant="positive" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Ativa
        </Badge>
      )
    }
    return (
      <Badge variant="neutral" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        {sub.statusLabel}
      </Badge>
    )
  }

  // DataTable columns
  const columns: ColumnDef<Subscription>[] = [
    {
      accessorKey: "clientName",
      header: "Cliente",
      type: "text",
      mobilePriority: "title",
      cell: (row) => (
        <div className="min-w-0">
          {row.clientId ? (
            <Link href={`/admin/clients/${row.clientId}`} className="hover:underline">
              <p className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] truncate">
                {row.clientName}
              </p>
              {row.clientCompany && (
                <p className="text-xs text-gray-400 dark:text-[#5C6378] truncate">
                  {row.clientCompany}
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
          {row.description || "Assinatura"}
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
      accessorKey: "cycle",
      header: "Ciclo",
      type: "badge",
      mobilePriority: "hidden",
      cell: (row) => (
        <Badge variant="neutral" showDot={false} className="text-[10px]">
          {row.cycleLabel}
        </Badge>
      ),
    },
    {
      accessorKey: "nextDueDate",
      header: "Próximo Vencimento",
      type: "date",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => (
        <span className="text-sm font-mono tabular-nums text-gray-600 dark:text-[#8B92A5]">
          {formatDate(row.nextDueDate)}
        </span>
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
            {row.isActive && (
              <DropdownMenuItem
                className="text-[#991B1B] dark:text-[#FCA5A5]"
                onClick={() => {
                  setSelectedSubscription(row)
                  setCancelDialogOpen(true)
                }}
              >
                <Ban className="h-4 w-4 mr-2" />
                Cancelar Assinatura
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
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Repeat className="h-4 w-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Assinaturas Ativas</span>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {activeSubscriptions.length}
          </p>
        </div>

        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-[#4E62D8] dark:text-[#7B8CEA]" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">MRR Estimado</span>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#4E62D8] dark:text-[#7B8CEA]">
            {formatCurrency(totalMRR)}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-1">Receita Mensal Recorrente</p>
        </div>

        <div className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] bg-white dark:bg-[#1A1D27] p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-gray-400 dark:text-[#5C6378]" />
            <span className="text-[13px] font-medium text-gray-500 dark:text-[#8B92A5]">Inativas</span>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {inactiveSubscriptions.length}
          </p>
        </div>
      </div>

      {/* Search + Refresh */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-[#EAEDF3]">
          Assinaturas
        </h3>
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
            onClick={() => loadSubscriptions(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* DataTable — DS v3.0 Rule 5 (no zebra-striping) */}
      <DataTable
        columns={columns}
        data={filteredSubscriptions}
        emptyMessage="Nenhuma assinatura encontrada"
        rowKey="id"
      />

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Assinatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta assinatura?
              {selectedSubscription && (
                <div className="mt-2 p-3 rounded-[8px] bg-gray-50 dark:bg-[#0F1117]">
                  <p><strong>Cliente:</strong> {selectedSubscription.clientName || "—"}</p>
                  <p><strong>Valor:</strong> {formatCurrency(selectedSubscription.value)}</p>
                  <p><strong>Ciclo:</strong> {selectedSubscription.cycleLabel}</p>
                </div>
              )}
              <p className="mt-2 text-[#991B1B] dark:text-[#FCA5A5]">
                O cliente não será mais cobrado automaticamente após o cancelamento.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Não, manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
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
    </div>
  )
}
