"use client"

import { useState, useEffect, useCallback } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/lib/hooks/use-toast"

interface StoreData {
  id: string
  client_id: string
  client_name: string
  client_company: string
  store_name: string
  store_url: string
  platform: string
  is_active: boolean
  total_revenue_30d: number
  klaviyo_revenue_30d: number
  result_percentage: number
  feedback_frequency: 'monthly' | '30_days'
  last_feedback_date: string | null
  next_feedback_date: string | null
  last_feedback_by: string | null
  last_feedback_by_name: string | null
  feedback_status: 'on_track' | 'due_soon' | 'overdue' | 'never'
  days_until_feedback: number | null
  has_shopify: boolean
  has_klaviyo: boolean
}

interface Summary {
  total: number
  overdue: number
  due_soon: number
  on_track: number
  never: number
}

interface User {
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
        className: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: AlertTriangle,
      }
    case 'due_soon':
      return {
        label: daysUntil !== null ? `Em ${daysUntil}d` : 'Em breve',
        className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        icon: Clock,
      }
    case 'on_track':
      return {
        label: daysUntil !== null ? `Em ${daysUntil}d` : 'Em dia',
        className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        icon: CheckCircle,
      }
    default:
      return {
        label: 'Nunca feito',
        className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
        icon: Calendar,
      }
  }
}

// Get result percentage color
const getResultColor = (percentage: number): string => {
  if (percentage >= 20) return 'text-emerald-400'
  if (percentage >= 10) return 'text-amber-400'
  if (percentage > 0) return 'text-orange-400'
  return 'text-zinc-500'
}

