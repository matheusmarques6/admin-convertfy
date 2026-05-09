"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Copy as CopyIcon,
  CheckCircle2,
  Loader2,
  ExternalLink,
  FileText,
  Palette,
  ListChecks,
  Send,
  Code,
  Smartphone,
  Monitor,
  Eye,
  ChevronDown,
} from "lucide-react"
import { ROUTES } from "@/lib/routes"
import { PublicFormView } from "@/components/forms/public-form-view"

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface PipelineLite {
  id: string
  name: string
  color: string | null
  stages: Array<{ id: string; name: string; stage_type: string | null; position?: number }>
}

interface FormField {
  id?: string
  field_type: string
  label: string
  placeholder?: string | null
  description?: string | null
  required: boolean
  position: number
  options?: Array<string | { label: string; value: string }>
  validation?: Record<string, unknown>
  map_to_lead_field?: string | null
}

interface FormTheme {
  mode?: "light" | "dark"
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  bgGradient?: { from: string; to: string; angle?: number } | null
  cardBgColor?: string
  cardBorderColor?: string
  cardShadow?: "none" | "sm" | "md" | "lg"
  cardPadding?: number
  containerWidth?: number
  fieldGap?: number
  inputBgColor?: string
  inputBorderColor?: string
  inputTextColor?: string
  inputPlaceholderColor?: string
  inputRadius?: number
  buttonText?: string
  buttonTextColor?: string
  buttonGradient?: { from: string; to: string; angle?: number } | null
  buttonRadius?: number
  fontFamily?: string
  fontSize?: number
  headingSize?: number
  subheadingSize?: number
  labelColor?: string
  labelSize?: number
  subtitleColor?: string
  borderRadius?: number
  hideTitle?: boolean
  hideLabels?: boolean
  hidePoweredBy?: boolean
  headline?: string
  subheadline?: string
  badge?: string
  badgeColor?: string
}

interface FormDetail {
  form: {
    id: string
    name: string
    slug: string
    description: string | null
    status: "draft" | "published" | "archived"
    theme: FormTheme
    pipeline_id: string | null
    stage_id: string | null
    success_message: string | null
    redirect_url: string | null
    logo_url: string | null
  }
  fields: FormField[]
  submissions: Array<{
    id: string
    status: string
    created_at: string
    lead_id: string | null
    deal_id: string | null
  }>
}

const FIELD_TYPES: Array<{ value: string; label: string }> = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone / WhatsApp" },
  { value: "number", label: "Número" },
  { value: "select", label: "Seleção (dropdown)" },
  { value: "radio", label: "Múltipla escolha (radio)" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Data" },
  { value: "url", label: "URL" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "cep", label: "CEP" },
]

const LEAD_FIELD_MAP: Array<{ value: string | ""; label: string }> = [
  { value: "", label: "Não mapear" },
  { value: "name", label: "Nome do lead" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "company", label: "Empresa" },
  { value: "source", label: "Origem (source)" },
]

const THEME_PRESETS: Array<{
  key: string
  label: string
  description: string
  preview: { bg: string; primary: string; text: string }
  theme: FormTheme
}> = [
  {
    key: "aplicar-diagnostico",
    label: "Aplicar diagnóstico",
    description: "Idêntico ao form da landing Convertfy",
    preview: { bg: "#0B0F19", primary: "#2563EB", text: "#fff" },
    theme: {
      mode: "dark",
      primaryColor: "#2563EB",
      backgroundColor: "#0B0F19",
      textColor: "#FFFFFF",
      cardBgColor: "rgba(255,255,255,0.02)",
      cardBorderColor: "rgba(255,255,255,0.08)",
      cardShadow: "lg",
      containerWidth: 460,
      inputBgColor: "rgba(255,255,255,0.03)",
      inputBorderColor: "rgba(255,255,255,0.08)",
      inputTextColor: "#FFFFFF",
      borderRadius: 8,
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 14,
      headingSize: 24,
      subheadingSize: 13,
      buttonText: "Solicitar diagnóstico gratuito",
      buttonTextColor: "#FFFFFF",
      headline: "Aplicar para diagnóstico",
      subheadline:
        "Analisamos seu e-commerce — no Brasil ou no exterior — e mostramos quanta receita você está deixando na mesa. Sem compromisso.",
      hidePoweredBy: false,
    },
  },
  {
    key: "card-claro-page-transparente",
    label: "Card claro · página transparente",
    description: "Card branco visível, página transparente — pra embedar em P.V.",
    preview: {
      bg: "repeating-conic-gradient(#E5E7EB 0% 25%, transparent 0% 50%) 0 0/14px 14px",
      primary: "#2563EB",
      text: "#0F172A",
    },
    theme: {
      mode: "light",
      primaryColor: "#2563EB",
      backgroundColor: "transparent",
      textColor: "#0F172A",
      cardBgColor: "#FFFFFF",
      cardBorderColor: "rgba(15,23,42,0.08)",
      cardShadow: "md",
      containerWidth: 480,
      inputBgColor: "#F8FAFC",
      inputBorderColor: "rgba(15,23,42,0.10)",
      inputTextColor: "#0F172A",
      borderRadius: 10,
      fontSize: 14,
      headingSize: 24,
      subheadingSize: 14,
      hidePoweredBy: true,
    },
  },
  {
    key: "card-escuro-page-transparente",
    label: "Card escuro · página transparente",
    description: "Card escuro visível, página transparente — pra embedar em P.V.",
    preview: {
      bg: "repeating-conic-gradient(#1F2937 0% 25%, transparent 0% 50%) 0 0/14px 14px",
      primary: "#60A5FA",
      text: "#FFFFFF",
    },
    theme: {
      mode: "dark",
      primaryColor: "#60A5FA",
      backgroundColor: "transparent",
      textColor: "#FFFFFF",
      cardBgColor: "#0F172A",
      cardBorderColor: "rgba(255,255,255,0.08)",
      cardShadow: "lg",
      containerWidth: 480,
      inputBgColor: "rgba(255,255,255,0.06)",
      inputBorderColor: "rgba(255,255,255,0.12)",
      inputTextColor: "#FFFFFF",
      borderRadius: 10,
      fontSize: 14,
      headingSize: 24,
      subheadingSize: 14,
      hidePoweredBy: true,
    },
  },
  {
    key: "tudo-transparente",
    label: "Tudo transparente (avançado)",
    description: "Card e página transparentes — só inputs e botão visíveis.",
    preview: {
      bg: "repeating-conic-gradient(#9CA3AF 0% 25%, transparent 0% 50%) 0 0/14px 14px",
      primary: "#2563EB",
      text: "#0F172A",
    },
    theme: {
      mode: "light",
      primaryColor: "#2563EB",
      backgroundColor: "transparent",
      textColor: "#0F172A",
      cardBgColor: "transparent",
      cardBorderColor: "transparent",
      cardShadow: "none",
      containerWidth: 480,
      inputBgColor: "rgba(0,0,0,0.04)",
      inputBorderColor: "rgba(0,0,0,0.12)",
      inputTextColor: "#0F172A",
      borderRadius: 8,
      fontSize: 14,
      headingSize: 24,
      subheadingSize: 14,
      hidePoweredBy: true,
    },
  },
  {
    key: "aceleradora-gradient",
    label: "Aceleradora gradient",
    description: "Variação com gradiente roxo + badge",
    preview: { bg: "linear-gradient(135deg, #0B0B14, #1E1B4B)", primary: "#A78BFA", text: "#fff" },
    theme: {
      mode: "dark",
      primaryColor: "#7C3AED",
      textColor: "#F1F5F9",
      bgGradient: { from: "#0B0B14", to: "#1E1B4B", angle: 135 },
      buttonGradient: { from: "#6366F1", to: "#A78BFA", angle: 90 },
      cardBgColor: "rgba(20,22,40,0.55)",
      cardBorderColor: "rgba(255,255,255,0.08)",
      cardShadow: "lg",
      containerWidth: 460,
      inputBgColor: "rgba(255,255,255,0.04)",
      inputBorderColor: "rgba(255,255,255,0.10)",
      inputTextColor: "#F1F5F9",
      borderRadius: 10,
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 14,
      headingSize: 30,
      subheadingSize: 14,
      buttonText: "Solicitar diagnóstico gratuito",
      buttonTextColor: "#FFFFFF",
      hidePoweredBy: false,
      badge: "Aceleradora #1 de E-mail Marketing",
      badgeColor: "#A78BFA",
    },
  },
  {
    key: "minimal-light",
    label: "Minimal claro",
    description: "Limpo, fundo branco, ideal pra embed",
    preview: { bg: "#F8FAFC", primary: "#2563EB", text: "#0F172A" },
    theme: {
      mode: "light",
      primaryColor: "#2563EB",
      backgroundColor: "#F8FAFC",
      textColor: "#0F172A",
      cardBgColor: "#FFFFFF",
      cardShadow: "sm",
      borderRadius: 8,
      fontSize: 14,
      headingSize: 24,
      subheadingSize: 14,
    },
  },
  {
    key: "soft-pastel",
    label: "Soft pastel",
    description: "Gradiente rosa-violeta suave",
    preview: { bg: "linear-gradient(135deg, #FCE7F3, #E0E7FF)", primary: "#DB2777", text: "#0F172A" },
    theme: {
      mode: "light",
      primaryColor: "#DB2777",
      bgGradient: { from: "#FCE7F3", to: "#E0E7FF", angle: 135 },
      cardBgColor: "#FFFFFF",
      cardShadow: "sm",
      borderRadius: 14,
      headingSize: 26,
      buttonGradient: { from: "#EC4899", to: "#8B5CF6", angle: 90 },
    },
  },
  {
    key: "premium-dark",
    label: "Premium dark",
    description: "Dark sólido com botão amarelo",
    preview: { bg: "#0A0A0A", primary: "#FBBF24", text: "#fff" },
    theme: {
      mode: "dark",
      primaryColor: "#FBBF24",
      backgroundColor: "#0A0A0A",
      textColor: "#F4F4F5",
      cardBgColor: "#18181B",
      cardBorderColor: "rgba(255,255,255,0.06)",
      cardShadow: "lg",
      borderRadius: 6,
      headingSize: 26,
      buttonTextColor: "#000000",
    },
  },
]

