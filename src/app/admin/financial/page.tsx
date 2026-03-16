"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChargesManager } from "@/components/financial/charges-manager"
import { SubscriptionsManager } from "@/components/financial/subscriptions-manager"
import { WiseReconciliation } from "@/components/financial/wise-reconciliation"
import { BillingMetrics } from "@/components/dashboard/billing-metrics"
import { FinancialCharts } from "@/components/dashboard/financial-charts"
import { BarChart3, DollarSign, Repeat, Wallet, Landmark } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"

export default function FinancialPage() {
  return (
    <PermissionGate requiredFeatures={["view_financial"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
          <Landmark className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gerencie faturas e assinaturas</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Análise
          </TabsTrigger>
          <TabsTrigger value="charges" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Faturas
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2">
            <Repeat className="h-4 w-4" />
            Assinaturas
          </TabsTrigger>
          <TabsTrigger value="wise" className="gap-2">
            <Wallet className="h-4 w-4" />
            Wise
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-6 space-y-6">
          <BillingMetrics />
          <FinancialCharts />
        </TabsContent>

        <TabsContent value="charges" className="mt-6">
          <ChargesManager />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionsManager />
        </TabsContent>

        <TabsContent value="wise" className="mt-6">
          <WiseReconciliation />
        </TabsContent>
      </Tabs>
    </div>
    </PermissionGate>
  )
}
