"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export function ClientDetailTabs({ client }: ClientDetailTabsProps) {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="overview">Visão Geral</TabsTrigger>
        <TabsTrigger value="stores">Lojas</TabsTrigger>
        <TabsTrigger value="financial">Financeiro</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="config">Configurações</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
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
      </TabsContent>

      <TabsContent value="stores">
        {activeTab === "stores" && (
          <ClientStores clientId={client.id} clientName={client.name} />
        )}
      </TabsContent>

      <TabsContent value="financial">
        {activeTab === "financial" && (
          <div className="space-y-6">
            <ClientFinancial clientId={client.id} clientName={client.name} />
            <ClientContracts clientId={client.id} />
          </div>
        )}
      </TabsContent>

      <TabsContent value="timeline">
        {activeTab === "timeline" && (
          <div className="space-y-6">
            <ClientTimeline clientId={client.id} />
            <ClientMeetings clientId={client.id} />
          </div>
        )}
      </TabsContent>

      <TabsContent value="config">
        {activeTab === "config" && (
          <div className="space-y-6">
            <ClientPortalUsers clientId={client.id} clientName={client.name} />
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
