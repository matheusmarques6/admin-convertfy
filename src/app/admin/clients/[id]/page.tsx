import { notFound } from "next/navigation"
import Link from "next/link"
import { Edit } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/ui/page-header"
import { ClientActions } from "@/components/clients/client-actions"
import { ClientDetailTabs } from "@/components/clients/client-detail-tabs"
import { getInitials, getHealthScoreColor, getHealthScoreEmoji } from "@/lib/utils"
import { ROUTES } from "@/lib/routes"

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
      {/* Breadcrumb + Header */}
      <PageHeader
        title={client.name}
        breadcrumb={[
          { label: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST },
          { label: client.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/admin/clients/${client.id}/edit`}>
                <Icon icon={Edit} size={16} className="mr-2" />
                Editar
              </Link>
            </Button>
            <ClientActions clientId={client.id} clientName={client.name} />
          </div>
        }
      />

      {/* Client Info */}
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-lg sm:text-xl">
            {getInitials(client.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <div className="flex items-center gap-1 text-sm">
              <span>{getHealthScoreEmoji(client.health_score)}</span>
              <span className={`font-medium ${
                healthColor === "green" ? "text-success" :
                healthColor === "yellow" ? "text-warning" : "text-destructive"
              }`}>
                {client.health_score}%
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4 mt-1 text-sm text-muted-foreground">
            {client.company && <span className="truncate">{client.company}</span>}
            {client.email && <span className="truncate">{client.email}</span>}
            {client.phone && <span>{client.phone}</span>}
          </div>
          {client.tags && client.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {client.tags.map((tag: string) => (
                <Badge key={tag} variant="neutral" showDot={false} className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <ClientDetailTabs client={client} />
    </div>
  )
}
