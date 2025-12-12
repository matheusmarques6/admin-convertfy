"use client"

import { useState, useEffect } from "react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/lib/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"

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

export function ClientFinancial({ clientId, clientName }: ClientFinancialProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [payments, setPayments] = useState<Payment[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString())
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noAsaasId, setNoAsaasId] = useState(false)
  const [createdPayment, setCreatedPayment] = useState<{
    id: string
    invoiceUrl?: string
    bankSlipUrl?: string
    pixQrCode?: { encodedImage: string; payload: string }
  } | null>(null)

  const [chargeForm, setChargeForm] = useState({
    value: "",
    billingType: "PIX",
    dueDate: new Date().toISOString().split("T")[0],
    description: "",
    installmentCount: "1",
  })

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, selectedYear])

  async function loadData() {
    setIsLoading(true)
    setError(null)
    setNoAsaasId(false)
    try {
      const [paymentsRes, subscriptionsRes] = await Promise.all([
        fetch(`/api/integrations/asaas/payments?client_id=${clientId}&year=${selectedYear}`),
        fetch(`/api/integrations/asaas/subscriptions?client_id=${clientId}`),
      ])

      const paymentsData = await paymentsRes.json()
      const subscriptionsData = await subscriptionsRes.json()

      // Check for errors
      if (paymentsData.error) {
        if (paymentsData.error.includes("não ativa")) {
          setError("Integração Asaas não está ativa. Configure nas configurações.")
        } else {
          setError(paymentsData.error)
        }
        return
      }

      // Check if client has Asaas ID (via subscriptions message)
      if (subscriptionsData.message?.includes("não possui ID Asaas")) {
        setNoAsaasId(true)
      }

      if (paymentsData.success) {
        setPayments(paymentsData.payments || [])
        setSummary(paymentsData.summary)
      }

      if (subscriptionsData.success) {
        setSubscriptions(subscriptionsData.subscriptions || [])
      }
    } catch (err) {
      console.error("Error loading financial data:", err)
      setError("Erro ao carregar dados financeiros")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreateCharge() {
    if (!chargeForm.value || !chargeForm.dueDate) {
      toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description: "Preencha o valor e a data de vencimento",
      })
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch("/api/integrations/asaas/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          value: parseFloat(chargeForm.value),
          billingType: chargeForm.billingType,
          dueDate: chargeForm.dueDate,
          description: chargeForm.description || `Cobrança - ${clientName}`,
          installmentCount: parseInt(chargeForm.installmentCount),
        }),
      })

      const result = await response.json()

      if (result.success) {
        setCreatedPayment(result.payment)
        toast({
          title: "Cobrança criada!",
          description: "A cobrança foi criada com sucesso no Asaas.",
        })
        loadData()
      } else {
        toast({
          variant: "destructive",
          title: "Erro ao criar cobrança",
          description: result.error,
        })
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro ao criar cobrança",
      })
    } finally {
      setIsCreating(false)
    }
  }

  function resetForm() {
    setChargeForm({
      value: "",
      billingType: "PIX",
      dueDate: new Date().toISOString().split("T")[0],
      description: "",
      installmentCount: "1",
    })
    setCreatedPayment(null)
  }

  function getStatusBadge(status: string) {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; icon: typeof CheckCircle2 }> = {
      RECEIVED: { label: "Pago", variant: "success", icon: CheckCircle2 },
      CONFIRMED: { label: "Confirmado", variant: "success", icon: CheckCircle2 },
      RECEIVED_IN_CASH: { label: "Recebido", variant: "success", icon: CheckCircle2 },
      PENDING: { label: "Pendente", variant: "warning", icon: Clock },
      OVERDUE: { label: "Vencido", variant: "destructive", icon: AlertCircle },
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
      default: return <Receipt className="h-4 w-4" />
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString())

  // Show error state
  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-medium text-destructive">Erro ao carregar</h3>
          <p className="text-muted-foreground text-center mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Show message if client doesn't have Asaas ID
  if (noAsaasId && !isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Cliente não vinculado ao Asaas</h3>
          <p className="text-muted-foreground text-center mt-1 max-w-md">
            Este cliente ainda não foi importado do Asaas. Importe os clientes na página de clientes
            para visualizar o histórico financeiro.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <a href="/clients">Ir para Clientes</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Recebido</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {formatCurrency(summary?.paidValue || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{summary?.paid || 0} cobranças pagas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendente</CardDescription>
            <CardTitle className="text-2xl text-yellow-600">
              {formatCurrency(summary?.pendingValue || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{summary?.pending || 0} cobranças pendentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vencido</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              {formatCurrency(summary?.overdueValue || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{summary?.overdue || 0} cobranças vencidas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Assinaturas Ativas</CardDescription>
            <CardTitle className="text-2xl">{subscriptions.filter(s => s.isActive).length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {subscriptions.filter(s => s.isActive).length > 0 ? "Recorrentes" : "Nenhuma"}
            </p>
          </CardContent>
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
          <Button variant="outline" size="icon" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <Button onClick={() => { resetForm(); setCreateDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Cobrança
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">
            <Receipt className="mr-2 h-4 w-4" />
            Cobranças ({payments.length})
          </TabsTrigger>
          <TabsTrigger value="subscriptions">
            <Repeat className="mr-2 h-4 w-4" />
            Assinaturas ({subscriptions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma cobrança</h3>
              <p className="text-muted-foreground mt-1">Crie uma nova cobrança para este cliente</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{payment.description || `Cobrança #${payment.id.slice(-6)}`}</p>
                          <p className="text-xs text-muted-foreground">ID: {payment.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getBillingTypeIcon(payment.billingType)}
                          {payment.billingType}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(payment.value)}</TableCell>
                      <TableCell>{new Date(payment.dueDate).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        {payment.invoiceUrl && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          {subscriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Repeat className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma assinatura</h3>
              <p className="text-muted-foreground mt-1">Este cliente não possui assinaturas no Asaas</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {subscriptions.map(sub => (
                <Card key={sub.id} className={sub.isActive ? "border-green-500/50" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{formatCurrency(sub.value)}</CardTitle>
                      <Badge variant={sub.isActive ? "success" : "secondary"}>{sub.statusLabel}</Badge>
                    </div>
                    <CardDescription>{sub.description || "Assinatura"}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ciclo:</span>
                        <span>{sub.cycleLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Próximo vencimento:</span>
                        <span>{new Date(sub.nextDueDate).toLocaleDateString("pt-BR")}</span>
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
              Nova Cobrança
            </DialogTitle>
            <DialogDescription>Criar cobrança para {clientName}</DialogDescription>
          </DialogHeader>

          {!createdPayment ? (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Valor *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      className="pl-10"
                      value={chargeForm.value}
                      onChange={(e) => setChargeForm({ ...chargeForm, value: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
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

                <div className="space-y-2">
                  <Label>Data de Vencimento *</Label>
                  <Input
                    type="date"
                    value={chargeForm.dueDate}
                    onChange={(e) => setChargeForm({ ...chargeForm, dueDate: e.target.value })}
                  />
                </div>

                {chargeForm.billingType === "CREDIT_CARD" && (
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Select value={chargeForm.installmentCount} onValueChange={(value) => setChargeForm({ ...chargeForm, installmentCount: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                          <SelectItem key={n} value={n.toString()}>
                            {n}x {chargeForm.value ? formatCurrency(parseFloat(chargeForm.value) / n) : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder="Descrição da cobrança..."
                    value={chargeForm.description}
                    onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateCharge} disabled={isCreating}>
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Cobrança
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                  <p className="font-medium text-green-600">Cobrança criada com sucesso!</p>
                </div>

                {createdPayment.pixQrCode && (
                  <div className="space-y-2">
                    <Label>QR Code PIX</Label>
                    <div className="flex flex-col items-center p-4 border rounded-lg">
                      <img
                        src={`data:image/png;base64,${createdPayment.pixQrCode.encodedImage}`}
                        alt="QR Code PIX"
                        className="w-48 h-48"
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
    </div>
  )
}
