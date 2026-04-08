"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Plus,
  Zap,
  Search,
  RefreshCw,
  MoreHorizontal,
  Edit,
  Mail,
  MessageSquare,
  Smartphone,
} from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { BrandIcon, BRAND_ICONS } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AutomationToggle } from "@/components/automations/automation-toggle"
import { AutomationDeleteButton } from "@/components/automations/automation-delete-button"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import { ROUTES } from "@/lib/routes"
import type { Automation } from "@/types"

// ─── Types ───────────────────────────────────────────────

interface AutomationWithRelations extends Automation {
  creator?: { id: string; name: string }
  logs?: { id: string; status: string; executed_at: string }[]
}

interface AutomationsPageClientProps {
  automations: AutomationWithRelations[]
}

type StatusFilter = "all" | "active" | "paused" | "draft"

// ─── Constants ───────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  new_client: "Novo cliente",
  client_status_changed: "Status alterado",
  payment_confirmed: "Pagamento confirmado",
  payment_overdue: "Pagamento em atraso",
  meeting_overdue: "Reunião atrasada",
  meeting_upcoming: "Reunião próxima",
  report_overdue: "Relatório atrasado",
  contract_expiring: "Contrato vencendo",
  revenue_dropped: "Faturamento caiu",
  deal_moved: "Deal movido",
  deal_created: "Deal criado",
  deal_won: "Deal ganho",
  deal_lost: "Deal perdido",
  scheduled_date: "Data agendada",
}

const CHANNEL_CONFIG: Record<string, { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: "Email" },
  sms: { icon: Smartphone, label: "SMS" },
  whatsapp: { icon: MessageSquare, label: "WhatsApp" },
}

// ─── Helpers ─────────────────────────────────────────────

function getAutomationStatus(a: AutomationWithRelations): string {
  if (a.is_active) return "active"
  // If never activated and no logs, treat as draft
  if (!a.logs || a.logs.length === 0) return "draft"
  return "paused"
}

function getChannel(a: AutomationWithRelations): string {
  const actions = (a.actions as unknown[]) || []
  for (const act of actions) {
    const action = act as { type?: string }
    if (action.type === "send_email") return "email"
    if (action.type === "send_sms") return "sms"
    if (action.type === "send_whatsapp") return "whatsapp"
  }
  return "email"
}

