"use client"

import { useState, useEffect, useMemo } from "react"
import { useAsaasPayments, useAsaasSubscriptions } from "@/lib/hooks/use-api-data"
import Image from "next/image"
import {
  DollarSign,
  Plus,
  RefreshCw,
  Loader2,
  Receipt,
  CreditCard,
  QrCode,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Copy,
  ExternalLink,
  Repeat,
  Edit2,
  Building2,
  Wallet,
  MoreVertical,
  Trash2,
  Ban,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/lib/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { centsToReais } from "@/lib/currency"
import { CurrencyInput } from "@/components/ui/currency-input"
import { createClient } from "@/lib/supabase/client"

interface ClientFinancialProps {
  clientId: string
  clientName: string
}

interface Payment {
  id: string
  value: number
  status: string
  billingType: string
  dueDate: string
  paymentDate?: string
  description?: string
  invoiceUrl?: string
  paymentMethod?: string // Método real de pagamento (manual override)
  manualStatus?: string // Status manual override
}

interface Subscription {
  id: string
  value: number
  status: string
  statusLabel: string
  cycle: string
  cycleLabel: string
  nextDueDate: string
  description?: string
  isActive: boolean
  paymentMethod?: string // Asaas, PIX Direto, Wise
}

interface LocalSubscription {
  id: string
  client_id: string
  name: string
  value: number
  cycle: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY"
  payment_method: "asaas" | "pix_direto" | "wise" | "boleto"
  status: "active" | "inactive" | "cancelled"
  start_date: string
  next_due_date: string
  notes?: string
  created_at: string
}

interface LocalCharge {
  id: string
  client_id: string
  subscription_id?: string
  description: string
  value: number
  due_date: string
  payment_date?: string
  status: "pending" | "paid" | "overdue" | "cancelled"
  payment_method: "asaas" | "pix_direto" | "wise" | "boleto" | "cartao"
  actual_payment_method?: string // Se foi pago por outro método
  notes?: string
  created_at: string
}

interface PaymentSummary {
  total: number
  totalValue: number
  paid: number
  paidValue: number
  pending: number
  pendingValue: number
  overdue: number
  overdueValue: number
}

const cycleLabels: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  SEMIANNUALLY: "Semestral",
  YEARLY: "Anual",
}

const paymentMethodLabels: Record<string, { label: string; icon: typeof Building2 }> = {
  asaas: { label: "Asaas (Automático)", icon: Building2 },
  pix_direto: { label: "PIX Direto", icon: QrCode },
  wise: { label: "Transferência Wise", icon: Wallet },
  boleto: { label: "Boleto", icon: FileText },
  cartao: { label: "Cartão de Crédito", icon: CreditCard },
}

