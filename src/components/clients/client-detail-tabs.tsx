"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Store, Receipt, History, Settings as SettingsIcon, LayoutDashboard } from "lucide-react"
import { UnderlineTabs, UnderlineTabItem } from "@/components/ui/underline-tabs"
import { Badge } from "@/components/ui/badge"
import { ClientOverview, type ClientWithRelations } from "@/components/clients/client-overview"
import { ClientFinancial } from "@/components/clients/client-financial"
import { ClientContracts } from "@/components/clients/client-contracts"
import { ClientMeetings } from "@/components/clients/client-meetings"
import { ClientTimeline } from "@/components/clients/client-timeline"
import { ClientStores } from "@/components/clients/client-stores"
import { ClientConfig } from "@/components/clients/client-config"
import {
  ClientPerformanceProvider,
  ClientPerformanceTables,
} from "@/components/clients/client-performance-review"

interface ClientDetailTabsProps {
  client: ClientWithRelations
  ltv?: number
}

const VALID_TABS = ["overview", "stores", "financial", "timeline", "config"] as const
type TabValue = typeof VALID_TABS[number]

export function ClientDetailTabs({ client, ltv }: ClientDetailTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const tabParam = searchParams.get("tab")
  const initialTab = VALID_TABS.includes(tabParam as TabValue) ? (tabParam as TabValue) : "overview"
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab)

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

  // Atalhos de teclado: g seguido de letra (g+v / g+l / g+f / g+t / g+c)
  useEffect(() => {
    let gPressed = false
    let resetTimer: ReturnType<typeof setTimeout> | null = null

    function isTypingInField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select") return true
      if (target.isContentEditable) return true
      return false
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingInField(e.target)) return

      if (!gPressed && e.key === "g") {
        gPressed = true
        if (resetTimer) clearTimeout(resetTimer)
        resetTimer = setTimeout(() => {
          gPressed = false
        }, 1200)
        return
      }

      if (gPressed) {
        const key = e.key.toLowerCase()
        const tabMap: Record<string, TabValue> = {
          v: "overview",
          l: "stores",
          f: "financial",
          t: "timeline",
          c: "config",
        }
        if (tabMap[key]) {
          e.preventDefault()
          setActiveTab(tabMap[key])
        }
        gPressed = false
        if (resetTimer) clearTimeout(resetTimer)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [])

  const storeCount = client.client_stores?.length ?? 0

  return (
    <div className="mt-6">
      <UnderlineTabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <UnderlineTabItem value="overview">
          <span className="inline-flex items-center gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Visão Geral
          </span>
        </UnderlineTabItem>
        <UnderlineTabItem value="stores">
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" />
            Lojas
            {storeCount > 0 && (
              <Badge
                variant="neutral"
                showDot={false}
                className="ml-1 text-[10px] px-1 py-0 h-4"
              >
                {storeCount}
              </Badge>
            )}
          </span>
        </UnderlineTabItem>
        <UnderlineTabItem value="financial">
          <span className="inline-flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            Financeiro
          </span>
        </UnderlineTabItem>
        <UnderlineTabItem value="timeline">
          <span className="inline-flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            Timeline
          </span>
        </UnderlineTabItem>
        <UnderlineTabItem value="config">
          <span className="inline-flex items-center gap-1.5">
            <SettingsIcon className="h-3.5 w-3.5" />
            Configurações
          </span>
        </UnderlineTabItem>
      </UnderlineTabs>

      {activeTab === "overview" && (
        <ClientPerformanceProvider
          clientId={client.id}
          onNavigateToStores={() => setActiveTab("stores")}
        >
          <div className="mt-6 space-y-5">
            <ClientOverview client={client} ltv={ltv} />
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
        <div className="mt-6 space-y-5">
          <ClientFinancial clientId={client.id} clientName={client.name} />
          <ClientContracts clientId={client.id} />
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="mt-6 space-y-5">
          <ClientTimeline clientId={client.id} />
          <ClientMeetings clientId={client.id} />
        </div>
      )}

      {activeTab === "config" && (
        <div className="mt-6">
          <ClientConfig client={client} />
        </div>
      )}
    </div>
  )
}
