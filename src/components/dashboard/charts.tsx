"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GlowCard } from "@/components/ui/glow-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency } from "@/lib/utils"

interface ClientsData {
  name: string
  value: number
  color: string
  [key: string]: string | number
}

interface PipelineData {
  stage: string
  value: number
  deals: number
  [key: string]: string | number
}

interface DashboardChartsProps {
  clientsData?: ClientsData[]
  pipelineData?: PipelineData[]
}

export function DashboardCharts({
  clientsData = [],
  pipelineData = []
}: DashboardChartsProps) {
  const hasClientsData = clientsData.some((d) => d.value > 0)
  const hasPipelineData = pipelineData.length > 0

  return (
    <GlowCard color="primary" intensity="subtle" className="h-full" surfaceClassName="gradient-accent-border">
      <CardHeader>
        <CardTitle>Visão Geral</CardTitle>
        <CardDescription>Pipeline e distribuição de clientes</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pipeline" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="clients">Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-4">
            <div className="h-[300px]">
              {hasPipelineData ? (
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
                    <Bar dataKey="value" fill="#5327F2" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Nenhum deal no pipeline
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="clients" className="space-y-4">
            <div className="h-[300px] flex items-center justify-center">
              {hasClientsData ? (
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
              ) : (
                <div className="text-muted-foreground">
                  Nenhum cliente cadastrado
                </div>
              )}
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
    </GlowCard>
  )
}
