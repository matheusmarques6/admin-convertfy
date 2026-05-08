"use client"

import { useEffect, useState, useMemo } from "react"
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

interface FormField {
  id: string
  field_type: string
  label: string
  placeholder: string | null
  description: string | null
  required: boolean
  position: number
  options: Array<string | { label: string; value: string }>
  validation: Record<string, unknown>
  map_to_lead_field: string | null
}

interface FormConfig {
  id: string
  name: string
  slug: string
  description: string | null
  theme: {
    primaryColor?: string
    backgroundColor?: string
    textColor?: string
    borderRadius?: number
    fontFamily?: string
    fontSize?: number
    headline?: string
    subheadline?: string
    buttonText?: string
    hideTitle?: boolean
    hideLabels?: boolean
  }
  logo_url: string | null
  success_message: string | null
  redirect_url: string | null
}

interface Props {
  slug: string
  payload: { form: FormConfig; fields: FormField[] }
  utm: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_term: string | null
    utm_content: string | null
  }
}

export function PublicFormView({ slug, payload, utm }: Props) {
  const { form, fields } = payload
  const theme = form.theme ?? {}
  const primary = theme.primaryColor ?? "#2563EB"
  const bg = theme.backgroundColor ?? "#FFFFFF"
  const text = theme.textColor ?? "#0F172A"
  const radius = theme.borderRadius ?? 8
  const fontFamily = theme.fontFamily ?? "Inter, system-ui, sans-serif"
  const fontSize = theme.fontSize ?? 14
  const buttonText = theme.buttonText ?? "Enviar"

  // Estado das respostas: { [field_id]: value }
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ message: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

  // Pre-preenche valor default vazio adequado pro tipo.
  useEffect(() => {
    const init: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.field_type === "checkbox") init[f.id] = false
      else if (f.field_type === "multi_select") init[f.id] = []
      else init[f.id] = ""
    }
    setAnswers(init)
  }, [fields])

  const update = (id: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [id]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validacao client-side de required.
    const missing: string[] = []
    for (const f of sortedFields) {
      if (!f.required) continue
      const v = answers[f.id]
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
        missing.push(f.label)
      }
    }
    if (missing.length > 0) {
      setError(`Preencha: ${missing.join(", ")}`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/forms/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          ...utm,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.success === false) {
        setError(json.error?.message || "Erro ao enviar. Tente novamente.")
        return
      }
      // Redireciona se configurado, senao mostra success message.
      if (json.redirect_url) {
        window.location.href = json.redirect_url
        return
      }
      setDone({ message: json.success_message ?? form.success_message ?? null })
    } catch {
      setError("Falha de rede. Verifique sua conexão.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4 py-12"
        style={{ background: bg, color: text, fontFamily, fontSize }}
      >
        <div
          className="w-full max-w-md text-center bg-white shadow-sm border border-black/5 px-8 py-10"
          style={{ borderRadius: radius * 1.25, background: bg }}
        >
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4"
            style={{ background: `${primary}1A`, color: primary }}
          >
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h2 className="text-[18px] font-semibold mb-2">
            Recebido com sucesso!
          </h2>
          <p className="text-[13px] opacity-80 leading-relaxed">
            {done.message ?? "Obrigado! Sua resposta foi registrada e nossa equipe entrará em contato."}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main
      className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8 sm:py-12"
      style={{ background: bg, color: text, fontFamily, fontSize }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md shadow-[0_4px_24px_rgba(15,23,42,0.06)] border border-black/[0.06]"
        style={{ borderRadius: radius * 1.25, background: bg }}
      >
        {/* Header com logo + headline + sub */}
        <div className="px-6 pt-7 pb-4">
          {form.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.logo_url}
              alt={form.name}
              className="h-10 w-auto mb-4 object-contain"
            />
          )}
          {!theme.hideTitle && (
            <h1
              className="text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: text }}
            >
              {theme.headline || form.name}
            </h1>
          )}
          {theme.subheadline && (
            <p className="mt-1.5 text-[13px] opacity-70 leading-relaxed">
              {theme.subheadline}
            </p>
          )}
          {form.description && !theme.subheadline && (
            <p className="mt-1.5 text-[13px] opacity-70 leading-relaxed">
              {form.description}
            </p>
          )}
        </div>

        {/* Campos */}
        <div className="px-6 pb-2 space-y-4">
          {sortedFields.map((f) => (
            <FieldRenderer
              key={f.id}
              field={f}
              value={answers[f.id]}
              onChange={(v) => update(f.id, v)}
              theme={theme}
              primary={primary}
            />
          ))}
        </div>

        {/* Erro */}
        {error && (
          <div className="mx-6 mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Botao */}
        <div className="px-6 pt-3 pb-6">
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 font-semibold transition-opacity disabled:opacity-60"
            style={{
              background: primary,
              color: "#FFFFFF",
              borderRadius: radius,
              padding: "12px 16px",
              fontSize: fontSize + 1,
            }}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Enviando..." : buttonText}
          </button>
          <p className="mt-3 text-center text-[10px] opacity-50">
            Powered by Convertfy
          </p>
        </div>
      </form>
    </main>
  )
}

function FieldRenderer({
  field,
  value,
  onChange,
  theme,
  primary,
}: {
  field: FormField
  value: unknown
  onChange: (v: unknown) => void
  theme: FormConfig["theme"]
  primary: string
}) {
  const radius = theme.borderRadius ?? 8
  const inputStyle: React.CSSProperties = {
    borderRadius: radius * 0.75,
    background: theme.backgroundColor === "#FFFFFF" ? "#F8FAFC" : "rgba(0,0,0,0.04)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    padding: "10px 12px",
    fontSize: theme.fontSize ?? 14,
    width: "100%",
    color: theme.textColor ?? "#0F172A",
    outline: "none",
  }

  const focusRing = `0 0 0 3px ${primary}33`

  const labelEl = !theme.hideLabels && (
    <label className="block text-[12px] font-medium mb-1.5">
      {field.label}
      {field.required && <span style={{ color: primary }}> *</span>}
    </label>
  )
  const descEl = field.description && (
    <p className="mt-1 text-[11px] opacity-60">{field.description}</p>
  )

  const opts = (field.options ?? []).map((o) =>
    typeof o === "string" ? { label: o, value: o } : o,
  )

  switch (field.field_type) {
    case "textarea":
      return (
        <div>
          {labelEl}
          <textarea
            rows={3}
            placeholder={field.placeholder ?? ""}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = focusRing)}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {descEl}
        </div>
      )

    case "select":
      return (
        <div>
          {labelEl}
          <select
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            style={inputStyle}
          >
            <option value="">{field.placeholder ?? "Selecione..."}</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {descEl}
        </div>
      )

    case "radio":
      return (
        <div>
          {labelEl}
          <div className="space-y-1.5">
            {opts.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name={field.id}
                  value={o.value}
                  checked={value === o.value}
                  onChange={() => onChange(o.value)}
                  required={field.required}
                  style={{ accentColor: primary }}
                />
                {o.label}
              </label>
            ))}
          </div>
          {descEl}
        </div>
      )

    case "checkbox":
      return (
        <label className="flex items-start gap-2 text-[13px] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            required={field.required}
            style={{ accentColor: primary, marginTop: 3 }}
          />
          <span>{field.label}{field.required && <span style={{ color: primary }}> *</span>}</span>
        </label>
      )

    case "date":
      return (
        <div>
          {labelEl}
          <input
            type="date"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            style={inputStyle}
          />
          {descEl}
        </div>
      )

    case "hidden":
      return null

    default: {
      // text, email, phone, number, url, cpf, cnpj, cep
      const inputType =
        field.field_type === "email"
          ? "email"
          : field.field_type === "phone" || field.field_type === "cpf" || field.field_type === "cnpj" || field.field_type === "cep"
            ? "tel"
            : field.field_type === "number"
              ? "number"
              : field.field_type === "url"
                ? "url"
                : "text"
      return (
        <div>
          {labelEl}
          <input
            type={inputType}
            placeholder={field.placeholder ?? ""}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            inputMode={inputType === "tel" ? "tel" : inputType === "number" ? "numeric" : undefined}
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.boxShadow = focusRing)}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {descEl}
        </div>
      )
    }
  }
}
