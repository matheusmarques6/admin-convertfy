"use client"

import { Globe, Mail, Phone, Building, User, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatCurrency, formatDate, getInitials } from "@/lib/utils"
import type { Client, Contract, Invoice, Meeting, User as UserType } from "@/types"

interface ClientWithRelations extends Client {
  contracts?: Contract[]
  invoices?: Invoice[]
  meetings?: Meeting[]
  owner?: UserType
}

interface ClientOverviewProps {
  client: ClientWithRelations
}

export function ClientOverview({ client }: ClientOverviewProps) {
  const activeContract = client.contracts?.find((c) => c.status === "active")
  const totalPaid = client.invoices
    ?.filter((i) => i.status === "paid")
    ?.reduce((sum, i) => sum + Number(i.amount), 0) || 0

  const pendingAmount = client.invoices
    ?.filter((i) => i.status === "pending" || i.status === "overdue")
    ?.reduce((sum, i) => sum + Number(i.amount), 0) || 0

  const nextMeeting = client.meetings
    ?.filter((m) => m.status === "scheduled" && new Date(m.scheduled_at) > new Date())
    ?.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Contact Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações de Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.email && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <a href={`mailto:${client.email}`} className="text-sm hover:underline">
                  {client.email}
                </a>
              </div>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Phone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <a href={`tel:${client.phone}`} className="text-sm hover:underline">
                  {client.phone}
                </a>
              </div>
            </div>
          )}
          {client.company && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Building className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Empresa</p>
                <p className="text-sm">{client.company}</p>
              </div>
            </div>
          )}
          {client.website && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-muted">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline"
                >
                  {client.website}
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contract & Financial Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo Financeiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeContract ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Plano Atual</p>
                <p className="text-lg font-semibold">{activeContract.plan_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Mensal</p>
                <p className="text-lg font-semibold text-emerald-500">
                  {formatCurrency(activeContract.monthly_value)}
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-muted-foreground">Sem contrato ativo</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Total Pago</p>
              <p className="text-sm font-medium text-emerald-500">
                {formatCurrency(totalPaid)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="text-sm font-medium text-amber-500">
                {formatCurrency(pendingAmount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Responsible & Next Meeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gestão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Responsável</p>
              {client.owner ? (
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={client.owner.avatar_url} />
                    <AvatarFallback className="text-xs">
                      {getInitials(client.owner.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{client.owner.name}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Não atribuído</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-muted">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próxima Reunião</p>
              {nextMeeting ? (
                <p className="text-sm">
                  {formatDate(nextMeeting.scheduled_at)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma agendada</p>
              )}
            </div>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Cliente desde</p>
            <p className="text-sm">{formatDate(client.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Custom Fields */}
      {client.custom_fields && Object.keys(client.custom_fields).length > 0 && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Campos Personalizados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(client.custom_fields).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground capitalize">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm">{String(value)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
