"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Store,
  Mail,
  Eye,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { SegmentedTabs, SegmentedTabItem } from "@/components/ui/segmented-tabs"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/lib/hooks/use-toast"
import type {
  ImageMapEntry,
  ImageMapType,
  EmailGenerationSettings,
  EmailReferenceTemplate,
} from "@/types/email-generation"
import type { ListPromptsResult } from "@/lib/services/prompt-management.service"
import type { BlueprintRow } from "@/lib/email-blueprints/types"
import { PromptsWorkspace } from "@/components/agents/prompts-workspace"
import { BlueprintsWorkspace } from "@/components/email-blueprints/blueprints-workspace"
import { ComponentsWorkspace } from "@/components/email-components/components-workspace"
import { OutlinesWorkspace } from "@/components/email-outlines/outlines-workspace"
import { GeneratedInspector } from "@/components/email-generation/generated-inspector"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const FLOW_TYPE_LABELS: Record<string, string> = {
  welcome: "Boas-vindas",
  site_abandoned: "Site abandonado",
  abandoned_cart: "Carrinho abandonado",
  browse_abandonment: "Browse abandonment",
  upsell: "Upsell",
  win_back: "Win-back",
  shipping_stages: "Etapas de envio",
  post_purchase: "Pós-compra",
  custom: "Personalizado",
}

const TABS = [
  "agents",
  "blueprints",
  "outlines",
  "components",
  "generated",
  "settings",
  "references",
  "test",
] as const
type Tab = (typeof TABS)[number]

function parseTab(value: string | null | undefined): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "agents"
}

interface WorkspaceProps {
  prompts: ListPromptsResult
  blueprints: BlueprintRow[]
  initialTab?: Tab
}

export function EmailGenerationWorkspace({
  prompts,
  blueprints,
  initialTab,
}: WorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlTab = useMemo(
    () => parseTab(searchParams?.get("tab") ?? initialTab ?? "agents"),
    [searchParams, initialTab],
  )
  const [tab, setTab] = useState<Tab>(urlTab)

  // Mantém estado e URL em sincronia quando o usuário troca de aba
  const onTabChange = (next: Tab) => {
    setTab(next)
    const sp = new URLSearchParams(searchParams?.toString() ?? "")
    sp.set("tab", next)
    router.replace(`?${sp.toString()}`, { scroll: false })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Geração de Emails"
        description="Prompts dos agentes, blueprints de estrutura, configurações e referências do pipeline AE."
      />

      <SegmentedTabs value={tab} onValueChange={(v) => onTabChange(v as Tab)}>
        <SegmentedTabItem value="agents">Agentes</SegmentedTabItem>
        <SegmentedTabItem value="blueprints">Blueprints</SegmentedTabItem>
        <SegmentedTabItem value="outlines">Estrutura geral</SegmentedTabItem>
        <SegmentedTabItem value="components">Componentes</SegmentedTabItem>
        <SegmentedTabItem value="generated">Geradas</SegmentedTabItem>
        <SegmentedTabItem value="settings">Configurações</SegmentedTabItem>
        <SegmentedTabItem value="references">Referências</SegmentedTabItem>
        <SegmentedTabItem value="test">Testar</SegmentedTabItem>
      </SegmentedTabs>

      {tab === "agents" && <PromptsWorkspace initial={prompts} />}
      {tab === "blueprints" && <BlueprintsWorkspace initial={blueprints} />}
      {tab === "outlines" && <OutlinesWorkspace />}
      {tab === "components" && <ComponentsWorkspace />}
      {tab === "generated" && <GeneratedInspector />}
      {tab === "settings" && <SettingsTab />}
      {tab === "references" && <ReferencesTab />}
      {tab === "test" && <TestTab />}
    </div>
  )
}


// ─── Settings Tab ───────────────────────────────────────────