export function ClientFinancial({ clientId, clientName }: ClientFinancialProps) {
  const [localSubscriptions, setLocalSubscriptions] = useState<LocalSubscription[]>([])
  const [localCharges, setLocalCharges] = useState<LocalCharge[]>([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [selectedCharge, setSelectedCharge] = useState<LocalCharge | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createdPayment, setCreatedPayment] = useState<{
    id: string
    invoiceUrl?: string
    bankSlipUrl?: string
    pixQrCode?: { encodedImage: string; payload: string }
  } | null>(null)

  // SWR hooks for Asaas data
  const {
    data: paymentsRaw,
    error: paymentsError,
    isLoading: paymentsLoading,
    mutate: mutatePayments,
  } = useAsaasPayments(clientId, parseInt(selectedYear))

  const {
    data: subscriptionsRaw,
    mutate: mutateSubscriptions,
  } = useAsaasSubscriptions(clientId)

  // Derive Asaas state from SWR
  const paymentsData = paymentsRaw as Record<string, unknown> | undefined
  const subscriptionsData = subscriptionsRaw as Record<string, unknown> | undefined

  const payments: Payment[] = (paymentsData?.payments as Payment[]) || []
  // eslint-disable-next-line react-hooks/exhaustive-deps -- subscriptionsData is the stable SWR ref; derived array is only used in computedSummary
  const subscriptions: Subscription[] = useMemo(() => (subscriptionsData?.subscriptions as Subscription[]) || [], [subscriptionsData])
  const summary: PaymentSummary | null = (paymentsData?.summary as PaymentSummary) || null
  const isLoading = paymentsLoading

  const error = paymentsError
    ? "Erro ao carregar dados financeiros"
    : paymentsData?.error
      ? (String(paymentsData.error).includes("não ativa")
        ? "Integração Asaas não está ativa. Configure nas configurações."
        : String(paymentsData.error))
      : null

  const [chargeForm, setChargeForm] = useState({
    value: 0,
    billingType: "PIX",
    dueDate: new Date().toISOString().split("T")[0],
    description: "",
    installmentCount: "1",
    paymentMethod: "asaas",
  })

  const [subscriptionForm, setSubscriptionForm] = useState({
    name: "",
    value: 0,
    cycle: "MONTHLY" as LocalSubscription["cycle"],
    paymentMethod: "asaas" as LocalSubscription["payment_method"],
    startDate: new Date().toISOString().split("T")[0],
    notes: "",
  })

  const [statusForm, setStatusForm] = useState({
    status: "paid" as LocalCharge["status"],
    actualPaymentMethod: "",
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
  })

  // Load local data from Supabase (not going through API)
  useEffect(() => {
    loadLocalData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, selectedYear])

  async function loadLocalData() {
    try {
      const supabase = createClient()

      // Load subscriptions and charges in parallel with limits
      const [subsResult, chargesResult] = await Promise.all([
        supabase
          .from("client_subscriptions")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_charges")
          .select("*")
          .eq("client_id", clientId)
          .order("due_date", { ascending: false })
          .limit(100),
      ])

      if (subsResult.data) {
        setLocalSubscriptions(subsResult.data)
      }

      if (chargesResult.data) {
        setLocalCharges(chargesResult.data)
      }
    } catch (err) {
      console.error("Error loading local data:", err)
    }
  }

  async function handleCreateCharge() {
    if (chargeForm.value <= 0 || !chargeForm.dueDate) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o valor e a data de vencimento",
      })
      return
    }

    setIsCreating(true)

    try {
      // If using Asaas, create via API
      if (chargeForm.paymentMethod === "asaas") {
        const response = await fetch("/api/integrations/asaas/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            value: centsToReais(chargeForm.value),
            billingType: chargeForm.billingType,
            dueDate: chargeForm.dueDate,
            description: chargeForm.description || `Fatura - ${clientName}`,
            installmentCount: parseInt(chargeForm.installmentCount),
          }),
        })

        const result = await response.json()

        if (response.ok && result.payment) {
          setCreatedPayment(result.payment)
          toast({
            title: "Fatura criada!",
            description: "A fatura foi criada com sucesso no Asaas.",
          })
          mutatePayments(); mutateSubscriptions()
        } else {
          toast({
            variant: "destructive",
            title: "Erro ao criar fatura",
            description: result.error,
          })
        }
      } else {
        // Create local charge (PIX Direto, Wise, etc.)
        const res = await fetch("/api/client-charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            description: chargeForm.description || `Fatura - ${clientName}`,
            value: centsToReais(chargeForm.value),
            due_date: chargeForm.dueDate,
            status: "pending",
            payment_method: chargeForm.paymentMethod,
          }),
        })
        const resData = await res.json()
        if (!res.ok) throw new Error(resData.error || "Erro ao criar fatura")

        toast({
          title: "Fatura criada!",
          description: "A fatura foi registrada com sucesso.",
        })

        loadLocalData()
        setCreateDialogOpen(false)
        resetForm()
      }
    } catch (err) {
      console.error("Error creating charge:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao criar fatura",
      })
    } finally {
      setIsCreating(false)
    }
  }

  async function handleCreateSubscription() {
    if (!subscriptionForm.name || subscriptionForm.value <= 0) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o nome e o valor",
      })
      return
    }

    setIsCreating(true)

    try {
      // If using Asaas, create subscription via API
      if (subscriptionForm.paymentMethod === "asaas") {
        const response = await fetch("/api/integrations/asaas/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            value: centsToReais(subscriptionForm.value),
            cycle: subscriptionForm.cycle,
            nextDueDate: subscriptionForm.startDate,
            description: subscriptionForm.name,
            billingType: "PIX", // Default to PIX for subscriptions
          }),
        })

        const result = await response.json()

        if (response.ok && result.subscription) {
          toast({
            title: "Assinatura criada no Asaas!",
            description: `ID: ${result.subscription?.id}`,
          })
          mutatePayments(); mutateSubscriptions()
          setSubscriptionDialogOpen(false)
          resetSubscriptionForm()
        } else {
          toast({
            variant: "destructive",
            title: "Erro ao criar assinatura no Asaas",
            description: result.error,
          })
        }
      } else {
        // Create local subscription (PIX Direto, Wise, etc.)
        const res = await fetch("/api/client-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            name: subscriptionForm.name,
            value: centsToReais(subscriptionForm.value),
            cycle: subscriptionForm.cycle,
            payment_method: subscriptionForm.paymentMethod,
            status: "active",
            start_date: subscriptionForm.startDate,
            next_due_date: subscriptionForm.startDate,
            notes: subscriptionForm.notes || null,
          }),
        })
        const resData = await res.json()
        if (!res.ok) throw new Error(resData.error || "Erro ao criar assinatura")

        toast({
          title: "Assinatura criada!",
          description: "A assinatura foi registrada com sucesso.",
        })

        loadLocalData()
        setSubscriptionDialogOpen(false)
        resetSubscriptionForm()
      }
    } catch (err) {
      console.error("Error creating subscription:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao criar assinatura. Verifique se a tabela existe no banco.",
      })
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDeleteCharge(charge: LocalCharge) {
    if (!confirm("Tem certeza que deseja excluir esta fatura?")) return

    try {
      const res = await fetch(`/api/client-charges?id=${charge.id}`, { method: "DELETE" })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || "Erro ao excluir fatura")

      toast({
        title: "Fatura excluída!",
        description: "A fatura foi removida com sucesso.",
      })

      loadLocalData()
    } catch (err) {
      console.error("Error deleting charge:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao excluir fatura",
      })
    }
  }

  async function handleCancelCharge(charge: LocalCharge) {
    if (!confirm("Tem certeza que deseja cancelar esta fatura?")) return

    try {
      const res = await fetch("/api/client-charges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: charge.id }),
      })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || "Erro ao cancelar fatura")

      toast({
        title: "Fatura cancelada!",
        description: "A fatura foi cancelada com sucesso.",
      })

      loadLocalData()
    } catch (err) {
      console.error("Error cancelling charge:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao cancelar fatura",
      })
    }
  }

  async function handleDeleteSubscription(sub: LocalSubscription) {
    if (!confirm("Tem certeza que deseja excluir esta assinatura?")) return

    try {
      const res = await fetch(`/api/client-subscriptions?id=${sub.id}`, { method: "DELETE" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao excluir assinatura")

      toast({
        title: "Assinatura excluída!",
        description: "A assinatura foi removida com sucesso.",
      })

      loadLocalData()
    } catch (err) {
      console.error("Error deleting subscription:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao excluir assinatura",
      })
    }
  }

  async function handleCancelSubscription(sub: LocalSubscription) {
    if (!confirm("Tem certeza que deseja cancelar esta assinatura?")) return

    try {
      const res = await fetch("/api/client-subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sub.id }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao cancelar assinatura")

      toast({
        title: "Assinatura cancelada!",
        description: "A assinatura foi cancelada com sucesso.",
      })

      loadLocalData()
    } catch (err) {
      console.error("Error cancelling subscription:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao cancelar assinatura",
      })
    }
  }

  async function handleCancelAsaasSubscription(subId: string) {
    if (!confirm("Tem certeza que deseja cancelar esta assinatura no Asaas?")) return

    try {
      const response = await fetch(`/api/integrations/asaas/subscriptions?subscription_id=${subId}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "Assinatura cancelada!",
          description: "A assinatura foi cancelada no Asaas.",
        })
        mutatePayments(); mutateSubscriptions()
      } else {
        toast({
          variant: "destructive",
          title: "Erro",
          description: result.error,
        })
      }
    } catch (err) {
      console.error("Error cancelling Asaas subscription:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao cancelar assinatura no Asaas",
      })
    }
  }

  async function handleCancelAsaasPayment(paymentId: string) {
    if (!confirm("Tem certeza que deseja cancelar esta assinatura no Asaas?")) return

    try {
      const response = await fetch(`/api/integrations/asaas/charges?payment_id=${paymentId}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "Assinatura cancelada!",
          description: "A assinatura foi cancelada no Asaas.",
        })
        mutatePayments(); mutateSubscriptions()
      } else {
        toast({
          variant: "destructive",
          title: "Erro",
          description: result.error,
        })
      }
    } catch (err) {
      console.error("Error cancelling Asaas payment:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao cancelar assinatura no Asaas",
      })
    }
  }

  async function handleUpdateChargeStatus() {
    if (!selectedCharge) return

    setIsCreating(true)

    try {
      const res = await fetch("/api/client-charges", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charge_id: selectedCharge.id,
          status: statusForm.status,
          actual_payment_method: statusForm.actualPaymentMethod || null,
          payment_date: statusForm.status === "paid" ? statusForm.paymentDate : null,
          notes: statusForm.notes || selectedCharge.notes,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Erro ao atualizar status")

      toast({
        title: "Status atualizado!",
        description: "O status da fatura foi atualizado.",
      })

      loadLocalData()
      setStatusDialogOpen(false)
      setSelectedCharge(null)
    } catch (err) {
      console.error("Error updating charge status:", err)
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao atualizar status",
      })
    } finally {
      setIsCreating(false)
    }
  }

  function resetForm() {
    setChargeForm({
      value: 0,
      billingType: "PIX",
      dueDate: new Date().toISOString().split("T")[0],
      description: "",
      installmentCount: "1",
      paymentMethod: "asaas",
    })
    setCreatedPayment(null)
  }

  function resetSubscriptionForm() {
    setSubscriptionForm({
      name: "",
      value: 0,
      cycle: "MONTHLY",
      paymentMethod: "asaas",
      startDate: new Date().toISOString().split("T")[0],
      notes: "",
    })
  }

  function openStatusDialog(charge: LocalCharge) {
    setSelectedCharge(charge)
    setStatusForm({
      status: charge.status,
      actualPaymentMethod: charge.actual_payment_method || "",
      paymentDate: charge.payment_date || new Date().toISOString().split("T")[0],
      notes: charge.notes || "",
    })
    setStatusDialogOpen(true)
  }

  function getStatusBadge(status: string) {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; icon: typeof CheckCircle2 }> = {
      RECEIVED: { label: "Pago", variant: "success", icon: CheckCircle2 },
      CONFIRMED: { label: "Confirmado", variant: "success", icon: CheckCircle2 },
      RECEIVED_IN_CASH: { label: "Recebido", variant: "success", icon: CheckCircle2 },
      PENDING: { label: "Pendente", variant: "warning", icon: Clock },
      pending: { label: "Pendente", variant: "warning", icon: Clock },
      OVERDUE: { label: "Vencido", variant: "destructive", icon: AlertCircle },
      overdue: { label: "Vencido", variant: "destructive", icon: AlertCircle },
      paid: { label: "Pago", variant: "success", icon: CheckCircle2 },
      cancelled: { label: "Cancelado", variant: "secondary", icon: XCircle },
      REFUNDED: { label: "Estornado", variant: "secondary", icon: XCircle },
    }
    const info = statusMap[status] || { label: status, variant: "default" as const, icon: Clock }
    const Icon = info.icon

    return (
      <Badge variant={info.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {info.label}
      </Badge>
    )
  }

  function getBillingTypeIcon(type: string) {
    switch (type) {
      case "PIX": return <QrCode className="h-4 w-4" />
      case "BOLETO": return <FileText className="h-4 w-4" />
      case "CREDIT_CARD": return <CreditCard className="h-4 w-4" />
      case "pix_direto": return <QrCode className="h-4 w-4" />
      case "wise": return <Wallet className="h-4 w-4" />
      case "boleto": return <FileText className="h-4 w-4" />
      case "cartao": return <CreditCard className="h-4 w-4" />
      case "asaas": return <Building2 className="h-4 w-4" />
      default: return <Receipt className="h-4 w-4" />
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString())

  // Memoize summary calculations to avoid recomputing on every render
  const computedSummary = useMemo(() => {
    const localPaid = localCharges.filter(c => c.status === "paid")
    const localPending = localCharges.filter(c => c.status === "pending")
    const localOverdue = localCharges.filter(c => c.status === "overdue")
    const activeLocal = localSubscriptions.filter(s => s.status === "active")
    const activeAsaas = subscriptions.filter(s => s.isActive)

    return {
      paidValue: (summary?.paidValue || 0) + localPaid.reduce((acc, c) => acc + c.value, 0),
      paidCount: (summary?.paid || 0) + localPaid.length,
      pendingValue: (summary?.pendingValue || 0) + localPending.reduce((acc, c) => acc + c.value, 0),
      pendingCount: (summary?.pending || 0) + localPending.length,
      overdueValue: (summary?.overdueValue || 0) + localOverdue.reduce((acc, c) => acc + c.value, 0),
      overdueCount: (summary?.overdue || 0) + localOverdue.length,
      activeSubsCount: activeAsaas.length + activeLocal.length,
      activeSubsValue: activeAsaas.reduce((acc, s) => acc + s.value, 0) + activeLocal.reduce((acc, s) => acc + s.value, 0),
    }
  }, [summary, localCharges, localSubscriptions, subscriptions])

  // Show error state
  if (error && localSubscriptions.length === 0 && localCharges.length === 0) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium text-destructive">Erro ao carregar</h3>
          <p className="text-muted-foreground text-center mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => { mutatePayments(); mutateSubscriptions() }}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Total Recebido</span>
            <div className="rounded-full w-2 h-2 bg-emerald-500" />
          </div>
          <p className="text-xl font-semibold text-foreground">
            {formatCurrency(computedSummary.paidValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {computedSummary.paidCount} faturas pagas
          </p>
        </Card>

        <Card className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Pendente</span>
            <div className="rounded-full w-2 h-2 bg-amber-500" />
          </div>
          <p className="text-xl font-semibold text-foreground">
            {formatCurrency(computedSummary.pendingValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {computedSummary.pendingCount} faturas pendentes
          </p>
        </Card>

        <Card className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-muted-foreground">Vencido</span>
            <div className="rounded-full w-2 h-2 bg-red-500" />
          </div>
          <p className="text-xl font-semibold text-foreground">
            {formatCurrency(computedSummary.overdueValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {computedSummary.overdueCount} faturas vencidas
          </p>
        </Card>

        <Card className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground mb-1">Assinaturas Ativas</p>
          <p className="text-2xl font-bold text-foreground">
            {computedSummary.activeSubsCount}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {formatCurrency(computedSummary.activeSubsValue)}/mês
          </p>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => { mutatePayments(); mutateSubscriptions(); loadLocalData(); }} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setSubscriptionDialogOpen(true)}>
            <Repeat className="mr-2 h-4 w-4" />
            Nova Assinatura
          </Button>
          <Button onClick={() => { resetForm(); setCreateDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Fatura
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="charges">
        <TabsList>
          <TabsTrigger value="charges">
            <Receipt className="mr-2 h-4 w-4" />
            Faturas ({payments.length + localCharges.length})
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            <Repeat className="mr-2 h-4 w-4" />
            Assinaturas ({subscriptions.length + localSubscriptions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="charges" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (payments.length === 0 && localCharges.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma fatura</h3>
              <p className="text-muted-foreground mt-1">Crie uma nova fatura para este cliente</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Local Charges */}
                  {localCharges.map(charge => (
                    <TableRow key={charge.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{charge.description}</p>
                          {charge.actual_payment_method && (
                            <p className="text-xs text-muted-foreground">
                              Pago via: {paymentMethodLabels[charge.actual_payment_method]?.label || charge.actual_payment_method}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getBillingTypeIcon(charge.payment_method)}
                          <span className="text-sm">{paymentMethodLabels[charge.payment_method]?.label || charge.payment_method}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(charge.value)}</TableCell>
                      <TableCell>{new Date(charge.due_date).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{getStatusBadge(charge.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openStatusDialog(charge)}>
                              <Edit2 className="mr-2 h-4 w-4" />
                              Alterar Status
                            </DropdownMenuItem>
                            {charge.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => handleCancelCharge(charge)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar Fatura
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteCharge(charge)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Asaas Payments */}
                  {payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{payment.description || `Fatura #${payment.id.slice(-6)}`}</p>
                          <p className="text-xs text-muted-foreground">Asaas: {payment.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getBillingTypeIcon(payment.billingType)}
                          <span className="text-sm">{payment.billingType}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(payment.value)}</TableCell>
                      <TableCell>{new Date(payment.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {payment.invoiceUrl && (
                              <DropdownMenuItem asChild>
                                <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Ver Fatura
                                </a>
                              </DropdownMenuItem>
                            )}
                            {(payment.status === "PENDING" || payment.status === "OVERDUE") && (
                              <DropdownMenuItem onClick={() => handleCancelAsaasPayment(payment.id)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar Fatura
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          {(subscriptions.length === 0 && localSubscriptions.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Repeat className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma assinatura</h3>
              <p className="text-muted-foreground mt-1">Crie uma nova assinatura para este cliente</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Local Subscriptions */}
              {localSubscriptions.map(sub => (
                <Card key={sub.id} className={sub.status === "active" ? "border-success/50" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{formatCurrency(sub.value)}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.status === "active" ? "success" : "secondary"}>
                          {sub.status === "active" ? "Ativa" : sub.status === "inactive" ? "Inativa" : "Cancelada"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {sub.status === "active" && (
                              <DropdownMenuItem onClick={() => handleCancelSubscription(sub)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar Assinatura
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteSubscription(sub)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <CardDescription>{sub.name}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método:</span>
                        <span className="flex items-center gap-1">
                          {getBillingTypeIcon(sub.payment_method)}
                          {paymentMethodLabels[sub.payment_method]?.label}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ciclo:</span>
                        <span>{cycleLabels[sub.cycle]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Próximo vencimento:</span>
                        <span>{new Date(sub.next_due_date).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {/* Asaas Subscriptions */}
              {subscriptions.map(sub => (
                <Card key={sub.id} className={sub.isActive ? "border-success/50" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{formatCurrency(sub.value)}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.isActive ? "success" : "secondary"}>{sub.statusLabel}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {sub.isActive && (
                              <DropdownMenuItem onClick={() => handleCancelAsaasSubscription(sub.id)}>
                                <Ban className="mr-2 h-4 w-4" />
                                Cancelar Assinatura
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <CardDescription>{sub.description || "Assinatura Asaas"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Método:</span>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          Asaas (Automático)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ciclo:</span>
                        <span>{sub.cycleLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Próximo vencimento:</span>
                        <span>{new Date(sub.nextDueDate).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ID Asaas:</span>
                        <span className="text-xs font-mono">{sub.id}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Charge Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Nova Fatura
            </DialogTitle>
            <DialogDescription>Criar fatura para {clientName}</DialogDescription>
          </DialogHeader>

          {!createdPayment ? (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Método de Pagamento *</Label>
                  <Select
                    value={chargeForm.paymentMethod}
                    onValueChange={(value) => setChargeForm({ ...chargeForm, paymentMethod: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asaas">
                        <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Asaas (Automático)</div>
                      </SelectItem>
                      <SelectItem value="pix_direto">
                        <div className="flex items-center gap-2"><QrCode className="h-4 w-4" /> PIX Direto</div>
                      </SelectItem>
                      <SelectItem value="wise">
                        <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Transferência Wise</div>
                      </SelectItem>
                      <SelectItem value="boleto">
                        <div className="flex items-center gap-2"><FileText className="h-4 w-4" /> Boleto Manual</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <CurrencyInput
                    value={chargeForm.value}
                    onValueChange={(cents) => setChargeForm({ ...chargeForm, value: cents })}
                  />
                </div>

                {chargeForm.paymentMethod === "asaas" && (
                  <div className="space-y-2">
                    <Label>Forma de Pagamento (Asaas) *</Label>
                    <Select value={chargeForm.billingType} onValueChange={(value) => setChargeForm({ ...chargeForm, billingType: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PIX">
                          <div className="flex items-center gap-2"><QrCode className="h-4 w-4" /> PIX</div>
                        </SelectItem>
                        <SelectItem value="BOLETO">
                          <div className="flex items-center gap-2"><FileText className="h-4 w-4" /> Boleto</div>
                        </SelectItem>
                        <SelectItem value="CREDIT_CARD">
                          <div className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Cartão de Crédito</div>
                        </SelectItem>
                        <SelectItem value="UNDEFINED">
                          <div className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Cliente escolhe</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Input
                    type="date"
                    value={chargeForm.dueDate}
                    onChange={(e) => setChargeForm({ ...chargeForm, dueDate: e.target.value })}
                  />
                </div>

                {chargeForm.paymentMethod === "asaas" && chargeForm.billingType === "CREDIT_CARD" && (
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Select value={chargeForm.installmentCount} onValueChange={(value) => setChargeForm({ ...chargeForm, installmentCount: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                          <SelectItem key={n} value={n.toString()}>
                            {n}x {chargeForm.value ? formatCurrency(centsToReais(chargeForm.value) / n) : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder="Descrição da fatura..."
                    value={chargeForm.description}
                    onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateCharge} disabled={isCreating || chargeForm.value === 0}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Fatura
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="rounded-lg border border-success/50 bg-success/10 p-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-2" />
                  <p className="font-medium text-success">Fatura criada com sucesso!</p>
                </div>

                {createdPayment.pixQrCode && (
                  <div className="space-y-2">
                    <Label>QR Code PIX</Label>
                    <div className="flex flex-col items-center p-4 border rounded-lg">
                      <Image
                        src={`data:image/png;base64,${createdPayment.pixQrCode.encodedImage}`}
                        alt="QR Code PIX"
                        width={192}
                        height={192}
                        className="w-48 h-48"
                        unoptimized
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          navigator.clipboard.writeText(createdPayment.pixQrCode!.payload)
                          toast({ title: "Código PIX copiado!" })
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copiar código
                      </Button>
                    </div>
                  </div>
                )}

                {createdPayment.bankSlipUrl && (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={createdPayment.bankSlipUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="mr-2 h-4 w-4" />
                      Ver Boleto
                    </a>
                  </Button>
                )}

                {createdPayment.invoiceUrl && (
                  <Button variant="outline" className="w-full" asChild>
                    <a href={createdPayment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Link de Pagamento
                    </a>
                  </Button>
                )}
              </div>

              <DialogFooter>
                <Button onClick={() => { setCreateDialogOpen(false); resetForm(); }}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Subscription Dialog */}
      <Dialog open={subscriptionDialogOpen} onOpenChange={(open) => { setSubscriptionDialogOpen(open); if (!open) resetSubscriptionForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              Nova Assinatura
            </DialogTitle>
            <DialogDescription>Criar assinatura recorrente para {clientName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Assinatura *</Label>
              <Input
                placeholder="Ex: Plano Mensal, Gestão de Tráfego..."
                value={subscriptionForm.name}
                onChange={(e) => setSubscriptionForm({ ...subscriptionForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Valor *</Label>
              <CurrencyInput
                value={subscriptionForm.value}
                onValueChange={(cents) => setSubscriptionForm({ ...subscriptionForm, value: cents })}
              />
            </div>

            <div className="space-y-2">
              <Label>Ciclo de Assinatura *</Label>
              <Select
                value={subscriptionForm.cycle}
                onValueChange={(value) => setSubscriptionForm({ ...subscriptionForm, cycle: value as LocalSubscription["cycle"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                  <SelectItem value="BIWEEKLY">Quinzenal</SelectItem>
                  <SelectItem value="MONTHLY">Mensal</SelectItem>
                  <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                  <SelectItem value="SEMIANNUALLY">Semestral</SelectItem>
                  <SelectItem value="YEARLY">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de Pagamento *</Label>
              <Select
                value={subscriptionForm.paymentMethod}
                onValueChange={(value) => setSubscriptionForm({ ...subscriptionForm, paymentMethod: value as LocalSubscription["payment_method"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asaas">
                    <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Asaas (Automático)</div>
                  </SelectItem>
                  <SelectItem value="pix_direto">
                    <div className="flex items-center gap-2"><QrCode className="h-4 w-4" /> PIX Direto</div>
                  </SelectItem>
                  <SelectItem value="wise">
                    <div className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Transferência Wise</div>
                  </SelectItem>
                  <SelectItem value="boleto">
                    <div className="flex items-center gap-2"><FileText className="h-4 w-4" /> Boleto</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data de Início *</Label>
              <Input
                type="date"
                value={subscriptionForm.startDate}
                onChange={(e) => setSubscriptionForm({ ...subscriptionForm, startDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Notas sobre a assinatura..."
                value={subscriptionForm.notes}
                onChange={(e) => setSubscriptionForm({ ...subscriptionForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateSubscription} disabled={isCreating || subscriptionForm.value === 0}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={(open) => { setStatusDialogOpen(open); if (!open) setSelectedCharge(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Alterar Status da Fatura
            </DialogTitle>
            <DialogDescription>
              {selectedCharge?.description} - {selectedCharge && formatCurrency(selectedCharge.value)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Novo Status *</Label>
              <Select
                value={statusForm.status}
                onValueChange={(value) => setStatusForm({ ...statusForm, status: value as LocalCharge["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Vencido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {statusForm.status === "paid" && (
              <>
                <div className="space-y-2">
                  <Label>Método de Pagamento Real</Label>
                  <Select
                    value={statusForm.actualPaymentMethod || "_same"}
                    onValueChange={(value) => setStatusForm({ ...statusForm, actualPaymentMethod: value === "_same" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione se diferente do original" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_same">Mesmo método original</SelectItem>
                      <SelectItem value="asaas">Asaas</SelectItem>
                      <SelectItem value="pix_direto">PIX Direto</SelectItem>
                      <SelectItem value="wise">Transferência Wise</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Use quando o cliente pagou por um método diferente (ex: fatura Asaas paga via Wise)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={statusForm.paymentDate}
                    onChange={(e) => setStatusForm({ ...statusForm, paymentDate: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Notas sobre a alteração..."
                value={statusForm.notes}
                onChange={(e) => setStatusForm({ ...statusForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateChargeStatus} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
