"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  Store,
  TrendingUp,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Phone,
  MoreVertical,
  RefreshCw,
  Loader2,
  ExternalLink,
  Search,
  Settings,
  Pencil,
  Video,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/lib/hooks/use-toast"
import { TimeAgo } from "@/components/ui/time-ago"
import { SyncStatusBadge } from "@/components/ui/sync-status-badge"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ReportJobCard } from "@/components/shared/report-job-card"
import { useReportJob } from "@/hooks/use-report-job"
import { cn } from "@/lib/utils"

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 dias" },
  { value: "15d", label: "15 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
] as const

interface StoreData {
  id: string
  client_id: string | null
  org_id: string | null
  client_name: string | null
  client_company: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  total_revenue_30d: number
  klaviyo_revenue_30d: number
  campaign_revenue_30d: number
  flow_revenue_30d: number
  recovery_rate: number | null
  currency: string
  revenue_status: 'loaded' | 'no_integration' | 'error'
  feedback_frequency: 'monthly' | '30_days'
  last_feedback_date: string | null
  next_feedback_date: string | null
  last_feedback_by: string | null
  last_feedback_by_name: string | null
  feedback_status: 'on_track' | 'due_soon' | 'overdue' | 'never'
  days_until_feedback: number | null
  last_call_date: string | null
  last_call_source: 'feedback' | 'meeting' | null
  has_shopify: boolean
  has_klaviyo: boolean
  fetched_at: string | null
  sync_status: string
}

interface Summary {
  total: number
  overdue: number
  due_soon: number
  on_track: number
  never: number
}

interface UserData {
  id: string
  name: string
}

const fmtCurrency = (value: number, currency: string = "BRL"): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}


const getStatusConfig = (status: StoreData['feedback_status'], daysUntil: number | null) => {
  switch (status) {
    case 'overdue':
      return {
        label: daysUntil !== null ? `${Math.abs(daysUntil)}d atrasado` : 'Atrasado',
        className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
        dotColor: 'bg-red-500',
        icon: AlertTriangle,
      }
    case 'due_soon':
      return {
        label: daysUntil !== null ? `Em ${daysUntil}d` : 'Em breve',
        className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        dotColor: 'bg-amber-500',
        icon: Clock,
      }
    case 'on_track':
      return {
        label: daysUntil !== null ? `Em ${daysUntil}d` : 'Em dia',
        className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        dotColor: 'bg-emerald-500',
        icon: CheckCircle,
      }
    default:
      return {
        label: 'Nunca feito',
        className: 'bg-muted text-muted-foreground border-border',
        dotColor: 'bg-muted-foreground/40',
        icon: Calendar,
      }
  }
}

// Summary card config
const summaryCards = [
  { key: 'all', label: 'Total', color: 'text-foreground', bgActive: 'border-primary/50 bg-primary/5 shadow-sm', icon: Store, iconBg: 'bg-primary/10 text-primary' },
  { key: 'overdue', label: 'Atrasadas', color: 'text-red-600 dark:text-red-400', bgActive: 'border-red-500/50 bg-red-500/5 shadow-sm', icon: AlertTriangle, iconBg: 'bg-red-500/10 text-red-500' },
  { key: 'due_soon', label: 'Em breve', color: 'text-amber-600 dark:text-amber-400', bgActive: 'border-amber-500/50 bg-amber-500/5 shadow-sm', icon: Clock, iconBg: 'bg-amber-500/10 text-amber-500' },
  { key: 'on_track', label: 'Em dia', color: 'text-emerald-600 dark:text-emerald-400', bgActive: 'border-emerald-500/50 bg-emerald-500/5 shadow-sm', icon: CheckCircle, iconBg: 'bg-emerald-500/10 text-emerald-500' },
  { key: 'never', label: 'Sem feedback', color: 'text-muted-foreground', bgActive: 'border-foreground/20 bg-muted/80 shadow-sm', icon: Calendar, iconBg: 'bg-muted text-muted-foreground' },
] as const

