"use client"

import { useState, useEffect } from "react"
import { Store, AlertTriangle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertBanner } from "@/components/ui/alert-banner"
import { StoreControlPanel } from "@/components/stores/store-control-panel"
import { StoreAlertsPanel } from "@/components/stores/store-alerts-panel"

export function StoresPageTabs() {
  const [activeAlertsCount, setActiveAlertsCount] = useState(0)
  const [noFeedbackCount, setNoFeedbackCount] = useState(0)

  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const res = await fetch("/api/stores/alerts/summary")
        const data = await res.json()
        if (data.success) {
          setActiveAlertsCount(data.summary.total_active)
        }
      } catch {
        // Silently fail
      }
    }

    async function fetchNoFeedbackCount() {
      try {
        const res = await fetch("/api/stores/control?per_page=1")
        const data = await res.json()
        if (data.success && data.summary) {
          setNoFeedbackCount(data.summary.never + data.summary.overdue)
        }
      } catch {
        // Silently fail
      }
    }

    fetchAlertCount()
    fetchNoFeedbackCount()
  }, [])

  return (
    <>
      {noFeedbackCount > 0 && (
        <AlertBanner
          variant="warning"
          title="Lojas sem feedback agendado"
          description="Agende calls de feedback para manter a saúde dos clientes"
          action={{ label: "Ver lojas", href: "/admin/stores" }}
          className="mb-6"
        />
      )}

    <Tabs defaultValue="stores" className="space-y-6">
      <TabsList>
        <TabsTrigger value="stores">
          <Store className="h-4 w-4 mr-2" />
          Lojas
        </TabsTrigger>
        <TabsTrigger value="alerts" className="relative">
          <AlertTriangle className="h-4 w-4 mr-2" />
          Alertas
          {activeAlertsCount > 0 && (
            <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1.5">
              {activeAlertsCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="stores">
        <StoreControlPanel />
      </TabsContent>

      <TabsContent value="alerts">
        <StoreAlertsPanel />
      </TabsContent>
    </Tabs>
    </>
  )
}
