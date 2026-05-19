"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Pencil,
  MoreHorizontal,
  Mail,
  Calendar,
  FileText,
  Trash2,
  IdCard,
  Phone,
  CalendarDays,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/lib/hooks/use-toast"
import { getInitials, formatCurrency, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Client, Contract, User } from "@/types"

// ─── Types ────────────────────────────────────────────────

export interface ClientWithRelations extends Client {
  owner?: User
  contracts?: Contract[]
  client_stores?: { id: string; store_name: string; platform: string; is_active: boolean }[]
}

interface ClientHeaderProps {
  client: ClientWithRelations
  ltv?: number
}

// ─── Status pill ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string; border: string }> = {
  active: {
    label: "Ativo",
    dot: "bg-[#10B981]",
    text: "text-[#065F46]",
    bg: "bg-[#ECFDF5]",
    border: "border-[#A7F3D0]",
  },
  onboarding: {
    label: "Onboarding",
    dot: "bg-[#F59E0B]",
    text: "text-[#92400E]",
    bg: "bg-[#FFFBEB]",
    border: "border-[#FDE68A]",
  },
  prospect: {
    label: "Prospect",
    dot: "bg-[#6366F1]",
    text: "text-[#3730A3]",
    bg: "bg-[#EEF0FB]",
    border: "border-[#C7CDEF]",
  },
  inactive: {
    label: "Inativo",
    dot: "bg-[#6B7280]",
    text: "text-[#374151]",
    bg: "bg-[#F3F4F6]",
    border: "border-[#E5E7EB]",
  },
  churned: {
    label: "Churn",
    dot: "bg-[#EF4444]",
    text: "text-[#991B1B]",
    bg: "bg-[#FEF2F2]",
    border: "border-[#FECACA]",
  },
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.inactive
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-[6px] border",
        cfg.bg,
        cfg.text,
        cfg.border,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function PlanPill({ planName }: { planName: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-[6px] border bg-[#EEF0FB] text-[#2137B6] border-[#C7CDEF] dark:bg-[#141C3D] dark:text-[#7B8CEA] dark:border-[rgba(123,140,234,0.3)]">
      {planName}
    </span>
  )
}

// ─── Health Score Ring ─────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(100, score))
  const stroke = 4
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (safe / 100) * circumference

  let color = "#10B981"
  let label = "Boa"
  if (safe < 50) {
    color = "#EF4444"
    label = "Crítica"
  } else if (safe < 70) {
    color = "#F59E0B"
    label = "Atenção"
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
          Saúde
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] mt-0.5">
          {label}
        </p>
      </div>
      <div className="relative w-[52px] h-[52px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 52 52">
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            stroke="rgba(0,0,0,0.08)"
            className="dark:stroke-[rgba(255,255,255,0.08)]"
            strokeWidth={stroke}
          />
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-semibold tabular-nums text-gray-900 dark:text-[#EAEDF3]">
            {safe}
          </span>
        </div>
      </div>
    </div>
  )
}

function CsmBadge({ owner }: { owner?: User }) {
  if (!owner) return null
  const initials = getInitials(owner.name)
  const firstName = owner.name.split(" ")[0]
  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-[#ECFDF5] dark:bg-[#0B2C24] flex items-center justify-center">
        <span className="text-[10px] font-semibold text-[#065F46] dark:text-[#6EE7B7]">
          {initials}
        </span>
      </div>
      <div className="text-left">
        <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
          CSM
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] -mt-0.5">
          {firstName} {owner.name.split(" ")[1]?.[0] ?? ""}.
        </p>
      </div>
    </div>
  )
}

// ─── KPI col ──────────────────────────────────────────────

