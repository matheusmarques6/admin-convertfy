"use client"

/**
 * Workspace da estrutura geral (Epic AE — input do agente gerador).
 *
 * Por (flow_type × email_number): objetivo + diretriz + blocos sugeridos
 * de alto nível. A IA expande isso no blueprint detalhado de cada loja.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { LayoutTemplate } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import type { EmailOutlineTemplate } from "@/types/email-generation"

const FLOW_TYPES = [
  "welcome",
  "abandoned_cart",
  "browse_abandonment",
  "upsell",
  "win_back",
  "site_abandoned",
  "shipping_stages",
  "post_purchase",
] as const

interface FormState {
  flow_type: string
  email_number: string
  objective: string
  guidance: string
  suggested_blocks: string
  tone_hint: string
  is_active: boolean
}

function emptyForm(flowType: string): FormState {
  return {
    flow_type: flowType,
    email_number: "1",
    objective: "",
    guidance: "",
    suggested_blocks: "",
    tone_hint: "",
    is_active: true,
  }
}

const csvToArr = (s: string): string[] =>
  s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

const inputCls =
  "w-full rounded-[6px] border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03]"

export function OutlinesWorkspace() {
  const [outlines, setOutlines] = useState<EmailOutlineTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>("welcome")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm("welcome"))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Flag "somente texto" por `${flow_type}:${email_number}` — fonte única em
  // email_blueprints (chave ausente = false). Checkbox espelhado da aba
  // Blueprints: escreve via PATCH /api/admin/email-blueprints/text-only.
  const [textOnlyFlags, setTextOnlyFlags] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, bpRes] = await Promise.all([
        fetch("/api/admin/outlines"),
        fetch("/api/admin/email-blueprints"),
      ])
      const json = (await res.json()) as { outlines?: EmailOutlineTemplate[] }
      setOutlines(json.outlines ?? [])
      const bpJson = (await bpRes.json()) as {
        blueprints?: Array<{
          flow_type: string
          email_number: number
          text_only?: boolean | null
        }>
      }
      const flags: Record<string, boolean> = {}
      for (const bp of bpJson.blueprints ?? []) {
        if (bp.text_only) flags[`${bp.flow_type}:${bp.email_number}`] = true
      }
      setTextOnlyFlags(flags)
    } catch {
      setMessage("Falha ao carregar.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      outlines
        .filter((o) => o.flow_type === tab)
        .sort((a, b) => a.email_number - b.email_number),
    [outlines, tab],
  )

  function selectOutline(o: EmailOutlineTemplate) {
    setSelectedId(o.id)
    setForm({
      flow_type: o.flow_type,
      email_number: String(o.email_number),
      objective: o.objective,
      guidance: o.guidance ?? "",
      suggested_blocks: (o.suggested_blocks ?? []).join(", "),
      tone_hint: o.tone_hint ?? "",
      is_active: o.is_active,
    })
  }

  function startNew() {
    setSelectedId(null)
    setForm(emptyForm(tab))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    const base = {
      objective: form.objective,
      guidance: form.guidance || null,
      suggested_blocks: csvToArr(form.suggested_blocks),
      tone_hint: form.tone_hint || null,
      is_active: form.is_active,
    }
    try {
      const res = selectedId
        ? await fetch(`/api/admin/outlines/${selectedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(base),
          })
        : await fetch("/api/admin/outlines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...base,
              flow_type: form.flow_type,
              email_number: Number(form.email_number) || 1,
            }),
          })
      if (!res.ok) throw new Error(String(res.status))
      setMessage("Salvo.")
      await load()
    } catch {
      setMessage("Falha ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selectedId) return
    setSaving(true)
    try {
      await fetch(`/api/admin/outlines/${selectedId}`, { method: "DELETE" })
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

  // Chave do email em edição (novo ou selecionado) no formato da flag.
  const currentKey = `${tab}:${Number(form.email_number) || 1}`
  const currentTextOnly = !!textOnlyFlags[currentKey]

  async function toggleTextOnly(next: boolean) {
    const key = currentKey
    const prev = !!textOnlyFlags[key]
    // Otimista + revert em erro.
    setTextOnlyFlags((f) => ({ ...f, [key]: next }))
    try {
      const res = await fetch("/api/admin/email-blueprints/text-only", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flow_type: tab,
          email_number: Number(form.email_number) || 1,
          text_only: next,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setMessage(
        next
          ? "Marcado como somente texto (sincronizado com a aba Blueprints)."
          : "Desmarcado — volta ao fluxo normal com imagens.",
      )
    } catch (err) {
      setTextOnlyFlags((f) => ({ ...f, [key]: prev }))
      setMessage(
        `Falha ao salvar somente texto: ${err instanceof Error ? err.message : "erro"}`,
      )
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={LayoutTemplate}
        title="Email / Estrutura geral"
        description="Diretriz de alto nível por email do flow. O agente a expande no blueprint detalhado de cada loja."
      />

      <div className="overflow-x-auto pb-1">
        <SegmentedTabs
          value={tab}
          onValueChange={(v) => {
            setTab(v)
            setSelectedId(null)
            setForm(emptyForm(v))
          }}
        >
          {FLOW_TYPES.map((ft) => (
            <SegmentedTabItem key={ft} value={ft}>
              {ft}
            </SegmentedTabItem>
          ))}
        </SegmentedTabs>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-2">
          <button
            type="button"
            onClick={startNew}
            className="w-full rounded-[6px] border border-dashed border-slate-300 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/[0.04]"
          >
            + Novo email de {tab}
          </button>
          {loading ? (
            <p className="px-1 text-[12px] text-slate-400">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-1 text-[12px] text-slate-400">
              Nenhum outline de {tab}.
            </p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => selectOutline(o)}
                className={`block w-full rounded-[6px] border px-3 py-2 text-left text-[13px] ${
                  selectedId === o.id
                    ? "border-slate-900 bg-slate-50 dark:border-white/40 dark:bg-white/[0.06]"
                    : "border-slate-200 hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                }`}
              >
                Email #{o.email_number}
                {textOnlyFlags[`${o.flow_type}:${o.email_number}`] && (
                  <span className="ml-2 rounded-[3px] bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    texto
                  </span>
                )}
                {!o.is_active && (
                  <span className="ml-2 text-[10px] text-slate-400">inativo</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-[6px] border border-slate-200 p-4 dark:border-white/[0.08]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">
              {selectedId ? `Editar (${tab} #${form.email_number})` : "Novo outline"}
            </span>
            {message && (
              <span className="text-[12px] text-slate-500">{message}</span>
            )}
          </div>

          {!selectedId && (
            <label className="block space-y-1">
              <span className="text-[12px] text-slate-500">Nº do email</span>
              <input
                className={inputCls}
                type="number"
                min={1}
                value={form.email_number}
                onChange={(e) => set({ email_number: e.target.value })}
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-[12px] text-slate-500">Objetivo</span>
            <textarea
              className={inputCls}
              rows={2}
              value={form.objective}
              onChange={(e) => set({ objective: e.target.value })}
              placeholder="Ex.: Boas-vindas e apresentação da marca"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[12px] text-slate-500">Diretriz</span>
            <textarea
              className={inputCls}
              rows={3}
              value={form.guidance}
              onChange={(e) => set({ guidance: e.target.value })}
              placeholder="Como estruturar este email em alto nível"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[12px] text-slate-500">
              Blocos sugeridos (vírgula)
            </span>
            <input
              className={inputCls}
              value={form.suggested_blocks}
              onChange={(e) => set({ suggested_blocks: e.target.value })}
              placeholder="header, hero, coupon, products, footer"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[12px] text-slate-500">Tom (hint)</span>
              <input
                className={inputCls}
                value={form.tone_hint}
                onChange={(e) => set({ tone_hint: e.target.value })}
                placeholder="aspiracional"
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-[13px]">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set({ is_active: e.target.checked })}
              />
              {form.is_active ? "Ativo" : "Inativo"}
            </label>
          </div>

          {/* Flag "somente texto" — vive em email_blueprints (fonte única,
              espelhada na aba Blueprints); salva na hora, fora do Salvar. */}
          <label className="flex items-start gap-2 rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <input
              type="checkbox"
              checked={currentTextOnly}
              onChange={(e) => void toggleTextOnly(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
            />
            <span>
              <span className="block text-[12px] font-semibold text-slate-800 dark:text-white/90">
                Email somente texto
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-white/50">
                Pula o Montador por loja; a copy vai pro n8n com esta Estrutura
                geral e o email fica pronto direto, sem imagem nem HTML gerado.
                Salva na hora (sincronizado com a aba Blueprints).
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !form.objective}
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
      </div>
    </div>
  )
}
