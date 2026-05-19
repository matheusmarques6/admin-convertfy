"use client"

/**
 * StoreDetailTabsV2 — container das 6 abas (visao/performance/relatorio/
 * contexto/atividade/setup). Hero + Tabs nav + content slot.
 *
 * Tab style mirror do Convertfy DS v3:
 *  - height ~43px, padding 10×14, font 13.5/500 (600 active)
 *  - border-bottom 2px brand quando ativa
 *  - hint badge "cliente" pequeno (9px/700 uppercase)
 *  - count badge circular brand quando ativa
 */

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { StoreHero } from "./store-hero"
import { TabVisao } from "./tab-visao"
import { TabAtividade } from "./tab-atividade"
import { TabContexto } from "./tab-contexto"
import { TabRelatorio } from "./tab-relatorio"
import { TabPerformance } from "./tab-performance"
import { TabSetup } from "./tab-setup"
import TabOnboardingStatus from "./tab-onboarding-status"
import TabAcompanhamento from "./tab-acompanhamento"
import TabCalls from "./tab-calls"
import TabSolicitacoes from "./tab-solicitacoes"
import { C, TNUM } from "./_primitives"

const TABS = [
  { key: "visao", label: "Visão Geral" },
  { key: "onboarding", label: "Onboarding" },
  { key: "performance", label: "Performance" },
  { key: "relatorio", label: "Relatório", hint: "cliente" },
  { key: "acompanhamento", label: "Acompanhamento" },
  { key: "calls", label: "Calls" },
  { key: "solicitacoes", label: "Solicitações", showSolicitacoesCount: true },
  { key: "contexto", label: "Contexto" },
  { key: "atividade", label: "Atividade", showCount: true },
  { key: "setup", label: "Setup" },
] as const

const LEGACY_TAB_MAP: Record<string, string> = {
  overview: "visao",
  integrations: "setup",
  onboarding: "setup",
  briefing: "contexto",
  reports: "performance",
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  kpis?: Array<{ label: string; value: string; delta?: string; tone?: "pos" | "neg" | "info" | "neut" }>
}

export function StoreDetailTabsV2({ store, cmName, kpis = [] }: StoreDetailTabsV2Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") || ""

  const resolvedTab = LEGACY_TAB_MAP[tabParam] || tabParam || "visao"
  const isLegacy = tabParam && LEGACY_TAB_MAP[tabParam]
  const [activeTab, setActiveTab] = useState<string>(resolvedTab)

  useEffect(() => {
    if (isLegacy) {
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

  // Activity count for Atividade tab badge (last 7d as "novidades")
  const { data: activityRes } = useSWR<{ items?: Array<{ occurred_at: string }> }>(
    `/api/admin/stores/${store.id}/activity?limit=20`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const recentCount = useMemo(() => {
    const items = activityRes?.items ?? []
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return items.filter((a) => new Date(a.occurred_at).getTime() >= cutoff).length
  }, [activityRes])

  // Plano label + meses
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
    <div className="flex flex-col">
      <StoreHero
        storeName={store.store_name}
        storeUrl={store.store_url}
        clientName={store.clients?.name ?? null}
        clientId={store.client_id ?? store.clients?.id ?? null}
        clientSince={clientSince}
        status={store.is_active ? "active" : "paused"}
        plan={plan}
        planMonths={planMonths}
        mrrCents={store.mrr_cents ?? null}
        cmName={cmName}
        healthScore={store.health_score ?? null}
        kpis={kpis}
      />

      {/* Tabs nav */}
      <div
        className="sticky top-0 z-10 bg-white mt-5"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex">
          {TABS.map((t) => {
            const isActive = activeTab === t.key
            const showBadge = "showCount" in t && t.showCount && recentCount > 0
            return (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap transition-colors -mb-px",
                  "px-[14px] py-[10px] text-[13.5px]",
                )}
                style={{
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? C.brand : C.g500,
                  borderBottom: `2px solid ${isActive ? C.brand : "transparent"}`,
                }}
              >
                {t.label}
                {"hint" in t && t.hint && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-[0.06em] px-[5px] py-[2px] rounded-[4px]"
                    style={{
                      color: isActive ? C.brand : C.g500,
                      background: isActive ? C.blue50 : C.g100,
                    }}
                  >
                    {t.hint}
                  </span>
                )}
                {showBadge && (
                  <span
                    className="inline-flex items-center justify-center text-[10px] font-bold rounded-full"
                    style={{
                      minWidth: 16,
                      height: 16,
                      padding: "0 5px",
                      background: isActive ? C.brand : C.g200,
                      color: isActive ? "#fff" : C.g600,
                      ...TNUM,
                    }}
                  >
                    {recentCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="pt-6">
        {activeTab === "visao" && <TabVisao storeId={store.id} />}
        {activeTab === "onboarding" && <TabOnboardingStatus storeId={store.id} />}
        {activeTab === "performance" && <TabPerformance storeId={store.id} />}
        {activeTab === "relatorio" && <TabRelatorio storeId={store.id} />}
        {activeTab === "acompanhamento" && <TabAcompanhamento storeId={store.id} />}
        {activeTab === "calls" && <TabCalls storeId={store.id} />}
        {activeTab === "solicitacoes" && <TabSolicitacoes storeId={store.id} />}
        {activeTab === "contexto" && <TabContexto storeId={store.id} />}
        {activeTab === "atividade" && <TabAtividade storeId={store.id} />}
        {activeTab === "setup" && <TabSetup storeId={store.id} />}
      </div>
    </div>
  )
}