function KpiCol({
  label,
  value,
  sub,
  isLast,
  tooltip,
}: {
  label: string
  value: string
  sub?: string
  isLast?: boolean
  tooltip?: string
}) {
  const content = (
    <div
      className={cn(
        "px-5 first:pl-0",
        !isLast && "border-r border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
        tooltip && "cursor-help",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-gray-400 dark:text-[#5C6378]">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-900 dark:text-[#EAEDF3] mt-1 tabular-nums leading-none">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-gray-500 dark:text-[#8B92A5] mt-1">
          {sub}
        </p>
      )}
    </div>
  )
  if (!tooltip) return content
  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-[11px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

// ─── ClientHeader ─────────────────────────────────────────

export function ClientHeader({ client, ltv }: ClientHeaderProps) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const activeContract = client.contracts?.find((c) => c.status === "active")
  const mrr = activeContract?.monthly_value ?? 0
  const totalStores = client.client_stores?.length ?? 0
  const activeStores = client.client_stores?.filter((s) => s.is_active).length ?? 0
  const onboardingStores = totalStores - activeStores
  const healthScore = client.health_score ?? 50
  const planName = activeContract?.plan_name ?? "—"

  const customFields = client.custom_fields as Record<string, unknown> | null
  const cpfCnpj = client.cpf_cnpj ?? (customFields?.cpf_cnpj as string) ?? null

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/clients/manage?id=${client.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao excluir cliente")
      }
      toast({ title: "Cliente excluído", description: "O cliente foi excluído com sucesso." })
      router.push("/admin/clients")
      router.refresh()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o cliente." })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          "rounded-[8px] border bg-white dark:bg-[#1A1D27]",
          "border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
        )}
      >
        {/* Top section */}
        <div className="p-5 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            {/* Avatar */}
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="bg-[#EEF0FB] text-[#4E62D8] dark:bg-[#141C3D] dark:text-[#7B8CEA] text-base font-semibold">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[20px] leading-tight font-semibold text-gray-900 dark:text-[#EAEDF3]">
                  {client.name}
                </h1>
                <StatusPill status={client.status} />
                {planName !== "—" && (
                  <PlanPill planName={`${planName}${activeContract?.end_date ? ` · ${activeContract.end_date.slice(0,4)}` : ""}`} />
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-gray-500 dark:text-[#8B92A5]">
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="inline-flex items-center gap-1.5 hover:text-[#4E62D8] dark:hover:text-[#7B8CEA] transition-colors"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {client.email}
                  </a>
                )}
                {client.phone && (
                  <a
                    href={`tel:${client.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-[#4E62D8] dark:hover:text-[#7B8CEA] transition-colors"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone}
                  </a>
                )}
                {cpfCnpj && (
                  <span className="inline-flex items-center gap-1.5">
                    <IdCard className="h-3.5 w-3.5" />
                    {cpfCnpj}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Cliente desde {formatDate(client.created_at)}
                </span>
              </div>
              {client.tags && client.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {client.tags.map((tag: string) => (
                    <Badge key={tag} variant="neutral" showDot={false} className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0 w-full lg:w-auto">
              <Button variant="secondary" size="sm" asChild>
                <a href={`mailto:${client.email}`}>
                  <Icon icon={Mail} customSize={14} className="mr-1.5" />
                  Email
                </a>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/admin/meetings/new?clientId=${client.id}`}>
                  <Icon icon={Calendar} customSize={14} className="mr-1.5" />
                  Reunião
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/admin/clients/${client.id}/edit`}>
                  <Icon icon={Pencil} customSize={14} className="mr-1.5" />
                  Editar
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais ações">
                    <Icon icon={MoreHorizontal} size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Ações</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/reports/new?clientId=${client.id}`}>
                      <FileText className="mr-2 h-4 w-4" />
                      Criar Relatório
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-[#991B1B] dark:text-[#FCA5A5]"
                    onSelect={(e) => {
                      e.preventDefault()
                      setShowDeleteDialog(true)
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir cliente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Bottom section: KPIs + CSM/Health */}
        <div
          className={cn(
            "px-5 sm:px-6 py-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.06)]",
            "bg-[#FAFBFC] dark:bg-[#161922]",
            "rounded-b-[8px]",
            "flex flex-col lg:flex-row lg:items-center justify-between gap-5",
          )}
        >
          <TooltipProvider delayDuration={200}>
            <div className="flex items-stretch divide-x divide-[rgba(0,0,0,0.06)] dark:divide-[rgba(255,255,255,0.06)]">
              <KpiCol
                label="MRR"
                value={mrr > 0 ? formatCurrency(mrr) : "—"}
                sub={mrr > 0 ? "plano mensal" : undefined}
                tooltip="Monthly Recurring Revenue · receita mensal contratada via plano ativo"
              />
              <KpiCol
                label="Lojas"
                value={totalStores.toString()}
                sub={
                  totalStores > 0
                    ? `${activeStores} ativa${activeStores !== 1 ? "s" : ""}${onboardingStores > 0 ? ` · ${onboardingStores} em onboarding` : ""}`
                    : "sem lojas"
                }
                tooltip="Total de lojas vinculadas ao cliente · ativas processam dados, em onboarding aguardam configuração"
              />
              <KpiCol
                label="Plano"
                value={planName}
                sub={activeContract?.end_date ? `${Math.max(0, Math.ceil((new Date(activeContract.end_date).getTime() - Date.now()) / (1000*60*60*24*30)))}m restantes` : undefined}
                tooltip={activeContract ? `Contrato ${activeContract.plan_name} ativo${activeContract.end_date ? ` até ${formatDate(activeContract.end_date)}` : ""}` : "Sem contrato ativo"}
              />
              <KpiCol
                label="LTV"
                value={ltv && ltv > 0 ? formatCurrency(ltv) : "—"}
                sub={ltv && ltv > 0 ? `desde ${formatDate(client.created_at)}` : undefined}
                isLast
                tooltip="Lifetime Value · soma de tudo já recebido em faturas pagas (Asaas + manual)"
              />
            </div>
          </TooltipProvider>

          <div className="flex items-center gap-5">
            <CsmBadge owner={client.owner} />
            <HealthRing score={healthScore} />
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente &quot;{client.name}&quot;?
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
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
    </>
  )
}
