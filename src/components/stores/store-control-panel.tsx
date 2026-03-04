"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Store,
  TrendingUp,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Phone,
  User,
  MoreVertical,
  RefreshCw,
  Loader2,
  ExternalLink,
  Filter,
  Search,
  Settings,
  Pencil,
  Video,
  Plus,
  Link2,
  Unlink,
  Trash2,
  ChevronLeft,
  ChevronRight,
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
import { QuickStoreForm } from "@/components/stores/quick-store-form"
import { StoreLinkModal } from "@/components/stores/store-link-modal"
import { StoreUnlinkDialog } from "@/components/stores/store-unlink-dialog"

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

interface LinkCounts {
  all: number
  avulsas: number
  vinculadas: number
}

interface UserData {
  id: string
  name: string
}

// Format currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// Get status badge config
const getStatusBadge = (status: StoreData['feedback_status'], daysUntil: number | null) => {
  switch (status) {
    case 'overdue':
      return {
        label: daysUntil !== null ? `${Math.abs(daysUntil)}d atrasado` : 'Atrasado',
        className: 'bg-destructive/15 text-destructive border-destructive/30',
        icon: AlertTriangle,
      }
    case 'due_soon':
      return {
        label: daysUntil !== null ? `Em ${daysUntil}d` : 'Em breve',
        className: 'bg-warning/15 text-warning border-warning/30',
        icon: Clock,
      }
    case 'on_track':
      return {
        label: daysUntil !== null ? `Em ${daysUntil}d` : 'Em dia',
        className: 'bg-success/15 text-success border-success/30',
        icon: CheckCircle,
      }
    default:
      return {
        label: 'Nunca feito',
        className: 'bg-muted/20 text-muted-foreground border-muted-foreground/30',
        icon: Calendar,
      }
  }
}

