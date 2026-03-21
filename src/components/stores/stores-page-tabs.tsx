"use client"

import { useState, useEffect } from "react"
import { Store, Bell } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { AlertBanner } from "@/components/ui/alert-banner"
import { StoreControlPanel } from "@/components/stores/store-control-panel"
import { StoreAlertsPanel } from "@/components/stores/store-alerts-panel"
import { cn } from "@/lib/utils"

export function StoresPageTabs() {
  const [activeTab, setActiveTab] = useState<"stores" | "alerts">("stores")
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
    <div className="space-y-4">
      {noFeedbackCount > 0 && (
        <AlertBanner
          variant="warning"
          title="Lojas sem feedback agendado"
          description="Agende calls de feedback para manter a saude dos clientes"
          action={{ label: "Ver lojas", href: "/admin/stores" }}
        />
      )}

      {/* Custom tab bar */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("stores")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all",
            activeTab === "stores"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon icon={Store} size={16} />
          Lojas
        </button>
        <button
          onClick={() => setActiveTab("alerts")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all relative",
            activeTab === "alerts"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon icon={Bell} size={16} />
          Alertas
          {activeAlertsCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1.5">
              {activeAlertsCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "stores" ? (
        <StoreControlPanel />
      ) : (
        <StoreAlertsPanel />
      )}
    </div>
  )
}
