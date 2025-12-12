"use client"

import { Plus, FileText, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Contract } from "@/types"

interface ClientContractsProps {
  contracts: Contract[]
  clientId: string
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning" }> = {
  active: { label: "Ativo", variant: "success" },
  expired: { label: "Expirado", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  pending: { label: "Pendente", variant: "warning" },
}

export function ClientContracts({ contracts, clientId: _clientId }: ClientContractsProps) {
  const activeContract = contracts.find((c) => c.status === "active")
  const pastContracts = contracts.filter((c) => c.status !== "active")

  return (
    <div className="space-y-6">
      {/* Active Contract */}
      {activeContract ? (
        <Card className="border-emerald-500/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Contrato Ativo</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {activeContract.plan_name}
              </p>
            </div>
            <Badge variant="success">Ativo</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Valor Mensal</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {formatCurrency(activeContract.monthly_value)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Início</p>
                <p className="text-sm font-medium">
                  {formatDate(activeContract.start_date)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Término</p>
                <p className="text-sm font-medium">
                  {activeContract.end_date
                    ? formatDate(activeContract.end_date)
                    : "Indeterminado"}
                </p>
              </div>
            </div>
            {activeContract.notes && (
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">Observações</p>
                <p className="text-sm mt-1">{activeContract.notes}</p>
              </div>
            )}
            {activeContract.document_url && (
              <div className="pt-4 border-t">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={activeContract.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Documento
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <div className="rounded-full bg-muted p-3 mb-4">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-4">
              Nenhum contrato ativo
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Contrato
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contract History */}
      {pastContracts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Contratos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pastContracts.map((contract) => {
              const config = statusConfig[contract.status] || statusConfig.pending
              return (
                <div
                  key={contract.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg p-2 bg-background">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{contract.plan_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(contract.start_date)} -{" "}
                        {contract.end_date
                          ? formatDate(contract.end_date)
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-medium">
                      {formatCurrency(contract.monthly_value)}/mês
                    </p>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
