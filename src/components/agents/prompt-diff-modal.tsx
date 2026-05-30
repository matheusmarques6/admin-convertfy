"use client"

/**
 * PromptDiffModal — diff line-by-line entre versão ativa e target.
 * Modo "view" só mostra diff; modo "activate" exige double-confirm
 * (typing "ativar") antes de ativar a target.
 *
 * Algoritmo de diff: comparação ingênua linha-a-linha. Não é Myers/LCS
 * — só marca cada linha como ADD (verde) se está no target mas não no
 * current, REM (vermelho) se vice-versa, SAME (cinza) se em ambos. Bom
 * o suficiente pra orientar o reviewer; QA já valida o output.
 */
import { useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Loader2, X, AlertTriangle } from "lucide-react"
import { toast } from "@/lib/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { PromptRow } from "@/lib/services/prompt-management.service"

interface Props {
  mode: "view" | "activate"
  current: PromptRow | null
  target: PromptRow
  onClose: () => void
  onActivated: () => void
}

type DiffLine = { kind: "same" | "add" | "rem"; text: string }

function diffLines(a: string, b: string): { left: DiffLine[]; right: DiffLine[] } {
  const aLines = (a ?? "").split("\n")
  const bLines = (b ?? "").split("\n")
  // Heurística simples baseada em conteúdo (ignorando índice para SAME/REM/ADD)
  const aPool = new Map<string, number>()
  for (const l of aLines) aPool.set(l, (aPool.get(l) ?? 0) + 1)
  const bPool = new Map<string, number>()
  for (const l of bLines) bPool.set(l, (bPool.get(l) ?? 0) + 1)

  const left: DiffLine[] = aLines.map((l) => {
    const stillInB = (bPool.get(l) ?? 0) > 0
    if (stillInB) {
      bPool.set(l, (bPool.get(l) ?? 0) - 1)
      return { kind: "same" as const, text: l }
    }
    return { kind: "rem" as const, text: l }
  })

  // Reset bPool para coluna direita
  const bPool2 = new Map<string, number>()
  for (const l of bLines) bPool2.set(l, (bPool2.get(l) ?? 0) + 1)
  const aPool2 = new Map<string, number>()
  for (const l of aLines) aPool2.set(l, (aPool2.get(l) ?? 0) + 1)

  const right: DiffLine[] = bLines.map((l) => {
    const wasInA = (aPool2.get(l) ?? 0) > 0
    if (wasInA) {
      aPool2.set(l, (aPool2.get(l) ?? 0) - 1)
      return { kind: "same" as const, text: l }
    }
    return { kind: "add" as const, text: l }
  })

  return { left, right }
}

const lineCls = (k: DiffLine["kind"]) =>
  k === "add"
    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
    : k === "rem"
      ? "bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200"
      : "text-slate-600 dark:text-white/55"

function DiffColumn({
  title,
  lines,
}: {
  title: string
  lines: DiffLine[]
}) {
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-white/45 mb-1">
        {title}
      </h4>
      <pre className="font-mono text-[11px] leading-[1.5] rounded-[4px] border border-slate-200 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02] max-h-[280px] overflow-auto">
        {lines.map((l, i) => (
          <div key={i} className={cn("px-2", lineCls(l.kind))}>
            {l.text || " "}
          </div>
        ))}
      </pre>
    </div>
  )
}

export function PromptDiffModal({ mode, current, target, onClose, onActivated }: Props) {
  const [confirmText, setConfirmText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const systemDiff = diffLines(current?.system_prompt ?? "", target.system_prompt)
  const userDiff = diffLines(current?.user_template ?? "", target.user_template)

  const activate = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/agents/prompts/${target.id}/activate`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erro ao ativar")
      toast({
        title: `v${target.version} ativada`,
        description: data.was_already_active
          ? "Versão já estava ativa."
          : `Versão anterior (v${data.deactivated_version ?? "?"}) desativada.`,
      })
      onActivated()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao ativar",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const canActivate = mode === "activate" && confirmText.trim().toLowerCase() === "ativar"

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[1000px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            {mode === "activate" ? `Ativar v${target.version}` : `Diff v${target.version}`}
          </DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {mode === "activate"
                ? `Ativar v${target.version}`
                : `Diff: v${current?.version ?? "—"} → v${target.version}`}
            </h2>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {mode === "activate" && (
              <div className="flex items-start gap-2 rounded-[4px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Esta mudança afeta <strong>TODOS</strong> os emails gerados a partir
                  de agora. Revise o diff abaixo antes de confirmar.
                </span>
              </div>
            )}

            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75 mb-2">
                System prompt
              </h3>
              <div className="flex gap-3">
                <DiffColumn title={`Atual (v${current?.version ?? "—"})`} lines={systemDiff.left} />
                <DiffColumn title={`Target (v${target.version})`} lines={systemDiff.right} />
              </div>
            </div>

            <div>
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75 mb-2">
                User template
              </h3>
              <div className="flex gap-3">
                <DiffColumn title={`Atual (v${current?.version ?? "—"})`} lines={userDiff.left} />
                <DiffColumn title={`Target (v${target.version})`} lines={userDiff.right} />
              </div>
            </div>

            {mode === "activate" && (
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Para confirmar, digite <code className="font-mono bg-slate-100 dark:bg-white/[0.06] px-1 rounded">ativar</code>
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="crm-input w-full max-w-[200px]"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              {mode === "activate" ? "Cancelar" : "Fechar"}
            </button>
            {mode === "activate" && (
              <button
                type="button"
                onClick={activate}
                disabled={!canActivate || submitting}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-40"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar ativação
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
