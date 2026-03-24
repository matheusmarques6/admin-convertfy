"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import { ClientOverview, type ClientWithRelations } from "@/components/clients/client-overview"
import { ClientFinancial } from "@/components/clients/client-financial"
import { ClientContracts } from "@/components/clients/client-contracts"
import { ClientMeetings } from "@/components/clients/client-meetings"
import { ClientTimeline } from "@/components/clients/client-timeline"
import { ClientStores } from "@/components/clients/client-stores"
import { ClientPortalUsers } from "@/components/clients/client-portal-users"
import {
  ClientPerformanceProvider,
  ClientPerformanceKPIs,
  ClientPerformanceTables,
} from "@/components/clients/client-performance-review"

interface ClientDetailTabsProps {
  client: ClientWithRelations
}

const VALID_TABS = ["overview", "stores", "financial", "timeline", "config"] as const
type TabValue = typeof VALID_TABS[number]

export function ClientDetailTabs({ client }: ClientDetailTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Read initial tab from URL ?tab= param
  const tabParam = searchParams.get("tab")
  const initialTab = VALID_TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : "overview"
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab)

  // Sync URL when tab changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (activeTab === "overview") {
      params.delete("tab")
    } else {
      params.set("tab", activeTab)
    }
    const qs = params.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    router.replace(url, { scroll: false })
  }, [activeTab, pathname, router, searchParams])

  return (
    <div className="mt-6">
      {/* UnderlineTabs — DS v3.0 Rule 18 */}
      <UnderlineTabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <UnderlineTabItem value="overview">Visão Geral</UnderlineTabItem>
        <UnderlineTabItem value="stores">Lojas</UnderlineTabItem>
        <UnderlineTabItem value="financial">Financeiro</UnderlineTabItem>
        <UnderlineTabItem value="timeline">Timeline</UnderlineTabItem>
        <UnderlineTabItem value="config">Configurações</UnderlineTabItem>
      </UnderlineTabs>

      {/* Tab content — lazy render */}
      {activeTab === "overview" && (
        <ClientPerformanceProvider
          clientId={client.id}
          onNavigateToStores={() => setActiveTab("stores")}
        >
          <div className="space-y-6">
            <ClientPerformanceKPIs />
            <ClientOverview client={client} />
            <ClientPerformanceTables />
          </div>
        </ClientPerformanceProvider>
      )}

      {activeTab === "stores" && (
        <div className="mt-6">
          <ClientStores clientId={client.id} clientName={client.name} />
        </div>
      )}

      {activeTab === "financial" && (
        <div className="mt-6 space-y-6">
          <ClientFinancial clientId={client.id} clientName={client.name} />
          <ClientContracts clientId={client.id} />
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="mt-6 space-y-6">
          <ClientTimeline clientId={client.id} />
          <ClientMeetings clientId={client.id} />
        </div>
      )}

      {activeTab === "config" && (
        <div className="mt-6 space-y-6">
          <ClientPortalUsers clientId={client.id} clientName={client.name} />
        </div>
      )}
    </div>
  )
}
