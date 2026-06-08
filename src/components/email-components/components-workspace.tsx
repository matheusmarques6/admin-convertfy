"use client"

/**
 * Workspace da biblioteca de componentes (Epic AE — Component Assembler).
 *
 * Layout 3 colunas: lista (por block_type) | editor | preview. As variantes
 * aqui são o acervo que o agente escolhe por bloco, com as dimensões de
 * matching (nicho/posicionamento/mood/densidade) editáveis.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Blocks } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import type { EmailComponentVariant } from "@/types/email-generation"
import { COMPONENT_CATEGORIES } from "@/lib/agents/shared/component-categories"

const FIRST_CATEGORY = COMPONENT_CATEGORIES[0].key

const DENSITIES = ["", "minimal", "balanced", "rich"] as const

interface FormState {
  block_type: string
  name: string
  html: string
  density: string
  niche_affinity: string
  positioning: string
  mood: string
  tags: string
  slots: string
  is_active: boolean
}

function emptyForm(blockType: string): FormState {
  return {
    block_type: blockType,
    name: "",
    html: "",
    density: "",
    niche_affinity: "",
    positioning: "",
    mood: "",
    tags: "",
    slots: "",
    is_active: true,
  }
}

const csvToArr = (s: string): string[] =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
const arrToCsv = (a: string[] | null | undefined): string => (a ?? []).join(", ")

const inputCls =
  "w-full rounded-[6px] border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03]"

export function ComponentsWorkspace() {
  const [variants, setVariants] = useState<EmailComponentVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>(FIRST_CATEGORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(FIRST_CATEGORY))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/components")
      const json = (await res.json()) as { variants?: EmailComponentVariant[] }
      setVariants(json.variants ?? [])
    } catch {
      setMessage("Falha ao carregar componentes.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () => variants.filter((v) => v.block_type === tab),
    [variants, tab],
  )

  function selectVariant(v: EmailComponentVariant) {
    setSelectedId(v.id)
    setForm({
      block_type: v.block_type,
      name: v.name,
      html: v.html,
      density: v.density ?? "",
      niche_affinity: arrToCsv(v.niche_affinity),
      positioning: arrToCsv(v.positioning),
      mood: arrToCsv(v.mood),
      tags: arrToCsv(v.tags),
      slots: arrToCsv(v.slots),
      is_active: v.is_active,
    })
  }

  function startNew() {
    setSelectedId(null)
    setForm(emptyForm(tab))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    const payload = {
      block_type: form.block_type,
      name: form.name,
      html: form.html,
      density: form.density || null,
      niche_affinity: csvToArr(form.niche_affinity),
      positioning: csvToArr(form.positioning),
      mood: csvToArr(form.mood),
      tags: csvToArr(form.tags),
      slots: csvToArr(form.slots),
      is_active: form.is_active,
    }
    try {
      const res = selectedId
        ? await fetch(`/api/admin/components/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/components", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error(String(res.status))
      setMessage("Salvo.")
      await load()
    } catch {
      setMessage("Falha ao salvar. Verifique os campos.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selectedId) return
    setSaving(true)
    try {
      await fetch(`/api/admin/components/${selectedId}`, { method: "DELETE" })
      startNew()
      await load()
    } catch {
      setMessage("Falha ao excluir.")
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }))

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Blocks}
        title="Email / Componentes"
        description="Acervo de variantes por tipo de bloco. O agente escolhe a melhor para cada loja com base nas dimensões de matching."
      />

      <div className="overflow-x-auto pb-1">
        <SegmentedTabs value={tab} onValueChange={(v) => setTab(v)}>
          {COMPONENT_CATEGORIES.map((c) => (
            <SegmentedTabItem key={c.key} value={c.key}>
              {c.label}
            </SegmentedTabItem>
          ))}
        </SegmentedTabs>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_380px]">
        {/* Lista */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={startNew}
            className="w-full rounded-[6px] border border-dashed border-slate-300 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/[0.04]"
          >
            + Nova variante de {tab}
          </button>
          {loading ? (
            <p className="px-1 text-[12px] text-slate-400">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-1 text-[12px] text-slate-400">
              Nenhuma variante de {tab}.
            </p>
          ) : (
            filtered.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVariant(v)}
                className={`block w-full rounded-[6px] border px-3 py-2 text-left text-[13px] ${
                  selectedId === v.id
                    ? "border-slate-900 bg-slate-50 dark:border-white/40 dark:bg-white/[0.06]"
                    : "border-slate-200 hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">{v.name}</span>
                  {!v.is_active && (
                    <span className="text-[10px] text-slate-400">inativo</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Editor */}
        <div className="space-y-3 rounded-[6px] border border-slate-200 p-4 dark:border-white/[0.08]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">
              {selectedId ? "Editar variante" : "Nova variante"}
            </span>
            {message && (
              <span className="text-[12px] text-slate-500">{message}</span>
            )}
          </div>

          <Field label="Nome">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Ex.: Hero lifestyle premium"
            />
          </Field>

          <Field label="HTML do snippet">
            <textarea
              className={`${inputCls} font-mono`}
              rows={8}
              value={form.html}
              onChange={(e) => set({ html: e.target.value })}
              placeholder="<div>…</div>"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Densidade">
              <select
                className={inputCls}
                value={form.density}
                onChange={(e) => set({ density: e.target.value })}
              >
                {DENSITIES.map((d) => (
                  <option key={d || "none"} value={d}>
                    {d || "(nenhuma)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ativo">
              <label className="flex items-center gap-2 py-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set({ is_active: e.target.checked })}
                />
                {form.is_active ? "Ativo" : "Inativo"}
              </label>
            </Field>
          </div>

          <Field label="Afinidade de nicho (vírgula)">
            <input
              className={inputCls}
              value={form.niche_affinity}
              onChange={(e) => set({ niche_affinity: e.target.value })}
              placeholder="beleza, moda"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Posicionamento (vírgula)">
              <input
                className={inputCls}
                value={form.positioning}
                onChange={(e) => set({ positioning: e.target.value })}
                placeholder="premium, medio"
              />
            </Field>
            <Field label="Mood (vírgula)">
              <input
                className={inputCls}
                value={form.mood}
                onChange={(e) => set({ mood: e.target.value })}
                placeholder="formal, afetivo"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slots (vírgula)">
              <input
                className={inputCls}
                value={form.slots}
                onChange={(e) => set({ slots: e.target.value })}
                placeholder="{{HEADLINE}}, {{CTA_URL}}"
              />
            </Field>
            <Field label="Tags (vírgula)">
              <input
                className={inputCls}
                value={form.tags}
                onChange={(e) => set({ tags: e.target.value })}
                placeholder="dark_bg, 2x2_grid"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !form.name || !form.html}
              onClick={() => void save()}
              className="rounded-[6px] bg-slate-900 px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            {selectedId && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void remove()}
                className="rounded-[6px] border border-slate-200 px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 dark:border-white/[0.08]"
              >
                Excluir
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-2">
          <span className="text-[12px] text-slate-500">Preview</span>
          <div className="overflow-hidden rounded-[6px] border border-slate-200 dark:border-white/[0.08]">
            <iframe
              title="preview"
              srcDoc={form.html || "<p style='font-family:sans-serif;color:#94a3b8;padding:16px'>Sem HTML</p>"}
              className="h-[460px] w-full bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-slate-500 dark:text-white/50">
        {label}
      </span>
      {children}
    </label>
  )
}
