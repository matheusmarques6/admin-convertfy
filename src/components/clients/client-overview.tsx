"use client"

import { useState, useEffect } from "react"
import { Globe, Mail, Phone, Building, User, Calendar, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { Client, Contract, Invoice, Meeting, User as UserType } from "@/types"

interface ClientWithRelations extends Client {
  owner?: UserType
}

interface ClientOverviewProps {
  client: ClientWithRelations
}

interface AsaasFinancialData {
  totalPaid: number
  totalPending: number
  totalOverdue: number
  hasSubscription: boolean
  subscriptionValue?: number
}

export function ClientOverview({ client }: ClientOverviewProps) {
  const [asaasData, setAsaasData] = useState<AsaasFinancialData | null>(null)
  const [isLoadingAsaas, setIsLoadingAsaas] = useState(true)
  const [hasAsaasId, setHasAsaasId] = useState(false)
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [localTotalPaid, setLocalTotalPaid] = useState(0)
  const [localPendingAmount, setLocalPendingAmount] = useState(0)
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)

  useEffect(() => {
    async function loadLocalData() {
      const supabase = createClient()
      const [contractsRes, invoicesRes, meetingsRes] = await Promise.all([
        supabase.from("contracts").select("*").eq("client_id", client.id).eq("status", "active").limit(1),
        supabase.from("invoices").select("amount, status").eq("client_id", client.id).limit(200),
        supabase.from("meetings").select("*").eq("client_id", client.id).eq("status", "scheduled").gt("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: true }).limit(1),
      ])
      setActiveContract(contractsRes.data?.[0] || null)
      const invoices = invoicesRes.data || []
      setLocalTotalPaid(invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.amount), 0))
      setLocalPendingAmount(invoices.filter(i => i.status === "pending" || i.status === "overdue").reduce((sum, i) => sum + Number(i.amount), 0))
      setNextMeeting(meetingsRes.data?.[0] || null)
    }
    loadLocalData()
    loadAsaasData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  async function loadAsaasData() {
    setIsLoadingAsaas(true)
    try {
      // Check if client has asaas_customer_id
      const customFields = client.custom_fields as Record<string, string> | null
      if (!customFields?.asaas_customer_id) {
        setHasAsaasId(false)
        return
      }
      setHasAsaasId(true)

      // Fetch payments for current year with 15s timeout
      const year = new Date().getFullYear()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const [paymentsRes, subscriptionsRes] = await Promise.all([
        fetch(`/api/integrations/asaas/payments?client_id=${client.id}&year=${year}`, { signal: controller.signal }),
        fetch(`/api/integrations/asaas/subscriptions?client_id=${client.id}`, { signal: controller.signal }),
      ])
      clearTimeout(timeout)

      const paymentsData = await paymentsRes.json()
      const subscriptionsData = await subscriptionsRes.json()

      if (paymentsData.success) {
        setAsaasData({
          totalPaid: paymentsData.summary?.paidValue || 0,
          totalPending: paymentsData.summary?.pendingValue || 0,
          totalOverdue: paymentsData.summary?.overdueValue || 0,
          hasSubscription: subscriptionsData.subscriptions?.some((s: { isActive: boolean }) => s.isActive) || false,
          subscriptionValue: subscriptionsData.subscriptions?.find((s: { isActive: boolean }) => s.isActive)?.value,
        })
      }
    } catch (error) {
      console.error("Error loading Asaas data:", error)
    } finally {
      setIsLoadingAsaas(false)
    }
  }

  // Use Asaas data if available, otherwise use local data
  const totalPaid = asaasData?.totalPaid ?? localTotalPaid
  const pendingAmount = asaasData ? (asaasData.totalPending + asaasData.totalOverdue) : localPendingAmount
  const overdueAmount = asaasData?.totalOverdue || 0

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações de Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.email && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <a href={`mailto:${client.email}`} className="text-sm hover:underline">
                  {client.email}
                </a>
              </div>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <a href={`tel:${client.phone}`} className="text-sm hover:underline">
                  {client.phone}
                </a>
              </div>
            </div>
          )}
          {client.company && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Building className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Empresa</p>
                <p className="text-sm">{client.company}</p>
              </div>
            </div>
          )}
          {client.website && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline"
                >
                  {client.website}
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contract & Financial Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Resumo Financeiro</CardTitle>
          {isLoadingAsaas ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : hasAsaasId ? (
            <Badge variant="success" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Asaas
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Local</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {activeContract || asaasData?.hasSubscription ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Plano/Assinatura</p>
                <p className="text-lg font-semibold">
                  {activeContract?.plan_name || "Assinatura Ativa"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Mensal</p>
                <p className="text-lg font-semibold text-emerald-500">
                  {formatCurrency(asaasData?.subscriptionValue || activeContract?.monthly_value || 0)}
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-muted-foreground">Sem contrato/assinatura ativa</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Total Pago</p>
              <p className="text-sm font-medium text-emerald-500">
                {formatCurrency(totalPaid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="text-sm font-medium text-amber-500">
                {formatCurrency(pendingAmount)}
              </p>
            </div>
          </div>
          {overdueAmount > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <div>
                <p className="text-xs text-red-600 dark:text-red-400">Vencido</p>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {formatCurrency(overdueAmount)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Responsible & Next Meeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gestão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Responsável</p>
              {client.owner ? (
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={client.owner.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {getInitials(client.owner.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{client.owner.name}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Não atribuído</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-muted">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próxima Reunião</p>
              {nextMeeting ? (
                <p className="text-sm">
                  {formatDate(nextMeeting.scheduled_at)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma agendada</p>
              )}
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Cliente desde</p>
            <p className="text-sm">{formatDate(client.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Custom Fields - filter out asaas internal fields */}
      {client.custom_fields && Object.keys(client.custom_fields).filter(k => !k.startsWith('asaas_')).length > 0 && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Campos Personalizados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(client.custom_fields)
                .filter(([key]) => !key.startsWith('asaas_') && key !== 'cpf_cnpj')
                .map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground capitalize">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
