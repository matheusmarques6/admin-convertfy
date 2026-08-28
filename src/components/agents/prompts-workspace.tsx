"use client"

/**
 * Workspace cliente do /admin/agents/prompts.
 * Tabs por agent_type, integra Editor + History + Diff Modal.
 */
import { useState } from "react"
import useSWR from "swr"
import {
  Bot,
  Image as ImageIcon,
  Code2,
  ShieldCheck,
  LayoutTemplate,
  Blocks,
  Megaphone,
  Zap,
  Compass,
  Type,
  UserRound,
  Mail,
  Sparkles,
  Palette,
  Scissors,
  Tags,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { C, F } from "@/components/email-generation/ui/eg-theme"
import { EGSecTitle } from "@/components/email-generation/ui/eg-atoms"
import type { AgentType } from "@/types/email-generation"
import type { ListPromptsResult, PromptRow } from "@/lib/services/prompt-management.service"
import { PromptEditor } from "@/components/agents/prompt-editor"
import { PromptHistory } from "@/components/agents/prompt-history"

const AGENT_LABELS: Record<AgentType, string> = {
  estruturador: "Estruturador",
  copy: "Copy",
  image: "Imagens",
  html: "HTML (legado)",
  qa: "QA",
  blueprint: "Blueprint",
  assembler: "Montador",
  assembler_chooser: "Curador",
  campaign_suggestion: "Campanhas",
  campaign_trends: "Trends",
  campaign_architect: "Arquiteto",
  campaign_image: "Imagens de campanha",
  refiner: "Refinador (legado)",
  component_test: "Teste de bloco",
  subject: "Assunto",
  // Cadeia de formatação (split do HTML agent).
  hero_section: "Hero Section",
  text_format: "Formatação de Texto",
  image_format: "Formatação de Imagem",
  color_format: "Cores & Botões",
  copy_fit: "Encurtador de Copy",
}

const AGENT_ICONS: Record<AgentType, LucideIcon> = {
  estruturador: Bot,
  copy: Bot,
  image: ImageIcon,
  html: Code2,
  qa: ShieldCheck,
  blueprint: LayoutTemplate,
  assembler: Blocks,
  assembler_chooser: Blocks,
  campaign_suggestion: Megaphone,
  campaign_trends: Zap,
  campaign_architect: Compass,
  campaign_image: ImageIcon,
  refiner: Type,
  component_test: Blocks,
  subject: Mail,
  hero_section: Sparkles,
  text_format: Type,
  image_format: ImageIcon,
  color_format: Palette,
  copy_fit: Scissors,
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  initial: ListPromptsResult
}

export function PromptsWorkspace({ initial }: Props) {
  const [tab, setTab] = useState<AgentType>("copy")
  const { data, mutate } = useSWR<{ by_type: ListPromptsResult["by_type"] }>(
    "/api/admin/agents/prompts",
    fetcher,
    { fallbackData: { by_type: initial.by_type } },
  )
  const byType = data?.by_type ?? initial.by_type
  const group = byType[tab]

  return (
    <div className="max-w-[1100px]">
      <EGSecTitle
        icon={<UserRound size={18} />}
        title="Agentes / Prompts"
        sub="Edite prompts por tipo de agente com versionamento e rollback. Mudanças afetam toda nova geração."
      />

      {/* Chips de agente (maquete EG): borda brand + versão quando ativo */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        {(Object.keys(AGENT_LABELS) as AgentType[]).map((at) => {
          const Icon = AGENT_ICONS[at]
          const on = at === tab
          const version = byType[at].active?.version
          return (
            <button
              key={at}
              type="button"
              onClick={() => setTab(at)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 7,
                border: `1px solid ${on ? C.brand : C.border}`,
                background: on ? C.blue50 : C.white,
                color: on ? C.brand : C.g600,
                fontSize: 12.5,
                fontWeight: on ? 600 : 500,
                fontFamily: F.sans,
                cursor: "pointer",
              }}
            >
              <Icon size={14} />
              {AGENT_LABELS[at]}
              {version != null && (
                <span
                  style={{
                    fontSize: 10.5,
                    color: on ? C.brand : C.g400,
                  }}
                >
                  v{version}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="space-y-5">
        <PromptEditor
          key={tab}
          agentType={tab}
          activePrompt={group.active}
          onSaved={() => mutate()}
        />

        <PromptHistory
          agentType={tab}
          active={group.active}
          history={group.history as PromptRow[]}
          onChanged={() => mutate()}
        />
      </div>
    </div>
  )
}
