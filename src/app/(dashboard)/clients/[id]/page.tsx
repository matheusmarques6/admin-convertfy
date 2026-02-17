import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Edit } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ClientActions } from "@/components/clients/client-actions"
import { ClientOverview } from "@/components/clients/client-overview"
import { ClientFinancial } from "@/components/clients/client-financial"
import { ClientContracts } from "@/components/clients/client-contracts"
import { ClientMeetings } from "@/components/clients/client-meetings"
import { ClientTimeline } from "@/components/clients/client-timeline"
import { ClientStores } from "@/components/clients/client-stores"
import { ClientPortalUsers } from "@/components/clients/client-portal-users"
import { ClientPerformanceReview } from "@/components/clients/client-performance-review"
import { getInitials, getHealthScoreColor, getHealthScoreEmoji } from "@/lib/utils"

export const dynamic = "force-dynamic"

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" }> = {
  active: { label: "Ativo", variant: "success" },
  inactive: { label: "Inativo", variant: "secondary" },
  churned: { label: "Churned", variant: "destructive" },
  prospect: { label: "Prospect", variant: "default" },
  onboarding: { label: "Onboarding", variant: "warning" },
}

async function getClient(id: string) {
  const supabase = await createClient()

  const { data: client, error } = await supabase
    .from("clients")
    .select(`
      *,
      owner:profiles!clients_owner_id_fkey (
        id,
        name,
        email,
        avatar_url
      )
    `)
    .eq("id", id)
    .single()

  if (error || !client) {
    return null
  }

  return client
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const client = await getClient(id)

  if (!client) {
    notFound()
  }

  const statusInfo = statusLabels[client.status] || statusLabels.prospect
  const healthColor = getHealthScoreColor(client.health_score)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{client.name}</h1>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              <div className="flex items-center gap-1 text-sm">
                <span>{getHealthScoreEmoji(client.health_score)}</span>
                <span className={`font-medium ${
                  healthColor === "green" ? "text-emerald-500" :
                  healthColor === "yellow" ? "text-amber-500" : "text-red-500"
                }`}>
                  {client.health_score}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              {client.company && <span>{client.company}</span>}
              {client.email && <span>{client.email}</span>}
              {client.phone && <span>{client.phone}</span>}
            </div>
            {client.tags && client.tags.length > 0 && (
              <div className="flex gap-1 mt-2">
                {client.tags.map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/clients/${client.id}/edit`}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </Button>
          <ClientActions clientId={client.id} clientName={client.name} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="stores">Lojas</TabsTrigger>
          <TabsTrigger value="financial">Financeiro</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            <ClientOverview client={client} />
            <ClientPerformanceReview clientId={client.id} />
          </div>
        </TabsContent>

        <TabsContent value="stores">
          <ClientStores clientId={client.id} clientName={client.name} />
        </TabsContent>

        <TabsContent value="financial">
          <div className="space-y-6">
            <ClientFinancial clientId={client.id} clientName={client.name} />
            <ClientContracts clientId={client.id} />
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <div className="space-y-6">
            <ClientTimeline clientId={client.id} />
            <ClientMeetings clientId={client.id} />
          </div>
        </TabsContent>

        <TabsContent value="config">
          <div className="space-y-6">
            <ClientPortalUsers clientId={client.id} clientName={client.name} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
