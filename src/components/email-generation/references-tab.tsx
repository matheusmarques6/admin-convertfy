"use client"

/**
 * Aba Referências do hub de Geração de Emails (grid de cards + ReferenceDialog
 * com image_map + TestImageDialog). Extraída de `email-generation-workspace.tsx`.
 */

import { useState, useEffect } from "react"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Loader2, Plus, Pencil, Trash2, X, Save, Play } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/hooks/use-toast"
import type {
  ImageMapEntry,
  ImageMapType,
  EmailReferenceTemplate,
} from "@/types/email-generation"
import { FLOW_TYPE_LABELS } from "./flow-labels"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ReferencesTab() {
  const { data, mutate, isLoading } = useSWR<{ templates: EmailReferenceTemplate[] }>(
    "/api/admin/email-reference-templates",
    fetcher,
  )
  const templates = data?.templates ?? []
  const [editing, setEditing] = useState<EmailReferenceTemplate | "new" | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-700 dark:text-white/75">
          {templates.length} referência{templates.length === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova referência
        </button>
      </div>

      {isLoading && (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!isLoading && templates.length === 0 && !editing && (
        <div className="rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] py-10 text-center">
          <p className="text-[13px] text-slate-500 dark:text-white/45">
            Nenhuma referência ainda. Adicione HTMLs e copys de exemplo para guiar a geração.
          </p>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => setEditing(tpl)}
            className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4 text-left hover:border-slate-300 dark:hover:border-white/[0.15] transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                  {tpl.name}
                </h4>
                {(tpl.flow_type || tpl.email_number) && (
                  <span className="text-[11px] text-slate-500 dark:text-white/45">
                    {FLOW_TYPE_LABELS[tpl.flow_type ?? ""] ?? tpl.flow_type ?? ""}
                    {tpl.email_number ? ` #${tpl.email_number}` : ""}
                  </span>
                )}
              </div>
              <Badge
                variant={tpl.is_active ? "positive" : "neutral"}
                showDot
              >
                {tpl.is_active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            {tpl.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tpl.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-white/50 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 dark:text-white/35">
              <span>{new Date(tpl.created_at).toLocaleDateString("pt-BR")}</span>
              {tpl.html && <span>HTML</span>}
              {tpl.copy && <span>Copy</span>}
              {!tpl.html && !tpl.copy && <span>Vazio</span>}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
              <Pencil className="h-3 w-3" />
              Editar
            </div>
          </button>
        ))}
      </div>

      {editing && (
        <ReferenceDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); mutate() }}
        />
      )}
    </div>
  )
}

