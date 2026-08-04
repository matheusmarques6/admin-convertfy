"use client"

/**
 * Razão da perda — obrigatória ao mover para etapa "lost".
 *
 * Os motivos vêm de `crm_lost_reasons` (configuráveis pela org, gestão
 * inline pelo lápis no cabeçalho); org sem lista usa os padrões do
 * código. `deals.lost_reason` é texto livre, então trocar a lista nunca
 * corrompe o histórico de perdas antigas.
 */

import { useEffect, useState } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Pencil, X } from "lucide-react"

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

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LostReasonDialogProps {
  open: boolean
  onConfirm: (reason: string, comment: string) => void
  onCancel: () => void
}

export function LostReasonDialog({ open, onConfirm, onCancel }: LostReasonDialogProps) {
  const [reason, setReason] = useState("")
  const [comment, setComment] = useState("")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [savingList, setSavingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const { data, mutate } = useSWR<{
    reasons: Array<{ id: string; label: string }>
    schema_missing?: boolean
  }>(open ? "/api/crm/lost-reasons" : null, fetcher, { revalidateOnFocus: false })

  const orgReasons = (data?.reasons ?? []).map((r) => r.label)
  const reasons = orgReasons.length > 0 ? orgReasons : COMMON_REASONS
  const canManage = data?.schema_missing !== true

  useEffect(() => {
    if (open) {
      setReason("")
      setComment("")
      setEditing(false)
      setListError(null)
    }
  }, [open])

  const startEditing = () => {
    setDraft(reasons.join("\n"))
    setListError(null)
    setEditing(true)
  }

  const saveList = async () => {
    setSavingList(true)
    setListError(null)
    try {
      const labels = draft
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
      const res = await fetch("/api/crm/lost-reasons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: unknown } | null
        const raw = json?.error
        setListError(
          (typeof raw === "string"
            ? raw
            : (raw as { message?: string } | undefined)?.message) ??
            "Não foi possível salvar os motivos.",
        )
        return
      }
      await mutate()
      setEditing(false)
    } finally {
      setSavingList(false)
    }
  }

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
              {editing ? "Editar motivos de perda" : "Por que foi perdido?"}
            </DialogPrimitive.Title>
            <div className="flex items-center gap-1">
              {canManage && !editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  title="Editar a lista de motivos da sua empresa"
                  aria-label="Editar motivos"
                  className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
                  style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="flex h-7 w-7 items-center justify-center hover:bg-[color:var(--crm-gray-100)]"
                style={{ borderRadius: "var(--crm-radius-md)", color: "var(--crm-gray-500)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {editing ? (
            <div className="space-y-2 px-5 py-4">
              <p style={{ fontSize: "var(--crm-text-xs)", color: "var(--crm-gray-500)", lineHeight: 1.5 }}>
                Um motivo por linha, na ordem em que devem aparecer. Vale para toda a
                empresa. Perdas antigas mantêm o texto da época.
              </p>
              <textarea
                className="crm-input w-full"
                style={{ height: "auto", minHeight: 160, padding: 10, fontSize: 13 }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              {listError && (
                <p style={{ fontSize: "var(--crm-text-sm)", color: "var(--crm-danger-fg)" }}>
                  {listError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3 px-5 py-4">
              <div className="grid grid-cols-2 gap-1">
                {reasons.map((r) => (
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
          )}

          <div
            className="flex items-center justify-end gap-2 border-t px-5 py-3"
            style={{ borderColor: "var(--crm-gray-200)", background: "var(--crm-gray-50)" }}
          >
            {editing ? (
              <>
                <button
                  type="button"
                  className="crm-button-ghost"
                  onClick={() => setEditing(false)}
                  disabled={savingList}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className="crm-button-primary"
                  onClick={saveList}
                  disabled={savingList}
                  style={{ opacity: savingList ? 0.5 : 1 }}
                >
                  {savingList ? "Salvando..." : "Salvar motivos"}
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
