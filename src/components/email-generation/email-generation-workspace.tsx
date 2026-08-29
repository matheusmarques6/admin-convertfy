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
import { PromptsWorkspace } from "@/components/agents/prompts-workspace"
import { ArchitectureTab } from "@/components/email-generation/architecture-tab"
import { ComponentsWorkspace } from "@/components/email-components/components-workspace"
import { GeneratedTab } from "@/components/email-generation/generated-tab"
import { SettingsTab } from "@/components/email-generation/settings-tab"
import { ReferencesTab } from "@/components/email-generation/references-tab"
import { TestTab } from "@/components/email-generation/test-tab"
import { VaultTab } from "@/components/email-generation/vault-tab"
import { C, F } from "@/components/email-generation/ui/eg-theme"

const TABS = [
  "agents",
  "vault",
  "architecture",
  "components",
  "generated",
  "settings",
  "references",
  "test",
] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  agents: "Agentes",
  vault: "Conhecimento",
  architecture: "Arquitetura dos Emails",
  components: "Componentes",
  generated: "Geradas",
  settings: "Configurações",
  references: "Referências",
  test: "Testar",
}

/**
 * "blueprints" e "outlines" viravam duas abas que editavam o mesmo e-mail;
 * agora resolvem para a Arquitetura. O alias fica porque há link salvo e os
 * redirects de `/admin/email-blueprints` e `/admin/outlines` apontam para cá.
 */
const TAB_ALIASES: Record<string, Tab> = {
  blueprints: "architecture",
  outlines: "architecture",
}

export function parseTab(value: string | null | undefined): Tab {
  if (!value) return "agents"
  if (TABS.includes(value as Tab)) return value as Tab
  return TAB_ALIASES[value] ?? "agents"
}

interface WorkspaceProps {
  prompts: ListPromptsResult
  initialTab?: string
}

export function EmailGenerationWorkspace({
  prompts,
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
          Prompts dos agentes, arquitetura dos e-mails, configurações e
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
      {tab === "vault" && <VaultTab />}
      {tab === "architecture" && <ArchitectureTab />}
      {tab === "components" && <ComponentsWorkspace />}
      {tab === "generated" && <GeneratedTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "references" && <ReferencesTab />}
      {tab === "test" && <TestTab />}
    </div>
  )
}