export function StoreControlPanel() {
  const router = useRouter()
  const { toast } = useToast()
  const [stores, setStores] = useState<StoreData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [linkCounts, setLinkCounts] = useState<LinkCounts>({ all: 0, avulsas: 0, vinculadas: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<UserData[]>([])

  // Pagination states
  const [page, setPage] = useState(1)
  const [perPage] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  // Filter states
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterLink, setFilterLink] = useState<'all' | 'avulsas' | 'vinculadas'>('all')

  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Dialog states
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null)
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isQuickStoreDialogOpen, setIsQuickStoreDialogOpen] = useState(false)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false)
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

  // Edit form states
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

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [])

  // Reset page when filters change
  const handleFilterStatusChange = useCallback((value: string) => {
    setFilterStatus(value)
    setPage(1)
  }, [])

  const handleFilterLinkChange = useCallback((value: 'all' | 'avulsas' | 'vinculadas') => {
    setFilterLink(value)
    setPage(1)
  }, [])

  // Fetch stores data
  const fetchStores = useCallback(async () => {
    // Cancel previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      })

      if (debouncedSearch) {
        params.set('search', debouncedSearch)
      }
      if (filterStatus && filterStatus !== 'all') {
        params.set('status', filterStatus)
      }
      if (filterLink && filterLink !== 'all') {
        params.set('link_filter', filterLink)
      }

      const res = await fetch(`/api/stores/control?${params}`, {
        signal: controller.signal,
      })

      if (controller.signal.aborted) return

      const data = await res.json()

      if (data.success) {
        setStores(data.stores)
        if (data.summary) setSummary(data.summary)
        if (data.link_counts) setLinkCounts(data.link_counts)
        if (data.pagination) {
          setTotalPages(data.pagination.total_pages)
          setTotalItems(data.pagination.total)
        } else {
          // Backward compat: no pagination object means all returned
          setTotalPages(1)
          setTotalItems(data.stores?.length || 0)
        }
      } else {
        toast({
          title: 'Erro ao carregar lojas',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Error fetching stores:', error)
      toast({
        title: 'Erro de conexao',
        description: 'Nao foi possivel carregar os dados das lojas',
        variant: 'destructive',
      })
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [page, perPage, debouncedSearch, filterStatus, filterLink, toast])

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Fetch users for dropdown
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.users) {
        setUsers(data.users)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }, [])

  useEffect(() => {
    fetchStores()
  }, [fetchStores])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Register feedback call
  const handleRegisterFeedback = async () => {
    if (!selectedStore || !feedbackForm.conducted_by) {
      toast({
        title: 'Campos obrigatorios',
        description: 'Selecione quem realizou a call',
        variant: 'destructive',
      })
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
        toast({
          title: 'Call registrada!',
          description: `Feedback de ${selectedStore.store_name} registrado com sucesso`,
        })
        setIsRegisterDialogOpen(false)
        setSelectedStore(null)
        setFeedbackForm({
          conducted_by: '',
          conducted_at: new Date().toISOString().split('T')[0],
          duration_minutes: '',
          notes: '',
          action_items: '',
        })
        // Reload current page with same filters
        fetchStores()
      } else {
        toast({
          title: 'Erro ao registrar',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error registering feedback:', error)
      toast({
        title: 'Erro de conexao',
        description: 'Nao foi possivel registrar a call',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open edit dialog
  const openEditDialog = (store: StoreData) => {
    setSelectedStore(store)
    setEditForm({
      feedback_frequency: store.feedback_frequency,
      next_feedback_date: store.next_feedback_date?.split('T')[0] || '',
    })
    setIsEditDialogOpen(true)
  }

  // Save store settings
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
        toast({
          title: 'Configuracoes salvas!',
          description: `Loja ${selectedStore.store_name} atualizada com sucesso`,
        })
        setIsEditDialogOpen(false)
        setSelectedStore(null)
        fetchStores()
      } else {
        toast({
          title: 'Erro ao salvar',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error saving store settings:', error)
      toast({
        title: 'Erro de conexao',
        description: 'Nao foi possivel salvar as configuracoes',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete store
  const handleDeleteStore = async () => {
    if (!selectedStore) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/client-stores/${selectedStore.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: 'Loja excluida!',
          description: `"${selectedStore.store_name}" foi removida com sucesso`,
        })
        setIsDeleteDialogOpen(false)
        setSelectedStore(null)
        fetchStores()
      } else {
        toast({
          title: 'Erro ao excluir',
          description: data.error || 'Nao foi possivel excluir a loja',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error deleting store:', error)
      toast({
        title: 'Erro de conexao',
        description: 'Nao foi possivel excluir a loja',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Pagination info text
  const paginationStart = totalItems > 0 ? ((page - 1) * perPage) + 1 : 0
  const paginationEnd = Math.min(page * perPage, totalItems)

  // Loading state - skeleton table for better perceived performance
  if (isLoading && stores.length === 0) {
    return (
      <div className="space-y-6">
        {/* Summary skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/50 border-b border-border px-4 py-3 flex gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-24" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 px-4 py-4 border-b border-border/50">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards - Clickable to filter */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            onClick={() => handleFilterStatusChange('all')}
            className={`rounded-xl border p-4 text-left transition-all hover:bg-muted/50 ${
              filterStatus === 'all' ? 'border-primary/40 ring-1 ring-primary/40 bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Total de Lojas</span>
              <div className="rounded-full p-1.5 bg-muted">
                <Store className="w-3 h-3 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xl font-semibold text-foreground">{summary.total}</p>
          </button>

          <button
            onClick={() => handleFilterStatusChange('overdue')}
            className={`rounded-xl border p-4 text-left transition-all hover:bg-red-500/5 ${
              filterStatus === 'overdue' ? 'border-red-500/40 ring-1 ring-red-500/40 bg-red-500/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Atrasadas</span>
              <div className="rounded-full p-1.5 bg-red-500/10">
                <AlertTriangle className="w-3 h-3 text-red-500" />
              </div>
            </div>
            <p className="text-xl font-semibold text-foreground">{summary.overdue}</p>
          </button>

          <button
            onClick={() => handleFilterStatusChange('due_soon')}
            className={`rounded-xl border p-4 text-left transition-all hover:bg-amber-500/5 ${
              filterStatus === 'due_soon' ? 'border-amber-500/40 ring-1 ring-amber-500/40 bg-amber-500/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Em breve</span>
              <div className="rounded-full p-1.5 bg-amber-500/10">
                <Clock className="w-3 h-3 text-amber-500" />
              </div>
            </div>
            <p className="text-xl font-semibold text-foreground">{summary.due_soon}</p>
          </button>

          <button
            onClick={() => handleFilterStatusChange('on_track')}
            className={`rounded-xl border p-4 text-left transition-all hover:bg-emerald-500/5 ${
              filterStatus === 'on_track' ? 'border-emerald-500/40 ring-1 ring-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Em dia</span>
              <div className="rounded-full p-1.5 bg-emerald-500/10">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
              </div>
            </div>
            <p className="text-xl font-semibold text-foreground">{summary.on_track}</p>
          </button>

          <button
            onClick={() => handleFilterStatusChange('never')}
            className={`rounded-xl border p-4 text-left transition-all hover:bg-muted/50 ${
              filterStatus === 'never' ? 'border-foreground/20 ring-1 ring-foreground/20 bg-muted/50' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">Sem feedback</span>
              <div className="rounded-full p-1.5 bg-muted">
                <Calendar className="w-3 h-3 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xl font-semibold text-foreground">{summary.never}</p>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por loja ou cliente..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-card border-border"
          />
        </div>

        <Select value={filterStatus} onValueChange={handleFilterStatusChange}>
          <SelectTrigger className="w-[180px] bg-card border-border">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="overdue">Atrasadas</SelectItem>
            <SelectItem value="due_soon">Em breve</SelectItem>
            <SelectItem value="on_track">Em dia</SelectItem>
            <SelectItem value="never">Sem feedback</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={fetchStores} disabled={isLoading} className="border-border">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>

        <Button onClick={() => setIsQuickStoreDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Cadastro Rapido
        </Button>
      </div>

      {/* Link Filter Tabs - using backend link_counts */}
      <div className="flex gap-2">
        {([
          { key: 'all' as const, label: 'Todas', count: linkCounts.all },
          { key: 'avulsas' as const, label: 'Avulsas', count: linkCounts.avulsas },
          { key: 'vinculadas' as const, label: 'Vinculadas', count: linkCounts.vinculadas },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => handleFilterLinkChange(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filterLink === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Stores List */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Loja / Cliente</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Receita Klaviyo 30d</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Campanhas / Flows</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">% Recuperacao</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Proximo Feedback</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Ultima Call</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Responsavel</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Store className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Nenhuma loja encontrada</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {searchInput || filterStatus !== 'all'
                            ? 'Tente ajustar os filtros de busca'
                            : 'Cadastre lojas nos clientes para ve-las aqui'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                stores.map((store) => {
                  const statusBadge = getStatusBadge(store.feedback_status, store.days_until_feedback)
                  const StatusIcon = statusBadge.icon

                  return (
                    <tr key={store.id} className={`border-b border-border/50 hover:bg-muted/50 transition-colors ${isLoading ? 'opacity-50' : ''}`}>
                      {/* Store / Client */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Store className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{store.store_name}</p>
                            <p className="text-sm text-muted-foreground">{store.client_name || 'Sem cliente'}</p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            {!store.client_id && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-yellow-500/50 text-yellow-600 dark:text-yellow-400 cursor-pointer hover:bg-yellow-500/10 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedStore(store)
                                  setIsLinkModalOpen(true)
                                }}
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Sem cliente vinculado
                              </Badge>
                            )}
                            {store.has_shopify && (
                              <Badge variant="outline" className="text-[10px] border-success/30 text-success">Shopify</Badge>
                            )}
                            {store.has_klaviyo && (
                              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Klaviyo</Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Klaviyo Revenue Total */}
                      <td className="px-4 py-4 text-center">
                        {store.revenue_status === 'no_integration' ? (
                          <span className="text-sm text-muted-foreground">Sem Klaviyo</span>
                        ) : store.revenue_status === 'error' ? (
                          <div className="flex flex-col items-center gap-1">
                            <AlertTriangle className="w-4 h-4 text-warning" />
                            <span className="text-xs text-warning">Erro ao carregar</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-lg font-bold ${store.klaviyo_revenue_30d > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              {formatCurrency(store.klaviyo_revenue_30d)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <SyncStatusBadge status={store.sync_status} compact />
                              <TimeAgo date={store.fetched_at} className="text-[10px] text-muted-foreground/60" />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Campaign / Flow Breakdown */}
                      <td className="px-4 py-4 text-center">
                        {store.revenue_status === 'no_integration' ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : store.revenue_status === 'error' ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs text-muted-foreground">
                              Camp: {formatCurrency(store.campaign_revenue_30d)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Flows: {formatCurrency(store.flow_revenue_30d)}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Recovery Rate (Klaviyo / Shopify) */}
                      <td className="px-4 py-4 text-center">
                        {store.recovery_rate !== null ? (
                          <span className={`text-lg font-bold ${
                            store.recovery_rate >= 10 ? 'text-success' :
                            store.recovery_rate >= 5 ? 'text-warning' :
                            'text-destructive'
                          }`}>
                            {store.recovery_rate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Next Feedback */}
                      <td className="px-4 py-4 text-center">
                        <Badge className={`${statusBadge.className} gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusBadge.label}
                        </Badge>
                        {store.next_feedback_date && (
                          <p className="text-xs text-muted-foreground mt-1">{formatDate(store.next_feedback_date)}</p>
                        )}
                      </td>

                      {/* Last Call */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {store.last_call_source === 'meeting' ? (
                            <span title="Reuniao"><Video className="w-3.5 h-3.5 text-primary" /></span>
                          ) : store.last_call_source === 'feedback' ? (
                            <span title="Feedback"><Phone className="w-3.5 h-3.5 text-success" /></span>
                          ) : null}
                          <span className="text-sm text-muted-foreground">
                            {formatDate(store.last_call_date)}
                          </span>
                        </div>
                      </td>

                      {/* Responsible */}
                      <td className="px-4 py-4 text-center">
                        {store.last_feedback_by_name ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                              <User className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm text-muted-foreground">{store.last_feedback_by_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground/70">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedStore(store)
                              setIsRegisterDialogOpen(true)
                            }}
                            className="h-8 px-3"
                          >
                            <Phone className="w-3 h-3 mr-1" />
                            Registrar
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/stores/${store.id}`)}>
                                <Store className="w-4 h-4 mr-2" />
                                Ver Loja
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(store)}>
                                <Settings className="w-4 h-4 mr-2" />
                                Configurar Loja
                              </DropdownMenuItem>
                              {store.client_id && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => router.push(`/clients/${store.client_id}`)}>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Ver Cliente
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              {!store.client_id ? (
                                <DropdownMenuItem onClick={() => {
                                  setSelectedStore(store)
                                  setIsLinkModalOpen(true)
                                }}>
                                  <Link2 className="w-4 h-4 mr-2" />
                                  Vincular a Cliente
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedStore(store)
                                    setIsUnlinkDialogOpen(true)
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Unlink className="w-4 h-4 mr-2" />
                                  Desvincular
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedStore(store)
                                  setIsDeleteDialogOpen(true)
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir Loja
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <span className="text-sm text-muted-foreground">
              Mostrando {paginationStart}-{paginationEnd} de {totalItems} lojas
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Proximo
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

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
                  Registrando feedback para <strong>{selectedStore.store_name}</strong> ({selectedStore.client_name || 'Avulsa'})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedStore && (
            <div className="space-y-4">
              {/* Result Summary */}
              <div className="rounded-lg bg-card border border-border p-4 space-y-2">
                {selectedStore.total_revenue_30d > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Faturamento Total (30d)</span>
                    <span className="text-lg font-bold text-foreground">
                      {formatCurrency(selectedStore.total_revenue_30d)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Receita Klaviyo (30d)</span>
                  <span className={`text-lg font-bold ${selectedStore.klaviyo_revenue_30d > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                    {formatCurrency(selectedStore.klaviyo_revenue_30d)}
                  </span>
                </div>
                {selectedStore.recovery_rate !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Taxa de Recuperacao</span>
                    <span className={`text-lg font-bold ${
                      selectedStore.recovery_rate >= 10 ? 'text-success' :
                      selectedStore.recovery_rate >= 5 ? 'text-warning' :
                      'text-destructive'
                    }`}>
                      {selectedStore.recovery_rate.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>Campanhas: {formatCurrency(selectedStore.campaign_revenue_30d)}</span>
                  <span>Flows: {formatCurrency(selectedStore.flow_revenue_30d)}</span>
                </div>
              </div>

              {/* Form */}
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
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
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
            <Button variant="outline" onClick={() => setIsRegisterDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterFeedback}
              disabled={isSubmitting}
              className=""
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Registrar Call
                </>
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
              {selectedStore && (
                <span>
                  Configurando <strong>{selectedStore.store_name}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedStore && (
            <div className="space-y-4">
              {/* Store Info */}
              <div className="rounded-lg bg-card border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Store className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{selectedStore.store_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedStore.client_name || 'Avulsa'}</p>
                  </div>
                </div>
              </div>

              {/* Settings Form */}
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback_frequency">Frequencia de Feedback</Label>
                  <Select
                    value={editForm.feedback_frequency}
                    onValueChange={(value: 'monthly' | '30_days') =>
                      setEditForm({ ...editForm, feedback_frequency: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a frequencia" />
                    </SelectTrigger>
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
                  <p className="text-xs text-muted-foreground">
                    Deixe vazio para calcular automaticamente com base na frequencia
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Acoes rapidas</p>
                <div className="flex gap-2">
                  {selectedStore.client_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-border"
                      onClick={() => router.push(`/clients/${selectedStore.client_id}?tab=stores`)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Editar no Cliente
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-border"
                    onClick={() => router.push(`/reports?store_id=${selectedStore.id}`)}
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Ver Relatorio
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveStoreSettings}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Configuracoes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Store Registration Dialog */}
      <Dialog open={isQuickStoreDialogOpen} onOpenChange={setIsQuickStoreDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <QuickStoreForm
            onSuccess={() => {
              setIsQuickStoreDialogOpen(false)
              fetchStores()
            }}
            onCancel={() => setIsQuickStoreDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Store Link Modal */}
      {selectedStore && (
        <StoreLinkModal
          storeId={selectedStore.id}
          storeName={selectedStore.store_name}
          orgId={selectedStore.org_id || ""}
          isOpen={isLinkModalOpen}
          onClose={() => {
            setIsLinkModalOpen(false)
            setSelectedStore(null)
          }}
          onSuccess={fetchStores}
        />
      )}

      {/* Store Unlink Dialog */}
      {selectedStore && (
        <StoreUnlinkDialog
          storeId={selectedStore.id}
          storeName={selectedStore.store_name}
          clientName={selectedStore.client_name || ""}
          isOpen={isUnlinkDialogOpen}
          onClose={() => {
            setIsUnlinkDialogOpen(false)
            setSelectedStore(null)
          }}
          onSuccess={fetchStores}
        />
      )}

      {/* Delete Store Confirmation Dialog */}
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
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
