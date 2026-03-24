"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SaveBarProps {
  isSaving: boolean
  onSave: () => void
  onCancel: () => void
  hasChanges: boolean
  saveLabel?: string
  savingLabel?: string
}

export function SaveBar({ isSaving, onSave, onCancel, hasChanges, saveLabel = "Salvar alterações", savingLabel = "Salvando..." }: SaveBarProps) {
  if (!hasChanges) return null

  return (
    <div className={cn(
      "sticky bottom-0 z-20",
      "bg-white dark:bg-[#1A1D27]",
      "border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.08)]",
      "px-4 py-3",
      "flex flex-col sm:flex-row items-center justify-end gap-2",
      "shadow-[0_-2px_8px_rgba(0,0,0,0.04)]",
    )}>
      <Button variant="ghost" size="md" onClick={onCancel} disabled={isSaving} className="w-full sm:w-auto">
        Cancelar
      </Button>
      <Button variant="primary" size="md" onClick={onSave} disabled={isSaving} className="w-full sm:w-auto">
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {savingLabel}
          </>
        ) : (
          saveLabel
        )}
      </Button>
    </div>
  )
}