export function StoreControlPanel() {
  const router = useRouter()
  const { toast } = useToast()
  const [stores, setStores] = useState<StoreData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [users, setUsers] = useState<User[]>([])

  // Dialog states
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null)
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
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

  // Fetch stores data
  const fetchStores = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/stores/control')
      const data = await res.json()

      if (data.success) {
        setStores(data.stores)
        setSummary(data.summary)
      } else {
        toast({
          title: 'Erro ao carregar lojas',
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error fetching stores:', error)
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível carregar os dados das lojas',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

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
    fetchUsers()
  }, [fetchStores, fetchUsers])

  // Register feedback call
  const handleRegisterFeedback = async () => {
    if (!selectedStore || !feedbackForm.conducted_by) {
      toast({
        title: 'Campos obrigatórios',
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
          result_percentage: selectedStore.result_percentage,
          klaviyo_revenue: selectedStore.klaviyo_revenue_30d,
          total_revenue: selectedStore.total_revenue_30d,
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
        title: 'Erro de conexão',
        description: 'Não foi possível registrar a call',
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
          title: 'Configurações salvas!',
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
        title: 'Erro de conexão',
        description: 'Não foi possível salvar as configurações',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter stores
  const filteredStores = stores.filter(store => {
    const matchesSearch =
      store.store_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      store.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      store.client_company.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter = filterStatus === 'all' || store.feedback_status === filterStatus

    return matchesSearch && matchesFilter
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm text-zinc-400">Carregando lojas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards - Clickable to filter */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <button
            onClick={() => setFilterStatus('all')}
            className={`rounded-xl bg-zinc-900/50 border p-4 text-left transition-all hover:bg-zinc-900/70 ${
              filterStatus === 'all' ? 'border-zinc-600 ring-1 ring-zinc-600' : 'border-zinc-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Store className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{summary.total}</p>
                <p className="text-xs text-zinc-500">Total de Lojas</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('overdue')}
            className={`rounded-xl bg-red-500/5 border p-4 text-left transition-all hover:bg-red-500/10 ${
              filterStatus === 'overdue' ? 'border-red-500 ring-1 ring-red-500' : 'border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{summary.overdue}</p>
                <p className="text-xs text-zinc-500">Atrasadas</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('due_soon')}
            className={`rounded-xl bg-amber-500/5 border p-4 text-left transition-all hover:bg-amber-500/10 ${
              filterStatus === 'due_soon' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-amber-500/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">{summary.due_soon}</p>
                <p className="text-xs text-zinc-500">Em breve</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('on_track')}
            className={`rounded-xl bg-emerald-500/5 border p-4 text-left transition-all hover:bg-emerald-500/10 ${
              filterStatus === 'on_track' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-emerald-500/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">{summary.on_track}</p>
                <p className="text-xs text-zinc-500">Em dia</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('never')}
            className={`rounded-xl bg-zinc-800/50 border p-4 text-left transition-all hover:bg-zinc-800/70 ${
              filterStatus === 'never' ? 'border-zinc-500 ring-1 ring-zinc-500' : 'border-zinc-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-400">{summary.never}</p>
                <p className="text-xs text-zinc-500">Sem feedback</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Buscar por loja ou cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px] bg-zinc-900 border-zinc-800">
            <Filter className="w-4 h-4 mr-2 text-zinc-500" />
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

        <Button variant="outline" onClick={fetchStores} className="border-zinc-800">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Stores List */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-900/50 border-b border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Loja / Cliente</th>
                <th className="text-center text-xs font-medium text-zinc-500 px-4 py-3">Resultado 30d</th>
                <th className="text-center text-xs font-medium text-zinc-500 px-4 py-3">Faturamento</th>
                <th className="text-center text-xs font-medium text-zinc-500 px-4 py-3">Próximo Feedback</th>
                <th className="text-center text-xs font-medium text-zinc-500 px-4 py-3">Última Call</th>
                <th className="text-center text-xs font-medium text-zinc-500 px-4 py-3">Responsável</th>
                <th className="text-center text-xs font-medium text-zinc-500 px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-zinc-500">
                    Nenhuma loja encontrada
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => {
                  const statusBadge = getStatusBadge(store.feedback_status, store.days_until_feedback)
                  const StatusIcon = statusBadge.icon

                  return (
                    <tr key={store.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                      {/* Store / Client */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                            <Store className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div>
                            <p className="font-medium text-white">{store.store_name}</p>
                            <p className="text-sm text-zinc-500">{store.client_name}</p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            {store.has_shopify && (
                              <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">Shopify</Badge>
                            )}
                            {store.has_klaviyo && (
                              <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">Klaviyo</Badge>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Result % */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-2xl font-bold ${getResultColor(store.result_percentage)}`}>
                            {store.result_percentage.toFixed(1)}%
                          </span>
                          <span className="text-xs text-zinc-500">da receita</span>
                        </div>
                      </td>

                      {/* Revenue */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-medium text-emerald-400">
                            {formatCurrency(store.klaviyo_revenue_30d)}
                          </span>
                          <span className="text-xs text-zinc-500">
                            de {formatCurrency(store.total_revenue_30d)}
                          </span>
                        </div>
                      </td>

                      {/* Next Feedback */}
                      <td className="px-4 py-4 text-center">
                        <Badge className={`${statusBadge.className} gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusBadge.label}
                        </Badge>
                        {store.next_feedback_date && (
                          <p className="text-xs text-zinc-500 mt-1">{formatDate(store.next_feedback_date)}</p>
                        )}
                      </td>

                      {/* Last Call */}
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm text-zinc-400">
                          {formatDate(store.last_feedback_date)}
                        </span>
                      </td>

                      {/* Responsible */}
                      <td className="px-4 py-4 text-center">
                        {store.last_feedback_by_name ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center">
                              <User className="w-3 h-3 text-zinc-400" />
                            </div>
                            <span className="text-sm text-zinc-400">{store.last_feedback_by_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-600">-</span>
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
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3"
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
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => router.push(`/clients/${store.client_id}`)}>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Ver Cliente
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
      </div>

      {/* Register Feedback Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-emerald-500" />
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
              {/* Result Summary */}
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Resultado atual (30d)</span>
                  <span className={`text-xl font-bold ${getResultColor(selectedStore.result_percentage)}`}>
                    {selectedStore.result_percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2 text-xs text-zinc-500">
                  <span>Receita Klaviyo: {formatCurrency(selectedStore.klaviyo_revenue_30d)}</span>
                  <span>Total: {formatCurrency(selectedStore.total_revenue_30d)}</span>
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
                  <Label htmlFor="duration">Duração (minutos)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="30"
                    value={feedbackForm.duration_minutes}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, duration_minutes: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas da reunião</Label>
                  <Textarea
                    id="notes"
                    placeholder="O que foi discutido..."
                    value={feedbackForm.notes}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action_items">Próximos passos / Action items</Label>
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
              className="bg-emerald-600 hover:bg-emerald-700"
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
              <Settings className="w-5 h-5 text-zinc-400" />
              Configurações da Loja
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
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <Store className="w-5 h-5 text-zinc-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{selectedStore.store_name}</p>
                    <p className="text-sm text-zinc-500">{selectedStore.client_name}</p>
                  </div>
                </div>
              </div>

              {/* Settings Form */}
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback_frequency">Frequência de Feedback</Label>
                  <Select
                    value={editForm.feedback_frequency}
                    onValueChange={(value: 'monthly' | '30_days') =>
                      setEditForm({ ...editForm, feedback_frequency: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a frequência" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">
                        <div className="flex flex-col">
                          <span>Mensal</span>
                          <span className="text-xs text-zinc-500">Início de cada mês</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="30_days">
                        <div className="flex flex-col">
                          <span>A cada 30 dias</span>
                          <span className="text-xs text-zinc-500">30 dias após última call</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="next_feedback_date">Próximo Feedback</Label>
                  <Input
                    id="next_feedback_date"
                    type="date"
                    value={editForm.next_feedback_date}
                    onChange={(e) => setEditForm({ ...editForm, next_feedback_date: e.target.value })}
                  />
                  <p className="text-xs text-zinc-500">
                    Deixe vazio para calcular automaticamente com base na frequência
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">Ações rápidas</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-zinc-700"
                    onClick={() => router.push(`/clients/${selectedStore.client_id}?tab=stores`)}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Editar no Cliente
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 border-zinc-700"
                    onClick={() => router.push(`/clients/${selectedStore.client_id}?tab=klaviyo`)}
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Ver Relatório
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
                'Salvar Configurações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
