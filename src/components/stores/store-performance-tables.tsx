"use client"

import { Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SkeletonShimmer } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/utils"
import { useStorePerformanceContext } from "@/lib/hooks/use-store-performance"

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <SkeletonShimmer className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <SkeletonShimmer className="h-4 flex-1" />
            <SkeletonShimmer className="h-4 w-16" />
            <SkeletonShimmer className="h-4 w-16" />
            <SkeletonShimmer className="h-4 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function formatSendDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ""
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export function StorePerformanceTables() {
  const { campaigns, flows, loading, error } = useStorePerformanceContext()

  if (loading) {
    return (
      <div className="space-y-6">
        <TableSkeleton />
        <TableSkeleton />
      </div>
    )
  }

  if (error) return null

  const hasCampaigns = campaigns.length > 0
  const hasFlows = flows.length > 0

  if (!hasCampaigns && !hasFlows) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum dado encontrado neste período</p>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
            Não há dados de campanhas ou flows para o período selecionado.
            Tente selecionar um período maior.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Recent Campaigns Table */}
      {hasCampaigns && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Campanhas recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Taxa de abertura</TableHead>
                  <TableHead className="text-right">Taxa de cliques</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.slice(0, 10).map((c) => {
                  const delivered = c.delivered || c.recipients || 0
                  const revenuePerRecipient = delivered > 0 ? c.revenue / delivered : 0
                  const sentDate = c.sendTime ? formatSendDate(c.sendTime) : ""
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate" title={c.name}>
                          {c.name}
                        </div>
                        {sentDate && (
                          <div className="text-xs text-muted-foreground">Enviada em: {sentDate}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(c.openRate || 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {(c.clickRate || 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(c.revenue)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(revenuePerRecipient)} / destinatário
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Top Flows Table */}
      {hasFlows && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Flows com melhor desempenho</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fluxo</TableHead>
                  <TableHead className="text-right">Entregas</TableHead>
                  <TableHead className="text-right">Abertura</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.slice(0, 10).map((f) => {
                  const delivered = f.delivered || f.recipients || 0
                  const revenuePerRecipient = delivered > 0 ? f.revenue / delivered : 0
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate" title={f.name}>
                          {f.name}
                        </div>
                        <Badge variant={f.status === "live" ? "success" : "secondary"} className="text-xs mt-1">
                          {f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(delivered).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {(f.openRate || 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(f.revenue)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(revenuePerRecipient)} / destinatário
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
