"use client"

/**
 * StoreDetailTabsV2 — container das 6 abas novas (visao/performance/
 * relatorio/contexto/atividade/setup). Mantem compat com URLs antigas
 * via redirect transparente.
 */

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { StoreHero } from "./store-hero"
import { TabVisao } from "./tab-visao"
import { TabAtividade } from "./tab-atividade"
import { TabContexto } from "./tab-contexto"
import { TabRelatorio } from "./tab-relatorio"
import { TabPerformance } from "./tab-performance"
import { TabSetup } from "./tab-setup"

const TABS = [
  { key: "visao", label: "Visão Geral" },
  { key: "performance", label: "Performance" },
  { key: "relatorio", label: "Relatório", badge: "CLIENTE" },
  { key: "contexto", label: "Contexto" },
  { key: "atividade", label: "Atividade", isNew: true },
  { key: "setup", label: "Setup" },
] as const

// Mapeia URLs antigas pra novas pra nao quebrar links em circulacao
const LEGACY_TAB_MAP: Record<string, string> = {
  overview: "visao",
  integrations: "setup",
  onboarding: "setup",
  briefing: "contexto",
  reports: "performance",
}

interface StoreDetailTabsV2Props {
  store: {
    id: string
    store_name: string
    store_url: string | null
    platform: string | null
    is_active: boolean
    niche: string | null
    country: string | null
    language: string | null
    created_at: string
    client_id: string | null
    org_id: string | null
    mrr_cents?: number | null
    contract_start_date?: string | null
    contract_end_date?: string | null
    health_score?: number | null
    clients?: { id: string; name: string } | null
  }
  cmName?: string | null
  kpis?: Array<{ label: string; value: string; delta?: string; positive?: boolean }>
}

export function StoreDetailTabsV2({ store, cmName, kpis = [] }: StoreDetailTabsV2Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") || ""

  // Resolve aba ativa (com redirect legado)
  const resolvedTab = LEGACY_TAB_MAP[tabParam] || tabParam || "visao"
  const isLegacy = tabParam && LEGACY_TAB_MAP[tabParam]
  const [activeTab, setActiveTab] = useState<string>(resolvedTab)

  useEffect(() => {
    if (isLegacy) {
      // Substitui silenciosamente a URL antiga sem reload
      const url = new URL(window.location.href)
      url.searchParams.set("tab", LEGACY_TAB_MAP[tabParam])
      router.replace(url.pathname + url.search)
    }
  }, [isLegacy, tabParam, router])

  useEffect(() => {
    setActiveTab(resolvedTab)
  }, [resolvedTab])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    const url = new URL(window.location.href)
    if (value === "visao") url.searchParams.delete("tab")
    else url.searchParams.set("tab", value)
    router.replace(url.pathname + url.search, { scroll: false })
  }

  // Plano + meses (deriva de contract_start_date)
  const plan = store.platform === "shopify" ? "Performance" : null
  const planMonths = store.contract_start_date
    ? Math.max(
        1,
        Math.round(
          (Date.now() - new Date(store.contract_start_date).getTime()) /
            (1000 * 60 * 60 * 24 * 30),
        ),
      )
    : null

  const clientSince = store.created_at
    ? new Date(store.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : null

  return (
    <div className="flex flex-col gap-4">
      {/* Hero */}
      <StoreHero
        storeName={store.store_name}
        storeUrl={store.store_url}
        clientName={store.clients?.name ?? null}
        clientSince={clientSince}
        status={store.is_active ? "active" : "paused"}
        plan={plan}
        planMonths={planMonths}
        mrrCents={store.mrr_cents ?? null}
        cmName={cmName}
        healthScore={store.health_score ?? null}
        kpis={kpis}
      />

      {/* Tabs */}
      <div
        className="border-b sticky top-0 z-10 bg-white"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((t) => {
            const isActive = activeTab === t.key
            return (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={cn(
                  "px-3.5 py-2.5 text-[13px] -mb-px transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                  isActive
                    ? "border-b-2 border-brand-500 text-brand-600 font-semibold"
                    : "border-b-2 border-transparent text-slate-500 font-medium hover:text-slate-700",
                )}
              >
                {t.label}
                {"badge" in t && t.badge && (
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      isActive ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {t.badge}
                  </span>
                )}
                {"isNew" in t && t.isNew && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    Novo
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Conteudo da aba */}
      <div>
        {activeTab === "visao" && <TabVisao storeId={store.id} />}
        {activeTab === "performance" && <TabPerformance storeId={store.id} />}
        {activeTab === "relatorio" && <TabRelatorio storeId={store.id} />}
        {activeTab === "contexto" && <TabContexto storeId={store.id} />}
        {activeTab === "atividade" && <TabAtividade storeId={store.id} />}
        {activeTab === "setup" && <TabSetup storeId={store.id} />}
      </div>
    </div>
  )
}