function getLastRun(logs?: { executed_at: string }[]): string | null {
  if (!logs || logs.length === 0) return null
  const sorted = [...logs].sort(
    (a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
  )
  return sorted[0].executed_at
}


// ─── ChannelBadge ────────────────────────────────────────

function ChannelBadge({ channel }: { channel: string }) {
  const cfg = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.email
  return (
    <Badge variant="neutral" showDot={false}>
      <Icon icon={cfg.icon} size={16} className="mr-0.5" />
      {cfg.label}
    </Badge>
  )
}

// ─── AutomationCard ──────────────────────────────────────

function AutomationCard({
  automation,
}: {
  automation: AutomationWithRelations
}) {
  const status = getAutomationStatus(automation)
  const triggerType = automation.trigger?.type as string
  const triggerLabel = TRIGGER_LABELS[triggerType] || triggerType || "Manual"
  const channel = getChannel(automation)
  const lastRun = getLastRun(automation.logs)
  const successCount = automation.logs?.filter((l) => l.status === "success").length || 0

  return (
    <div
      className={cn(
        "rounded-[8px] border border-border bg-card p-4",
        "cursor-pointer transition-all duration-150",
        "hover:border-[rgba(0,0,0,0.15)] dark:hover:border-[rgba(255,255,255,0.14)]"
      )}
    >
      {/* Header: name + status + menu */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-[#EAEDF3] truncate">
            {automation.name}
          </h4>
          <StatusBadge status={status} showDot />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" aria-label="Ações">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={ROUTES.ADMIN.AUTOMATIONS.DETAIL(automation.id)}>
                <Icon icon={Edit} size={16} className="mr-2" />
                Editar
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AutomationDeleteButton
              automationId={automation.id}
              automationName={automation.name}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Description */}
      {automation.description && (
        <p className="text-xs text-gray-500 dark:text-[#8B92A5] line-clamp-2 mb-3">
          {automation.description}
        </p>
      )}

      {/* Trigger + Channel badges */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Badge variant="info" showDot={false}>{triggerLabel}</Badge>
        <ChannelBadge channel={channel} />
      </div>

      {/* Metrics footer (if active and has logs) */}
      {status === "active" && successCount > 0 && (
        <div className="pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)] flex items-center gap-4 text-xs text-gray-500 dark:text-[#8B92A5]">
          <span className="font-mono tabular-nums">
            {successCount.toLocaleString("pt-BR")} execuções
          </span>
          <span className="font-mono tabular-nums">
            {(automation.actions as unknown[])?.length || 0} ações
          </span>
        </div>
      )}

      {/* Toggle + Last run */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]">
        <p className="text-[11px] text-gray-400 dark:text-[#5C6378]">
          {lastRun
            ? `Última: ${formatDistanceToNow(new Date(lastRun), { locale: ptBR, addSuffix: true })}`
            : "Nunca executada"}
        </p>
        <AutomationToggle automationId={automation.id} isActive={automation.is_active} />
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────

export function AutomationsPageClient({ automations }: AutomationsPageClientProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [isSyncing, setIsSyncing] = useState(false)

  // Filter automations
  const filteredAutomations = useMemo(() => {
    return automations.filter((a) => {
      // Status filter
      if (statusFilter !== "all") {
        const status = getAutomationStatus(a)
        if (status !== statusFilter) return false
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const nameMatch = a.name.toLowerCase().includes(q)
        const descMatch = a.description?.toLowerCase().includes(q) || false
        const triggerMatch = (a.trigger?.type as string)?.toLowerCase().includes(q) || false
        if (!nameMatch && !descMatch && !triggerMatch) return false
      }

      return true
    })
  }, [automations, statusFilter, search])

  // Counts per status
  const counts = useMemo(() => {
    const c = { all: automations.length, active: 0, paused: 0, draft: 0 }
    automations.forEach((a) => {
      const s = getAutomationStatus(a)
      if (s === "active") c.active++
      else if (s === "paused") c.paused++
      else if (s === "draft") c.draft++
    })
    return c
  }, [automations])

  const handleSyncKlaviyo = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch("/api/integrations/klaviyo/sync-flows", { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Erro ao sincronizar")
      }
      toast({
        title: "Sincronização iniciada",
        description: "Os flows do Klaviyo serão importados em instantes.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao sincronizar",
        description: error instanceof Error ? error.message : "Tente novamente mais tarde.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Actions bar: Sync Klaviyo + Nova Automação */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SegmentedTabItem value="all">
            Todas ({counts.all})
          </SegmentedTabItem>
          <SegmentedTabItem value="active">
            Ativas ({counts.active})
          </SegmentedTabItem>
          <SegmentedTabItem value="paused">
            Pausadas ({counts.paused})
          </SegmentedTabItem>
          <SegmentedTabItem value="draft">
            Rascunho ({counts.draft})
          </SegmentedTabItem>
        </SegmentedTabs>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSyncKlaviyo}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Icon icon={RefreshCw} size={16} className="mr-1.5 animate-spin" />
            ) : (
              <BrandIcon src={BRAND_ICONS.klaviyo} alt="Klaviyo" size={16} className="mr-1.5" />
            )}
            {isSyncing ? "Sincronizando..." : "Sync Klaviyo"}
          </Button>
          <Button asChild>
            <Link href={ROUTES.ADMIN.AUTOMATIONS.NEW}>
              <Icon icon={Plus} size={16} className="mr-1.5" />
              Nova Automação
            </Link>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar automações..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid or Empty State */}
      {filteredAutomations.length === 0 ? (
        <div className="text-center py-16">
          <Icon icon={Zap} size={24} className="text-gray-300 dark:text-[#5C6378] mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-[#8B92A5]">
            Nenhuma automação encontrada
          </p>
          <p className="text-xs text-gray-400 dark:text-[#5C6378] mt-1">
            {search || statusFilter !== "all"
              ? "Tente ajustar os filtros ou buscar outro termo."
              : "Crie sua primeira automação ou sincronize com Klaviyo."}
          </p>
          {!search && statusFilter === "all" && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button asChild size="sm">
                <Link href={ROUTES.ADMIN.AUTOMATIONS.NEW}>
                  <Icon icon={Plus} size={16} className="mr-1.5" />
                  Nova Automação
                </Link>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSyncKlaviyo} disabled={isSyncing}>
                <BrandIcon src={BRAND_ICONS.klaviyo} alt="Klaviyo" size={16} className="mr-1.5" />
                Sync Klaviyo
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAutomations.map((automation) => (
            <Link
              key={automation.id}
              href={ROUTES.ADMIN.AUTOMATIONS.DETAIL(automation.id)}
              className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-[8px]"
            >
              <AutomationCard automation={automation} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
