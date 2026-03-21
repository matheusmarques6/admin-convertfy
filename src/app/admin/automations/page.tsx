import { Suspense } from "react"
import Link from "next/link"
import { Plus, Zap, Play, Pause, MoreHorizontal, Trash2, Edit, TrendingUp, TrendingDown, Activity } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AutomationToggle } from "@/components/automations/automation-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import type { Automation } from "@/types"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

async function getAutomations() {
  const supabase = await createClient()

  const { data: automations, error } = await supabase
    .from("automations")
    .select(`
      *,
      creator:profiles!automations_created_by_fkey (
        id,
        name
      ),
      logs:automation_logs (
        id,
        status,
        executed_at
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching automations:", error)
    return []
  }

  return automations || []
}

async function getAutomationStats() {
  const supabase = await createClient()

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalExecutionsLast30 },
    { count: successExecutionsLast30 },
    { count: failedExecutionsLast30 },
  ] = await Promise.all([
    supabase.from("automation_logs").select("*", { count: "exact", head: true }).gte("executed_at", thirtyDaysAgo),
    supabase.from("automation_logs").select("*", { count: "exact", head: true }).gte("executed_at", thirtyDaysAgo).eq("status", "success"),
    supabase.from("automation_logs").select("*", { count: "exact", head: true }).gte("executed_at", thirtyDaysAgo).eq("status", "error"),
  ])

  return {
    executionsLast30: totalExecutionsLast30 || 0,
    successLast30: successExecutionsLast30 || 0,
    failedLast30: failedExecutionsLast30 || 0,
  }
}

function TrendBadge({ value, label, positive }: { value: number; label: string; positive?: boolean }) {
  if (value === 0) return null
  const colorClass = positive === undefined
    ? "text-muted-foreground"
    : positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400"

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium", colorClass)}>
      {positive !== undefined && (positive ? <Icon icon={TrendingUp} customSize={12} /> : <Icon icon={TrendingDown} customSize={12} />)}
      {value}
      <span className="text-muted-foreground/50 ml-0.5">{label}</span>
    </span>
  )
}

const triggerLabels: Record<string, string> = {
  new_client: "Novo cliente cadastrado",
  client_status_changed: "Status do cliente alterado",
  payment_confirmed: "Pagamento confirmado",
  payment_overdue: "Pagamento em atraso",
  meeting_overdue: "Reunião atrasada",
  meeting_upcoming: "Reunião se aproximando",
  report_overdue: "Relatório atrasado",
  contract_expiring: "Contrato vencendo",
  revenue_dropped: "Faturamento caiu",
  deal_moved: "Deal movido",
  deal_created: "Deal criado",
  deal_won: "Deal ganho",
  deal_lost: "Deal perdido",
  scheduled_date: "Data específica",
}

function AutomationsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  )
}

export default async function AutomationsPage() {
  const [automations, stats] = await Promise.all([getAutomations(), getAutomationStats()])

  return (
    <PagePermissionWrapper requiredFeatures={["campaign_control"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
            <Icon icon={Zap} size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Automações</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Automatize tarefas e processos repetitivos</p>
          </div>
        </div>
        <Button asChild className="self-end sm:self-auto">
          <Link href="/admin/automations/new">
            <Icon icon={Plus} size={16} className="mr-2" />
            Nova Automação
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-xl border bg-card pt-6">
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg p-3 bg-primary/10">
              <Icon icon={Zap} size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{automations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card pt-6">
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg p-3 bg-emerald-500/10">
              <Icon icon={Play} size={20} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ativas</p>
              <p className="text-2xl font-bold">
                {automations.filter((a: Automation) => a.is_active).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card pt-6">
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg p-3 bg-muted">
              <Icon icon={Pause} size={20} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pausadas</p>
              <p className="text-2xl font-bold">
                {automations.filter((a: Automation) => !a.is_active).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card pt-6">
          <CardContent className="flex items-center gap-4">
            <div className="rounded-lg p-3 bg-info/10">
              <Icon icon={Activity} size={20} className="text-info" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">Execuções 30d</p>
              </div>
              <p className="text-2xl font-bold">{stats.executionsLast30}</p>
              {stats.failedLast30 > 0 && (
                <TrendBadge value={stats.failedLast30} label="erros" positive={false} />
              )}
              {stats.failedLast30 === 0 && stats.successLast30 > 0 && (
                <TrendBadge value={stats.successLast30} label="sucesso" positive={true} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automations List */}
      <Suspense fallback={<AutomationsSkeleton />}>
        {automations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Icon icon={Zap} customSize={32} className="text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhuma automação criada</h3>
              <p className="text-muted-foreground mt-1 text-center max-w-sm">
                Crie sua primeira automação para automatizar tarefas repetitivas
              </p>
              <Button asChild className="mt-4">
                <Link href="/admin/automations/new">
                  <Icon icon={Plus} size={16} className="mr-2" />
                  Criar Automação
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {automations.map((automation: Automation & { creator?: { name: string }, logs?: { status: string }[] }) => {
              const triggerType = automation.trigger?.type as string
              const triggerLabel = triggerLabels[triggerType] || triggerType

              return (
                <Card key={automation.id} className="rounded-xl border bg-card relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${automation.is_active ? "bg-primary/10" : "bg-muted"}`}>
                          <Icon icon={Zap} size={16} className={automation.is_active ? "text-primary" : "text-muted-foreground"} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{automation.name}</CardTitle>
                          {automation.description && (
                            <CardDescription className="mt-1 line-clamp-1">
                              {automation.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Icon icon={MoreHorizontal} size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/automations/${automation.id}`}>
                              <Icon icon={Edit} size={16} className="mr-2" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Icon icon={Trash2} size={16} className="mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Trigger */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Gatilho</p>
                      <Badge variant="outline">{triggerLabel}</Badge>
                    </div>

                    {/* Actions count */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {(automation.actions as unknown[])?.length || 0} ações configuradas
                      </span>
                      <span className="text-muted-foreground">
                        {automation.logs?.length || 0} execuções
                      </span>
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-sm">
                        {automation.is_active ? "Ativa" : "Pausada"}
                      </span>
                      <AutomationToggle automationId={automation.id} isActive={automation.is_active} />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </Suspense>
    </div>
    </PagePermissionWrapper>
  )
}
