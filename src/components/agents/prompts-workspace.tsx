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
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import type { AgentType } from "@/types/email-generation"
import type { ListPromptsResult, PromptRow } from "@/lib/services/prompt-management.service"
import { PromptEditor } from "@/components/agents/prompt-editor"
import { PromptHistory } from "@/components/agents/prompt-history"

const AGENT_LABELS: Record<AgentType, string> = {
  copy: "Copy",
  image: "Imagens",
  html: "HTML",
  qa: "QA",
  blueprint: "Blueprint",
  assembler: "Montador",
  assembler_chooser: "Curador",
  campaign_suggestion: "Campanhas",
  campaign_trends: "Trends",
  campaign_architect: "Arquiteto",
}

const AGENT_ICONS: Record<AgentType, LucideIcon> = {
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
    <div className="space-y-5 max-w-[1100px]">
      <PageHeader
        title="Agentes / Prompts"
        description="Edite prompts por tipo de agente com versionamento e rollback. Mudanças afetam toda nova geração."
      />

      <SegmentedTabs value={tab} onValueChange={(v) => setTab(v as AgentType)}>
        {(Object.keys(AGENT_LABELS) as AgentType[]).map((at) => {
          const Icon = AGENT_ICONS[at]
          return (
            <SegmentedTabItem key={at} value={at}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {AGENT_LABELS[at]}
                {byType[at].active && (
                  <span className="text-[10px] text-slate-400 dark:text-white/40">
                    v{byType[at].active!.version}
                  </span>
                )}
              </span>
            </SegmentedTabItem>
          )
        })}
      </SegmentedTabs>

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
  )
}
