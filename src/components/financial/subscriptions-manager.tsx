"use client"

import { useState, useEffect, useCallback } from "react"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Calendar,
  Ban,
  ChevronDown,
  Search,
  Repeat,
  User,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { formatCurrency, formatDate } from "@/lib/utils"
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

      // Get all clients with asaas_customer_id
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, company, custom_fields")

      const allSubscriptions: Subscription[] = []

      // Filter clients that have asaas_customer_id
      const clientsWithAsaas = (clients || []).filter(
        (c) => (c.custom_fields as Record<string, string>)?.asaas_customer_id
      )

      // Fetch subscriptions in parallel batches (max 5 concurrent)
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

      // Sort by active first, then by nextDueDate
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
    // Normalize to monthly value
    let monthlyValue = s.value
    switch (s.cycle) {
      case "WEEKLY":
        monthlyValue = s.value * 4
        break
      case "BIWEEKLY":
        monthlyValue = s.value * 2
        break
      case "BIMONTHLY":
        monthlyValue = s.value / 2
        break
      case "QUARTERLY":
        monthlyValue = s.value / 3
        break
      case "SEMIANNUALLY":
        monthlyValue = s.value / 6
        break
      case "YEARLY":
        monthlyValue = s.value / 12
        break
    }
    return sum + monthlyValue
  }, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const getStatusBadge = (sub: Subscription) => {
    if (sub.isActive) {
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Ativa
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        {sub.statusLabel}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Repeat className="h-4 w-4 text-emerald-500" />
              Assinaturas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {activeSubscriptions.length}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              MRR Estimado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(totalMRR)}
            </div>
            <p className="text-xs text-muted-foreground">Receita Mensal Recorrente</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Inativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {inactiveSubscriptions.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="rounded-xl border bg-card">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Assinaturas</CardTitle>
              <CardDescription>
                Gerencie as assinaturas recorrentes dos clientes
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
              <Button
                variant="outline"
                size="icon"
                onClick={() => loadSubscriptions(true)}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Ciclo</TableHead>
                <TableHead>Próximo Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma assinatura encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      {sub.clientId ? (
                        <Link href={`/clients/${sub.clientId}`} className="hover:underline">
                          <div className="font-medium">{sub.clientName}</div>
                          {sub.clientCompany && (
                            <div className="text-xs text-muted-foreground">{sub.clientCompany}</div>
                          )}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {sub.description || "Assinatura"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(sub.value)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{sub.cycleLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {formatDate(sub.nextDueDate)}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(sub)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {sub.isActive && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                setSelectedSubscription(sub)
                                setCancelDialogOpen(true)
                              }}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Cancelar Assinatura
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Assinatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar esta assinatura?
              {selectedSubscription && (
                <div className="mt-2 p-3 rounded-lg bg-muted">
                  <p><strong>Cliente:</strong> {selectedSubscription.clientName || "—"}</p>
                  <p><strong>Valor:</strong> {formatCurrency(selectedSubscription.value)}</p>
                  <p><strong>Ciclo:</strong> {selectedSubscription.cycleLabel}</p>
                </div>
              )}
              <p className="mt-2 text-warning">
                O cliente não será mais cobrado automaticamente após o cancelamento.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Não, manter</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
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
    </div>
  )
}
