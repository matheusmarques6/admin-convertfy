"use client"

/**
 * Editor do blueprint selecionado.
 *
 * Metadados: objective, messaging, subject_hint, tone_override.
 * Lista de blocks via <BlueprintBlocksEditor />.
 *
 * Save:
 *   - source='db' → PATCH /api/admin/email-blueprints/[id]
 *   - source='default' → POST /api/admin/email-blueprints
 *
 * Validação client-side (zod) garante shape de blocks antes do POST/PATCH —
 * o endpoint aceita JSONB livre (z.record), então um bloco com chave errada
 * passaria a validação API e quebraria o seedBlocksFromBlueprint silenciosamente.
 */
import { useState } from "react"
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react"
import { z } from "zod"
import { toast } from "@/lib/hooks/use-toast"
import type { BlueprintBlockDef } from "@/lib/agents/email-blueprint"
import type { BlueprintRow } from "@/lib/services/blueprint-management.service"
import { BlueprintBlocksEditor } from "./blueprint-blocks-editor"

const BLOCK_TYPES = [
  "hero",
  "text",
  "coupon",
  "products",
  "cta",
  "footer",
  "image",
  "divider",
  "spacer",
] as const

const blockSchema = z.object({
  type: z.enum(BLOCK_TYPES),
  label: z.string().min(1, "label obrigatório"),
  purpose: z.string().min(1, "purpose obrigatório"),
  needs_image: z.boolean().optional(),
})

interface Props {
  blueprint: BlueprintRow
  onSaved: () => void
}

export function BlueprintEditor({ blueprint, onSaved }: Props) {
  const [objective, setObjective] = useState(blueprint.objective)
  const [messaging, setMessaging] = useState(blueprint.messaging)
  const [subjectHint, setSubjectHint] = useState(blueprint.subject_hint ?? "")
  const [toneOverride, setToneOverride] = useState(
    blueprint.tone_override ?? "",
  )
  const [blocks, setBlocks] = useState<BlueprintBlockDef[]>(blueprint.blocks)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isDb = blueprint.source === "db"

  const reset = () => {
    setObjective(blueprint.objective)
    setMessaging(blueprint.messaging)
    setSubjectHint(blueprint.subject_hint ?? "")
    setToneOverride(blueprint.tone_override ?? "")
    setBlocks(blueprint.blocks)
  }

  const save = async () => {
    if (!objective.trim() || !messaging.trim()) {
      toast({
        variant: "destructive",
        title: "objective e messaging são obrigatórios",
      })
      return
    }

    // Valida cada bloco no client — endpoint aceita JSONB livre.
    for (let i = 0; i < blocks.length; i++) {
      const result = blockSchema.safeParse(blocks[i])
      if (!result.success) {
        const first = result.error.issues[0]
        toast({
          variant: "destructive",
          title: `Bloco #${i + 1}: ${first?.message ?? "inválido"}`,
        })
        return
      }
    }

    setSubmitting(true)
    try {
      const cleanBlocks = blocks.map((b) => ({
        type: b.type,
        label: b.label,
        purpose: b.purpose,
        needs_image: Boolean(b.needs_image),
      }))

      const payload = {
        objective: objective.trim(),
        messaging: messaging.trim(),
        subject_hint: subjectHint.trim() || null,
        tone_override: toneOverride.trim() || null,
        blocks: cleanBlocks,
      }

      let res: Response
      if (isDb && blueprint.id) {
        res = await fetch(`/api/admin/email-blueprints/${blueprint.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/admin/email-blueprints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            flow_type: blueprint.flow_type,
            email_number: blueprint.email_number,
          }),
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erro ao salvar")

      toast({
        title: isDb
          ? "Blueprint atualizado"
          : "Blueprint criado (sobrescreve DEFAULT)",
        description: `${blueprint.flow_type} #${blueprint.email_number}`,
      })
      onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao salvar",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    if (!isDb || !blueprint.id) return
    const ok = window.confirm(
      `Deletar o blueprint customizado de ${blueprint.flow_type} #${blueprint.email_number}? Volta a usar o DEFAULT do código.`,
    )
    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/email-blueprints/${blueprint.id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erro ao deletar")
      toast({
        title: "Blueprint deletado",
        description: `Voltou pro DEFAULT do código.`,
      })
      onSaved()
    } catch (err) {
      toast({
        variant: "destructive",
        title: err instanceof Error ? err.message : "Erro ao deletar",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-slate-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">
            {blueprint.flow_type} · email #{blueprint.email_number}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/40">
            {isDb
              ? `Salvo no DB${blueprint.updated_at ? ` — atualizado em ${new Date(blueprint.updated_at).toLocaleString("pt-BR")}` : ""}`
              : "Usando DEFAULT do código (não há row no DB)"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isDb && (
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-[4px] border border-red-200 bg-white px-2 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10"
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Resetar p/ Default
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-[4px] border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08]"
          >
            <RotateCcw className="h-3 w-3" />
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-[4px] bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90"
          >
            {submitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Salvar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
            Subject hint
          </label>
          <input
            type="text"
            value={subjectHint}
            onChange={(e) => setSubjectHint(e.target.value)}
            placeholder="Ex: Bem-vindo(a) à <brand>!"
            className="crm-input w-full text-[12px]"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
            Tone override (opcional)
          </label>
          <input
            type="text"
            value={toneOverride}
            onChange={(e) => setToneOverride(e.target.value)}
            placeholder="Vazio = usa o tom da loja"
            className="crm-input w-full text-[12px]"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
          Objective
        </label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          className="crm-input w-full text-[12px]"
          placeholder="O que esse email deve realizar editorialmente"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-white/60">
          Messaging
        </label>
        <textarea
          value={messaging}
          onChange={(e) => setMessaging(e.target.value)}
          rows={3}
          className="crm-input w-full text-[12px]"
          placeholder="Mensagem central + tópicos a cobrir"
        />
      </div>

      <BlueprintBlocksEditor blocks={blocks} onChange={setBlocks} />
    </div>
  )
}
