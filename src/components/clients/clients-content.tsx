"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ExternalLink,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, getInitials } from "@/lib/utils"
import { StatusTabs } from "@/components/ui/status-tabs"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { Badge } from "@/components/ui/badge"
import { FilterSelect } from "@/components/ui/filter-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/ui/icon"
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer"
import { useMediaQuery } from "@/hooks/use-media-query"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { useAuthStore } from "@/lib/store"
import { clientService } from "@/lib/services"
import { toast } from "@/lib/hooks/use-toast"
import type { Client, Contract, User } from "@/types"

// ─── Types ────────────────────────────────────────────────

interface ClientStore {
  id: string
  store_name: string
  platform: string
  is_active: boolean
}

interface ClientWithRelations extends Client {
  contracts?: Contract[]
  owner?: User
  client_stores?: ClientStore[]
}

interface ClientStats {
  total: number
  active: number
  prospect: number
  onboarding: number
  churned: number
  critical: number
  trends: {
    newLast30: number
    newPrev30: number
    churnedLast30: number
    churnedPrev30: number
  }
}

interface ClientsContentProps {
  clients: ClientWithRelations[]
  totalCount: number
  currentPage: number
  stats: ClientStats
  currentStatus?: string
  currentSearch?: string
  currentHealth?: string
}

// ─── Constants ────────────────────────────────────────────

const PAGE_SIZE = 50

const HEALTH_OPTIONS = [
  { value: "all", label: "Todas as saúdes" },
  { value: "good", label: "Saudável (70-100)" },
  { value: "warning", label: "Atenção (40-69)" },
  { value: "critical", label: "Crítico (0-39)" },
]

const statusLabels: Record<string, { label: string; variant: "positive" | "negative" | "warning" | "neutral" | "info" }> = {
  active: { label: "Ativo", variant: "positive" },
  inactive: { label: "Inativo", variant: "neutral" },
  churned: { label: "Churned", variant: "negative" },
  prospect: { label: "Prospect", variant: "info" },
  onboarding: { label: "Onboarding", variant: "warning" },
}

// ─── URL helpers ──────────────────────────────────────────

function buildUrl(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== "all") sp.set(k, v)
  })
  const qs = sp.toString()
  return qs ? `/admin/clients?${qs}` : "/admin/clients"
}

// ─── ClientsContent ───────────────────────────────────────