// Tabs
type TabKey = "content" | "style" | "fields" | "after" | "install"
const TABS: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: "content", label: "Conteúdo", icon: FileText },
  { key: "style", label: "Estilo", icon: Palette },
  { key: "fields", label: "Campos", icon: ListChecks },
  { key: "after", label: "Após envio", icon: Send },
  { key: "install", label: "Instalar", icon: Code },
]

// ────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────

export default function FormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data, isLoading, mutate } = useSWR<FormDetail>(
    `/api/crm/forms/${id}`,
    fetcher,
  )
  const { data: pipelinesData } = useSWR<{ pipelines: PipelineLite[] }>(
    "/api/crm/pipelines?scope=sales",
    fetcher,
  )
  const pipelines = pipelinesData?.pipelines ?? []

  // Custom fields da org (entity=lead). Aparecem no dropdown de mapeamento
  // como "Custom: Nome do campo" pra mapear pra crm_leads.custom_fields[key].
  const { data: customFieldsData } = useSWR<{
    fields: Array<{ id: string; key: string; label: string; field_type: string }>
  }>("/api/crm/custom-fields?entity=lead", fetcher)
  const customFields = useMemo(
    () => customFieldsData?.fields ?? [],
    [customFieldsData],
  )

  // Estado dos campos editaveis
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [pipelineId, setPipelineId] = useState("")
  const [stageId, setStageId] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [theme, setTheme] = useState<FormTheme>({})
  const [fields, setFields] = useState<FormField[]>([])

  const [activeTab, setActiveTab] = useState<TabKey>("style")
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop")
  // Fundo simulado do preview (pra testar como o form ficara em diferentes
  // P.V.s antes de embedar). 'auto' adapta ao mode do tema.
  const [previewBg, setPreviewBg] = useState<"auto" | "white" | "gray" | "dark" | "checker">("auto")

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setName(data.form.name)
    setSlug(data.form.slug)
    setDescription(data.form.description ?? "")
    setPipelineId(data.form.pipeline_id ?? "")
    setStageId(data.form.stage_id ?? "")
    setSuccessMessage(data.form.success_message ?? "")
    setRedirectUrl(data.form.redirect_url ?? "")
    setTheme(data.form.theme ?? {})
    setFields(data.fields)
  }, [data])

  const stagesForPipeline =
    pipelines.find((p) => p.id === pipelineId)?.stages ?? []

  const addField = () => {
    setFields((arr) => [
      ...arr,
      {
        field_type: "text",
        label: "Novo campo",
        placeholder: "",
        required: false,
        position: arr.length,
        map_to_lead_field: null,
      },
    ])
  }
  const updateField = (idx: number, patch: Partial<FormField>) =>
    setFields((arr) => arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  const removeField = (idx: number) =>
    setFields((arr) =>
      arr.filter((_, i) => i !== idx).map((f, i) => ({ ...f, position: i })),
    )
  const moveField = (idx: number, dir: "up" | "down") =>
    setFields((arr) => {
      const next = [...arr]
      const swap = dir === "up" ? idx - 1 : idx + 1
      if (swap < 0 || swap >= next.length) return next
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((f, i) => ({ ...f, position: i }))
    })

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/crm/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description: description || null,
          pipeline_id: pipelineId || null,
          stage_id: stageId || null,
          theme,
          success_message: successMessage || null,
          redirect_url: redirectUrl || null,
          fields: fields.map((f, i) => ({ ...f, position: i })),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error?.message || "Erro ao salvar")
        return
      }
      setSavedAt(new Date())
      mutate()
    } finally {
      setSaving(false)
    }
  }, [id, name, slug, description, pipelineId, stageId, theme, successMessage, redirectUrl, fields, mutate])

  const togglePublish = async () => {
    if (!data) return
    const next = data.form.status === "published" ? "draft" : "published"
    await fetch(`/api/crm/forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    mutate()
  }

  // Atalho Cmd/Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  // Payload do preview live (calculado do estado atual sem salvar).
  const previewPayload = useMemo(() => {
    return {
      form: {
        id: id,
        name,
        slug: slug || "preview",
        description: description || null,
        theme,
        logo_url: data?.form.logo_url ?? null,
        success_message: successMessage || null,
        redirect_url: redirectUrl || null,
      },
      fields: fields.map((f, i) => ({
        id: f.id ?? `temp-${i}`,
        field_type: f.field_type,
        label: f.label,
        placeholder: f.placeholder ?? null,
        description: f.description ?? null,
        required: f.required,
        position: i,
        options: f.options ?? [],
        validation: f.validation ?? {},
        map_to_lead_field: f.map_to_lead_field ?? null,
      })),
    }
  }, [id, name, slug, description, theme, data?.form.logo_url, successMessage, redirectUrl, fields])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Formulário não encontrado.
      </div>
    )
  }

  const status = data.form.status
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/forms/${slug}`
      : `/forms/${slug}`

  // ────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────

  return (
    <div className="flex -m-4 md:-m-6 lg:-m-8 h-[calc(100vh-1rem)] md:h-[calc(100vh-1.5rem)] lg:h-[calc(100vh-2rem)] overflow-hidden bg-white dark:bg-[#0F1117]">
      {/* ─── PAINEL ESQUERDO: configuração ─── */}
      <div className="w-[460px] shrink-0 flex flex-col border-r border-black/[0.06] dark:border-white/[0.08]">
        {/* Top bar */}
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <Link
              href={ROUTES.ADMIN.COMERCIAL.FORMS}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Link>
            <StatusBadge status={status} />
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do formulário"
            className="w-full text-[18px] font-semibold leading-tight bg-transparent text-slate-900 dark:text-white outline-none border-0 px-0 focus:ring-0"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45 font-mono truncate">
            /forms/{slug || "..."}
          </p>
        </div>

        {/* Tab nav */}
        <div className="shrink-0 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex">
            {TABS.map((t) => {
              const active = activeTab === t.key
              const Icon = t.icon
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={
                    "flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors border-b-2 " +
                    (active
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                      : "border-transparent text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.03]")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content (scroll) */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "content" && (
            <ContentTab
              name={name}
              setName={setName}
              slug={slug}
              setSlug={setSlug}
              description={description}
              setDescription={setDescription}
              theme={theme}
              setTheme={setTheme}
            />
          )}
          {activeTab === "style" && (
            <StyleTab theme={theme} setTheme={setTheme} />
          )}
          {activeTab === "fields" && (
            <FieldsTab
              fields={fields}
              customFields={customFields}
              addField={addField}
              updateField={updateField}
              removeField={removeField}
              moveField={moveField}
            />
          )}
          {activeTab === "after" && (
            <AfterTab
              pipelines={pipelines}
              stagesForPipeline={stagesForPipeline}
              pipelineId={pipelineId}
              setPipelineId={(v) => {
                setPipelineId(v)
                setStageId("")
              }}
              stageId={stageId}
              setStageId={setStageId}
              successMessage={successMessage}
              setSuccessMessage={setSuccessMessage}
              redirectUrl={redirectUrl}
              setRedirectUrl={setRedirectUrl}
            />
          )}
          {activeTab === "install" && (
            <InstallTab
              publicUrl={publicUrl}
              status={status}
              copied={copied}
              setCopied={setCopied}
              name={name}
            />
          )}
        </div>

        {/* Footer com ações */}
        <div className="shrink-0 px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02] flex items-center justify-between gap-2">
          <div className="text-[10px] text-slate-500 dark:text-white/45 truncate">
            {error ? (
              <span className="text-red-600 dark:text-red-400">{error}</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Salvo {savedAt.toLocaleTimeString("pt-BR")}
              </span>
            ) : (
              <span>Cmd/Ctrl + S para salvar</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePublish}
              className="h-8 px-3 rounded-[6px] text-[11px] font-medium text-slate-700 dark:text-white/80 border border-black/[0.08] dark:border-white/[0.10] hover:bg-white dark:hover:bg-white/[0.06] transition-colors"
            >
              {status === "published" ? "Despublicar" : "Publicar"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] text-[11px] font-semibold text-white bg-[#1F1F1F] hover:bg-black dark:bg-white dark:text-black dark:hover:bg-white/90 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* ─── PAINEL DIREITO: preview live ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-100 dark:bg-[#0A0B12]">
        {/* Toolbar */}
        <div className="shrink-0 h-12 px-4 flex items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#0F1117]">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-white/55 min-w-0">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Preview ao vivo</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Toggle de fundo simulado */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-slate-400 dark:text-white/45 uppercase tracking-wide">
                Fundo
              </span>
              <div className="inline-flex items-center gap-0.5 rounded-[6px] bg-slate-100 dark:bg-white/[0.04] p-0.5">
                {(
                  [
                    { key: "auto", label: "Auto", swatch: null },
                    { key: "white", label: "Claro", swatch: "#FFFFFF" },
                    { key: "gray", label: "Cinza", swatch: "#E5E7EB" },
                    { key: "dark", label: "Escuro", swatch: "#0B0F19" },
                    { key: "checker", label: "Transparente", swatch: "checker" },
                  ] as const
                ).map((b) => {
                  const active = previewBg === b.key
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setPreviewBg(b.key)}
                      title={b.label}
                      className={
                        "inline-flex items-center justify-center h-6 px-1.5 rounded-[4px] gap-1 " +
                        (active
                          ? "bg-white dark:bg-[#1A1D27] shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-slate-900 dark:text-white"
                          : "text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white")
                      }
                      aria-label={`Fundo ${b.label}`}
                    >
                      {b.swatch === "checker" ? (
                        <span
                          className="h-3 w-3 rounded-[2px] border border-slate-300 dark:border-white/15"
                          style={{
                            background:
                              "repeating-conic-gradient(#D1D5DB 0% 25%, transparent 0% 50%) 0 0/6px 6px",
                          }}
                          aria-hidden
                        />
                      ) : b.swatch ? (
                        <span
                          className="h-3 w-3 rounded-[2px] border border-slate-300 dark:border-white/15"
                          style={{ background: b.swatch }}
                          aria-hidden
                        />
                      ) : null}
                      <span className="text-[10px] font-medium">{b.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {status === "published" && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Abrir publicado <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <div className="inline-flex items-center gap-0.5 rounded-[6px] bg-slate-100 dark:bg-white/[0.04] p-0.5">
              {(
                [
                  { key: "desktop", label: "Desktop", icon: Monitor },
                  { key: "mobile", label: "Mobile", icon: Smartphone },
                ] as const
              ).map((m) => {
                const active = previewMode === m.key
                const Icon = m.icon
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPreviewMode(m.key)}
                    className={
                      "inline-flex items-center justify-center h-6 w-7 rounded-[4px] " +
                      (active
                        ? "bg-white dark:bg-[#1A1D27] shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-slate-900 dark:text-white"
                        : "text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white")
                    }
                    aria-label={m.label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Preview frame com fundo simulado pra simular onde o form ficara */}
        <div
          className="flex-1 overflow-auto transition-colors"
          style={{
            background: (() => {
              // 'auto': adapta ao mode do tema (dark form -> dark bg, light form -> white bg).
              // Garante que dark mode + transparent nao fique invisivel no preview.
              if (previewBg === "auto") {
                return theme.mode === "dark" ? "#0B0F19" : "#F8FAFC"
              }
              if (previewBg === "white") return "#FFFFFF"
              if (previewBg === "gray") return "#E5E7EB"
              if (previewBg === "dark") return "#0B0F19"
              // checker: padrao xadrez universal pra "transparente"
              return "repeating-conic-gradient(#D1D5DB 0% 25%, transparent 0% 50%) 0 0/16px 16px"
            })(),
          }}
        >
          <div className="min-h-full flex items-start justify-center p-6 md:p-10">
            <div
              className={
                "transition-all duration-200 " +
                (previewMode === "mobile"
                  ? "w-[380px] rounded-[24px] overflow-hidden border border-slate-300/40 dark:border-white/10 shadow-[0_24px_48px_rgba(0,0,0,0.18)]"
                  : "w-full max-w-[680px] rounded-[8px] overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.10)]")
              }
            >
              {/* Renderiza o form publico em modo EMBED (mesma forma que
                  ficara em qualquer landing). Mostrar embed por default
                  garante que o que o usuario ve aqui e o que o visitante
                  vera quando o form for embedado na pagina de vendas. */}
              <PublicFormView
                slug={slug || "preview"}
                payload={previewPayload}
                utm={{
                  utm_source: null,
                  utm_medium: null,
                  utm_campaign: null,
                  utm_term: null,
                  utm_content: null,
                }}
                preview
                embed
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Tabs
// ────────────────────────────────────────────────────────────────────

function ContentTab({
  name,
  setName,
  slug,
  setSlug,
  description,
  setDescription,
  theme,
  setTheme,
}: {
  name: string
  setName: (v: string) => void
  slug: string
  setSlug: (v: string) => void
  description: string
  setDescription: (v: string) => void
  theme: FormTheme
  setTheme: (fn: FormTheme | ((t: FormTheme) => FormTheme)) => void
}) {
  return (
    <Stack>
      <SectionTitle title="Identificação" hint="Para encontrar o form no admin." />
      <Field label="Nome do formulário">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="crm-input w-full"
        />
      </Field>
      <Field
        label="Slug (URL pública)"
        hint="Apenas letras minúsculas, números e hífen."
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-500 dark:text-white/45 font-mono shrink-0">
            /forms/
          </span>
          <input
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-")
                  .replace(/-+/g, "-"),
              )
            }
            className="crm-input flex-1 font-mono text-[12px]"
          />
        </div>
      </Field>
      <Field
        label="Descrição interna"
        hint="Visível apenas para o time. Não aparece no formulário público."
      >
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="crm-input w-full"
          placeholder="Notas internas sobre esse form."
        />
      </Field>

      <Divider />

      <SectionTitle
        title="Conteúdo do form público"
        hint="O que o visitante vê na página."
      />
      <Field
        label="Badge (chip pequeno acima do título)"
        hint="Opcional. Ex: 'Aceleradora #1'"
      >
        <input
          type="text"
          value={theme.badge ?? ""}
          onChange={(e) => setTheme((t) => ({ ...t, badge: e.target.value || undefined }))}
          className="crm-input w-full"
          placeholder="Aceleradora #1 de E-mail Marketing"
        />
      </Field>
      <Field label="Headline (título grande)">
        <input
          type="text"
          value={theme.headline ?? ""}
          onChange={(e) => setTheme((t) => ({ ...t, headline: e.target.value }))}
          className="crm-input w-full"
          placeholder={name}
        />
      </Field>
      <Field label="Subtítulo">
        <input
          type="text"
          value={theme.subheadline ?? ""}
          onChange={(e) => setTheme((t) => ({ ...t, subheadline: e.target.value }))}
          className="crm-input w-full"
          placeholder="Descreva em uma linha por que vale preencher."
        />
      </Field>
      <Field label="Texto do botão de envio">
        <input
          type="text"
          value={theme.buttonText ?? "Enviar"}
          onChange={(e) => setTheme((t) => ({ ...t, buttonText: e.target.value }))}
          className="crm-input w-full"
        />
      </Field>
    </Stack>
  )
}

function StyleTab({
  theme,
  setTheme,
}: {
  theme: FormTheme
  setTheme: (fn: FormTheme | ((t: FormTheme) => FormTheme)) => void
}) {
  const dark = theme.mode === "dark"
  const defaultText = dark ? "#F1F5F9" : "#0F172A"
  return (
    <Stack>
      {/* ── Templates ── */}
      <SectionTitle
        title="Templates"
        hint="Aplica um conjunto pronto. Você pode editar tudo depois."
      />
      <div className="grid grid-cols-2 gap-2">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setTheme(p.theme)}
            className="group text-left rounded-[8px] overflow-hidden border border-black/[0.08] dark:border-white/[0.10] hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-[0_4px_16px_rgba(37,99,235,0.18)] transition-all"
          >
            <div
              className="aspect-[16/9] flex items-center justify-center px-3"
              style={{ background: p.preview.bg }}
            >
              <div className="space-y-1.5">
                <div
                  className="h-1.5 w-12 rounded-full"
                  style={{ background: p.preview.text, opacity: 0.4 }}
                />
                <div
                  className="h-2 w-20 rounded-full"
                  style={{ background: p.preview.text, opacity: 0.7 }}
                />
                <div
                  className="h-3 w-20 rounded-[4px] mt-1"
                  style={{ background: p.preview.primary }}
                />
              </div>
            </div>
            <div className="px-2.5 py-2 bg-white dark:bg-[#0F1117]">
              <div className="text-[12px] font-semibold text-slate-900 dark:text-white">
                {p.label}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-white/45 leading-tight mt-0.5">
                {p.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      <Divider />

      {/* ── Modo + Cor primaria ── */}
      <SectionTitle
        title="Base"
        hint="Modo claro ou escuro. A cor primária controla botão, foco e detalhes."
      />
      <Field label="Modo">
        <ToggleGroup
          value={theme.mode ?? "light"}
          onChange={(v) => setTheme((t) => ({ ...t, mode: v }))}
          options={[
            { value: "light", label: "Claro" },
            { value: "dark", label: "Escuro" },
          ]}
        />
      </Field>
      <Field label="Cor primária">
        <ColorRow
          value={theme.primaryColor ?? "#2563EB"}
          onChange={(v) => setTheme((t) => ({ ...t, primaryColor: v }))}
        />
      </Field>

      <Divider />

      {/* ── Card do formulario ── */}
      <SectionTitle
        title="Card do formulário"
        hint="A caixa do form é o que aparece embedado. Tudo é configurável."
      />
      <Field label="Fundo do card">
        <ToggleGroup
          value={
            theme.cardBgColor === "transparent" ? "transparent" : "solid"
          }
          onChange={(v) =>
            setTheme((t) => ({
              ...t,
              cardBgColor:
                v === "transparent"
                  ? "transparent"
                  : t.cardBgColor && t.cardBgColor !== "transparent"
                    ? t.cardBgColor
                    : t.mode === "dark"
                      ? "#0F172A"
                      : "#FFFFFF",
            }))
          }
          options={[
            { value: "solid", label: "Sólido (visível)" },
            { value: "transparent", label: "Sem fundo" },
          ]}
        />
        {theme.cardBgColor !== "transparent" && (
          <div className="mt-2">
            <ColorRow
              value={
                theme.cardBgColor ?? (theme.mode === "dark" ? "#0F172A" : "#FFFFFF")
              }
              onChange={(v) => setTheme((t) => ({ ...t, cardBgColor: v }))}
            />
          </div>
        )}
      </Field>
      <Field label="Borda do card">
        <ToggleGroup
          value={
            theme.cardBorderColor === "transparent" ? "none" : "visible"
          }
          onChange={(v) =>
            setTheme((t) => ({
              ...t,
              cardBorderColor:
                v === "none"
                  ? "transparent"
                  : t.cardBorderColor && t.cardBorderColor !== "transparent"
                    ? t.cardBorderColor
                    : t.mode === "dark"
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(15,23,42,0.10)",
            }))
          }
          options={[
            { value: "visible", label: "Visível" },
            { value: "none", label: "Sem borda" },
          ]}
        />
        {theme.cardBorderColor !== "transparent" && (
          <div className="mt-2">
            <ColorRow
              value={
                theme.cardBorderColor ??
                (theme.mode === "dark"
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(15,23,42,0.10)")
              }
              onChange={(v) => setTheme((t) => ({ ...t, cardBorderColor: v }))}
            />
          </div>
        )}
      </Field>
      <Field label="Sombra do card">
        <ToggleGroup
          value={theme.cardShadow ?? "sm"}
          onChange={(v) => setTheme((t) => ({ ...t, cardShadow: v }))}
          options={[
            { value: "none", label: "Nenhuma" },
            { value: "sm", label: "Leve" },
            { value: "md", label: "Média" },
            { value: "lg", label: "Forte" },
          ]}
        />
      </Field>
      <Field label="Padding interno (px)">
        <NumberRow
          value={theme.cardPadding ?? 28}
          onChange={(v) => setTheme((t) => ({ ...t, cardPadding: v }))}
          min={0}
          max={64}
          suffix="px"
        />
      </Field>
      <Field label="Largura máxima do card (px)">
        <NumberRow
          value={theme.containerWidth ?? 480}
          onChange={(v) => setTheme((t) => ({ ...t, containerWidth: v }))}
          min={320}
          max={720}
          suffix="px"
        />
      </Field>
      <Field label="Cantos arredondados">
        <NumberRow
          value={theme.borderRadius ?? 8}
          onChange={(v) => setTheme((t) => ({ ...t, borderRadius: v }))}
          min={0}
          max={24}
          suffix="px"
        />
      </Field>
      <Field label="Espaço entre campos (px)">
        <NumberRow
          value={theme.fieldGap ?? 14}
          onChange={(v) => setTheme((t) => ({ ...t, fieldGap: v }))}
          min={4}
          max={32}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Texto e cores ── */}
      <SectionTitle
        title="Texto e cores"
        hint="Controle individual de cada peça de texto do form."
      />
      <Field label="Cor do texto (geral)">
        <ColorRow
          value={theme.textColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, textColor: v }))}
        />
      </Field>
      <Field label="Cor do subtítulo">
        <ColorRow
          value={theme.subtitleColor ?? theme.textColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, subtitleColor: v }))}
        />
      </Field>
      <Field label="Cor das labels">
        <ColorRow
          value={theme.labelColor ?? theme.textColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, labelColor: v }))}
        />
      </Field>
      <Field label="Tamanho do título grande">
        <NumberRow
          value={theme.headingSize ?? 28}
          onChange={(v) => setTheme((t) => ({ ...t, headingSize: v }))}
          min={16}
          max={56}
          suffix="px"
        />
      </Field>
      <Field label="Tamanho do subtítulo">
        <NumberRow
          value={theme.subheadingSize ?? 14}
          onChange={(v) => setTheme((t) => ({ ...t, subheadingSize: v }))}
          min={10}
          max={20}
          suffix="px"
        />
      </Field>
      <Field label="Tamanho da label">
        <NumberRow
          value={theme.labelSize ?? 12}
          onChange={(v) => setTheme((t) => ({ ...t, labelSize: v }))}
          min={10}
          max={18}
          suffix="px"
        />
      </Field>
      <Field label="Tamanho de texto base (inputs)">
        <NumberRow
          value={theme.fontSize ?? 14}
          onChange={(v) => setTheme((t) => ({ ...t, fontSize: v }))}
          min={11}
          max={18}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Inputs ── */}
      <SectionTitle
        title="Inputs"
        hint="Aparência dos campos preenchíveis."
      />
      <Field label="Fundo do input">
        <ColorRow
          value={
            theme.inputBgColor ??
            (dark ? "rgba(255,255,255,0.04)" : "#F8FAFC")
          }
          onChange={(v) => setTheme((t) => ({ ...t, inputBgColor: v }))}
        />
      </Field>
      <Field label="Borda do input">
        <ColorRow
          value={
            theme.inputBorderColor ??
            (dark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)")
          }
          onChange={(v) => setTheme((t) => ({ ...t, inputBorderColor: v }))}
        />
      </Field>
      <Field label="Cor do texto digitado">
        <ColorRow
          value={theme.inputTextColor ?? defaultText}
          onChange={(v) => setTheme((t) => ({ ...t, inputTextColor: v }))}
        />
      </Field>
      <Field label="Cor do placeholder">
        <ColorRow
          value={
            theme.inputPlaceholderColor ??
            (dark ? "rgba(241,245,249,0.40)" : "rgba(15,23,42,0.40)")
          }
          onChange={(v) =>
            setTheme((t) => ({ ...t, inputPlaceholderColor: v }))
          }
        />
      </Field>
      <Field label="Cantos do input">
        <NumberRow
          value={
            theme.inputRadius ??
            Math.max(4, Math.round((theme.borderRadius ?? 8) * 0.75))
          }
          onChange={(v) => setTheme((t) => ({ ...t, inputRadius: v }))}
          min={0}
          max={20}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Botão ── */}
      <SectionTitle title="Botão" />
      <Field label="Estilo">
        <ToggleGroup
          value={theme.buttonGradient ? "gradient" : "solid"}
          onChange={(v) =>
            setTheme((t) =>
              v === "gradient"
                ? {
                    ...t,
                    buttonGradient: t.buttonGradient ?? {
                      from: t.primaryColor ?? "#6366F1",
                      to: "#A78BFA",
                      angle: 90,
                    },
                  }
                : { ...t, buttonGradient: null },
            )
          }
          options={[
            { value: "solid", label: "Sólido (cor primária)" },
            { value: "gradient", label: "Gradiente" },
          ]}
        />
        {theme.buttonGradient && (
          <div className="mt-2 space-y-1.5">
            <ColorRow
              label="De"
              value={theme.buttonGradient.from}
              onChange={(v) =>
                setTheme((t) => ({
                  ...t,
                  buttonGradient: {
                    ...(t.buttonGradient ?? { from: v, to: v }),
                    from: v,
                  },
                }))
              }
            />
            <ColorRow
              label="Para"
              value={theme.buttonGradient.to}
              onChange={(v) =>
                setTheme((t) => ({
                  ...t,
                  buttonGradient: {
                    ...(t.buttonGradient ?? { from: v, to: v }),
                    to: v,
                  },
                }))
              }
            />
          </div>
        )}
      </Field>
      <Field label="Cor do texto do botão">
        <ColorRow
          value={theme.buttonTextColor ?? "#FFFFFF"}
          onChange={(v) => setTheme((t) => ({ ...t, buttonTextColor: v }))}
        />
      </Field>
      <Field label="Cantos do botão">
        <NumberRow
          value={theme.buttonRadius ?? theme.borderRadius ?? 8}
          onChange={(v) => setTheme((t) => ({ ...t, buttonRadius: v }))}
          min={0}
          max={32}
          suffix="px"
        />
      </Field>

      <Divider />

      {/* ── Opções ── */}
      <SectionTitle title="Opções" />
      <CheckRow
        label="Esconder título e subtítulo"
        checked={!!theme.hideTitle}
        onChange={(v) => setTheme((t) => ({ ...t, hideTitle: v }))}
      />
      <CheckRow
        label="Esconder labels dos campos (apenas placeholders)"
        checked={!!theme.hideLabels}
        onChange={(v) => setTheme((t) => ({ ...t, hideLabels: v }))}
      />
      <CheckRow
        label='Esconder "Powered by Convertfy"'
        checked={!!theme.hidePoweredBy}
        onChange={(v) => setTheme((t) => ({ ...t, hidePoweredBy: v }))}
      />

      <Divider />

      {/* ── Página standalone (avancado) ── */}
      <SectionTitle
        title="Página standalone (avançado)"
        hint="Só afeta a URL pública direta /forms/[slug]. Quando o form é embedado em outra página, o fundo é da página host."
      />
      <Field label="Fundo da página standalone">
        <ToggleGroup
          value={theme.bgGradient ? "gradient" : "solid"}
          onChange={(v) =>
            setTheme((t) =>
              v === "gradient"
                ? {
                    ...t,
                    bgGradient: t.bgGradient ?? {
                      from: t.backgroundColor ?? "#0B0B14",
                      to: "#1E1B4B",
                      angle: 135,
                    },
                  }
                : { ...t, bgGradient: null },
            )
          }
          options={[
            { value: "solid", label: "Cor sólida" },
            { value: "gradient", label: "Gradiente" },
          ]}
        />
        <div className="mt-2 space-y-1.5">
          {theme.bgGradient ? (
            <>
              <ColorRow
                label="De"
                value={theme.bgGradient.from}
                onChange={(v) =>
                  setTheme((t) => ({
                    ...t,
                    bgGradient: {
                      ...(t.bgGradient ?? { from: v, to: v }),
                      from: v,
                    },
                  }))
                }
              />
              <ColorRow
                label="Para"
                value={theme.bgGradient.to}
                onChange={(v) =>
                  setTheme((t) => ({
                    ...t,
                    bgGradient: {
                      ...(t.bgGradient ?? { from: v, to: v }),
                      to: v,
                    },
                  }))
                }
              />
              <NumberRow
                label="Ângulo"
                value={theme.bgGradient.angle ?? 135}
                onChange={(v) =>
                  setTheme((t) => ({
                    ...t,
                    bgGradient: {
                      ...(t.bgGradient ?? { from: "#000", to: "#000" }),
                      angle: v,
                    },
                  }))
                }
                min={0}
                max={360}
                suffix="°"
              />
            </>
          ) : (
            <ColorRow
              value={theme.backgroundColor ?? (dark ? "#0B0F19" : "#FFFFFF")}
              onChange={(v) => setTheme((t) => ({ ...t, backgroundColor: v }))}
            />
          )}
        </div>
      </Field>

      <Divider />

      <button
        type="button"
        onClick={() => setTheme({})}
        className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline self-start"
      >
        Resetar tema (volta ao padrão)
      </button>
    </Stack>
  )
}

function FieldsTab({
  fields,
  customFields,
  addField,
  updateField,
  removeField,
  moveField,
}: {
  fields: FormField[]
  customFields: Array<{ id: string; key: string; label: string; field_type: string }>
  addField: () => void
  updateField: (idx: number, patch: Partial<FormField>) => void
  removeField: (idx: number) => void
  moveField: (idx: number, dir: "up" | "down") => void
}) {
  return (
    <Stack>
      <div className="flex items-center justify-between">
        <SectionTitle
          title={`Campos (${fields.length})`}
          hint="Arraste pra reordenar — em breve."
        />
        <button
          type="button"
          onClick={addField}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[5px] bg-[#1F1F1F] dark:bg-white text-white dark:text-black text-[11px] font-semibold"
        >
          <Plus className="h-3 w-3" />
          Adicionar
        </button>
      </div>

      {fields.length === 0 && (
        <div className="rounded-[6px] border border-dashed border-slate-300 dark:border-white/[0.10] p-6 text-center">
          <p className="text-[12px] font-medium text-slate-700 dark:text-white/75">
            Nenhum campo ainda
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45">
            Adicione pelo menos 1 campo pra coletar dados.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {fields.map((field, idx) => (
          <FieldEditor
            key={field.id ?? `new-${idx}`}
            field={field}
            customFields={customFields}
            onChange={(patch) => updateField(idx, patch)}
            onRemove={() => removeField(idx)}
            onMoveUp={idx > 0 ? () => moveField(idx, "up") : undefined}
            onMoveDown={idx < fields.length - 1 ? () => moveField(idx, "down") : undefined}
          />
        ))}
      </div>
    </Stack>
  )
}

function AfterTab({
  pipelines,
  stagesForPipeline,
  pipelineId,
  setPipelineId,
  stageId,
  setStageId,
  successMessage,
  setSuccessMessage,
  redirectUrl,
  setRedirectUrl,
}: {
  pipelines: PipelineLite[]
  stagesForPipeline: Array<{ id: string; name: string }>
  pipelineId: string
  setPipelineId: (v: string) => void
  stageId: string
  setStageId: (v: string) => void
  successMessage: string
  setSuccessMessage: (v: string) => void
  redirectUrl: string
  setRedirectUrl: (v: string) => void
}) {
  return (
    <Stack>
      <SectionTitle
        title="Pipeline e automação"
        hint="Cada submissão cria um lead automaticamente. Se selecionar pipeline, também cria um deal nesta etapa."
      />
      <Field label="Pipeline (opcional)">
        <div className="relative">
          <select
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="crm-input w-full appearance-none pr-8"
          >
            <option value="">Apenas criar lead (sem deal)</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        </div>
      </Field>
      {pipelineId && (
        <Field label="Etapa inicial">
          <div className="relative">
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="crm-input w-full appearance-none pr-8"
            >
              <option value="">Primeira etapa do pipeline</option>
              {stagesForPipeline.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
        </Field>
      )}

      <Divider />

      <SectionTitle title="O que mostrar após o envio" />
      <Field
        label="Mensagem de sucesso"
        hint="Aparece dentro do card depois do envio."
      >
        <textarea
          rows={2}
          value={successMessage}
          onChange={(e) => setSuccessMessage(e.target.value)}
          className="crm-input w-full"
          placeholder="Recebemos sua resposta! Entraremos em contato."
        />
      </Field>
      <Field
        label="Ou redirecionar pra URL"
        hint="Se preenchido, ignora a mensagem acima."
      >
        <input
          type="url"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          className="crm-input w-full font-mono text-[12px]"
          placeholder="https://"
        />
      </Field>
    </Stack>
  )
}

function InstallTab({
  publicUrl,
  status,
  copied,
  setCopied,
  name,
}: {
  publicUrl: string
  status: "draft" | "published" | "archived"
  copied: string | null
  setCopied: (v: string | null) => void
  name: string
}) {
  // ?embed=1 faz o /forms/[slug] renderizar SO o card (sem min-h-screen,
  // sem padding de pagina). Ideal pra iframe — herda altura/largura natural
  // do conteudo e o background do iframe pai.
  const embedUrl = `${publicUrl}?embed=1`
  const iframe = `<iframe src="${embedUrl}" style="border:0;background:transparent;width:100%;min-height:600px" title="${name}" allowtransparency="true"></iframe>`
  const buttonLink = `<a href="${publicUrl}" target="_blank" rel="noopener noreferrer">Abrir formulário</a>`

  const copy = (label: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1600)
  }

  return (
    <Stack>
      {status !== "published" && (
        <div className="rounded-[6px] border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed">
          ⚠️ Este formulário ainda está em <b>rascunho</b>. Visitantes ainda não conseguem acessar.
          Clique em <b>Publicar</b> no rodapé pra liberar.
        </div>
      )}

      <SectionTitle title="Passo 1 — Compartilhar link direto" hint="A forma mais simples." />
      <CopyBox
        label="URL pública"
        value={publicUrl}
        copied={copied === "url"}
        onCopy={() => copy("url", publicUrl)}
      />
      <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
        Cole esse link em emails, redes sociais ou em qualquer botão da sua página de vendas.
        Exemplo de uso em HTML:
      </p>
      <CopyBox
        value={buttonLink}
        copied={copied === "button"}
        onCopy={() => copy("button", buttonLink)}
        mono
      />

      <Divider />

      <SectionTitle
        title="Passo 2 — Embedar no seu site"
        hint="Cole esse código onde quiser que o form apareça."
      />
      <CopyBox
        label="HTML iframe"
        value={iframe}
        copied={copied === "iframe"}
        onCopy={() => copy("iframe", iframe)}
        mono
      />
      <p className="text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
        O form se ajusta à largura do container. Pra fixar uma altura, edite{" "}
        <code className="font-mono">min-height</code> no estilo.
      </p>

      <Divider />

      <SectionTitle
        title="Passo 3 — Como instalar na sua página de vendas"
        hint="Guia rápido por plataforma."
      />
      <PlatformGuide
        platforms={[
          {
            name: "WordPress",
            steps: [
              "Edite a página onde quer o form",
              'Adicione um bloco "HTML personalizado" (Custom HTML)',
              "Cole o código do iframe acima",
              "Salvar / atualizar",
            ],
          },
          {
            name: "Shopify",
            steps: [
              "Online Store → Pages → escolha a página",
              'Clique no ícone "Mostrar HTML" (<>)',
              "Cole o iframe onde quiser",
              "Salvar",
            ],
          },
          {
            name: "Webflow / Wix / Squarespace",
            steps: [
              "Adicione um elemento Custom Code / Embed",
              "Cole o iframe",
              "Publique a página",
            ],
          },
          {
            name: "Site customizado (HTML/Next.js)",
            steps: [
              "Cole o iframe diretamente no JSX/HTML",
              'Em Next.js, considere usar dangerouslySetInnerHTML ou um <iframe /> nativo',
            ],
          },
        ]}
      />
    </Stack>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sub-componentes / helpers
// ────────────────────────────────────────────────────────────────────

function StatusBadge({
  status,
}: {
  status: "draft" | "published" | "archived"
}) {
  const map = {
    published: {
      label: "Publicado",
      cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    draft: {
      label: "Rascunho",
      cls: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/65",
    },
    archived: {
      label: "Arquivado",
      cls: "bg-slate-100 text-slate-500 dark:bg-white/[0.04] dark:text-white/45",
    },
  } as const
  const m = map[status]
  return (
    <span
      className={
        "inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-[3px] " + m.cls
      }
    >
      {m.label}
    </span>
  )
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-4 space-y-4">{children}</div>
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900 dark:text-white/90">
        {title}
      </h3>
      {hint && (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/45 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] -mx-5" />
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-slate-700 dark:text-white/75">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-white/45 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[6px] bg-slate-100 dark:bg-white/[0.04] p-0.5">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              "h-7 px-3 rounded-[4px] text-[11px] font-medium transition-colors " +
              (active
                ? "bg-white dark:bg-[#1A1D27] text-slate-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white")
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[10px] text-slate-500 dark:text-white/45 w-10 shrink-0">
          {label}
        </span>
      )}
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded-[4px] border border-slate-200 dark:border-white/[0.10] cursor-pointer p-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="crm-input flex-1 font-mono text-[11px]"
        style={{ height: 28 }}
      />
    </div>
  )
}

function NumberRow({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-[10px] text-slate-500 dark:text-white/45 shrink-0 w-12">
          {label}
        </span>
      )}
      {min != null && max != null && (
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (Number.isFinite(n)) onChange(n)
          }}
          className="flex-1"
        />
      )}
      <div className="relative w-[68px] shrink-0">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            if (Number.isFinite(n)) onChange(n)
          }}
          className="crm-input w-full font-mono text-[11px]"
          style={{ height: 28, paddingRight: suffix ? 22 : undefined }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-white/40">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 text-[12px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer mt-0.5"
      />
      <span className="text-slate-700 dark:text-white/75">{label}</span>
    </label>
  )
}

