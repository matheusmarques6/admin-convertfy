import { Suspense } from "react"
import Link from "next/link"
import { Plus, Zap, Play, Pause, MoreHorizontal, Trash2, Edit } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import type { Automation } from "@/types"

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
  const automations = await getAutomations()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automações</h1>
          <p className="text-muted-foreground">
            Automatize tarefas e processos repetitivos
          </p>
        </div>
        <Button asChild>
          <Link href="/automations/new">
            <Plus className="mr-2 h-4 w-4" />
            Nova Automação
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{automations.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-emerald-500/10">
              <Play className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ativas</p>
              <p className="text-2xl font-bold">
                {automations.filter((a: Automation) => a.is_active).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-3 bg-muted">
              <Pause className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pausadas</p>
              <p className="text-2xl font-bold">
                {automations.filter((a: Automation) => !a.is_active).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automations List */}
      <Suspense fallback={<AutomationsSkeleton />}>
        {automations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Zap className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">Nenhuma automação criada</h3>
              <p className="text-muted-foreground mt-1 text-center max-w-sm">
                Crie sua primeira automação para automatizar tarefas repetitivas
              </p>
              <Button asChild className="mt-4">
                <Link href="/automations/new">
                  <Plus className="mr-2 h-4 w-4" />
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
                <Card key={automation.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg p-2 ${automation.is_active ? "bg-primary/10" : "bg-muted"}`}>
                          <Zap className={`h-4 w-4 ${automation.is_active ? "text-primary" : "text-muted-foreground"}`} />
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
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/automations/${automation.id}`}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
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
                      <Switch checked={automation.is_active} />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </Suspense>
    </div>
  )
}
