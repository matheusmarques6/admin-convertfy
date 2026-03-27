"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChargesManager } from "@/components/financial/charges-manager"
import { SubscriptionsManager } from "@/components/financial/subscriptions-manager"
import { WiseReconciliation } from "@/components/financial/wise-reconciliation"
import { BillingMetrics } from "@/components/dashboard/billing-metrics"
import { FinancialCharts } from "@/components/dashboard/financial-charts"
import { BarChart3, DollarSign, Repeat, Wallet } from "lucide-react"
import { PermissionGate } from "@/components/permission-gate"

export default function FinancialPage() {
  return (
    <PermissionGate requiredFeatures={["view_financial"]}>
    <div className="space-y-6">
      {/* Header */}
      <p className="text-muted-foreground">
        Gerencie cobranças, assinaturas e pagamentos
      </p>

      {/* Tabs */}
      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Análise
          </TabsTrigger>
          <TabsTrigger value="charges" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Cobranças
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
