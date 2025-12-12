"use client"

import { useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

// Mock data - will be replaced with real data from Supabase
const revenueData = [
  { month: "Jan", receita: 45000, custos: 32000, lucro: 13000 },
  { month: "Fev", receita: 52000, custos: 35000, lucro: 17000 },
  { month: "Mar", receita: 48000, custos: 33000, lucro: 15000 },
  { month: "Abr", receita: 61000, custos: 38000, lucro: 23000 },
  { month: "Mai", receita: 55000, custos: 36000, lucro: 19000 },
  { month: "Jun", receita: 67000, custos: 40000, lucro: 27000 },
]

const clientsData = [
  { name: "Ativos", value: 45, color: "#22C55E" },
  { name: "Em Onboarding", value: 8, color: "#3B82F6" },
  { name: "Inativos", value: 5, color: "#94A3B8" },
  { name: "Churned", value: 3, color: "#EF4444" },
]

const pipelineData = [
  { stage: "Lead", value: 25000, deals: 12 },
  { stage: "Qualificação", value: 45000, deals: 8 },
  { stage: "Proposta", value: 78000, deals: 6 },
  { stage: "Negociação", value: 120000, deals: 4 },
  { stage: "Fechado", value: 95000, deals: 5 },
]

export function DashboardCharts() {
  const [period, setPeriod] = useState("6months")

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Resumo Financeiro</CardTitle>
          <CardDescription>Acompanhe o desempenho da sua agência</CardDescription>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30days">30 dias</SelectItem>
            <SelectItem value="3months">3 meses</SelectItem>
            <SelectItem value="6months">6 meses</SelectItem>
            <SelectItem value="12months">12 meses</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="revenue">Receita</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="receita" fill="#22C55E" radius={[4, 4, 0, 0]} name="Receita" />
                  <Bar dataKey="custos" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Custos" />
                  <Bar dataKey="lucro" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Lucro" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Receita</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-muted-foreground">Custos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-muted-foreground">Lucro</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickFormatter={(value) => `${value / 1000}k`}
                  />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name, props) => [
                      `${formatCurrency(value)} (${props.payload.deals} deals)`,
                      "Valor",
                    ]}
                  />
                  <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
            <div className="h-[300px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={clientsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {clientsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [`${value} clientes`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              {clientsData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-muted-foreground">
                    {item.name}: {item.value}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
