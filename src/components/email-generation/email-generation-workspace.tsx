"use client"

/**
 * Hub de Geração de Emails — shell fino das 8 abas.
 *
 * Header e tabs seguem a maquete aprovada (ícone mail + título + tabs
 * underline, tokens de `ui/eg-theme.ts`). O conteúdo de cada aba vive em
 * arquivo próprio; Settings/References/Test foram extraídas deste arquivo.
 */

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Mail } from "lucide-react"
import type { ListPromptsResult } from "@/lib/services/prompt-management.service"
import type { BlueprintRow } from "@/lib/email-blueprints/types"
import { PromptsWorkspace } from "@/components/agents/prompts-workspace"
import { BlueprintsWorkspace } from "@/components/email-blueprints/blueprints-workspace"
import { ComponentsWorkspace } from "@/components/email-components/components-workspace"
import { OutlinesWorkspace } from "@/components/email-outlines/outlines-workspace"
import { GeneratedInspector } from "@/components/email-generation/generated-inspector"
import { SettingsTab } from "@/components/email-generation/settings-tab"
import { ReferencesTab } from "@/components/email-generation/references-tab"
import { TestTab } from "@/components/email-generation/test-tab"
import { C, F } from "@/components/email-generation/ui/eg-theme"

const TABS = [
  "agents",
  "blueprints",
  "outlines",
  "components",
  "generated",
  "settings",
  "references",
  "test",
] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  agents: "Agentes",
  blueprints: "Blueprints",
  outlines: "Estrutura geral",
  components: "Componentes",
  generated: "Geradas",
  settings: "Configurações",
  references: "Referências",
  test: "Testar",
}

function parseTab(value: string | null | undefined): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "agents"
}

interface WorkspaceProps {
  prompts: ListPromptsResult
  blueprints: BlueprintRow[]
  initialTab?: Tab
}

export function EmailGenerationWorkspace({
  prompts,
  blueprints,
  initialTab,
}: WorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlTab = useMemo(
    () => parseTab(searchParams?.get("tab") ?? initialTab ?? "agents"),
    [searchParams, initialTab],
  )
  const [tab, setTab] = useState<Tab>(urlTab)

  // Mantém estado e URL em sincronia quando o usuário troca de aba
  const onTabChange = (next: Tab) => {
    setTab(next)
    const sp = new URLSearchParams(searchParams?.toString() ?? "")
    sp.set("tab", next)
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-5">
      {/* Header da maquete: ícone + título + subtítulo + tabs underline */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ color: C.brand, display: "flex" }}>
            <Mail size={22} />
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 600,
              color: C.g900,
              letterSpacing: "-0.015em",
              fontFamily: F.sans,
            }}
          >
            Geração de Emails
          </h1>
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            color: C.g500,
            fontFamily: F.sans,
          }}
        >
          Prompts dos agentes, blueprints de estrutura, configurações e
          referências do pipeline AE.
        </div>
        <div
          style={{
            display: "flex",
            gap: 2,
            marginTop: 16,
            borderBottom: `1px solid ${C.border}`,
            flexWrap: "wrap",
          }}
        >
          {TABS.map((t) => {
            const on = tab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTabChange(t)}
                style={{
                  padding: "9px 14px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: on ? 600 : 500,
                  color: on ? C.brand : C.g500,
                  borderBottom: on
                    ? `2px solid ${C.brand}`
                    : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {TAB_LABELS[t]}
              </button>
            )
          })}
        </div>
      </div>

      {tab === "agents" && <PromptsWorkspace initial={prompts} />}
      {tab === "blueprints" && <BlueprintsWorkspace initial={blueprints} />}
      {tab === "outlines" && <OutlinesWorkspace />}
      {tab === "components" && <ComponentsWorkspace />}
      {tab === "generated" && <GeneratedInspector />}
      {tab === "settings" && <SettingsTab />}
      {tab === "references" && <ReferencesTab />}
      {tab === "test" && <TestTab />}
    </div>
  )
}
