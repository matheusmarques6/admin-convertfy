"use client"

import { useCallback } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Rocket,
  Video,
  Mail,
  MessageSquare,
  FileText,
  FileSignature,
  RotateCcw,
} from "lucide-react"
import { BOARD_SOURCE_OPTIONS, getDefaultsForRole } from "@/lib/services/board-config-defaults"
import type { OrgRole } from "@/types"
import type { BoardSourceKey } from "@/lib/services/board-config-defaults"

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket,
  Video,
  Mail,
  MessageSquare,
  FileText,
  FileSignature,
}

export interface BoardConfigState {
  show_onboarding_tasks: boolean
  show_meeting_tasks: boolean
  show_campaign_tasks: boolean
  show_feedback_tasks: boolean
  show_report_tasks: boolean
  show_contract_tasks: boolean
  show_manual_tasks: boolean
  calendar_view_mode: "daily" | "weekly" | "monthly"
  show_personal_events: boolean
}

interface AgentBoardConfigProps {
  orgMemberId: string
  role: OrgRole
  value: BoardConfigState | null
  onChange: (config: BoardConfigState) => void
  isLoading?: boolean
}

export function AgentBoardConfig({
  role,
  value,
  onChange,
  isLoading = false,
}: AgentBoardConfigProps) {
  const defaults = getDefaultsForRole(role)

  const config: BoardConfigState = value ?? defaults

  const handleToggle = useCallback(
    (key: BoardSourceKey, checked: boolean) => {
      onChange({ ...config, [key]: checked })
    },
    [config, onChange]
  )

  const handleResetDefaults = useCallback(() => {
    onChange(getDefaultsForRole(role))
  }, [role, onChange])

  const isDefault = BOARD_SOURCE_OPTIONS.every(
    (opt) => config[opt.key] === defaults[opt.key]
  )

  if (isLoading) {
    return (
      <div className="space-y-4 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Configure quais processos alimentam automaticamente o board deste agente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetDefaults}
          disabled={isDefault}
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Padrão
        </Button>
      </div>

      {!isDefault && (
        <Badge variant="secondary" className="text-xs">
          Configuração personalizada
        </Badge>
      )}

      <div className="space-y-1">
        {BOARD_SOURCE_OPTIONS.map((source) => {
          const Icon = ICON_MAP[source.icon]
          const isOn = config[source.key]
          const isDefaultValue = isOn === defaults[source.key]

          return (
            <div
              key={source.key}
              className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {Icon && (
                  <div className={`mt-0.5 p-1.5 rounded-md ${isOn ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                )}
                <div className="space-y-0.5">
                  <Label
                    htmlFor={source.key}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {source.label}
                    {!isDefaultValue && (
                      <span className="ml-2 text-xs text-muted-foreground">(alterado)</span>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {source.description}
                  </p>
                </div>
              </div>
              <Switch
                id={source.key}
                checked={isOn}
                onCheckedChange={(checked) => handleToggle(source.key, checked)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
