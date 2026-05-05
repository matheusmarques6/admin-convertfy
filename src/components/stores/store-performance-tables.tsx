"use client"

import { Zap } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/ui/status-badge"
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

export function StorePerformanceTables() {
  const { flows, loading, error, totals } = useStorePerformanceContext()

  if (loading) {
    return (
      <div className="space-y-6">
        <TableSkeleton />
      </div>
    )
  }

  if (error) return null

  const currency = totals?.currency ?? "BRL"
  const hasFlows = flows.length > 0

  if (!hasFlows) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Icon icon={Zap} customSize={40} className="text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Nenhum dado encontrado neste período</p>
          <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
            Não há dados de flows para o período selecionado.
            Tente selecionar um período maior.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Flows Table */}
      {hasFlows && (
        <Card className="rounded-[8px]">
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
                        <StatusBadge
                          status={
                            f.status === "live" || f.status === "enabled" || f.status === "active"
                              ? "live"
                              : "inactive"
                          }
                          className="text-xs mt-1"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {(delivered).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {(f.openRate || 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{formatCurrency(f.revenue, currency)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(revenuePerRecipient, currency)} / destinatário
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
