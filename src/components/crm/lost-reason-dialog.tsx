"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

const COMMON_REASONS = [
  "Sem orçamento",
  "Sem fit",
  "Sem decisão",
  "Concorrência ganhou",
  "Sem resposta",
  "Timing ruim",
  "Mudança de prioridade",
  "Outro",
]

interface LostReasonDialogProps {
  open: boolean
  onConfirm: (reason: string, comment: string) => void
  onCancel: () => void
}

export function LostReasonDialog({ open, onConfirm, onCancel }: LostReasonDialogProps) {
  const [reason, setReason] = useState("")
  const [comment, setComment] = useState("")

  useEffect(() => {
    if (open) {
      setReason("")
      setComment("")
    }
  }, [open])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[60] bg-black/40"
          style={{ animationDuration: "var(--crm-duration-normal)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2"
          style={{
            background: "var(--crm-gray-0)",
            borderRadius: "var(--crm-radius-lg)",
            width: "90vw",
            maxWidth: 460,
            fontFamily: "var(--crm-font-sans)",
            boxShadow: "var(--crm-shadow-lg)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-5 py-4"
            style={{ borderColor: "var(--crm-gray-200)" }}
          >
            <DialogPrimitive.Title
              style={{
                fontSize: "var(--crm-text-md)",
                fontWeight: "var(--crm-weight-medium)",
                color: "var(--crm-gray-900)",
              }}
            >
              Por que foi perdido?
            </DialogPrimitive.Title>
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
              style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-1">
              {COMMON_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  type="button"
                  style={{
                    fontSize: "var(--crm-text-sm)",
                    padding: "8px 10px",
                    borderRadius: "var(--crm-radius-sm)",
                    border: `1px solid ${reason === r ? "var(--crm-brand)" : "var(--crm-gray-200)"}`,
                    background: reason === r ? "var(--crm-brand)" : "var(--crm-gray-0)",
                    color: reason === r ? "var(--crm-brand-fg)" : "var(--crm-gray-700)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              className="crm-input w-full"
              style={{ height: "auto", minHeight: 70, padding: 10 }}
              placeholder="Detalhes adicionais (opcional)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-50)" }}
          >
            <button type="button" className="crm-button-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="crm-button-primary"
              onClick={() => onConfirm(reason || "Não informado", comment)}
              disabled={!reason}
              style={{ opacity: !reason ? 0.5 : 1 }}
            >
              Confirmar perda
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
