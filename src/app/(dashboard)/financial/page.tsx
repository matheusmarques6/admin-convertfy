import { createClient } from "@/lib/supabase/server"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

export const dynamic = "force-dynamic"

async function getFinancialData() {
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      *,
      client:clients (
        id,
        name,
        company
      )
    `)
    .order("due_date", { ascending: false })
    .limit(50)

  const { data: contracts } = await supabase
    .from("contracts")
    .select("monthly_value, status")
    .eq("status", "active")

  const mrr = contracts?.reduce((sum, c) => sum + Number(c.monthly_value), 0) || 0

  const paid = invoices?.filter((i) => i.status === "paid")?.reduce((sum, i) => sum + Number(i.amount), 0) || 0
  const pending = invoices?.filter((i) => i.status === "pending")?.reduce((sum, i) => sum + Number(i.amount), 0) || 0
  const overdue = invoices?.filter((i) => i.status === "overdue")?.reduce((sum, i) => sum + Number(i.amount), 0) || 0

  return {
    mrr,
    paid,
    pending,
    overdue,
    invoices: invoices || [],
  }
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "warning"; icon: React.ElementType }> = {
  pending: { label: "Pendente", variant: "warning", icon: Clock },
  paid: { label: "Pago", variant: "success", icon: CheckCircle },
  overdue: { label: "Atrasado", variant: "destructive", icon: AlertCircle },
  cancelled: { label: "Cancelado", variant: "secondary", icon: AlertCircle },
}

export default async function FinancialPage() {
  const data = await getFinancialData()

  const metrics = [
    {
      title: "MRR",
      value: formatCurrency(data.mrr),
      change: "+8.2%",
      positive: true,
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Recebido (Mês)",
      value: formatCurrency(data.paid),
      change: "+12.5%",
      positive: true,
      icon: CheckCircle,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      title: "A Receber",
      value: formatCurrency(data.pending),
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      title: "Em Atraso",
      value: formatCurrency(data.overdue),
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-muted-foreground">
          Acompanhe cobranças, pagamentos e receitas
        </p>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className={`rounded-lg p-3 ${metric.bg}`}>
                <metric.icon className={`h-5 w-5 ${metric.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                <p className={`text-2xl font-bold ${metric.color}`}>
                  {metric.value}
                </p>
                {metric.change && (
                  <p className={`text-xs flex items-center gap-1 ${metric.positive ? "text-emerald-500" : "text-red-500"}`}>
                    {metric.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {metric.change}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cobranças Recentes</CardTitle>
          <CardDescription>Últimas 50 cobranças do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((invoice) => {
                const config = statusConfig[invoice.status] || statusConfig.pending
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.client?.name || "—"}
                    </TableCell>
                    <TableCell>{invoice.description || "Mensalidade"}</TableCell>
                    <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
