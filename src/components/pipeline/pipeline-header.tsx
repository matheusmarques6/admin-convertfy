"use client"

import { useState } from "react"
import { Plus, Settings, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DealDialog } from "./deal-dialog"
import type { Pipeline } from "@/types"

interface PipelineHeaderProps {
  pipelines: Pipeline[]
  currentPipeline?: Pipeline | null
}

export function PipelineHeader({ pipelines, currentPipeline }: PipelineHeaderProps) {
  const [showNewDeal, setShowNewDeal] = useState(false)

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">
            Gerencie seus negócios e oportunidades
          </p>
        </div>

        {/* Pipeline Selector */}
        {pipelines.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {currentPipeline?.name || "Selecionar Pipeline"}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.map((pipeline) => (
                <DropdownMenuItem key={pipeline.id}>
                  {pipeline.name}
                  {pipeline.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (padrão)
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Plus className="mr-2 h-4 w-4" />
                Novo Pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
        <Button onClick={() => setShowNewDeal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Deal
        </Button>
      </div>

      <DealDialog
        open={showNewDeal}
        onOpenChange={setShowNewDeal}
        pipelineId={currentPipeline?.id}
      />
    </div>
  )
}
