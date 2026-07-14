"use client"

import { useState } from "react"
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  FileText,
  HeartHandshake,
  Layers,
} from "lucide-react"
import { Painel } from "./painel"
import { PipelinesTab } from "./pipelines-tab"
import { CadenciasTab } from "./cadencias-tab"
import { FormulariosTab } from "./formularios-tab"

/**
 * Shell do modulo Customer Success — porta do prototipo Figma Make.
 * Header com breadcrumb (Operacional › Customer Success › CS) + 4 sub-tabs:
 * Painel · Pipelines CS · Formularios · Cadencias. Todas implementadas.
 */

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
      className="flex h-full flex-col overflow-hidden"
      style={{
        background: "var(--crm-gray-50)",
        fontFamily: "var(--crm-font-sans)",
      }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 sticky top-0 z-20"
        style={{
          padding: "18px 32px 0",
          background: "var(--crm-gray-0)",
          borderBottom: "1px solid var(--crm-gray-200)",
        }}
      >
        {/* Breadcrumb */}
        <div
          className="flex items-center gap-1.5"
          style={{ fontSize: 12, color: "var(--crm-gray-500)", marginBottom: 12 }}
        >
          <span>Operacional</span>
          <ChevronRight className="h-3 w-3" style={{ color: "var(--crm-gray-300)" }} />
          <span style={{ color: "var(--crm-gray-900)", fontWeight: 500 }}>
            Customer Success
          </span>
          <span
            className="inline-flex items-center gap-1"
            style={{
              marginLeft: 4,
              padding: "2px 9px",
              borderRadius: 999,
              background: "var(--crm-pos-bg)",
              color: "var(--crm-pos)",
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            <HeartHandshake className="h-3 w-3" /> CS
          </span>
        </div>

        {/* Sub-tabs */}
        <div className="flex" style={{ gap: 0 }}>
          {TABS.map((t) => {
            const on = tab === t.key
            const Icon = t.icon
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="inline-flex items-center cf-focusable"
                style={{
                  gap: 7,
                  padding: "11px 16px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--crm-font-sans)",
                  fontSize: 13.5,
                  fontWeight: on ? 600 : 500,
                  color: on ? "var(--crm-brand)" : "var(--crm-gray-500)",
                  borderBottom: `2px solid ${on ? "var(--crm-brand)" : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: on ? "var(--crm-brand)" : "var(--crm-gray-400)" }}
                />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "20px 32px 48px" }}>
        {tab === "painel" && <Painel />}
        {tab === "pipelines" && <PipelinesTab />}
        {tab === "cadencias" && <CadenciasTab />}
        {tab === "formularios" && <FormulariosTab />}
      </div>
    </div>
  )
}
