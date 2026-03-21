"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Settings,
  ChevronDown,
  Users,
  Download,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DealDialog } from "./deal-dialog"
import { PipelineCreateDialog } from "./pipeline-create-dialog"
import { PipelineSettingsDialog } from "./pipeline-settings-dialog"
import { PipelineMembersDialog } from "./pipeline-members-dialog"
import { ImportRulesDialog } from "./import-rules-dialog"
import { getInitials } from "@/lib/utils"
import type { Pipeline, PipelineStage, PipelineMember, PipelineMemberRole, PipelineImportRule } from "@/types"

interface PipelineHeaderProps {
  pipelines: Pipeline[]
  currentPipeline?: Pipeline | null
  stages: PipelineStage[]
  members: PipelineMember[]
  importRules: PipelineImportRule[]
  currentUserRole: PipelineMemberRole | null
}

export function PipelineHeader({
  pipelines,
  currentPipeline,
  stages,
  members,
  importRules,
  currentUserRole,
}: PipelineHeaderProps) {
  const router = useRouter()
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [showCreatePipeline, setShowCreatePipeline] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showImportRules, setShowImportRules] = useState(false)

  const canEdit = currentUserRole === "owner" || currentUserRole === "editor"
  const isOwner = currentUserRole === "owner"
  const activeRulesCount = importRules.filter((r) => r.is_active).length

  function handleSwitchPipeline(pipelineId: string) {
    router.push(`/admin/pipeline?id=${pipelineId}`)
  }

  const roleLabels: Record<PipelineMemberRole, string> = {
    owner: "Dono",
    editor: "Editor",
    viewer: "Visualizador",
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            {currentUserRole && (
              <Badge variant="neutral" showDot={false} className="text-xs">
                {roleLabels[currentUserRole]}
              </Badge>
            )}
          </div>
        </div>

        {/* Pipeline Selector - always visible */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="gap-2">
              {currentPipeline?.name || "Selecionar Pipeline"}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Pipelines</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {pipelines.map((pipeline) => (
              <DropdownMenuItem
                key={pipeline.id}
                onClick={() => handleSwitchPipeline(pipeline.id)}
                className={
                  pipeline.id === currentPipeline?.id ? "bg-accent" : ""
                }
              >
                {pipeline.name}
                {pipeline.is_default && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (padrao)
                  </span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowCreatePipeline(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Pipeline
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Member Avatars */}
        {members.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowMembers(true)}
                  className="flex -space-x-2 hover:opacity-80 transition-opacity"
                >
                  {members.slice(0, 4).map((member) => (
                    <Avatar key={member.id} className="h-7 w-7 border-2 border-background">
                      <AvatarImage src={member.user?.avatar_url} />
                      <AvatarFallback className="text-[10px]">
                        {getInitials(member.user?.name || "?")}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {members.length > 4 && (
                    <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground">
                        +{members.length - 4}
                      </span>
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {members.length} membro{members.length !== 1 ? "s" : ""}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Import Rules */}
        {canEdit && currentPipeline && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="relative"
                  onClick={() => setShowImportRules(true)}
                >
                  <Download className="h-4 w-4" />
                  {activeRulesCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                      {activeRulesCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regras de Importacao</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Members */}
        {isOwner && currentPipeline && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowMembers(true)}
                >
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gerenciar Membros</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Settings */}
        {isOwner && currentPipeline && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configuracoes</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* New Deal */}
        {canEdit && (
          <Button onClick={() => setShowNewDeal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Deal
          </Button>
        )}
      </div>

      {/* Dialogs */}
      <DealDialog
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        pipelineId={currentPipeline?.id}
        onSuccess={() => router.refresh()}
      />

      <PipelineCreateDialog
        open={showCreatePipeline}
        onOpenChange={setShowCreatePipeline}
        onSuccess={() => router.refresh()}
      />

      {currentPipeline && (
        <>
          <PipelineSettingsDialog
            open={showSettings}
            onOpenChange={setShowSettings}
            pipeline={currentPipeline}
            stages={stages}
            pipelines={pipelines}
            onSuccess={() => router.refresh()}
          />

          <PipelineMembersDialog
            open={showMembers}
            onOpenChange={setShowMembers}
            pipeline={currentPipeline}
            members={members}
            currentUserRole={currentUserRole}
            onSuccess={() => router.refresh()}
          />

          <ImportRulesDialog
            open={showImportRules}
            onOpenChange={setShowImportRules}
            pipeline={currentPipeline}
            stages={stages}
            members={members}
            onSuccess={() => router.refresh()}
          />
        </>
      )}
    </div>
  )
}
