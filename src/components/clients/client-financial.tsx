"use client"

import { DollarSign, Clock, AlertCircle, CheckCircle } from "lucide-react"
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
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Invoice } from "@/types"

interface ClientFinancialProps {
  invoices: Invoice[]
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; icon: React.ElementType }> = {
  pending: { label: "Pendente", variant: "warning", icon: Clock },
  paid: { label: "Pago", variant: "success", icon: CheckCircle },
  overdue: { label: "Atrasado", variant: "destructive", icon: AlertCircle },
  cancelled: { label: "Cancelado", variant: "secondary", icon: AlertCircle },
  refunded: { label: "Reembolsado", variant: "secondary", icon: DollarSign },
}

export function ClientFinancial({ invoices }: ClientFinancialProps) {
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.amount), 0)

  const totalPending = invoices
    .filter((i) => i.status === "pending")
    .reduce((sum, i) => sum + Number(i.amount), 0)

  const totalOverdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + Number(i.amount), 0)

  const metrics = [
    {
      label: "Total Pago",
      value: formatCurrency(totalPaid),
      icon: CheckCircle,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Pendente",
      value: formatCurrency(totalPending),
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Em Atraso",
      value: formatCurrency(totalOverdue),
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className={`rounded-lg p-3 ${metric.bg}`}>
                <metric.icon className={`h-5 w-5 ${metric.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className={`text-2xl font-bold ${metric.color}`}>
                  {metric.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma cobrança registrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const config = statusConfig[invoice.status] || statusConfig.pending
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        {invoice.description || "Mensalidade"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell>
                        {invoice.payment_date
                          ? formatDate(invoice.payment_date)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>
                          {config.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
