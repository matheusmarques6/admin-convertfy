"use client"

import { useState } from "react"
import {
  BarChart3,
  CalendarClock,
  FileText,
  HeartHandshake,
  Layers,
} from "lucide-react"
import { Painel } from "./painel"
import { PipelinesTab } from "./pipelines-tab"
import { CadenciasTab } from "./cadencias-tab"
import { FormulariosTab } from "./formularios-tab"

/**
 * Shell do modulo Customer Success — design Claude Design (carteira.jsx,
 * ago/2026). Header full-bleed com breadcrumb (Operacional › Customer
 * Success · badge CS) + 4 sub-tabs: Painel · Pipelines CS · Formularios ·
 * Cadencias. O bloco sangra o padding do layout admin (precedente do
 * funil/dashboard operacional) pra barra encostar nas bordas como no
 * protótipo, com o corpo em cinza claro.
 */

const BRAND = "#4E62D8"

type TabKey = "painel" | "pipelines" | "formularios" | "cadencias"

const TABS: Array<{
  key: TabKey
  label: string
  icon: typeof BarChart3
}> = [
  { key: "painel", label: "Painel", icon: BarChart3 },
  { key: "pipelines", label: "Pipelines CS", icon: Layers },
  { key: "formularios", label: "Formulários", icon: FileText },
  { key: "cadencias", label: "Cadências", icon: CalendarClock },
]

export function CustomerSuccessShell() {
  const [tab, setTab] = useState<TabKey>("painel")

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 flex min-h-[100dvh] flex-col"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {/* Header full-bleed (card + border-bottom, como no protótipo) */}
      <div
        className="flex-shrink-0 sticky top-0 z-20 px-4 md:px-7 pt-4 md:pt-[18px]"
        style={{
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-gray-200)",
        }}
      >
        {/* Breadcrumb */}
        <div
          className="flex items-center"
          style={{ gap: 7, fontSize: 11.5, color: "var(--crm-gray-400)", marginBottom: 12 }}
        >
          <span>Operacional</span>
          <span style={{ opacity: 0.5 }}>›</span>
          <span style={{ color: "var(--crm-gray-900)", fontWeight: 600 }}>
            Customer Success
          </span>
          <span
            className="inline-flex items-center"
            style={{
              gap: 4,
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--crm-pos-bg)",
              color: "var(--crm-pos)",
              fontSize: 9.5,
              fontWeight: 700,
            }}
          >
            <HeartHandshake className="h-[10px] w-[10px]" /> CS
          </span>
        </div>

        {/* Sub-tabs — roláveis no mobile */}
        <div className="flex overflow-x-auto scrollbar-hide" style={{ gap: 2 }}>
          {TABS.map((t) => {
            const on = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="inline-flex shrink-0 items-center whitespace-nowrap cf-focusable"
                style={{
                  gap: 7,
                  padding: "9px 14px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--crm-font-sans)",
                  fontSize: 12.5,
                  fontWeight: on ? 600 : 500,
                  color: on ? BRAND : "var(--crm-gray-500)",
                  borderBottom: `2px solid ${on ? BRAND : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                <Icon
                  className="h-[13px] w-[13px]"
                  style={{ color: on ? BRAND : "var(--crm-gray-400)" }}
                />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Body — o scroll é do main do layout; sticky do header segue nele */}
      <div className="flex-1 px-4 md:px-7 pt-5 pb-12">
        {tab === "painel" && <Painel />}
        {tab === "pipelines" && <PipelinesTab />}
        {tab === "cadencias" && <CadenciasTab />}
        {tab === "formularios" && <FormulariosTab />}
      </div>
    </div>
  )
}