const getSummaryValue = (summary: Summary, key: string): number => {
  if (key === 'all') return summary.total
  return summary[key as keyof Omit<Summary, 'total'>] ?? 0
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StoreControlPanel() {
  const router = useRouter()
  const { toast } = useToast()
  const [stores, setStores] = useState<StoreData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<UserData[]>([])

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Period & custom date range
  const [period, setPeriod] = useState<string>("30d")
  const [customStart, setCustomStart] = useState<Date | undefined>()
  const [customEnd, setCustomEnd] = useState<Date | undefined>()

  // Report job (shared hook)
  const {
    activeJob,
    isGenerating,
    jobDismissed,
    generateReport,
    retryReport: handleRetryReport,
    dismissJob,
  } = useReportJob()

  // Dialog states
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null)
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form states
  const [feedbackForm, setFeedbackForm] = useState({
    conducted_by: '',
    conducted_at: new Date().toISOString().split('T')[0],
    duration_minutes: '',
    notes: '',
    action_items: '',
  })

  const [editForm, setEditForm] = useState({
    feedback_frequency: 'monthly' as 'monthly' | '30_days',
    next_feedback_date: '',
  })

  // Debounce search
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  const handleFilterStatusChange = useCallback((value: string) => {
    setFilterStatus(value)
    setPage(1)
  }, [])

  const handlePeriodChange = useCallback((value: string) => {
    setPeriod(value)
    if (value !== "custom") {
      setCustomStart(undefined)
      setCustomEnd(undefined)
    }
  }, [])

  // ─── Generate report when custom dates are applied ───────────────────────
  const handleCustomDateApply = useCallback(async (start: Date, end: Date) => {
    setCustomStart(start)
    setCustomEnd(end)
    setPeriod("custom")

    // Collect store IDs from current page that have Klaviyo
    const storeIds = stores.filter((s) => s.has_klaviyo).map((s) => s.id)
    await generateReport(
      storeIds,
      format(start, 'yyyy-MM-dd'),
      format(end, 'yyyy-MM-dd'),
    )
  }, [stores, generateReport])

  // Fetch stores
  const fetchStores = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
      const res = await fetch(`/api/stores/control?${params}`, { signal: controller.signal })
      if (controller.signal.aborted) return

      const data = await res.json()
      if (data.success) {
        setStores(data.stores)
        if (data.summary) setSummary(data.summary)
        if (data.pagination) {
          setTotalPages(data.pagination.total_pages)
          setTotalItems(data.pagination.total)
        } else {
          setTotalPages(1)
          setTotalItems(data.stores?.length || 0)
        }
      } else {
        toast({ title: 'Erro ao carregar lojas', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Error fetching stores:', error)
      toast({ title: 'Erro de conexao', description: 'Nao foi possivel carregar os dados das lojas', variant: 'destructive' })
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [page, perPage, debouncedSearch, filterStatus, toast])

  useEffect(() => {
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort() }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.users) setUsers(data.users)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }, [])

  useEffect(() => { fetchStores() }, [fetchStores])
  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Handlers
  const handleRegisterFeedback = async () => {
    if (!selectedStore || !feedbackForm.conducted_by) {
      toast({ title: 'Campos obrigatorios', description: 'Selecione quem realizou a call', variant: 'destructive' })
      return
    }
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/stores/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: selectedStore.id,
          client_id: selectedStore.client_id,
          conducted_by: feedbackForm.conducted_by,
          conducted_at: feedbackForm.conducted_at,
          duration_minutes: feedbackForm.duration_minutes ? parseInt(feedbackForm.duration_minutes) : null,
          notes: feedbackForm.notes,
          action_items: feedbackForm.action_items,
          total_revenue: selectedStore.total_revenue_30d,
          klaviyo_revenue: selectedStore.klaviyo_revenue_30d,
          campaign_revenue: selectedStore.campaign_revenue_30d,
          flow_revenue: selectedStore.flow_revenue_30d,
          recovery_rate: selectedStore.recovery_rate,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'Call registrada!', description: `Feedback de ${selectedStore.store_name} registrado com sucesso` })
        setIsRegisterDialogOpen(false)
        setSelectedStore(null)
        setFeedbackForm({ conducted_by: '', conducted_at: new Date().toISOString().split('T')[0], duration_minutes: '', notes: '', action_items: '' })
        fetchStores()
      } else {
        toast({ title: 'Erro ao registrar', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error registering feedback:', error)
      toast({ title: 'Erro de conexao', description: 'Nao foi possivel registrar a call', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEditDialog = (store: StoreData) => {
    setSelectedStore(store)
    setEditForm({ feedback_frequency: store.feedback_frequency, next_feedback_date: store.next_feedback_date?.split('T')[0] || '' })
    setIsEditDialogOpen(true)
  }

  const handleSaveStoreSettings = async () => {
    if (!selectedStore) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/stores/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: selectedStore.id,
          feedback_frequency: editForm.feedback_frequency,
          next_feedback_date: editForm.next_feedback_date || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: 'Configuracoes salvas!', description: `Loja ${selectedStore.store_name} atualizada com sucesso` })
        setIsEditDialogOpen(false)
        setSelectedStore(null)
        fetchStores()
      } else {
        toast({ title: 'Erro ao salvar', description: data.error, variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error saving store settings:', error)
      toast({ title: 'Erro de conexao', description: 'Nao foi possivel salvar as configuracoes', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteStore = async () => {
    if (!selectedStore) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/client-stores/${selectedStore.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({ title: 'Loja excluida!', description: `"${selectedStore.store_name}" foi removida com sucesso` })
        setIsDeleteDialogOpen(false)
        setSelectedStore(null)
        fetchStores()
      } else {
        toast({ title: 'Erro ao excluir', description: data.error || 'Nao foi possivel excluir a loja', variant: 'destructive' })
      }
    } catch (error) {
      console.error('Error deleting store:', error)
      toast({ title: 'Erro de conexao', description: 'Nao foi possivel excluir a loja', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  const paginationStart = totalItems > 0 ? ((page - 1) * perPage) + 1 : 0
  const paginationEnd = Math.min(page * perPage, totalItems)
  const hasActiveFilters = filterStatus !== 'all' || searchInput !== ''

  // ─── Loading skeleton ─────────────────────────────────────────
  if (isLoading && stores.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="w-8 h-8 rounded-lg" />
              </div>
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ─── Summary Cards ─────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {summaryCards.map((card) => {
            const Icon = card.icon
            const value = getSummaryValue(summary, card.key)
            const isActive = filterStatus === card.key

            return (
              <button
                key={card.key}
                onClick={() => handleFilterStatusChange(card.key)}
                className={cn(
                  "group rounded-xl border p-4 text-left transition-all duration-200",
                  isActive
                    ? card.bgActive
                    : "border-border bg-card hover:border-border/80 hover:shadow-sm"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center transition-colors", card.iconBg)}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <p className={cn("text-2xl font-bold tracking-tight", isActive ? card.color : "text-foreground")}>
                  {value}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* ─── Report Job Status Card ────────────────────────────── */}
      {activeJob && !jobDismissed && (
        <ReportJobCard
          job={activeJob}
          onClose={dismissJob}
          onRetry={handleRetryReport}
          className="mb-4"
        />
      )}

      {/* ─── Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Search + Period + Actions row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por loja ou cliente..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 bg-card"
            />
            {searchInput && (
              <button
                onClick={() => { handleSearchChange(''); setSearchInput('') }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={handlePeriodChange}>
              <SelectTrigger className="h-10 w-[140px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {period === "custom" && (
              <DateRangePicker
                startDate={customStart}
                endDate={customEnd}
                onApply={handleCustomDateApply}
              />
            )}

            {isGenerating && (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={fetchStores}
              disabled={isLoading}
              className="h-10 w-10 shrink-0"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setFilterStatus('all')
                handleSearchChange('')
                setSearchInput('')
                setPage(1)
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* ─── Store List ────────────────────────────────────────── */}
      {stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Store className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma loja encontrada</p>
          <p className="text-xs text-muted-foreground text-center max-w-[280px]">
            {hasActiveFilters
              ? 'Tente ajustar os filtros de busca'
              : 'Cadastre lojas nos clientes para ve-las aqui'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table (hidden on mobile) */}
          <div className="hidden lg:block rounded-xl border border-border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 min-w-[240px]">Loja / Cliente</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Receita Klaviyo</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Campanhas / Flows</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Recuperacao</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Feedback</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Ultima Call</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Responsavel</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 w-[120px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => {
                    const statusCfg = getStatusConfig(store.feedback_status, store.days_until_feedback)
                    return (
                      <tr
                        key={store.id}
                        onClick={() => router.push(`/admin/stores/${store.id}`)}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/40 transition-colors cursor-pointer group",
                          isLoading && "opacity-50"
                        )}
                      >
                        {/* Store / Client */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                              <Store className="w-4.5 h-4.5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{store.store_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground truncate">{store.client_name || 'Sem cliente'}</span>
                                {store.has_klaviyo && (
                                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">
                                    Klaviyo
                                  </span>
                                )}
                                {store.has_shopify && (
                                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    Shopify
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Revenue — always shows 30d data */}
                        <td className="px-4 py-3.5 text-right">
                          {store.revenue_status === 'no_integration' ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : store.revenue_status === 'error' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-xs text-amber-500">Erro</span>
                            </div>
                          ) : (
                            <div className="text-right">
                              <span className={cn(
                                "text-sm font-semibold tabular-nums",
                                store.klaviyo_revenue_30d > 0 ? 'text-foreground' : 'text-muted-foreground'
                              )}>
                                {fmtCurrency(store.klaviyo_revenue_30d, store.currency)}
                              </span>
                              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                                <SyncStatusBadge status={store.sync_status} compact />
                                <TimeAgo date={store.fetched_at} className="text-[10px] text-muted-foreground/50" />
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Campaign / Flows — always shows 30d data */}
                        <td className="px-4 py-3.5 text-right">
                          {store.revenue_status !== 'loaded' ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="text-xs text-muted-foreground tabular-nums">
                                Camp: {fmtCurrency(store.campaign_revenue_30d, store.currency)}
                              </div>
                              <div className="text-xs text-muted-foreground tabular-nums">
                                Flows: {fmtCurrency(store.flow_revenue_30d, store.currency)}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Recovery Rate */}
                        <td className="px-4 py-3.5 text-center">
                          {store.recovery_rate !== null ? (
                            <span className={cn(
                              "text-sm font-semibold tabular-nums",
                              store.recovery_rate >= 10 ? 'text-emerald-600 dark:text-emerald-400' :
                              store.recovery_rate >= 5 ? 'text-amber-600 dark:text-amber-400' :
                              'text-red-600 dark:text-red-400'
                            )}>
                              {store.recovery_rate.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* Feedback Status */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant="neutral" showDot={false} className={cn("text-[11px] font-medium gap-1 border", statusCfg.className)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dotColor)} />
                              {statusCfg.label}
                            </Badge>
                            {store.next_feedback_date && (
                              <span className="text-[10px] text-muted-foreground">{formatDate(store.next_feedback_date)}</span>
                            )}
                          </div>
                        </td>

                        {/* Last Call */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {store.last_call_source === 'meeting' ? (
                              <Video className="w-3.5 h-3.5 text-primary" />
                            ) : store.last_call_source === 'feedback' ? (
                              <Phone className="w-3.5 h-3.5 text-emerald-500" />
                            ) : null}
                            <span className="text-xs text-muted-foreground">{formatDate(store.last_call_date)}</span>
                          </div>
                        </td>

                        {/* Responsible */}
                        <td className="px-4 py-3.5 text-center">
                          {store.last_feedback_by_name ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-[10px] font-medium text-primary">
                                  {store.last_feedback_by_name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">{store.last_feedback_by_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedStore(store)
                                setIsRegisterDialogOpen(true)
                              }}
                              className="h-7 px-2.5 text-xs"
                            >
                              <Phone className="w-3 h-3 mr-1" />
                              Registrar
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => router.push(`/admin/stores/${store.id}`)}>
                                  <Store className="w-4 h-4 mr-2" />
                                  Ver Loja
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(store)}>
                                  <Settings className="w-4 h-4 mr-2" />
                                  Configurar
                                </DropdownMenuItem>
                                {store.client_id && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => router.push(`/admin/clients/${store.client_id}`)}>
                                      <ExternalLink className="w-4 h-4 mr-2" />
                                      Ver Cliente
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setSelectedStore(store); setIsDeleteDialogOpen(true) }} className="text-destructive focus:text-destructive">
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Excluir Loja
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards (hidden on desktop) */}
          <div className="lg:hidden space-y-3">
            {stores.map((store) => {
              const statusCfg = getStatusConfig(store.feedback_status, store.days_until_feedback)

              return (
                <div
                  key={store.id}
                  onClick={() => router.push(`/admin/stores/${store.id}`)}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4 space-y-3 active:bg-muted/50 transition-colors cursor-pointer",
                    isLoading && "opacity-50"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                        <Store className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{store.store_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate">{store.client_name || 'Sem cliente'}</span>
                          {store.has_klaviyo && (
                            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">
                              Klaviyo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => router.push(`/admin/stores/${store.id}`)}>
                            <Store className="w-4 h-4 mr-2" />
                            Ver Loja
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(store)}>
                            <Settings className="w-4 h-4 mr-2" />
                            Configurar
                          </DropdownMenuItem>
                          {store.client_id && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => router.push(`/admin/clients/${store.client_id}`)}>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Ver Cliente
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { setSelectedStore(store); setIsDeleteDialogOpen(true) }} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir Loja
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Receita 30d</p>
                      {store.revenue_status === 'loaded' ? (
                        <p className={cn(
                          "text-sm font-semibold tabular-nums",
                          store.klaviyo_revenue_30d > 0 ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {fmtCurrency(store.klaviyo_revenue_30d, store.currency)}
                        </p>
                      ) : store.revenue_status === 'error' ? (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span className="text-xs text-amber-500">Erro</span>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">-</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Recuperacao</p>
                      {store.recovery_rate !== null ? (
                        <p className={cn(
                          "text-sm font-semibold tabular-nums",
                          store.recovery_rate >= 10 ? 'text-emerald-600 dark:text-emerald-400' :
                          store.recovery_rate >= 5 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        )}>
                          {store.recovery_rate.toFixed(1)}%
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">-</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Feedback</p>
                      <Badge variant="neutral" showDot={false} className={cn("text-[10px] font-medium gap-1 border px-1.5 py-0", statusCfg.className)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", statusCfg.dotColor)} />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {store.last_call_source === 'meeting' ? (
                        <Video className="w-3 h-3 text-primary" />
                      ) : store.last_call_source === 'feedback' ? (
                        <Phone className="w-3 h-3 text-emerald-500" />
                      ) : null}
                      <span>
                        {store.last_call_date ? `Ultima: ${formatDate(store.last_call_date)}` : 'Sem calls'}
                      </span>
                      {store.last_feedback_by_name && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span>{store.last_feedback_by_name}</span>
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedStore(store)
                        setIsRegisterDialogOpen(true)
                      }}
                      className="h-7 px-2.5 text-xs"
                    >
                      <Phone className="w-3 h-3 mr-1" />
                      Registrar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─── Pagination ──────────────────────────────────────── */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-xs text-muted-foreground order-2 sm:order-1">
                {paginationStart}-{paginationEnd} de {totalItems} lojas
              </span>
              <div className="flex items-center gap-1.5 order-1 sm:order-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                  className="h-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">Anterior</span>
                </Button>
                <div className="flex items-center gap-1 px-2">
                  <span className="text-xs font-medium text-foreground">{page}</span>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-xs text-muted-foreground">{totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                  className="h-8"
                >
                  <span className="hidden sm:inline mr-1">Proximo</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Dialogs ─────────────────────────────────────────── */}

      {/* Register Feedback Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Registrar Call de Feedback
            </DialogTitle>
            <DialogDescription>
              {selectedStore && (
                <span>
                  Registrando feedback para <strong>{selectedStore.store_name}</strong> ({selectedStore.client_name})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedStore && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2">
                {selectedStore.total_revenue_30d > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Faturamento Total (30d)</span>
                    <span className="text-sm font-semibold text-foreground">
                      {fmtCurrency(selectedStore.total_revenue_30d, selectedStore.currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Receita Klaviyo (30d)</span>
                  <span className={cn("text-sm font-semibold", selectedStore.klaviyo_revenue_30d > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                    {fmtCurrency(selectedStore.klaviyo_revenue_30d, selectedStore.currency)}
                  </span>
                </div>
                {selectedStore.recovery_rate !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Taxa de Recuperacao</span>
                    <span className={cn("text-sm font-semibold",
                      selectedStore.recovery_rate >= 10 ? 'text-emerald-600 dark:text-emerald-400' :
                      selectedStore.recovery_rate >= 5 ? 'text-amber-600 dark:text-amber-400' :
                      'text-red-600 dark:text-red-400'
                    )}>
                      {selectedStore.recovery_rate.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t border-border/50">
                  <span>Campanhas: {fmtCurrency(selectedStore.campaign_revenue_30d, selectedStore.currency)}</span>
                  <span>Flows: {fmtCurrency(selectedStore.flow_revenue_30d, selectedStore.currency)}</span>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="conducted_by">Quem realizou *</Label>
                    <Select
                      value={feedbackForm.conducted_by}
                      onValueChange={(value) => setFeedbackForm({ ...feedbackForm, conducted_by: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conducted_at">Data da call</Label>
                    <Input
                      id="conducted_at"
                      type="date"
                      value={feedbackForm.conducted_at}
                      onChange={(e) => setFeedbackForm({ ...feedbackForm, conducted_at: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duracao (minutos)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="30"
                    value={feedbackForm.duration_minutes}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, duration_minutes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notas da reuniao</Label>
                  <Textarea
                    id="notes"
                    placeholder="O que foi discutido..."
                    value={feedbackForm.notes}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="action_items">Proximos passos / Action items</Label>
                  <Textarea
                    id="action_items"
                    placeholder="O que precisa ser feito..."
                    value={feedbackForm.action_items}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, action_items: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRegisterDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRegisterFeedback} disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-2" />Registrar Call</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Store Settings Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-muted-foreground" />
              Configuracoes da Loja
            </DialogTitle>
            <DialogDescription>
              {selectedStore && <span>Configurando <strong>{selectedStore.store_name}</strong></span>}
            </DialogDescription>
          </DialogHeader>

          {selectedStore && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/30 border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    <Store className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{selectedStore.store_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedStore.client_name}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback_frequency">Frequencia de Feedback</Label>
                  <Select
                    value={editForm.feedback_frequency}
                    onValueChange={(value: 'monthly' | '30_days') => setEditForm({ ...editForm, feedback_frequency: value })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione a frequencia" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">
                        <div className="flex flex-col">
                          <span>Mensal</span>
                          <span className="text-xs text-muted-foreground">Inicio de cada mes</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="30_days">
                        <div className="flex flex-col">
                          <span>A cada 30 dias</span>
                          <span className="text-xs text-muted-foreground">30 dias apos ultima call</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next_feedback_date">Proximo Feedback</Label>
                  <Input
                    id="next_feedback_date"
                    type="date"
                    value={editForm.next_feedback_date}
                    onChange={(e) => setEditForm({ ...editForm, next_feedback_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Deixe vazio para calcular automaticamente com base na frequencia</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Acoes rapidas</p>
                <div className="flex gap-2">
                  {selectedStore.client_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => router.push(`/admin/clients/${selectedStore.client_id}?tab=stores`)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Editar no Cliente
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/admin/reports?store_id=${selectedStore.id}`)}
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Ver Relatorio
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveStoreSettings} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar Configuracoes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsDeleteDialogOpen(false)
          if (!isDeleting) setSelectedStore(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir loja</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a loja <strong>&quot;{selectedStore?.store_name}&quot;</strong>?
              Esta acao e irreversivel e removera todos os dados associados, incluindo alertas, briefings, dados de onboarding e acessos configurados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteStore() }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Excluir</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
