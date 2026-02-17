"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Mail,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Repeat,
  DollarSign,
  RefreshCw,
} from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, getInitials, getHealthScoreColor } from "@/lib/utils"
import { clientService } from "@/lib/services"
import { usePermission } from "@/lib/permissions/hooks"
import { useAuthStore } from "@/lib/store"
import { toast } from "@/lib/hooks/use-toast"
import type { Client, Contract, User } from "@/types"

const CACHE_KEY = "clients_status_cache"
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface ClientWithRelations extends Client {
  contracts?: Contract[]
  owner?: User
}

interface ClientsTableProps {
  clients: ClientWithRelations[]
}

interface ClientStatus {
  asaasId: string
  hasOverdue: boolean
  overdueCount: number
  overdueValue: number
  pendingCount: number
  pendingValue: number
  subscription?: {
    value: number
    cycle: string
    status: string
  }
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" }> = {
  active: { label: "Ativo", variant: "success" },
  inactive: { label: "Inativo", variant: "secondary" },
  churned: { label: "Churned", variant: "destructive" },
  prospect: { label: "Prospect", variant: "default" },
  onboarding: { label: "Onboarding", variant: "warning" },
}

const cycleLabels: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUALLY: "Semestral",
  YEARLY: "Anual",
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const router = useRouter()
  const { user } = useAuthStore()
  const canDelete = usePermission("clients.delete")
  const canEdit = usePermission("clients.edit")
  const [deleteClient, setDeleteClient] = useState<ClientWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [clientsStatus, setClientsStatus] = useState<Record<string, ClientStatus>>({})
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)

  function getCachedStatus(): Record<string, ClientStatus> | null {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL) {
          return data
        }
      }
    } catch {
      // Ignore cache errors
    }
    return null
  }

  function setCachedStatus(data: Record<string, ClientStatus>) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch {
      // Ignore cache errors
    }
  }

  const loadClientsStatus = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true)
    }
    setLoadError(false)

    // Retry logic with exponential backoff
    let attempts = 0
    const maxAttempts = 3

    while (attempts < maxAttempts) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000) // 25s timeout

        const response = await fetch("/api/integrations/asaas/clients-status", {
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        const statusData = data.clientsStatus || data.data?.clientsStatus || {}
        setClientsStatus(statusData)
        setCachedStatus(statusData)
        setLoadError(false)
        break
      } catch (error) {
        attempts++
        console.error(`Attempt ${attempts} failed:`, error)

        if (attempts < maxAttempts) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000))
        } else {
          setLoadError(true)
        }
      }
    }

    setIsLoadingStatus(false)
    setIsRefreshing(false)
  }, [])

  // Load cached data immediately on mount
  useEffect(() => {
    const cached = getCachedStatus()
    if (cached) {
      setClientsStatus(cached)
      setIsLoadingStatus(false)
    }
  }, [])

  // Fetch fresh data
  useEffect(() => {
    loadClientsStatus()
  }, [loadClientsStatus])

  const handleManualRefresh = () => {
    loadClientsStatus(true)
  }

  async function handleDelete() {
    if (!deleteClient || !user?.id) return

    setIsDeleting(true)
    try {
      await clientService.delete(deleteClient.id, user.id)

      toast({
        title: "Cliente excluído",
        description: "O cliente foi excluído com sucesso.",
      })

      router.refresh()
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: "Não foi possível excluir o cliente.",
      })
    } finally {
      setIsDeleting(false)
      setDeleteClient(null)
    }
  }

  const getActiveContract = (contracts?: Contract[]) => {
    return contracts?.find((c) => c.status === "active")
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Mail className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Nenhum cliente encontrado</h3>
        <p className="text-muted-foreground mt-1">
          Comece adicionando seu primeiro cliente
        </p>
        <Button asChild className="mt-4">
          <Link href="/clients/new">Adicionar Cliente</Link>
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <div className="flex items-center gap-2">
                  Pagamento
                  {(isLoadingStatus || isRefreshing) && (
                    <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  {loadError && !isLoadingStatus && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={handleManualRefresh}
                        >
                          <RefreshCw className="h-3 w-3 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Erro ao carregar. Clique para tentar novamente.</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Saúde</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const activeContract = getActiveContract(client.contracts)
              const statusInfo = statusLabels[client.status] || statusLabels.prospect
              const healthColor = getHealthScoreColor(client.health_score)
              const clientStatus = clientsStatus[client.id]

              return (
                <TableRow key={client.id} className={clientStatus?.hasOverdue ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-medium hover:underline flex items-center gap-2"
                        >
                          {client.name}
                          {clientStatus?.hasOverdue && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Inadimplente - {clientStatus.overdueCount} cobranças vencidas</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {client.company && <span>{client.company}</span>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isLoadingStatus && !clientStatus ? (
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ) : clientStatus ? (
                      <div className="space-y-1">
                        {clientStatus.hasOverdue ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertCircle className="h-3 w-3" />
                            Inadimplente
                          </Badge>
                        ) : (
                          <Badge variant="success" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Adimplente
                          </Badge>
                        )}
                        {clientStatus.overdueValue > 0 && (
                          <p className="text-xs text-red-500">
                            {formatCurrency(clientStatus.overdueValue)} vencido
                          </p>
                        )}
                        {clientStatus.pendingValue > 0 && !clientStatus.hasOverdue && (
                          <p className="text-xs text-amber-500">
                            {formatCurrency(clientStatus.pendingValue)} pendente
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sem vínculo Asaas
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isLoadingStatus && !clientStatus ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-14" />
                      </div>
                    ) : clientStatus?.subscription ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Repeat className="h-3 w-3 text-purple-500" />
                          <span className="font-medium text-sm">
                            {formatCurrency(clientStatus.subscription.value)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {cycleLabels[clientStatus.subscription.cycle] || clientStatus.subscription.cycle}
                        </p>
                      </div>
                    ) : activeContract ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-emerald-500" />
                          <span className="font-medium text-sm">
                            {formatCurrency(activeContract.monthly_value)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{activeContract.plan_name}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          healthColor === "green"
                            ? "bg-emerald-500"
                            : healthColor === "yellow"
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                      />
                      <span className="text-sm font-medium">{client.health_score}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {client.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={client.owner.avatar_url} />
                          <AvatarFallback className="text-xs">
                            {getInitials(client.owner.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{client.owner.name}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/clients/${client.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link href={`/clients/${client.id}/edit`}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {client.website && (
                          <DropdownMenuItem asChild>
                            <a
                              href={client.website}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Visitar site
                            </a>
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteClient(client)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteClient} onOpenChange={() => setDeleteClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente &quot;{deleteClient?.name}&quot;?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