function ReferenceDialog({
  template,
  onClose,
  onSaved,
}: {
  template: EmailReferenceTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = template !== null
  const [name, setName] = useState(template?.name ?? "")
  const [flowType, setFlowType] = useState(template?.flow_type ?? "")
  const [emailNumber, setEmailNumber] = useState<number | null>(template?.email_number ?? null)
  const [html, setHtml] = useState(template?.html ?? "")
  const [copy, setCopy] = useState(template?.copy ?? "")
  const [imageMap, setImageMap] = useState<ImageMapEntry[]>(template?.image_map ?? [])
  const [tags, setTags] = useState((template?.tags ?? []).join(", "))
  const [isActive, setIsActive] = useState(template?.is_active ?? true)
  const [submitting, setSubmitting] = useState(false)
  const [testingIdx, setTestingIdx] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const detectImageType = (src: string): ImageMapType => {
    const s = src.toUpperCase()
    if (s.includes("LOGO")) return "logo"
    if (s.includes("HERO") || s.includes("BANNER")) return "hero"
    if (s.includes("PRODUCT") || s.includes("PRODUTO")) return "product"
    if (s.includes("ICON")) return "icon"
    if (s.includes("STAR") || s.includes("SEPARATOR") || s.includes("DIVIDER")) return "decorative"
    return "custom"
  }

  const extractImagesFromHtml = (htmlStr: string) => {
    const imgRe = /<img[^>]+src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*(?:width="(\d+)")?[^>]*(?:height="(\d+)")?[^>]*/gi
    const found: ImageMapEntry[] = []
    const seen = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = imgRe.exec(htmlStr)) !== null) {
      const src = m[1]
      if (!src || seen.has(src)) continue
      seen.add(src)
      if (src.startsWith("data:")) continue
      const alt = m[2] ?? ""
      const width = m[3] ? parseInt(m[3]) : null
      const height = m[4] ? parseInt(m[4]) : null
      const type = detectImageType(src)
      const existing = imageMap.find((e) => e.src === src)
      found.push({
        src, alt, width, height,
        type: existing?.type ?? type,
        product_index: existing?.product_index ?? (type === "product" ? found.filter((f) => f.type === "product").length : undefined),
        instruction: existing?.instruction ?? null,
        image_prompt: existing?.image_prompt ?? null,
      })
    }
    return found
  }

  // Ao abrir o dialog, se o HTML tem <img> mas o image_map salvo está vazio/desatualizado,
  // re-extrai mantendo o que já estava configurado.
  useEffect(() => {
    if (!html.trim()) return
    const detected = extractImagesFromHtml(html)
    if (detected.length === 0) return
    const savedSrcs = new Set(imageMap.map((e) => e.src))
    const detectedSrcs = new Set(detected.map((e) => e.src))
    const sameSet =
      savedSrcs.size === detectedSrcs.size &&
      [...savedSrcs].every((s) => detectedSrcs.has(s))
    if (!sameSet) setImageMap(detected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleHtmlChange = (newHtml: string) => {
    setHtml(newHtml)
    if (newHtml.trim()) {
      const detected = extractImagesFromHtml(newHtml)
      if (detected.length > 0) setImageMap(detected)
    }
  }

  const save = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        flow_type: flowType || null,
        email_number: emailNumber,
        html: html || null,
        copy: copy || null,
        image_map: imageMap.length > 0 ? imageMap : null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        is_active: isActive,
      }
      const url = isEdit
        ? `/api/admin/email-reference-templates/${template!.id}`
        : "/api/admin/email-reference-templates"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      onSaved()
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar referência" })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit || !confirm("Tem certeza que deseja excluir esta referência?")) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/email-reference-templates/${template!.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Erro ao excluir")
      onSaved()
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir referência" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[800px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">
            {isEdit ? "Editar referência" : "Nova referência"}
          </DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              {isEdit ? `Editar: ${template!.name}` : "Nova referência"}
            </h2>
            <DialogPrimitive.Close asChild>
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Nome</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Welcome 1" className="crm-input w-full" autoFocus />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Flow type</label>
                <select value={flowType} onChange={(e) => setFlowType(e.target.value)} className="crm-input w-full">
                  <option value="">Todos</option>
                  {Object.entries(FLOW_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Email #</label>
                <input type="number" value={emailNumber ?? ""} onChange={(e) => setEmailNumber(e.target.value ? parseInt(e.target.value) : null)} placeholder="1" min={1} max={20} className="crm-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">Tags</label>
                <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="promo, minimal" className="crm-input w-full" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Referência de Copy (texto/estrutura que o agente Copy deve seguir)
              </label>
              <textarea
                rows={8}
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                placeholder={"Subject: Bem-vinda à [marca]...\nPreheader: ...\n\n1. HERO\nHeadline: ...\nBody: ...\nCTA: ...\n\n2. TEXTO\n..."}
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Referência de HTML (template base para o agente HTML)
              </label>
              <textarea
                rows={8}
                value={html}
                onChange={(e) => handleHtmlChange(e.target.value)}
                placeholder="Cole o HTML de referência aqui..."
                className="crm-input w-full font-mono text-[12px]"
              />
            </div>
            {imageMap.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                  Imagens detectadas ({imageMap.length})
                </label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {imageMap.map((img, idx) => {
                    const isHeroOrCustom = img.type === "hero" || img.type === "custom"
                    return (
                      <div key={img.src} className="flex items-start gap-2 p-2.5 rounded-[4px] bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.06]">
                        <div className="shrink-0 w-10 h-10 rounded bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[16px]">
                          {img.type === "logo" ? "🏷" : img.type === "hero" ? "🖼" : img.type === "product" ? "📦" : img.type === "icon" ? "✨" : img.type === "decorative" ? "⭐" : "🎨"}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-500 dark:text-white/40 truncate flex-1">{img.src}</span>
                            {img.width && img.height && (
                              <span className="text-[10px] text-slate-400 dark:text-white/30 shrink-0">{img.width}x{img.height}</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setImageMap(imageMap.filter((_, i) => i !== idx))
                              }}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                              title="Remover esta imagem"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={img.type}
                              onChange={(e) => {
                                const updated = [...imageMap]
                                updated[idx] = { ...img, type: e.target.value as ImageMapType }
                                setImageMap(updated)
                              }}
                              className="crm-input text-[11px] h-7 w-[100px]"
                            >
                              <option value="logo">Logo</option>
                              <option value="hero">Hero</option>
                              <option value="product">Produto</option>
                              <option value="icon">Ícone</option>
                              <option value="decorative">Decorativo</option>
                              <option value="custom">Custom</option>
                            </select>
                            {img.type === "icon" && (
                              <input
                                type="text"
                                value={img.instruction ?? ""}
                                onChange={(e) => {
                                  const updated = [...imageMap]
                                  updated[idx] = { ...img, instruction: e.target.value || null }
                                  setImageMap(updated)
                                }}
                                placeholder="Ex: 🚚"
                                className="crm-input text-[11px] h-7 flex-1"
                              />
                            )}
                            {img.type === "product" && (
                              <input
                                type="number"
                                value={img.product_index ?? 0}
                                onChange={(e) => {
                                  const updated = [...imageMap]
                                  updated[idx] = { ...img, product_index: parseInt(e.target.value) || 0 }
                                  setImageMap(updated)
                                }}
                                min={0}
                                max={9}
                                placeholder="Índice"
                                className="crm-input text-[11px] h-7 w-[60px]"
                              />
                            )}
                          </div>
                          {isHeroOrCustom && (
                            <div className="space-y-1.5 mt-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">
                                  Prompt de geração (GPT Image 2)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setTestingIdx(idx)}
                                  disabled={!img.image_prompt?.trim()}
                                  className="inline-flex items-center gap-1 h-6 px-2 rounded-[4px] text-[10px] font-medium text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Testar geração com uma loja real"
                                >
                                  <Play className="h-3 w-3" />
                                  Testar geração
                                </button>
                              </div>
                              <textarea
                                rows={4}
                                value={img.image_prompt ?? ""}
                                onChange={(e) => {
                                  const updated = [...imageMap]
                                  updated[idx] = { ...img, image_prompt: e.target.value || null }
                                  setImageMap(updated)
                                }}
                                placeholder={`Descreva exatamente como esta imagem deve ser gerada.\n\nVariáveis disponíveis:\nIdentidade: {brand_name}, {nicho}, {persona}, {diferencial}, {slogan}, {tom_voz}, {posicionamento}\nVisual: {primary_colors}, {secondary_colors}, {color_names}, {font_heading}, {logo_url}\nProdutos: {top_products}, {product_1_name}, ..., {product_5_name}, {top_products_images}\nBloco: {block_purpose}`}
                                className="crm-input w-full font-mono text-[11px]"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {testingIdx !== null && imageMap[testingIdx] && (
              <TestImageDialog
                imagePrompt={imageMap[testingIdx].image_prompt ?? ""}
                onClose={() => setTestingIdx(null)}
              />
            )}
            {isEdit && (
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span className="text-[12px] text-slate-600 dark:text-white/60">{isActive ? "Ativo" : "Inativo"}</span>
                </div>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 text-[12px] text-red-500 hover:text-red-600"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Excluir
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={submitting || !name.trim()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Save className="h-3.5 w-3.5" />
              {isEdit ? "Salvar" : "Criar referência"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ─── Test Image Dialog ─────────────────────────────────────

function TestImageDialog({
  imagePrompt,
  onClose,
}: {
  imagePrompt: string
  onClose: () => void
}) {
  const { data: storesData } = useSWR<{ stores: Array<{ id: string; store_name: string }> }>(
    "/api/admin/stores",
    fetcher,
  )
  const stores = storesData?.stores ?? []
  const [storeId, setStoreId] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ url: string; rendered_prompt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!storeId) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/email-reference-templates/test-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_prompt: imagePrompt, store_id: storeId }),
      })
      const text = await res.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const payload = (data?.data ?? data) as Record<string, unknown>
      if (!res.ok) {
        throw new Error((payload?.error as string) || `HTTP ${res.status}`)
      }
      setResult({
        url: payload.url as string,
        rendered_prompt: payload.rendered_prompt as string,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro na geração")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[600px] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0F1117] rounded-[10px] shadow-2xl border border-black/[0.08] dark:border-white/[0.08] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogPrimitive.Title className="sr-only">Testar geração de imagem</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Testar geração de imagem</h2>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700 dark:text-white/80">
                Loja para teste
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="crm-input w-full"
                disabled={submitting}
              >
                <option value="">Selecione...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            </div>
            <div className="rounded-[6px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
              ⚠️ A geração real custa ~$0.04 e leva ~3 minutos.
            </div>
            {error && (
              <div className="rounded-[6px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            {result && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">
                    Prompt enviado
                  </label>
                  <pre className="text-[11px] font-mono bg-slate-50 dark:bg-white/[0.03] p-2.5 rounded-[4px] max-h-[140px] overflow-y-auto whitespace-pre-wrap">
                    {result.rendered_prompt}
                  </pre>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-1">
                    Imagem gerada
                  </label>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.url} alt="generated" className="w-full rounded-[4px] border border-slate-200 dark:border-white/[0.06]" />
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block">
                    Abrir em nova aba
                  </a>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={submitting || !storeId}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Gerando..." : "Gerar imagem real"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
