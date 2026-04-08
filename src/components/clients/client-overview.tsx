"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Pencil, Check, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAsaasPayments, useAsaasSubscriptions } from "@/lib/hooks/use-api-data"
import { cn } from "@/lib/utils"
import type { Client, Contract, Meeting, User as UserType, Activity } from "@/types"

// ─── Types ────────────────────────────────────────────────

export interface ClientWithRelations extends Client {
  owner?: UserType
}

interface ClientOverviewProps {
  client: ClientWithRelations
}

// ─── formatRelativeTime helper ────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return "agora mesmo"
  if (diffMin < 60) return `há ${diffMin} min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays} dia${diffDays > 1 ? "s" : ""}`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

// ─── Activity type → dot color ────────────────────────────

const activityDotColors: Record<string, string> = {
  note_added: "bg-[#4E62D8] dark:bg-[#7B8CEA]",
  email_sent: "bg-[#065F46] dark:bg-[#6EE7B7]",
  whatsapp_sent: "bg-[#065F46] dark:bg-[#6EE7B7]",
  status_changed: "bg-[#92400E] dark:bg-[#FCD34D]",
  payment_received: "bg-[#065F46] dark:bg-[#6EE7B7]",
  payment_overdue: "bg-[#991B1B] dark:bg-[#FCA5A5]",
  meeting_scheduled: "bg-[#4E62D8] dark:bg-[#7B8CEA]",
  meeting_completed: "bg-[#065F46] dark:bg-[#6EE7B7]",
  client_created: "bg-[#4E62D8] dark:bg-[#7B8CEA]",
  client_updated: "bg-gray-400 dark:bg-[#5C6378]",
  report_uploaded: "bg-[#92400E] dark:bg-[#FCD34D]",
}

// ─── Asaas types ──────────────────────────────────────────

interface AsaasFinancialData {
  totalPaid: number
  totalPending: number
  totalOverdue: number
  hasSubscription: boolean
  subscriptionValue?: number
}

// ─── ClientOverview (2-column layout) ─────────────────────

