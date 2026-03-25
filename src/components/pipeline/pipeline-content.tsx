"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Kanban, List, Plus, Settings, Users, Download, ChevronDown } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
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
import { PipelineBoard } from "./pipeline-board"
import { PipelineMobile } from "./pipeline-mobile"
import { PipelineList } from "./pipeline-list"
import { PipelineSummary } from "./pipeline-summary"
import { DealDialog } from "./deal-dialog"
import { PipelineCreateDialog } from "./pipeline-create-dialog"
import { PipelineSettingsDialog } from "./pipeline-settings-dialog"
import { PipelineMembersDialog } from "./pipeline-members-dialog"
import { ImportRulesDialog } from "./import-rules-dialog"
import { useMediaQuery } from "@/hooks/use-media-query"
import { getInitials } from "@/lib/utils"
import type {
  Pipeline,
  PipelineStage,
  DealWithRelations,
  PipelineMember,
  PipelineMemberRole,
  PipelineImportRule,
} from "@/types"

// ─── Types ────────────────────────────────────────────────

type ViewMode = "kanban" | "list"

interface PipelineContentProps {
  pipelines: Pipeline[]
  currentPipeline: Pipeline | null
  stages: PipelineStage[]
  deals: DealWithRelations[]
  members: PipelineMember[]
  importRules: PipelineImportRule[]
  currentUserRole: PipelineMemberRole | null
}

// ─── PipelineContent ──────────────────────────────────────

export function PipelineContent({
  pipelines,
  currentPipeline,
  stages,
  deals,
  members,
  importRules,
  currentUserRole,
}: PipelineContentProps) {
  const router = useRouter()
  const isMobile = useMediaQuery("(max-width: 767px)")
  const [view, setView] = useState<ViewMode>("kanban")
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

  return (
    <div className="space-y-4">
      {/* Toolbar: Pipeline selector + View switcher + Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Pipeline selector + member avatars */}
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1.5">
                {currentPipeline?.name || "Selecionar Pipeline"}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.map((pipeline) => (
                <DropdownMenuItem
                  key={pipeline.id}
                  onClick={() => handleSwitchPipeline(pipeline.id)}
                  className={pipeline.id === currentPipeline?.id ? "bg-accent" : ""}
                >
                  {pipeline.name}
                  {pipeline.is_default && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-[#5C6378]">(padrão)</span>
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

          {/* Role badge */}
          {currentUserRole && (
            <Badge variant="neutral" showDot={false} className="text-[10px]">
              {currentUserRole === "owner" ? "Dono" : currentUserRole === "editor" ? "Editor" : "Visualizador"}
            </Badge>
          )}
        </div>

        {/* Right: View switcher + tool buttons + new deal */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View switcher — SegmentedTabs (Rule 18) */}
          <SegmentedTabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <SegmentedTabItem value="kanban">
              <Icon icon={Kanban} size={16} className="mr-1.5" />
              Kanban
            </SegmentedTabItem>
            <SegmentedTabItem value="list">
              <Icon icon={List} size={16} className="mr-1.5" />
              Lista
            </SegmentedTabItem>
          </SegmentedTabs>

          {/* Import Rules */}
          {canEdit && currentPipeline && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 relative"
                    onClick={() => setShowImportRules(true)}
                  >
                    <Download className="h-4 w-4" />
                    {activeRulesCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#4E62D8] dark:bg-[#7B8CEA] text-[10px] text-white flex items-center justify-center">
                        {activeRulesCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regras de Importação</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Members */}
          {isOwner && currentPipeline && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => setShowMembers(true)}>
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
                  <Button variant="secondary" size="icon" className="h-9 w-9" onClick={() => setShowSettings(true)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Configurações</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* New Deal */}
          {canEdit && (
            <Button size="sm" onClick={() => setShowNewDeal(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo Deal
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline Summary KPIs */}
      <PipelineSummary stages={stages} deals={deals} />

      {/* View content */}
      {view === "kanban" && (
        isMobile ? (
          <PipelineMobile
            stages={stages}
            deals={deals}
            pipelineId={currentPipeline?.id}
            currentUserRole={currentUserRole}
          />
        ) : (
          <div className="flex-1 min-h-0">
            <PipelineBoard
              stages={stages}
              deals={deals}
              pipelineId={currentPipeline?.id}
              currentUserRole={currentUserRole}
            />
          </div>
        )
      )}

      {view === "list" && (
        <PipelineList
          stages={stages}
          deals={deals}
          pipelineId={currentPipeline?.id}
          currentUserRole={currentUserRole}
        />
      )}

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
