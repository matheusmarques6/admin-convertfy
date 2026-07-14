"use client"

import { useState } from "react"
import Link from "next/link"
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  FileText,
  HeartHandshake,
  Layers,
} from "lucide-react"
import { ROUTES } from "@/lib/routes"
import { Painel } from "./painel"
import { PipelinesTab } from "./pipelines-tab"

/**
 * Shell do modulo Customer Success — porta do prototipo Figma Make.
 * Header com breadcrumb (Operacional › Customer Success › CS) + 4 sub-tabs:
 * Painel · Pipelines CS · Formularios · Cadencias.
 *
 * Nesta primeira entrega so a aba Painel esta implementada (passada via
 * children). As outras 3 mostram um placeholder com atalho pra versao
 * atual da funcionalidade — serao migradas pagina por pagina.
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

const PLACEHOLDER: Record<
  "formularios" | "cadencias",
  { title: string; desc: string; href: string; cta: string }
> = {
  formularios: {
    title: "Formulários",
    desc: "Formulários CS vinculados aos pipelines (NPS, health check, feedback). Será migrado para esta aba.",
    href: ROUTES.ADMIN.OPERACIONAL.FORMS,
    cta: "Abrir formulários",
  },
  cadencias: {
    title: "Cadências",
    desc: "Board de frequência de call (Semanal · Quinzenal · Mensal · Pausada). Será migrado para esta aba.",
    href: ROUTES.ADMIN.OPERACIONAL.CS.CADENCES,
    cta: "Abrir board de cadências",
  },
}

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
        {(tab === "formularios" || tab === "cadencias") && (
          <TabPlaceholder {...PLACEHOLDER[tab]} />
        )}
      </div>
    </div>
  )
}

function TabPlaceholder({
  title,
  desc,
  href,
  cta,
}: {
  title: string
  desc: string
  href: string
  cta: string
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: "var(--crm-gray-900)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "8px 0 20px",
            fontSize: 13,
            color: "var(--crm-gray-500)",
            lineHeight: 1.5,
          }}
        >
          {desc}
        </p>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-[6px]"
          style={{
            height: 36,
            padding: "0 16px",
            background: "var(--crm-brand)",
            color: "var(--crm-brand-fg)",
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {cta}
        </Link>
      </div>
    </div>
  )
}