function SettingsTab() {
  const { data, mutate, isLoading } = useSWR<{ settings: EmailGenerationSettings | null }>(
    "/api/admin/email-generation-settings?org_id=00000000-0000-0000-0000-000000000001",
    fetcher,
  )
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<EmailGenerationSettings>>({})
  const [emailInput, setEmailInput] = useState("")

  const settings = data?.settings
  const merged = {
    auto_trigger: form.auto_trigger ?? settings?.auto_trigger ?? false,
    max_parallel: form.max_parallel ?? settings?.max_parallel ?? 3,
    generate_images: form.generate_images ?? settings?.generate_images ?? true,
    notify_on_error: form.notify_on_error ?? settings?.notify_on_error ?? true,
    notify_on_success: form.notify_on_success ?? settings?.notify_on_success ?? false,
    notify_emails: form.notify_emails ?? settings?.notify_emails ?? [],
  }

  const dirty = Object.keys(form).length > 0

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/email-generation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: "00000000-0000-0000-0000-000000000001",
          ...form,
        }),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      setForm({})
      mutate()
      toast({ title: "Configurações salvas" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao salvar configurações" })
    } finally {
      setSaving(false)
    }
  }

  const addEmail = () => {
    const email = emailInput.trim()
    if (!email || !email.includes("@")) return
    const current = merged.notify_emails
    if (!current.includes(email)) {
      setForm((f) => ({ ...f, notify_emails: [...current, email] }))
    }
    setEmailInput("")
  }

  const removeEmail = (email: string) => {
    setForm((f) => ({
      ...f,
      notify_emails: merged.notify_emails.filter((e) => e !== email),
    }))
  }

  if (isLoading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-[600px] space-y-5">
      <div className="space-y-4 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Comportamento
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Trigger automático</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Iniciar geração automaticamente ao criar emails
            </p>
          </div>
          <Switch
            checked={merged.auto_trigger}
            onCheckedChange={(v) => setForm((f) => ({ ...f, auto_trigger: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Gerar imagens</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Incluir geração de imagens no pipeline
            </p>
          </div>
          <Switch
            checked={merged.generate_images}
            onCheckedChange={(v) => setForm((f) => ({ ...f, generate_images: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Execuções paralelas</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Máximo de agentes rodando simultaneamente
            </p>
          </div>
          <input
            type="number"
            value={merged.max_parallel}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                max_parallel: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)),
              }))
            }
            min={1}
            max={10}
            className="crm-input w-[80px] text-center"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5">
        <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Notificações
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Notificar em erros</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Enviar email quando uma geração falhar
            </p>
          </div>
          <Switch
            checked={merged.notify_on_error}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_on_error: v }))}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-700 dark:text-white/80">Notificar em sucesso</p>
            <p className="text-[11px] text-slate-500 dark:text-white/45">
              Enviar email quando a geração concluir com sucesso
            </p>
          </div>
          <Switch
            checked={merged.notify_on_success}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_on_success: v }))}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[13px] text-slate-700 dark:text-white/80">Emails para notificação</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              placeholder="email@exemplo.com"
              className="crm-input flex-1"
            />
            <button
              type="button"
              onClick={addEmail}
              className="h-8 px-3 rounded-[6px] bg-slate-100 dark:bg-white/[0.06] text-[12px] font-medium text-slate-700 dark:text-white/75 hover:bg-slate-200 dark:hover:bg-white/[0.10]"
            >
              Adicionar
            </button>
          </div>
          {merged.notify_emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {merged.notify_emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60 px-2 py-0.5 rounded-full"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[12px] font-semibold disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar configurações
          </button>
        </div>
      )}
    </div>
  )
}

// ─── References Tab ─────────────────────────────────────────

