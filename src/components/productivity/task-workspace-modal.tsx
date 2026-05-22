"use client"

import { useEffect } from "react"
import { mutate as swrMutate } from "swr"
import { ProductionWorkspace } from "@/components/stores/producao/production-workspace"
import type {
  WorkspaceMode,
  AllowedEmailRef,
} from "@/components/stores/producao/production-workspace-types"

interface TaskWorkspaceModalProps {
  open: boolean
  onClose: () => void
  taskId: string
  storeId: string
  mode: WorkspaceMode
  allowedEmails?: AllowedEmailRef[]
  initialFlowId: string | null
  initialEmailId: string | null
  /** "brand" | "briefing" pra abrir num recurso de consulta. */
  initialResource?: "brand" | "briefing" | null
}

export function TaskWorkspaceModal({
  open,
  onClose,
  taskId,
  storeId,
  mode,
  allowedEmails,
  initialFlowId,
  initialEmailId,
  initialResource = null,
}: TaskWorkspaceModalProps) {
  // Fecha no ESC
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Quando fecha, revalida a task pra refletir status sincronizado pelo
  // email-task-sync (ready/approved → review/completed).
  const handleClose = () => {
    swrMutate(`/api/tasks/${taskId}`)
    onClose()
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workspace de produção"
      className="fixed inset-0 z-[58]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="fixed left-[2.5vw] top-[2.5vh] z-[59]"
        style={{
          width: "95vw",
          height: "95vh",
          background: "var(--crm-bg, #FFFFFF)",
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.24)",
        }}
      >
        <ProductionWorkspace
          storeId={storeId}
          mode={mode}
          allowedEmails={allowedEmails}
          initialResource={initialResource}
          initialFlow={initialFlowId}
          initialEmail={initialEmailId}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}
