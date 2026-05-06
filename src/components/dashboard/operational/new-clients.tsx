"use client"

import Link from "next/link"
import { Users, UserPlus } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/10 text-green-600 dark:text-green-400",
  prospect: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  onboarding: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  inactive: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  churned: "bg-red-500/10 text-red-600 dark:text-red-400",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  prospect: "Prospect",
  onboarding: "Onboarding",
  inactive: "Inativo",
  churned: "Churned",
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

interface NewClientsProps {
  clients: Array<{
    id: string
    name: string
    email: string
    status: string
    health_score: number
    created_at: string
    owner_id?: string
  }>
}

export function NewClients({ clients }: NewClientsProps) {
  return (
    <div className="rounded-[6px] border border-border bg-card">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon={UserPlus} size={16} className="text-primary" />
            <CardTitle className="text-sm font-medium text-foreground">Novos Clientes</CardTitle>
          </div>
          {clients.length > 0 && (
            <Badge variant="neutral" className="text-xs">
              {clients.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {clients.length > 0 ? (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {clients.map((client) => (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {client.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate text-foreground">{client.name}</p>
                      <Badge
                        variant="neutral"
                        className={cn("text-[10px] h-5 px-2 shrink-0", STATUS_COLORS[client.status])}
                      >
                        {STATUS_LABELS[client.status] || client.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(client.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <div className="flex items-center gap-1.5 flex-1">
                        <Progress
                          value={client.health_score}
                          className="h-1 w-14"
                        />
                        <span className="text-xs text-muted-foreground">
                          {client.health_score}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Icon icon={Users} customSize={32} className="mb-2 opacity-50" />
            <p className="text-sm">Nenhum novo cliente nos últimos 30 dias</p>
          </div>
        )}
      </CardContent>
    </div>
  )
}