function ReferencesTab() {
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

// ─── Test Tab ──────────────────────────────────────────────

interface StoreOption {
  id: string
  store_name: string
}

interface FlowOption {
  id: string
  flow_type: string
  name: string
  emails: Array<{
    id: string
    number: number
    name: string
    status: string
    subject: string | null
  }>
}

interface RunStep {
  agent: string
  status: "pending" | "success" | "error" | "skipped" | "running"
  error?: string
  durationMs?: number
  tokens?: number
  cost?: number
}

/**
 * Normaliza qualquer payload de erro (string, Error-like, objeto da API) para
 * texto legível. Evita o clássico "[object Object]" quando a resposta traz o
 * erro como objeto (ex.: { error: { message, code } } ou um PostgrestError).
 */
function errText(x: unknown): string {
  if (x == null) return ""
  if (typeof x === "string") return x
  if (typeof x === "object") {
    const o = x as Record<string, unknown>
    for (const k of ["error", "message", "reason", "failure_reason", "detail"]) {
      if (typeof o[k] === "string") return o[k] as string
    }
    try {
      return JSON.stringify(x)
    } catch {
      return String(x)
    }
  }
  return String(x)
}

function TestTab() {
  const { data: storesData, isLoading: loadingStores } = useSWR<{ stores: StoreOption[] }>(
    "/api/admin/stores",
    fetcher,
  )
  const stores = storesData?.stores ?? []

  const [selectedStoreId, setSelectedStoreId] = useState("")
  const [selectedFlowId, setSelectedFlowId] = useState("")
  const [selectedEmailId, setSelectedEmailId] = useState("")
  const [generating, setGenerating] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [result, setResult] = useState<{
    status: "done" | "error" | "dispatched" | "running"
    error?: string
    message?: string
    batchId?: string
    emailId?: string
    relaxedBrand?: boolean
  } | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])
  const [pollInterval, setPollInterval] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  // ── Preview de vars HTML resolvidas (debug do Master Prompt v2) ─
  const [previewingVars, setPreviewingVars] = useState(false)
  const [previewVars, setPreviewVars] = useState<Record<string, string> | null>(
    null,
  )
  const [previewError, setPreviewError] = useState<string | null>(null)

  const { data: producaoData, isLoading: loadingFlows } = useSWR<{ flows: FlowOption[] }>(
    selectedStoreId ? `/api/admin/stores/${selectedStoreId}/producao` : null,
    fetcher,
  )
  const flows = producaoData?.flows ?? []

  const selectedFlow = flows.find((f) => f.id === selectedFlowId)
  const selectedEmail = selectedFlow?.emails.find((e) => e.id === selectedEmailId)

  const { data: statusData } = useSWR(
    batchId && selectedStoreId
      ? `/api/admin/stores/${selectedStoreId}/generation-status/${batchId}`
      : null,
    fetcher,
    {
      refreshInterval: pollInterval,
      revalidateOnFocus: false,
    },
  )

  const statusInfo = statusData?.data ?? statusData

  useEffect(() => {
    if (statusInfo && pollInterval > 0) {
      const isTerminal =
        statusInfo.status === "done" ||
        statusInfo.status === "error" ||
        statusInfo.email_status === "failed" ||
        statusInfo.email_status === "ready"
      if (isTerminal) {
        setPollInterval(0)
      }
    }
  }, [statusInfo, pollInterval])

  // Detecta inatividade — se o pipeline esta numa fase in-flight (rendering,
  // image_done, qa_running) e nao houve atualizacao ha >3min, mostra warning
  // pro usuario explicando que o watchdog vai limpar em breve.
  const [showStaleWarning, setShowStaleWarning] = useState(false)

  useEffect(() => {
    if (!statusInfo || pollInterval === 0) {
      setShowStaleWarning(false)
      return
    }

    const checkStale = () => {
      const runs = (statusInfo.runs ?? []) as Array<{ created_at?: string }>
      const lastRun = runs[runs.length - 1]
      const lastTs = lastRun?.created_at ?? statusInfo.email_updated_at
      if (!lastTs) {
        setShowStaleWarning(false)
        return
      }
      const ageMs = Date.now() - new Date(lastTs).getTime()
      const isInFlight = ["rendering", "image_done", "qa_running"].includes(
        statusInfo.email_status ?? "",
      )
      setShowStaleWarning(isInFlight && ageMs > 3 * 60 * 1000)
    }

    checkStale()
    const interval = setInterval(checkStale, 30_000)
    return () => clearInterval(interval)
  }, [statusInfo, pollInterval])

  const handleGenerate = async () => {
    if (!selectedStoreId || !selectedFlowId || !selectedEmailId || !selectedFlow || !selectedEmail) return

    setGenerating(true)
    setResult(null)
    setBatchId(null)
    setSteps([
      { agent: "assembler", status: "pending" },
      { agent: "blueprint", status: "pending" },
      { agent: "seed", status: "pending" },
      { agent: "copy", status: "pending" },
      { agent: "image", status: "pending" },
      { agent: "html", status: "pending" },
    ])

    try {
      const res = await fetch(`/api/admin/stores/${selectedStoreId}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId: selectedFlowId,
          emailId: selectedEmailId,
          flowType: selectedFlow.flow_type,
          emailNumber: selectedEmail.number,
        }),
      })

      const text = await res.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(
          res.status === 504 || text.includes("timed out")
            ? "Timeout: a função do servidor expirou (300s). Verifique qual fase travou em /admin/tools/email-generation-logs e tente novamente."
            : `Resposta inválida do servidor (HTTP ${res.status})`,
        )
      }
      const responseData = (parsed?.data ?? parsed) as Record<string, unknown>

      if (!res.ok) {
        throw new Error(errText(responseData?.error) || `HTTP ${res.status}`)
      }

      const respStatus = responseData.status as string
      const isError = respStatus === "error"
      const isDispatched = respStatus === "dispatched"
      const isRunning = respStatus === "running"
      const errMsg =
        responseData.error != null ? errText(responseData.error) : undefined
      setResult({
        status: isError
          ? "error"
          : isDispatched
            ? "dispatched"
            : isRunning
              ? "running"
              : "done",
        error: isError
          ? errMsg || "Falha na geração (sem detalhe retornado)"
          : errMsg,
        message: isDispatched
          ? "Sem copy detectada — disparado ao N8N (Montador → Blueprint → seed → N8N). O render (imagem/HTML/QA) virá depois, após o callback da copy."
          : isRunning
            ? "Montador e Blueprint concluídos. Render (imagem + HTML + QA) rodando em background — esta página atualiza sozinha."
            : undefined,
        batchId: responseData.batchId as string | undefined,
        emailId: responseData.emailId as string | undefined,
        relaxedBrand: responseData.relaxedBrand === true,
      })
      // Polling no caminho síncrono (with_copy) E no novo "running" (phase2
      // em background). Só pula no "dispatched" porque o render lá vem sob
      // outro batch.
      if (responseData.batchId && !isDispatched) {
        setBatchId(responseData.batchId as string)
        setPollInterval(2000)
      }
    } catch (err) {
      setResult({
        status: "error",
        error: err instanceof Error ? err.message : "Erro desconhecido",
      })
    } finally {
      setGenerating(false)
    }
  }

  const handlePreviewVars = async () => {
    if (!selectedStoreId || !selectedEmailId) return
    setPreviewingVars(true)
    setPreviewError(null)
    setPreviewVars(null)
    try {
      const res = await fetch(
        `/api/admin/stores/${selectedStoreId}/preview-html-vars`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailId: selectedEmailId }),
        },
      )
      const text = await res.text()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(`Resposta inválida (HTTP ${res.status})`)
      }
      const data = (parsed?.data ?? parsed) as Record<string, unknown>
      if (!res.ok) {
        throw new Error(errText(data?.error) || `HTTP ${res.status}`)
      }
      setPreviewVars(data.vars as Record<string, string>)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setPreviewingVars(false)
    }
  }

  const agentLabels: Record<string, string> = {
    assembler: "Montador",
    blueprint: "Blueprint (estrutura)",
    seed: "Seed Blocos",
    copy: "Copy (IA)",
    image: "Imagem (IA)",
    html: "HTML (IA)",
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      case "error": return <AlertCircle className="h-4 w-4 text-red-500" />
      case "running": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case "skipped": return <Clock className="h-4 w-4 text-slate-400" />
      default: return <Clock className="h-4 w-4 text-slate-300 dark:text-white/20" />
    }
  }

  return (
    <div className="max-w-[700px] space-y-5">
      <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-slate-700 dark:text-white/80" />
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
            Testar geração de email
          </h3>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-white/45">
          Verifica se o email tem copy. Com copy: Montador → Blueprint → render
          (seed → imagem → HTML). Sem copy: Montador → Blueprint → N8N (a copy é
          gerada e o render vem depois).
        </p>

        <div className="space-y-3">
          {/* Store selector */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
              <Store className="h-3.5 w-3.5" />
              Loja
            </label>
            {loadingStores ? (
              <div className="flex items-center gap-2 text-[12px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando lojas...
              </div>
            ) : (
              <select
                value={selectedStoreId}
                onChange={(e) => {
                  setSelectedStoreId(e.target.value)
                  setSelectedFlowId("")
                  setSelectedEmailId("")
                  setResult(null)
                  setBatchId(null)
                }}
                className="crm-input w-full"
              >
                <option value="">Selecione uma loja...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.store_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Flow selector */}
          {selectedStoreId && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
                <Mail className="h-3.5 w-3.5" />
                Flow
              </label>
              {loadingFlows ? (
                <div className="flex items-center gap-2 text-[12px] text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando flows...
                </div>
              ) : flows.length === 0 ? (
                <p className="text-[12px] text-amber-600 dark:text-amber-400">
                  Nenhum flow encontrado. Inicialize os flows desta loja primeiro.
                </p>
              ) : (
                <select
                  value={selectedFlowId}
                  onChange={(e) => {
                    setSelectedFlowId(e.target.value)
                    setSelectedEmailId("")
                    setResult(null)
                    setBatchId(null)
                  }}
                  className="crm-input w-full"
                >
                  <option value="">Selecione um flow...</option>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {FLOW_TYPE_LABELS[f.flow_type] ?? f.flow_type} — {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Email selector */}
          {selectedFlow && selectedFlow.emails.length > 0 && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
                <Mail className="h-3.5 w-3.5" />
                Email
              </label>
              <select
                value={selectedEmailId}
                onChange={(e) => {
                  setSelectedEmailId(e.target.value)
                  setResult(null)
                  setBatchId(null)
                }}
                className="crm-input w-full"
              >
                <option value="">Selecione um email...</option>
                {selectedFlow.emails.map((e) => (
                  <option key={e.id} value={e.id}>
                    #{e.number} — {e.name} {e.subject ? `(${e.subject})` : ""} [{e.status}]
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Generate + preview vars buttons */}
        <div className="pt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !selectedStoreId || !selectedFlowId || !selectedEmailId}
            className="inline-flex items-center gap-2 h-9 px-5 rounded-[6px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[13px] font-semibold disabled:opacity-40 transition-opacity"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {generating ? "Gerando..." : "Executar geração"}
          </button>
          <button
            type="button"
            onClick={handlePreviewVars}
            disabled={previewingVars || !selectedStoreId || !selectedEmailId}
            title="Mostra as 20 vars que o HTML Agent vai receber, sem invocar o LLM"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-[6px] border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] text-slate-700 dark:text-white/80 text-[13px] font-medium disabled:opacity-40 transition-opacity"
          >
            {previewingVars ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Pré-visualizar vars HTML
          </button>
        </div>
      </div>

      {/* Preview vars panel */}
      {(previewVars || previewError) && (
        <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-700 dark:text-white/80" />
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                Vars resolvidas — HTML Agent v2
              </h3>
              {previewVars && (
                <span className="text-[11px] text-slate-400 dark:text-white/40">
                  {Object.keys(previewVars).length} keys
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewVars(null)
                setPreviewError(null)
              }}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-white/60"
            >
              fechar
            </button>
          </div>
          {previewError ? (
            <div className="flex items-start gap-2 rounded-[4px] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2 text-[12px] text-red-800 dark:text-red-200">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
              {previewVars &&
                Object.entries(previewVars).map(([key, value]) => {
                  const isEmpty = !value || value.trim() === ""
                  const isLong = value.length > 200
                  return (
                    <details
                      key={key}
                      className="rounded-[4px] bg-slate-50 dark:bg-white/[0.03] px-3 py-2"
                      open={!isLong && !isEmpty}
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-[12px]">
                        <code className="font-mono font-semibold text-slate-800 dark:text-white/90">
                          {`{{${key}}}`}
                        </code>
                        <span className="text-[10px] text-slate-400 dark:text-white/35">
                          {isEmpty ? "vazio" : `${value.length} chars`}
                        </span>
                      </summary>
                      <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all text-slate-600 dark:text-white/70 max-h-[300px] overflow-y-auto">
                        {isEmpty ? "(vazio)" : value}
                      </pre>
                    </details>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* Progress / Result */}
      {(result || generating || statusInfo) && (
        <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 space-y-4">
          {/* Status header */}
          <div className="flex items-center gap-2">
            {result?.status === "dispatched" ? (
              <Clock className="h-5 w-5 text-blue-500" />
            ) : statusInfo?.status === "done" || result?.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : statusInfo?.status === "error" || result?.status === "error" ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
            )}
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
              {result?.status === "dispatched"
                ? "Copy disparada ao N8N"
                : statusInfo?.status === "done" || result?.status === "done"
                  ? "Geração concluída"
                  : statusInfo?.status === "error" || result?.status === "error"
                    ? "Erro na geração"
                    : "Gerando email..."}
            </h3>
          </div>

          {/* Banner modo teste tolerante */}
          {result?.relaxedBrand && (
            <div className="rounded-[4px] border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              ℹ️ Modo teste tolerante: brand identity da loja pode estar incompleta. O email gerado pode ficar sem logo ou com cores em default. Confirme a brand antes de promover pro fluxo real.
            </div>
          )}

          {/* Banner geracao travada — watchdog vai limpar em breve */}
          {showStaleWarning && (() => {
            const faseMap: Record<string, string> = {
              rendering: "imagem",
              image_done: "HTML",
              qa_running: "QA",
            }
            const fase = faseMap[statusInfo?.email_status ?? ""] ?? statusInfo?.email_status ?? "atual"
            return (
              <div className="rounded-[4px] border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
                ⚠️ Geração parece travada na fase {fase}. Watchdog vai limpar em alguns minutos. Veja logs em{" "}
                <a
                  href="/admin/tools/email-generation-logs"
                  className="underline font-medium"
                >
                  /admin/tools/email-generation-logs
                </a>
              </div>
            )
          })()}

          {/* Agent steps — default mostra só runs do batch atual.
              Toggle revela histórico (runs de batches anteriores agrupados). */}
          {statusInfo?.runs && (() => {
            const allRuns = (statusInfo.runs ?? []) as Array<{
              agent: string
              status: string
              error_message?: string
              duration_ms?: number
              tokens_input?: number
              tokens_output?: number
              cost_cents?: number
              batch_id?: string
              created_at?: string
            }>
            const currentBatchId =
              (statusInfo as { currentBatchId?: string }).currentBatchId ?? batchId
            const currentRuns = allRuns.filter(
              (r) => !currentBatchId || r.batch_id === currentBatchId,
            )
            const historicalRuns = allRuns.filter(
              (r) => currentBatchId && r.batch_id && r.batch_id !== currentBatchId,
            )
            // Agrupa runs históricos por batch_id (ordem decrescente — mais recente primeiro)
            const historicalByBatch = new Map<string, typeof allRuns>()
            for (const r of historicalRuns) {
              const bid = r.batch_id as string
              if (!historicalByBatch.has(bid)) historicalByBatch.set(bid, [])
              historicalByBatch.get(bid)!.push(r)
            }
            const historicalBatches = Array.from(historicalByBatch.entries()).sort(
              ([, a], [, b]) => {
                const ta = a[0]?.created_at ? Date.parse(a[0].created_at) : 0
                const tb = b[0]?.created_at ? Date.parse(b[0].created_at) : 0
                return tb - ta
              },
            )

            const renderAgentRow = (
              runs: typeof allRuns,
              agent: string,
            ) => {
              const agentRuns = runs.filter((r) => r.agent === agent)
              const latestRun = agentRuns[agentRuns.length - 1]
              const status = latestRun?.status ?? "pending"
              return (
                <div
                  key={agent}
                  className="flex items-center justify-between px-3 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    {statusIcon(status)}
                    <span className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                      {agentLabels[agent] ?? agent}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-white/35">
                    {latestRun?.duration_ms != null && (
                      <span>{(latestRun.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {(latestRun?.tokens_input || latestRun?.tokens_output) && (
                      <span>
                        {((latestRun.tokens_input ?? 0) + (latestRun.tokens_output ?? 0)).toLocaleString()} tokens
                      </span>
                    )}
                    {latestRun?.cost_cents != null && latestRun.cost_cents > 0 && (
                      <span>${(latestRun.cost_cents / 100).toFixed(4)}</span>
                    )}
                    {latestRun?.error_message && (
                      <span className="text-red-500 max-w-[200px] truncate" title={latestRun.error_message}>
                        {latestRun.error_message}
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            const agentKeys = ["assembler", "blueprint", "seed", "copy", "image", "html"] as const

            return (
              <>
                <div className="space-y-1.5">
                  {agentKeys.map((agent) => renderAgentRow(currentRuns, agent))}
                </div>

                {historicalBatches.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowHistory((v) => !v)}
                      className="text-[11px] text-slate-500 hover:text-slate-700 dark:text-white/45 dark:hover:text-white/70 hover:underline"
                    >
                      {showHistory
                        ? "Ocultar histórico de testes anteriores"
                        : `Ver histórico de testes anteriores (${historicalBatches.length})`}
                    </button>
                  </div>
                )}

                {showHistory && historicalBatches.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                    {historicalBatches.map(([bid, batchRuns], idx) => {
                      const firstRun = batchRuns[0]
                      const minutesAgo = firstRun?.created_at
                        ? Math.max(
                            1,
                            Math.round(
                              (Date.now() - Date.parse(firstRun.created_at)) / 60000,
                            ),
                          )
                        : null
                      return (
                        <div key={bid} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-white/45">
                            <span className="font-medium">
                              Anterior #{historicalBatches.length - idx}
                              {minutesAgo != null && ` · ${minutesAgo} min atrás`}
                            </span>
                            <span className="font-mono text-[10px] opacity-60">
                              {bid.slice(0, 8)}
                            </span>
                          </div>
                          {agentKeys.map((agent) => renderAgentRow(batchRuns, agent))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}

          {/* Fallback steps when no status polling data yet */}
          {!statusInfo?.runs && steps.length > 0 && (
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div
                  key={step.agent}
                  className="flex items-center gap-2 px-3 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.03]"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 text-slate-300 animate-spin" />
                  ) : (
                    statusIcon(step.status)
                  )}
                  <span className="text-[12px] font-medium text-slate-700 dark:text-white/80">
                    {agentLabels[step.agent] ?? step.agent}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Info message (caminho sem copy → N8N) */}
          {result?.message && (
            <div className="p-3 rounded-[4px] bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
              <p className="text-[12px] text-blue-700 dark:text-blue-300">
                {result.message}
              </p>
            </div>
          )}

          {/* Error message */}
          {result?.error && (
            <div className="p-3 rounded-[4px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <p className="text-[12px] text-red-700 dark:text-red-400 font-mono break-all">
                {result.error}
              </p>
            </div>
          )}

          {/* Botao "Tentar de novo" — disponivel quando deu erro ou email_status=failed */}
          {(result?.status === "error" || statusInfo?.email_status === "failed") && (
            <div className="pt-1">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !selectedStoreId || !selectedFlowId || !selectedEmailId}
                className="inline-flex items-center gap-2 h-8 px-4 rounded-[6px] border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] text-slate-700 dark:text-white/80 text-[12px] font-medium disabled:opacity-40 transition-opacity"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Tentar de novo
              </button>
            </div>
          )}

          {/* Summary */}
          {statusInfo?.summary && (statusInfo.status === "done" || statusInfo.status === "error") && (
            <div className="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-white/45">
              {statusInfo.summary.totalDuration > 0 && (
                <span>Tempo: {(statusInfo.summary.totalDuration / 1000).toFixed(1)}s</span>
              )}
              {statusInfo.summary.tokensTotal > 0 && (
                <span>Tokens: {statusInfo.summary.tokensTotal.toLocaleString()}</span>
              )}
              {statusInfo.summary.totalCost > 0 && (
                <span>Custo: ${(statusInfo.summary.totalCost / 100).toFixed(4)}</span>
              )}
              {batchId && (
                <a
                  href={`/admin/tools/email-generation-logs?batch=${batchId}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-auto"
                >
                  Ver logs completos
                </a>
              )}
              {selectedStoreId && selectedEmailId && statusInfo?.status === "done" && (
                <a
                  href={`/admin/stores/${selectedStoreId}/producao?email=${selectedEmailId}`}
                  className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                >
                  Ver email gerado
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
