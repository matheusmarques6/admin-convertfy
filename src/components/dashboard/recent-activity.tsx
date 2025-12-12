"use client"

import {
  UserPlus,
  DollarSign,
  Calendar,
  FileText,
  MessageSquare,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

// Mock data - will be replaced with real data from Supabase
const activities = [
  {
    id: 1,
    type: "client_created",
    description: "Novo cliente cadastrado: Loja Premium",
    user: "João Silva",
    time: "2 min atrás",
    icon: UserPlus,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
  },
  {
    id: 2,
    type: "payment_received",
    description: "Pagamento recebido: R$ 2.500,00",
    user: "Sistema",
    time: "15 min atrás",
    icon: DollarSign,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10",
  },
  {
    id: 3,
    type: "meeting_scheduled",
    description: "Reunião agendada com Loja ABC",
    user: "Maria Santos",
    time: "1 hora atrás",
    icon: Calendar,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-500/10",
  },
  {
    id: 4,
    type: "report_uploaded",
    description: "Relatório enviado para Loja XYZ",
    user: "Pedro Costa",
    time: "2 horas atrás",
    icon: FileText,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10",
  },
  {
    id: 5,
    type: "deal_won",
    description: "Novo contrato fechado: R$ 5.000/mês",
    user: "Ana Lima",
    time: "3 horas atrás",
    icon: TrendingUp,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10",
  },
  {
    id: 6,
    type: "whatsapp_sent",
    description: "Mensagem enviada para 15 clientes",
    user: "Automação",
    time: "5 horas atrás",
    icon: MessageSquare,
    iconColor: "text-green-500",
    iconBg: "bg-green-500/10",
  },
]

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atividade Recente</CardTitle>
        <CardDescription>Últimas ações no sistema</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex gap-3">
                <div className={cn("rounded-lg p-2 h-fit", activity.iconBg)}>
                  <activity.icon className={cn("h-4 w-4", activity.iconColor)} />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm leading-tight">{activity.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{activity.user}</span>
                    <span>•</span>
                    <span>{activity.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