function CopyBox({
  label,
  value,
  copied,
  onCopy,
  mono = false,
}: {
  label?: string
  value: string
  copied: boolean
  onCopy: () => void
  mono?: boolean
}) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-[11px] font-medium text-slate-700 dark:text-white/75">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5">
        <code
          className={
            "flex-1 block px-2.5 py-2 rounded-[4px] bg-slate-50 dark:bg-white/[0.04] text-slate-800 dark:text-white/85 break-all text-[11px] " +
            (mono ? "font-mono" : "")
          }
        >
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-[4px] bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-white/80 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors"
          title={copied ? "Copiado!" : "Copiar"}
        >
          {copied ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

function PlatformGuide({
  platforms,
}: {
  platforms: Array<{ name: string; steps: string[] }>
}) {
  const [open, setOpen] = useState<string | null>(platforms[0]?.name ?? null)
  return (
    <div className="space-y-1">
      {platforms.map((p) => {
        const expanded = open === p.name
        return (
          <div
            key={p.name}
            className="rounded-[6px] border border-black/[0.08] dark:border-white/[0.10] overflow-hidden bg-white dark:bg-white/[0.02]"
          >
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : p.name)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-medium text-slate-800 dark:text-white/85 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            >
              <span>{p.name}</span>
              <ChevronDown
                className={
                  "h-3.5 w-3.5 text-slate-400 transition-transform " +
                  (expanded ? "rotate-180" : "")
                }
              />
            </button>
            {expanded && (
              <ol className="px-3 pb-3 pt-0 list-decimal list-inside space-y-1 text-[11px] text-slate-700 dark:text-white/70 leading-relaxed">
                {p.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Field editor
// ────────────────────────────────────────────────────────────────────

function FieldEditor({
  field,
  customFields,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: FormField
  customFields: Array<{ id: string; key: string; label: string; field_type: string }>
  onChange: (patch: Partial<FormField>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [open, setOpen] = useState(false)

  const showOptions =
    field.field_type === "select" ||
    field.field_type === "radio" ||
    field.field_type === "multi_select"

  const optionsText = (field.options ?? [])
    .map((o) => (typeof o === "string" ? o : o.label))
    .join("\n")

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-white/25 cursor-grab shrink-0" />
        <input
          type="text"
          placeholder="Label do campo"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-slate-900 dark:text-white outline-none"
        />
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400 dark:text-white/40 font-mono">
          {field.field_type}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/85 p-0.5"
          aria-label={open ? "Fechar" : "Editar"}
        >
          <ChevronDown
            className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-slate-400 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 p-0.5"
          aria-label="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-100 dark:border-white/[0.06] pt-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={field.field_type}
              onChange={(e) => {
                const newType = e.target.value
                const patch: Partial<FormField> = { field_type: newType }
                // Telefone/WhatsApp: ativa seletor de pais + mascara por
                // default. Quase todo phone field e BR/WhatsApp e usuario
                // espera ja vir formatado.
                if (
                  newType === "phone" &&
                  (field.validation as { countryCode?: boolean } | undefined)?.countryCode === undefined
                ) {
                  patch.validation = {
                    ...(field.validation ?? {}),
                    countryCode: true,
                  }
                }
                onChange(patch)
              }}
              className="crm-input text-[11px]"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={field.map_to_lead_field ?? ""}
              onChange={(e) => onChange({ map_to_lead_field: e.target.value || null })}
              className="crm-input text-[11px]"
            >
              <optgroup label="Padrão">
                {LEAD_FIELD_MAP.map((m) => (
                  <option key={m.value || "_none"} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              {customFields.length > 0 && (
                <optgroup label="Personalizados">
                  {customFields.map((c) => (
                    <option key={c.id} value={`custom:${c.key}`}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {customFields.length === 0 ? (
            <p className="text-[10px] text-slate-500 dark:text-white/45 leading-relaxed">
              Pra adicionar mais campos (ex: URL da loja, faturamento),{" "}
              <a
                href="/admin/settings/custom-fields"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                crie campos personalizados
              </a>
              .
            </p>
          ) : (
            <p className="text-[10px] text-slate-500 dark:text-white/45 leading-relaxed">
              <a
                href="/admin/settings/custom-fields"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Gerenciar campos personalizados ↗
              </a>
            </p>
          )}
          <input
            type="text"
            placeholder="Placeholder (opcional)"
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            className="crm-input w-full text-[12px]"
          />

          {showOptions && (
            <textarea
              rows={3}
              value={optionsText}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Uma opção por linha..."
              className="crm-input w-full text-[11px]"
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-white/75">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
              />
              Obrigatório
            </label>

            {field.field_type === "phone" && (
              <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-white/75">
                <input
                  type="checkbox"
                  checked={(field.validation as { countryCode?: boolean } | undefined)?.countryCode === true}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...(field.validation ?? {}),
                        countryCode: e.target.checked,
                      },
                    })
                  }
                />
                Com seletor de país (+55, +1...)
              </label>
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {onMoveUp && (
                <button
                  type="button"
                  onClick={onMoveUp}
                  className="text-[10px] px-1 text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white"
                  aria-label="Mover pra cima"
                >
                  ▲
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  onClick={onMoveDown}
                  className="text-[10px] px-1 text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white"
                  aria-label="Mover pra baixo"
                >
                  ▼
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
