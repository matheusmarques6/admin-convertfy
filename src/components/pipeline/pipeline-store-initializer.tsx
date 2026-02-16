"use client"

import { useEffect, useRef } from "react"
import { usePipelineStore } from "@/lib/store"
import type { Pipeline, PipelineStage, DealWithRelations, PipelineMember, PipelineImportRule, PipelineMemberRole } from "@/types"

interface PipelineStoreInitializerProps {
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  stages: PipelineStage[]
  deals: DealWithRelations[]
  members: PipelineMember[]
  importRules: PipelineImportRule[]
  currentUserRole: PipelineMemberRole | null
}

/**
 * Syncs server-fetched pipeline data into the Zustand store.
 * This enables child components to read/write pipeline state
 * without prop drilling, while keeping SSR as the data source.
 */
export function PipelineStoreInitializer({
  pipelines,
  selectedPipeline,
  stages,
  deals,
  members,
  importRules,
  currentUserRole,
}: PipelineStoreInitializerProps) {
  const initialized = useRef(false)
  const store = usePipelineStore

  useEffect(() => {
    store.getState().setPipelines(pipelines)
    store.getState().setSelectedPipeline(selectedPipeline)
    store.getState().setStages(stages)
    store.getState().setDeals(deals)
    store.getState().setMembers(members)
    store.getState().setImportRules(importRules)
    store.getState().setCurrentUserRole(currentUserRole)
    initialized.current = true
  }, [pipelines, selectedPipeline, stages, deals, members, importRules, currentUserRole, store])

  return null
}
