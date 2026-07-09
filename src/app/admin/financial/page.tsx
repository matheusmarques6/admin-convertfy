"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Landmark } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { PageSkeleton } from "@/components/ui/page-skeleton"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import { ChargesManager } from "@/components/financial/charges-manager"
import { SubscriptionsManager } from "@/components/financial/subscriptions-manager"
import { WiseReconciliation } from "@/components/financial/wise-reconciliation"
import { BillingMetrics } from "@/components/dashboard/billing-metrics"
import { PermissionGate } from "@/components/permission-gate"

const FinancialCharts = dynamic(
  () =>
    import("@/components/dashboard/financial-charts").then((mod) => ({
      default: mod.FinancialCharts,
    })),
  {
    loading: () => <PageSkeleton variant="chart" showHeader={false} className="px-0 py-0" />,
    ssr: false,
  }
)

const _VALID_TABS = ["analysis", "charges", "subscriptions", "wise"] as const
type TabValue = typeof _VALID_TABS[number]

export default function FinancialPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("analysis")

  return (
    <PermissionGate requiredFeatures={["view_financial"]}>
      <div className="space-y-5">
        {/* PageHeader — DS v3.0 Rule 14, no icon-in-circle */}
        <PageHeader
          title="Financeiro"
          description="Receita, faturas e assinaturas da agência"
          icon={Landmark}
        />

        {/* BillingMetrics KPIs — shown above tabs as financial summary */}
        <BillingMetrics />

        {/* UnderlineTabs — DS v3.0 Rule 18 */}
        <div className="mt-6">
          <UnderlineTabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
            <UnderlineTabItem value="analysis">Análise</UnderlineTabItem>
            <UnderlineTabItem value="charges">Faturas</UnderlineTabItem>
            <UnderlineTabItem value="subscriptions">Assinaturas</UnderlineTabItem>
            <UnderlineTabItem value="wise">Wise</UnderlineTabItem>
          </UnderlineTabs>
        </div>

        {/* Tab content — lazy render */}
        {activeTab === "analysis" && (
          <div className="mt-6 space-y-6">
            <FinancialCharts />
          </div>
        )}

        {activeTab === "charges" && (
          <div className="mt-6">
            <ChargesManager />
          </div>
        )}

        {activeTab === "subscriptions" && (
          <div className="mt-6">
            <SubscriptionsManager />
          </div>
        )}

        {activeTab === "wise" && (
          <div className="mt-6">
            <WiseReconciliation />
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
