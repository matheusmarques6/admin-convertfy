"use client"

import { use, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import useSWR from "swr"
import {
  ArrowLeft,
  ExternalLink,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Copy as CopyIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { CrmPageShell } from "@/components/crm/crm-page-shell"
import { ROUTES } from "@/lib/routes"

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

interface FormTheme {
  mode?: "light" | "dark"
  primaryColor?: string
  backgroundColor?: string
  textColor?: string
  bgGradient?: { from: string; to: string; angle?: number } | null
  cardBgColor?: string
  cardBorderColor?: string
  cardShadow?: "none" | "sm" | "md" | "lg"
  containerWidth?: number
  inputBgColor?: string
  inputBorderColor?: string
  inputTextColor?: string
  buttonText?: string
  buttonTextColor?: string
  buttonGradient?: { from: string; to: string; angle?: number } | null
  fontFamily?: string
  fontSize?: number
  headingSize?: number
  subheadingSize?: number
  borderRadius?: number
  hideTitle?: boolean
  hideLabels?: boolean
  hidePoweredBy?: boolean
  headline?: string
  subheadline?: string
  badge?: string
  badgeColor?: string
}

/**
 * Templates pre-configurados — 1 clique aplica todo o tema. Pode estender
 * com mais templates no futuro (corporate, festa, e-commerce, etc).
 */
const THEME_PRESETS: Array<{ key: string; label: string; theme: FormTheme }> = [
  {
    key: "convertfy-aceleradora",
    label: "Aceleradora (dark gradient)",
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
      buttonText: "Solicitar diagnostico gratuito",
      buttonTextColor: "#FFFFFF",
      hidePoweredBy: false,
      badge: "Aceleradora #1 de E-mail Marketing",
      badgeColor: "#A78BFA",
    },
  },
  {
    key: "minimal-light",
    label: "Minimal claro",
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
]

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
  { value: "", label: "Não mapear (vai pro JSON de respostas)" },
  { value: "name", label: "Nome do lead" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "company", label: "Empresa" },
  { value: "source", label: "Origem (source)" },
]

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

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [pipelineId, setPipelineId] = useState("")
  const [stageId, setStageId] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [redirectUrl, setRedirectUrl] = useState("")
  const [theme, setTheme] = useState<FormDetail["form"]["theme"]>({})
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Hidrata estado quando data chega.
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

  const updateField = (idx: number, patch: Partial<FormField>) => {
    setFields((arr) =>
      arr.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    )
  }

  const removeField = (idx: number) => {
    setFields((arr) =>
      arr.filter((_, i) => i !== idx).map((f, i) => ({ ...f, position: i })),
    )
  }

  const moveField = (idx: number, dir: "up" | "down") => {
    setFields((arr) => {
      const next = [...arr]
      const swap = dir === "up" ? idx - 1 : idx + 1
      if (swap < 0 || swap >= next.length) return next
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next.map((f, i) => ({ ...f, position: i }))
    })
  }

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

  const copyEmbed = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const code = `<iframe src="${origin}/forms/${slug}" style="border:0;width:100%;min-height:600px" title="${name}"></iframe>`
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (isLoading) {
    return (
      <div className="p-8 text-[13px] text-slate-500 dark:text-white/55">
        Carregando formulário...
      </div>
    )
  }
  if (!data) {
    return (
      <div className="p-8 text-[13px] text-red-600 dark:text-red-400">
        Formulário não encontrado.
      </div>
    )
  }

  const publicUrl = `/forms/${slug}`

  return (
    <CrmPageShell
      title={name || "Sem nome"}
      subtitle={`/forms/${slug}`}
      actions={
        <>
          <Link
            href={ROUTES.ADMIN.COMERCIAL.FORMS}
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Pré-visualizar
          </a>
          <button
            onClick={togglePublish}
            className="crm-button-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {data.form.status === "published" ? "Despublicar" : "Publicar"}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="crm-button-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 p-6">
        {/* COLUNA ESQUERDA — campos */}
        <div className="space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-[6px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/15 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {savedAt && !saving && (
            <div className="flex items-center gap-2 rounded-[6px] border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/15 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Salvo as {savedAt.toLocaleTimeString("pt-BR")}
            </div>
          )}

          <Section title="Identificação">
            <Row label="Nome">
              <input
                type="text"
                className="crm-input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Row>
            <Row label="Slug (URL)">
              <input
                type="text"
                className="crm-input w-full font-mono text-[12px]"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              />
            </Row>
            <Row label="Descrição interna">
              <textarea
                className="crm-input w-full"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Visível apenas para o time."
              />
            </Row>
          </Section>

          <Section title="Pipeline e automação">
            <Row
              label="Pipeline"
              hint="Quando vazio, o form só cria leads (sem deal)."
            >
              <select
                className="crm-input w-full"
                value={pipelineId}
                onChange={(e) => {
                  setPipelineId(e.target.value)
                  setStageId("")
                }}
              >
                <option value="">Não criar deal automaticamente</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Row>
            {pipelineId && (
              <Row label="Etapa inicial">
                <select
                  className="crm-input w-full"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {stagesForPipeline
                    .filter((s) => (s.stage_type || "open") === "open")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </Row>
            )}
          </Section>

          <Section
            title="Campos do formulário"
            action={
              <button
                onClick={addField}
                className="crm-button-ghost text-[11px]"
                style={{ height: 28, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Plus className="h-3 w-3" />
                Adicionar campo
              </button>
            }
          >
            <div className="space-y-2">
              {fields.length === 0 && (
                <div className="rounded-[6px] border border-dashed border-slate-200 dark:border-white/[0.10] py-6 text-center text-[12px] text-slate-500 dark:text-white/55">
                  Nenhum campo. Clique em &ldquo;Adicionar campo&rdquo; para começar.
                </div>
              )}
              {fields.map((f, idx) => (
                <FieldEditor
                  key={idx}
                  field={f}
                  onChange={(patch) => updateField(idx, patch)}
                  onRemove={() => removeField(idx)}
                  onMoveUp={idx > 0 ? () => moveField(idx, "up") : undefined}
                  onMoveDown={idx < fields.length - 1 ? () => moveField(idx, "down") : undefined}
                />
              ))}
            </div>
          </Section>

          <Section title="Após envio">
            <Row label="Mensagem de sucesso">
              <textarea
                className="crm-input w-full"
                rows={2}
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                placeholder="Ex: Recebemos sua resposta! Entraremos em contato em breve."
              />
            </Row>
            <Row label="Ou redirecionar para URL" hint="Se preenchido, ignora a mensagem.">
              <input
                type="url"
                className="crm-input w-full"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://"
              />
            </Row>
          </Section>
        </div>

        {/* COLUNA DIREITA — preview + theme + embed */}
        <div className="space-y-5">
          <Section
            title="Aparência"
            action={
              <button
                type="button"
                onClick={() => setTheme({})}
                className="crm-button-ghost text-[10px]"
                style={{ height: 24, padding: "0 8px" }}
                title="Restaurar tema padrao"
              >
                Resetar
              </button>
            }
          >
            {/* ── Templates ── */}
            <Row label="Template (1 clique)" hint="Aplica um conjunto pronto. Voce pode editar tudo depois.">
              <div className="flex flex-wrap gap-1.5">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setTheme(p.theme)}
                    className="crm-button-ghost text-[11px]"
                    style={{ height: 26, padding: "0 10px" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Row>

            {/* ── Modo claro/escuro ── */}
            <Row label="Modo">
              <div className="flex gap-1">
                {([
                  { v: "light", label: "Claro" },
                  { v: "dark", label: "Escuro" },
                ] as const).map((o) => {
                  const active = (theme.mode ?? "light") === o.v
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setTheme((t) => ({ ...t, mode: o.v }))}
                      className={
                        active
                          ? "crm-button-primary text-[11px]"
                          : "crm-button-ghost text-[11px]"
                      }
                      style={{ height: 26, padding: "0 12px" }}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </Row>

            <Row label="Cor primária">
              <ColorRow
                value={theme.primaryColor ?? "#2563EB"}
                onChange={(v) => setTheme((t) => ({ ...t, primaryColor: v }))}
              />
            </Row>

            {/* ── Fundo: solido ou gradiente ── */}
            <Row label="Fundo">
              <div className="space-y-2">
                <div className="flex gap-1">
                  {([
                    { v: "solid", label: "Cor sólida" },
                    { v: "gradient", label: "Gradiente" },
                  ] as const).map((o) => {
                    const isGrad = !!theme.bgGradient
                    const active = o.v === (isGrad ? "gradient" : "solid")
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() =>
                          setTheme((t) =>
                            o.v === "gradient"
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
                        className={
                          active
                            ? "crm-button-primary text-[11px]"
                            : "crm-button-ghost text-[11px]"
                        }
                        style={{ height: 26, padding: "0 12px" }}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                {theme.bgGradient ? (
                  <div className="space-y-1.5">
                    <ColorRow
                      label="De"
                      value={theme.bgGradient.from}
                      onChange={(v) =>
                        setTheme((t) => ({
                          ...t,
                          bgGradient: {
                            ...(t.bgGradient ?? { from: v, to: v, angle: 135 }),
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
                            ...(t.bgGradient ?? { from: v, to: v, angle: 135 }),
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
                  </div>
                ) : (
                  <ColorRow
                    value={theme.backgroundColor ?? "#FFFFFF"}
                    onChange={(v) =>
                      setTheme((t) => ({ ...t, backgroundColor: v }))
                    }
                  />
                )}
              </div>
            </Row>

            {/* ── Botao: cor solida ou gradiente ── */}
            <Row label="Botão">
              <div className="space-y-2">
                <div className="flex gap-1">
                  {([
                    { v: "solid", label: "Sólido" },
                    { v: "gradient", label: "Gradiente" },
                  ] as const).map((o) => {
                    const isGrad = !!theme.buttonGradient
                    const active = o.v === (isGrad ? "gradient" : "solid")
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() =>
                          setTheme((t) =>
                            o.v === "gradient"
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
                        className={
                          active
                            ? "crm-button-primary text-[11px]"
                            : "crm-button-ghost text-[11px]"
                        }
                        style={{ height: 26, padding: "0 12px" }}
                      >
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                {theme.buttonGradient && (
                  <div className="space-y-1.5">
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
              </div>
            </Row>

            {/* ── Conteudo ── */}
            <Row label="Badge (chip acima do título)" hint="Opcional. Ex: 'Aceleradora #1'">
              <input
                type="text"
                className="crm-input w-full"
                value={theme.badge ?? ""}
                onChange={(e) =>
                  setTheme((t) => ({ ...t, badge: e.target.value || undefined }))
                }
                placeholder="Aceleradora #1 de E-mail Marketing"
              />
            </Row>
            <Row label="Headline (título grande)">
              <input
                type="text"
                className="crm-input w-full"
                value={theme.headline ?? ""}
                onChange={(e) =>
                  setTheme((t) => ({ ...t, headline: e.target.value }))
                }
                placeholder={name}
              />
            </Row>
            <Row label="Subtítulo">
              <input
                type="text"
                className="crm-input w-full"
                value={theme.subheadline ?? ""}
                onChange={(e) =>
                  setTheme((t) => ({ ...t, subheadline: e.target.value }))
                }
                placeholder="Descreva em uma linha."
              />
            </Row>
            <Row label="Texto do botão">
              <input
                type="text"
                className="crm-input w-full"
                value={theme.buttonText ?? "Enviar"}
                onChange={(e) =>
                  setTheme((t) => ({ ...t, buttonText: e.target.value }))
                }
              />
            </Row>

            {/* ── Tipografia / layout ── */}
            <Row label="Tipografia">
              <div className="grid grid-cols-3 gap-2">
                <NumberRow
                  label="Título"
                  value={theme.headingSize ?? 28}
                  onChange={(v) => setTheme((t) => ({ ...t, headingSize: v }))}
                  min={16}
                  max={56}
                  suffix="px"
                />
                <NumberRow
                  label="Sub"
                  value={theme.subheadingSize ?? 14}
                  onChange={(v) =>
                    setTheme((t) => ({ ...t, subheadingSize: v }))
                  }
                  min={10}
                  max={20}
                  suffix="px"
                />
                <NumberRow
                  label="Base"
                  value={theme.fontSize ?? 14}
                  onChange={(v) => setTheme((t) => ({ ...t, fontSize: v }))}
                  min={11}
                  max={18}
                  suffix="px"
                />
              </div>
            </Row>
            <Row label="Layout">
              <div className="grid grid-cols-2 gap-2">
                <NumberRow
                  label="Largura"
                  value={theme.containerWidth ?? 480}
                  onChange={(v) =>
                    setTheme((t) => ({ ...t, containerWidth: v }))
                  }
                  min={320}
                  max={720}
                  suffix="px"
                />
                <NumberRow
                  label="Cantos"
                  value={theme.borderRadius ?? 8}
                  onChange={(v) =>
                    setTheme((t) => ({ ...t, borderRadius: v }))
                  }
                  min={0}
                  max={24}
                  suffix="px"
                />
              </div>
            </Row>

            {/* ── Toggles ── */}
            <Row label="Opções">
              <div className="space-y-1.5">
                <CheckRow
                  label="Esconder título"
                  checked={!!theme.hideTitle}
                  onChange={(v) => setTheme((t) => ({ ...t, hideTitle: v }))}
                />
                <CheckRow
                  label="Esconder labels dos campos"
                  checked={!!theme.hideLabels}
                  onChange={(v) => setTheme((t) => ({ ...t, hideLabels: v }))}
                />
                <CheckRow
                  label='Esconder "Powered by Convertfy"'
                  checked={!!theme.hidePoweredBy}
                  onChange={(v) =>
                    setTheme((t) => ({ ...t, hidePoweredBy: v }))
                  }
                />
              </div>
            </Row>
          </Section>

          <Section
            title="Embed / URL"
            action={
              <button
                onClick={copyEmbed}
                className="crm-button-ghost text-[10px]"
                style={{ height: 24, padding: "0 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <CopyIcon className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar embed"}
              </button>
            }
          >
            <Row label="URL pública">
              <code className="block w-full rounded-[4px] bg-slate-50 dark:bg-white/[0.04] px-2 py-1.5 text-[11px] font-mono text-slate-700 dark:text-white/75 break-all">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {publicUrl}
              </code>
            </Row>
            <Row label="Status">
              <span
                className={
                  data.form.status === "published"
                    ? "inline-flex text-[11px] font-medium px-2 py-0.5 rounded-[3px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "inline-flex text-[11px] font-medium px-2 py-0.5 rounded-[3px] bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-white/65"
                }
              >
                {data.form.status === "published" ? "Publicado" : "Rascunho"}
              </span>
            </Row>
          </Section>

          {data.submissions.length > 0 && (
            <Section title={`Últimas ${data.submissions.length} submissões`}>
              <ul className="space-y-1.5">
                {data.submissions.slice(0, 8).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between text-[11px] rounded-[4px] bg-slate-50 dark:bg-white/[0.04] px-2 py-1.5"
                  >
                    <span className="text-slate-700 dark:text-white/80">
                      {new Date(s.created_at).toLocaleString("pt-BR")}
                    </span>
                    {s.deal_id && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        Deal criado
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </CrmPageShell>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[6px] border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1D27] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-700 dark:text-white/75">
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  )
}

function Row({
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
      <label className="block text-[11px] font-medium text-slate-700 dark:text-white/70">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-white/45">{hint}</p>
      )}
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
        // O input nativo de cor nao suporta rgba/strings nao-hex.
        // Mostra um fallback hex se o valor atual nao for hex.
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
    <div className="flex items-center gap-1.5">
      {label && (
        <span className="text-[10px] text-slate-500 dark:text-white/45 shrink-0">
          {label}
        </span>
      )}
      <div className="relative flex-1">
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
    <label className="flex items-center gap-2 text-[11px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer"
      />
      <span className="text-slate-700 dark:text-white/70">{label}</span>
    </label>
  )
}

function FieldEditor({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: FormField
  onChange: (patch: Partial<FormField>) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const showOptions =
    field.field_type === "select" ||
    field.field_type === "radio" ||
    field.field_type === "multi_select"

  const optionsText = (field.options ?? [])
    .map((o) => (typeof o === "string" ? o : o.label))
    .join("\n")

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.10] bg-slate-50/40 dark:bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <button
          aria-label="Reordenar"
          className="mt-1 cursor-grab text-slate-400 dark:text-white/40"
          title="Arraste para reordenar (TODO: drag/drop)"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Label"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="crm-input"
          />
          <select
            value={field.field_type}
            onChange={(e) => onChange({ field_type: e.target.value })}
            className="crm-input"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          {onMoveUp && (
            <button
              onClick={onMoveUp}
              aria-label="Mover para cima"
              className="text-[9px] px-1 text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white"
            >
              ▲
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={onMoveDown}
              aria-label="Mover para baixo"
              className="text-[9px] px-1 text-slate-500 dark:text-white/55 hover:text-slate-900 dark:hover:text-white"
            >
              ▼
            </button>
          )}
        </div>
        <button
          onClick={onRemove}
          aria-label="Remover campo"
          className="text-slate-400 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Placeholder"
          value={field.placeholder ?? ""}
          onChange={(e) => onChange({ placeholder: e.target.value })}
          className="crm-input"
        />
        <select
          value={field.map_to_lead_field ?? ""}
          onChange={(e) => onChange({ map_to_lead_field: e.target.value || null })}
          className="crm-input"
        >
          {LEAD_FIELD_MAP.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

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

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-white/75">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Obrigatório
        </label>

        {/* Phone com seletor de DDI (so aparece pra phone) */}
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
      </div>
    </div>
  )
}