export function ClientsContent({
  clients,
  totalCount,
  currentPage,
  stats,
  currentStatus,
  currentSearch,
  currentHealth,
}: ClientsContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const { permissions } = usePermissions()
  const { user } = useAuthStore()
  const canDelete = permissions?.isAdmin || permissions?.isOrgOwner
  const canEdit = permissions?.isAdmin || permissions?.isOrgOwner

  // Local state
  const [search, setSearch] = useState(currentSearch ?? "")
  const [health, setHealth] = useState(currentHealth ?? "all")
  const [deleteClient, setDeleteClient] = useState<ClientWithRelations | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)

  const statusTab = currentStatus ?? "all"
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasActiveFilters = !!(currentSearch || currentStatus || currentHealth)

  // ─── Navigation helpers ───────────────────────────────

  const navigate = useCallback((overrides: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      status: currentStatus,
      search: currentSearch,
      health: currentHealth,
    }
    // Merge overrides, reset page on filter change
    const merged = { ...base, ...overrides }
    // Remove page key if going back to page 1
    if (!overrides.page) delete merged.page
    router.push(buildUrl(merged))
  }, [router, currentStatus, currentSearch, currentHealth])

  function handleStatusChange(value: string) {
    navigate({ status: value === "all" ? undefined : value, page: undefined })
  }

  function handleSearch() {
    const trimmed = search.trim()
    navigate({ search: trimmed || undefined, page: undefined })
  }

  function handleHealthChange(value: string) {
    setHealth(value)
    navigate({ health: value === "all" ? undefined : value, page: undefined })
  }

  function handlePageChange(page: number) {
    const params: Record<string, string | undefined> = {
      status: currentStatus,
      search: currentSearch,
      health: currentHealth,
    }
    if (page > 1) params.page = String(page)
    router.push(buildUrl(params))
  }

  function clearAllFilters() {
    setSearch("")
    setHealth("all")
    router.push("/admin/clients")
  }

  // ─── Delete handler ───────────────────────────────────

  async function handleDelete() {
    if (!deleteClient || !user?.id) return
    setIsDeleting(true)
    try {
      await clientService.delete(deleteClient.id, user.id)
      toast({ title: "Cliente excluído", description: "O cliente foi excluído com sucesso." })
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o cliente." })
    } finally {
      setIsDeleting(false)
      setDeleteClient(null)
    }
  }

  // ─── Status tabs ──────────────────────────────────────

  const statusItems = [
    { value: "all", label: "Todos", count: stats.total },
    { value: "active", label: "Ativos", count: stats.active },
    { value: "prospect", label: "Prospect", count: stats.prospect },
    { value: "onboarding", label: "Onboarding", count: stats.onboarding },
    { value: "churned", label: "Churned", count: stats.churned },
  ]

  // ─── DataTable columns ────────────────────────────────

  const columns: ColumnDef<ClientWithRelations>[] = [
    {
      accessorKey: "name",
      header: "Cliente",
      type: "text",
      mobilePriority: "title",
      width: "250px",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA] text-xs font-semibold">
              {getInitials(row.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link
              href={`/admin/clients/${row.id}`}
              className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] hover:underline truncate block"
            >
              {row.name}
            </Link>
            {row.company && (
              <span className="text-xs text-gray-400 dark:text-[#5C6378] truncate block">
                {row.company}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      type: "badge",
      mobilePriority: "badge",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      accessorKey: "contracts",
      header: "MRR",
      type: "currency",
      mobilePriority: "detail",
      sortable: true,
      cell: (row) => {
        const active = row.contracts?.find((c: Contract) => c.status === "active")
        if (!active) return <span className="text-gray-400 dark:text-[#5C6378]">—</span>
        return (
          <div>
            <span className="font-mono tabular-nums text-sm text-gray-900 dark:text-[#EAEDF3]">
              {formatCurrency(active.monthly_value)}
            </span>
            <span className="block text-xs text-gray-400 dark:text-[#5C6378]">
              {active.plan_name}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: "health_score",
      header: "Health",
      type: "custom",
      mobilePriority: "detail",
      cell: (row) => {
        const score = row.health_score ?? 50
        const variant = score >= 70 ? "positive" : score >= 40 ? "warning" : "negative"
        return (
          <Badge variant={variant} showDot>
            {score}/100
          </Badge>
        )
      },
    },
    {
      accessorKey: "owner",
      header: "Agente",
      type: "custom",
      mobilePriority: "hidden",
      hideOnTablet: true,
      cell: (row) => {
        const owner = row.owner as User | undefined
        if (!owner) return <span className="text-gray-400 dark:text-[#5C6378]">—</span>
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={owner.avatar_url} />
              <AvatarFallback className="text-[10px]">
                {getInitials(owner.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-gray-700 dark:text-[#8B92A5] truncate max-w-[100px]">
              {owner.name}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: "id",
      header: "",
      type: "custom",
      mobilePriority: "hidden",
      width: "50px",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Ações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/admin/clients/${row.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhes
              </Link>
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`/admin/clients/${row.id}/edit`}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </DropdownMenuItem>
            )}
            {(row as ClientWithRelations).website && (
              <DropdownMenuItem asChild>
                <a
                  href={(row as ClientWithRelations).website!}
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
                  onClick={() => setDeleteClient(row as ClientWithRelations)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Status Tabs */}
      <StatusTabs
        value={statusTab}
        onValueChange={handleStatusChange}
        items={statusItems}
      />

      {/* Filter row */}
      {isMobile ? (
        /* Mobile: search + filter drawer trigger */
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon icon={Search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5C6378]" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 h-10"
            />
          </div>
          <Drawer open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
            <DrawerTrigger asChild>
              <Button variant="secondary" size="icon" className="h-10 w-10 shrink-0">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Filtros</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-2 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-[#EAEDF3]">
                    Saúde do Cliente
                  </label>
                  {HEALTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setHealth(opt.value)}
                      className={cn(
                        "w-full text-left px-3 py-3 rounded-[6px] text-sm",
                        "transition-colors duration-150",
                        health === opt.value
                          ? "bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA] font-medium"
                          : "text-gray-700 dark:text-[#8B92A5] hover:bg-gray-50 dark:hover:bg-[#242836]",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <DrawerFooter className="flex-row gap-2">
                <DrawerClose asChild>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setHealth("all")
                      navigate({ health: undefined, page: undefined })
                    }}
                  >
                    Limpar
                  </Button>
                </DrawerClose>
                <DrawerClose asChild>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      navigate({ health: health === "all" ? undefined : health, page: undefined })
                    }}
                  >
                    Aplicar
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      ) : (
        /* Desktop: inline search + FilterSelect */
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Icon icon={Search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5C6378]" />
            <Input
              placeholder="Buscar por nome, email ou empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <FilterSelect
            value={health}
            onValueChange={handleHealthChange}
            options={HEALTH_OPTIONS}
            placeholder="Saúde"
          />
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs text-gray-500 dark:text-[#8B92A5]"
            >
              Limpar filtros
            </Button>
          )}
        </div>
      )}

      {/* Active filters indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <Badge variant="neutral" showDot={false} className="font-normal">
            {totalCount} {totalCount === 1 ? "resultado encontrado" : "resultados encontrados"}
          </Badge>
        </div>
      )}

      {/* Alert banner for critical clients */}
      {stats.critical > 0 && !currentStatus && (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-[8px]",
            "bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]",
            "dark:bg-[#3B1111] dark:border-[rgba(252,165,165,0.15)] dark:text-[#FCA5A5]",
            "text-sm",
          )}
        >
          <span className="font-medium">
            {stats.critical} {stats.critical === 1 ? "cliente" : "clientes"} com saúde crítica
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-[#991B1B] dark:text-[#FCA5A5] hover:bg-[#FEE2E2] dark:hover:bg-[#4B1515]"
            onClick={() => navigate({ health: "critical", page: undefined })}
          >
            Ver clientes →
          </Button>
        </div>
      )}

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={clients}
        rowKey="id"
        emptyMessage={hasActiveFilters ? "Nenhum cliente encontrado para os filtros aplicados" : "Nenhum cliente encontrado"}
        emptyDescription={hasActiveFilters ? "Tente ajustar os filtros ou limpar a busca" : "Comece adicionando seu primeiro cliente"}
        pagination={totalPages > 1 ? {
          page: currentPage,
          pageSize: PAGE_SIZE,
          total: totalCount,
          onPageChange: handlePageChange,
          loadMore: isMobile,
          onLoadMore: isMobile ? () => handlePageChange(currentPage + 1) : undefined,
        } : undefined}
      />

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
    </div>
  )
}