export function ClientOverview({ client }: ClientOverviewProps) {
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [localTotalPaid, setLocalTotalPaid] = useState(0)
  const [localPendingAmount, setLocalPendingAmount] = useState(0)
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null)
  const [localLoading, setLocalLoading] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const clientCustomFields = client.custom_fields as Record<string, unknown> | null
  const [notes, setNotes] = useState((clientCustomFields?.notes as string) ?? "")
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  // Asaas integration
  const customFields = client.custom_fields as Record<string, string> | null
  const hasAsaasId = !!customFields?.asaas_customer_id
  const currentYear = useMemo(() => new Date().getFullYear(), [])

  const { data: paymentsRaw, isLoading: paymentsLoading } = useAsaasPayments(
    hasAsaasId ? client.id : null, currentYear
  )
  const { data: subscriptionsRaw } = useAsaasSubscriptions(
    hasAsaasId ? client.id : null
  )

  const paymentsData = paymentsRaw as Record<string, unknown> | undefined
  const subscriptionsData = subscriptionsRaw as Record<string, unknown> | undefined

  const asaasData = useMemo<AsaasFinancialData | null>(() => {
    if (!paymentsData) return null
    const summary = (paymentsData.summary || (paymentsData.data as Record<string, unknown>)?.summary) as Record<string, number> | undefined
    if (!summary) return null
    const subs = (subscriptionsData?.subscriptions || (subscriptionsData?.data as Record<string, unknown>)?.subscriptions) as Array<{ isActive: boolean; value?: number }> | undefined
    return {
      totalPaid: summary.paidValue || 0,
      totalPending: summary.pendingValue || 0,
      totalOverdue: summary.overdueValue || 0,
      hasSubscription: subs?.some(s => s.isActive) || false,
      subscriptionValue: subs?.find(s => s.isActive)?.value,
    }
  }, [paymentsData, subscriptionsData])

  const isLoadingAsaas = hasAsaasId && paymentsLoading

  // Load local data
  useEffect(() => {
    async function loadLocalData() {
      const supabase = createClient()
      const [contractsRes, invoicesRes, meetingsRes, activitiesRes] = await Promise.all([
        supabase.from("contracts").select("*").eq("client_id", client.id).eq("status", "active").limit(1),
        supabase.from("unified_invoices").select("amount, status").eq("client_id", client.id).limit(50),
        supabase.from("meetings").select("*").eq("client_id", client.id).eq("status", "scheduled").gt("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: true }).limit(1),
        supabase.from("activities").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(5),
      ])
      setActiveContract(contractsRes.data?.[0] || null)
      const invoices = invoicesRes.data || []
      setLocalTotalPaid(invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.amount), 0))
      setLocalPendingAmount(invoices.filter(i => i.status === "pending" || i.status === "overdue").reduce((sum, i) => sum + Number(i.amount), 0))
      setNextMeeting(meetingsRes.data?.[0] || null)
      setActivities(activitiesRes.data || [])
      setLocalLoading(false)
      setActivitiesLoading(false)
    }
    loadLocalData()
  }, [client.id])

  const totalPaid = asaasData?.totalPaid ?? localTotalPaid
  const pendingAmount = asaasData ? (asaasData.totalPending + asaasData.totalOverdue) : localPendingAmount
  const overdueAmount = asaasData?.totalOverdue || 0

  // Save notes (stored in custom_fields.notes)
  async function handleSaveNotes() {
    setIsSavingNotes(true)
    try {
      const supabase = createClient()
      const updatedFields = { ...(client.custom_fields ?? {}), notes }
      await supabase.from("clients").update({ custom_fields: updatedFields }).eq("id", client.id)
      setIsEditingNotes(false)
    } catch {
      // silently fail
    } finally {
      setIsSavingNotes(false)
    }
  }

  // ─── Info fields ────────────────────────────────────────

  const infoFields = [
    { label: "Empresa", value: client.company ?? "—" },
    { label: "Email", value: client.email, render: () => client.email ? (
      <a href={`mailto:${client.email}`} className="text-sm text-[#4E62D8] dark:text-[#7B8CEA] hover:underline">
        {client.email}
      </a>
    ) : "—" },
    { label: "Telefone", value: client.phone ?? "—", render: () => client.phone ? (
      <a href={`tel:${client.phone}`} className="text-sm text-[#4E62D8] dark:text-[#7B8CEA] hover:underline">
        {client.phone}
      </a>
    ) : "—" },
    { label: "Website", value: client.website, render: () => client.website ? (
      <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-[#4E62D8] dark:text-[#7B8CEA] hover:underline truncate block">
        {client.website.replace(/^https?:\/\//, "")}
      </a>
    ) : "—" },
    { label: "Responsável", value: client.owner?.name, render: () => client.owner ? (
      <div className="flex items-center gap-2">
        <Avatar className="h-5 w-5">
          <AvatarImage src={client.owner.avatar_url} />
          <AvatarFallback className="text-[9px]">{getInitials(client.owner.name)}</AvatarFallback>
        </Avatar>
        <span className="text-sm text-gray-700 dark:text-[#EAEDF3]">{client.owner.name}</span>
      </div>
    ) : <span className="text-sm text-gray-400 dark:text-[#5C6378]">Não atribuído</span> },
    { label: "Cliente desde", value: formatDate(client.created_at) },
    { label: "Próxima reunião", value: nextMeeting ? formatDate(nextMeeting.scheduled_at) : "Nenhuma agendada", render: () => localLoading ? (
      <SkeletonShimmer className="h-4 w-28" />
    ) : nextMeeting ? (
      <span className="text-sm text-gray-700 dark:text-[#EAEDF3]">{formatDate(nextMeeting.scheduled_at)}</span>
    ) : <span className="text-sm text-gray-400 dark:text-[#5C6378]">Nenhuma agendada</span> },
    { label: "CPF/CNPJ", value: client.cpf_cnpj ?? (clientCustomFields?.cpf_cnpj as string) ?? "—" },
  ]

  // Build address string from custom_fields.address
  const addressObj = clientCustomFields?.address as Record<string, string> | undefined
  const addressParts = addressObj
    ? [
        [addressObj.street, addressObj.number].filter(Boolean).join(", "),
        addressObj.complement,
        addressObj.neighborhood,
        [addressObj.city, addressObj.state].filter(Boolean).join(" - "),
        addressObj.postal_code,
      ].filter(Boolean)
    : []

  // Custom fields (filter internal + address + notes)
  const displayCustomFields = client.custom_fields
    ? Object.entries(client.custom_fields).filter(([key]) => !key.startsWith("asaas_") && key !== "cpf_cnpj" && key !== "address" && key !== "notes")
    : []

  return (
    <div className={cn(
      "mt-6 grid gap-6",
      "grid-cols-1 lg:grid-cols-5",
    )}>
      {/* Left column: Info + Financial + Notes (3/5) */}
      <div className="lg:col-span-3 space-y-6">
        {/* Info Card */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Informações gerais</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {infoFields.map((field) => (
                <div key={field.label}>
                  <dt className="text-[12px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">
                    {field.label}
                  </dt>
                  <dd className="text-sm text-gray-700 dark:text-[#EAEDF3] mt-0.5">
                    {field.render ? field.render() : field.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {/* Address Card */}
        {addressParts.length > 0 && (
          <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Endereço</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 dark:text-[#EAEDF3] leading-relaxed">
                {addressParts.join(" — ")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Financial Summary Card */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Resumo financeiro</CardTitle>
            {isLoadingAsaas ? (
              <Icon icon={Loader2} size={16} className="animate-spin text-gray-400" />
            ) : hasAsaasId ? (
              <Badge variant="positive" className="text-[10px]">
                <Icon icon={CheckCircle2} customSize={12} className="mr-1" /> Asaas
              </Badge>
            ) : (
              <Badge variant="neutral" className="text-[10px]">Local</Badge>
            )}
          </CardHeader>
          <CardContent>
            {isLoadingAsaas ? (
              <div className="space-y-3">
                <SkeletonShimmer className="h-5 w-32" />
                <SkeletonShimmer className="h-5 w-24" />
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                  <SkeletonShimmer className="h-4 w-20" />
                  <SkeletonShimmer className="h-4 w-20" />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {activeContract || asaasData?.hasSubscription ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <dt className="text-[12px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">Plano</dt>
                      <dd className="text-sm font-medium text-gray-900 dark:text-[#EAEDF3] mt-0.5">
                        {activeContract?.plan_name || "Assinatura Ativa"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">Valor Mensal</dt>
                      <dd className="text-sm font-semibold font-mono tabular-nums text-[#065F46] dark:text-[#6EE7B7] mt-0.5">
                        {formatCurrency(asaasData?.subscriptionValue || activeContract?.monthly_value || 0)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-[#5C6378]">Sem contrato/assinatura ativa</p>
                )}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
                  <div>
                    <p className="text-[12px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">Total Pago</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-[#065F46] dark:text-[#6EE7B7] mt-0.5">
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em]">Pendente</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-[#92400E] dark:text-[#FCD34D] mt-0.5">
                      {formatCurrency(pendingAmount)}
                    </p>
                  </div>
                </div>
                {overdueAmount > 0 && (
                  <div className={cn(
                    "flex items-center gap-2 p-3 rounded-[6px]",
                    "bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B]",
                    "dark:bg-[#3B1111] dark:border-[rgba(252,165,165,0.15)] dark:text-[#FCA5A5]",
                  )}>
                    <Icon icon={AlertCircle} size={16} />
                    <div>
                      <p className="text-xs font-medium">Vencido</p>
                      <p className="text-sm font-semibold font-mono tabular-nums">{formatCurrency(overdueAmount)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custom Fields */}
        {displayCustomFields.length > 0 && (
          <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Campos personalizados</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {displayCustomFields.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-[12px] font-medium text-gray-400 dark:text-[#5C6378] uppercase tracking-[0.04em] capitalize">
                      {key.replace(/_/g, " ")}
                    </dt>
                    <dd className="text-sm text-gray-700 dark:text-[#EAEDF3] mt-0.5">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Notes Card */}
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Notas</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={isEditingNotes ? handleSaveNotes : () => setIsEditingNotes(true)}
                disabled={isSavingNotes}
              >
                {isSavingNotes ? (
                  <Icon icon={Loader2} size={16} className="animate-spin mr-1" />
                ) : (
                  <Icon icon={isEditingNotes ? Check : Pencil} size={16} className="mr-1" />
                )}
                {isEditingNotes ? "Salvar" : "Editar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isEditingNotes ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(
                  "w-full min-h-[100px] rounded-[6px] px-3 py-2 text-sm resize-y",
                  "bg-white border border-[rgba(0,0,0,0.08)] text-gray-700",
                  "dark:bg-[#1A1D27] dark:border-[rgba(255,255,255,0.08)] dark:text-[#EAEDF3]",
                  "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#4E62D8]",
                  "dark:focus-visible:shadow-[0_0_0_2px_#7B8CEA]",
                  "placeholder:text-gray-400 dark:placeholder:text-[#5C6378]",
                )}
                placeholder="Adicionar notas sobre o cliente..."
              />
            ) : (
              <p className={cn(
                "text-sm leading-relaxed whitespace-pre-wrap",
                notes
                  ? "text-gray-700 dark:text-[#8B92A5]"
                  : "text-gray-400 dark:text-[#5C6378] italic",
              )}>
                {notes || "Nenhuma nota adicionada."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right column: Recent Activities (2/5) */}
      <div className="lg:col-span-2">
        <Card className="rounded-[8px] border border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Atividades recentes</CardTitle>
              <Link
                href={`/admin/clients/${client.id}?tab=timeline`}
                className="text-xs font-medium text-[#4E62D8] dark:text-[#7B8CEA] hover:underline"
              >
                Ver tudo →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activitiesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <SkeletonShimmer className="w-2 h-2 rounded-full mt-2 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <SkeletonShimmer className="h-4 w-full" />
                      <SkeletonShimmer className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-[#5C6378] text-center py-6">
                Nenhuma atividade registrada.
              </p>
            ) : (
              <div className="space-y-0">
                {activities.map((activity, index) => (
                  <div key={activity.id} className="flex gap-3">
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0 mt-2",
                        activityDotColors[activity.type] ?? "bg-gray-300 dark:bg-[#5C6378]",
                      )} />
                      {index < activities.length - 1 && (
                        <div className="w-px flex-1 bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.08)] min-h-[24px]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-[#EAEDF3] leading-snug">
                        {activity.description}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-[#5C6378] mt-1">
                        {formatRelativeTime(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
