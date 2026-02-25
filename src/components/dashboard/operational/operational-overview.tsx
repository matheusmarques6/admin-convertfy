"use client"

import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Edit,
  Kanban,
  Rocket,
  Activity,
  LucideIcon,
} from "lucide-react"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

function getActivityIcon(type: string): { icon: LucideIcon; color: string; bg: string } {
  switch (type) {
    case "client_created":
      return { icon: UserPlus, color: "text-primary", bg: "bg-primary/10" }
    case "payment_received":
    case "payment_confirmed":
      return { icon: DollarSign, color: "text-success", bg: "bg-success/10" }
    case "payment_overdue":
      return { icon: DollarSign, color: "text-destructive", bg: "bg-destructive/10" }
    case "meeting_scheduled":
    case "meeting_completed":
      return { icon: Calendar, color: "text-warning", bg: "bg-warning/10" }
    case "report_uploaded":
      return { icon: FileText, color: "text-warning", bg: "bg-warning/10" }
    case "deal_created":
    case "deal_updated":
      return { icon: Kanban, color: "text-primary", bg: "bg-primary/10" }
    case "deal_won":
      return { icon: TrendingUp, color: "text-success", bg: "bg-success/10" }
    case "deal_lost":
      return { icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" }
    case "client_updated":
    case "status_changed":
      return { icon: Edit, color: "text-muted-foreground", bg: "bg-muted" }
    case "email_sent":
    case "whatsapp_sent":
      return { icon: MessageSquare, color: "text-success", bg: "bg-success/10" }
    default:
      return { icon: FileText, color: "text-muted-foreground", bg: "bg-muted" }
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min atrás`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d atrás`

  return new Date(dateStr).toLocaleDateString("pt-BR")
}

const ONBOARDING_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: "Não Iniciado", color: "bg-gray-500/10 text-gray-500" },
  in_progress: { label: "Em Progresso", color: "bg-blue-500/10 text-blue-500" },
  paused: { label: "Pausado", color: "bg-yellow-500/10 text-yellow-500" },
}

interface OperationalOverviewProps {
  activities: Array<{
    id: string
    type: string
    description: string
    created_at: string
    client: { name: string } | { name: string }[] | null
    profile: { name: string } | { name: string }[] | null
  }>
  onboardings: Array<{
    id: string
    status: string
    progress_percent: number
    target_completion_date: string | null
    client: { id: string; name: string } | { id: string; name: string }[] | null
    store: { id: string; store_name: string; platform: string } | { id: string; store_name: string; platform: string }[] | null
    steps: Array<{ id: string; status: string; name: string }> | null
  }>
  pendingTasks: number
}

export function OperationalOverview({ activities, onboardings }: OperationalOverviewProps) {
  return (
    <div className="rounded-xl border bg-card">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-info" />
          <CardTitle className="text-sm font-medium">Overview Operacional</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Tabs defaultValue="atividades">
          <TabsList className="w-full bg-muted/50 rounded-lg p-0.5">
            <TabsTrigger value="atividades" className="flex-1 rounded-md text-xs h-7">Atividades</TabsTrigger>
            <TabsTrigger value="onboardings" className="flex-1 rounded-md text-xs h-7">
              Onboardings
              {onboardings.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 rounded-full text-[10px] px-1.5 py-0">
                  {onboardings.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atividades">
            {activities.length > 0 ? (
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2.5 pt-2">
                  {activities.map((activity) => {
                    const { icon: Icon, color, bg } = getActivityIcon(activity.type)
                    const profileName = Array.isArray(activity.profile)
                      ? activity.profile[0]?.name
                      : activity.profile?.name
                    return (
                      <div key={activity.id} className="flex gap-3">
                        <div className={cn("rounded-md p-1.5 h-fit", bg)}>
                          <Icon className={cn("h-3.5 w-3.5", color)} />
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-[13px] leading-tight">{activity.description}</p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{profileName || "Sistema"}</span>
                            <span>•</span>
                            <span>{timeAgo(activity.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma atividade recente</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="onboardings">
            {onboardings.length > 0 ? (
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-2.5 pt-2">
                  {onboardings.map((onboarding) => {
                    const client = Array.isArray(onboarding.client) ? onboarding.client[0] : onboarding.client
                    const store = Array.isArray(onboarding.store) ? onboarding.store[0] : onboarding.store
                    const status = ONBOARDING_STATUS[onboarding.status] || ONBOARDING_STATUS.not_started
                    const completedSteps = onboarding.steps?.filter(s => s.status === "completed").length || 0
                    const totalSteps = onboarding.steps?.length || 0

                    return (
                      <div
                        key={onboarding.id}
                        className="p-2.5 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="rounded-md p-1.5 bg-info/10 shrink-0">
                            <Rocket className="h-3.5 w-3.5 text-info" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate">
                              {store?.store_name || "Loja"}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {client?.name || "Cliente"}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge
                                variant="secondary"
                                className={cn("text-[10px] h-5 px-2", status.color)}
                              >
                                {status.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {completedSteps}/{totalSteps} concluídos
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <Progress value={onboarding.progress_percent} className="h-1 flex-1" />
                              <span className="text-[11px] font-medium">{onboarding.progress_percent}%</span>
                            </div>
                            {onboarding.target_completion_date && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Meta: {new Date(onboarding.target_completion_date).toLocaleDateString("pt-BR")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Rocket className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhum onboarding ativo</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </div>
  )
}
