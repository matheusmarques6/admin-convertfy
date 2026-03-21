"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChargesManager } from "@/components/financial/charges-manager"
import { SubscriptionsManager } from "@/components/financial/subscriptions-manager"
import { WiseReconciliation } from "@/components/financial/wise-reconciliation"
import { BillingMetrics } from "@/components/dashboard/billing-metrics"
import { FinancialCharts } from "@/components/dashboard/financial-charts"
import { BarChart3, DollarSign, Repeat, Wallet, Landmark } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { PermissionGate } from "@/components/permission-gate"

export default function FinancialPage() {
  return (
    <PermissionGate requiredFeatures={["view_financial"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
          <Icon icon={Landmark} size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Receita, faturas e assinaturas da agência</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="analysis">
        <TabsList>
          <TabsTrigger value="analysis" className="gap-1.5 sm:gap-2">
            <Icon icon={BarChart3} size={16} />
            <span className="text-xs sm:text-sm">Análise</span>
          </TabsTrigger>
          <TabsTrigger value="charges" className="gap-1.5 sm:gap-2">
            <Icon icon={DollarSign} size={16} />
            <span className="text-xs sm:text-sm">Faturas</span>
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-1.5 sm:gap-2">
            <Icon icon={Repeat} size={16} />
            <span className="text-xs sm:text-sm">Assinaturas</span>
          </TabsTrigger>
          <TabsTrigger value="wise" className="gap-1.5 sm:gap-2">
            <Icon icon={Wallet} size={16} />
            <span className="text-xs sm:text-sm">Wise</span>
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
