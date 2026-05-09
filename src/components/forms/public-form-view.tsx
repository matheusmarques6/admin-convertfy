"use client"

import { useEffect, useState, useMemo } from "react"
import { CheckCircle2, AlertCircle, Loader2, ChevronDown } from "lucide-react"

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

/**
 * Estrutura do theme. Todos os campos sao opcionais — defaults aplicados
 * no renderer pra manter compatibilidade com forms criados antes destas
 * extensoes.
 */
interface FormTheme {
  // ── Modo ──
  mode?: "light" | "dark"

  // ── Cores principais ──
  primaryColor?: string
  backgroundColor?: string // bg solido (fallback se nao houver gradient)
  textColor?: string

  // ── Gradiente de fundo (overrides backgroundColor) ──
  bgGradient?: { from: string; to: string; angle?: number } | null

  // ── Card / container ──
  cardBgColor?: string
  cardBorderColor?: string
  cardShadow?: "none" | "sm" | "md" | "lg"
  containerWidth?: number // max-width em px

  // ── Inputs ──
  inputBgColor?: string
  inputBorderColor?: string
  inputTextColor?: string
  inputPlaceholderColor?: string

  // ── Botao ──
  buttonText?: string
  buttonTextColor?: string
  buttonGradient?: { from: string; to: string; angle?: number } | null

  // ── Tipografia ──
  fontFamily?: string
  fontSize?: number // base
  headingSize?: number // tamanho do <h1> em px
  subheadingSize?: number // tamanho do subtitulo em px

  // ── Layout / labels ──
  borderRadius?: number
  hideTitle?: boolean
  hideLabels?: boolean
  hidePoweredBy?: boolean

  // ── Conteudo extra ──
  headline?: string
  subheadline?: string
  badge?: string // chip pequeno acima do headline (ex: "Aceleradora #1")
  badgeColor?: string
}

interface FormConfig {
  id: string
  name: string
  slug: string
  description: string | null
  theme: FormTheme
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
  /**
   * Quando true, intercepta o submit e mostra success state fake. Usado
   * pelo editor pra preview live sem persistir no banco.
   */
  preview?: boolean
  /**
   * Quando true, renderiza apenas o card do form (sem min-h-screen, sem
   * centralizar verticalmente). Usado em iframes/embeds — o form ocupa
   * apenas o espaco que precisa, herdando o background da pagina pai.
   */
  embed?: boolean
}

// ── Países suportados no seletor de DDI ──
const COUNTRIES = [
  { code: "BR", flag: "🇧🇷", dial: "+55" },
  { code: "US", flag: "🇺🇸", dial: "+1" },
  { code: "PT", flag: "🇵🇹", dial: "+351" },
  { code: "ES", flag: "🇪🇸", dial: "+34" },
  { code: "MX", flag: "🇲🇽", dial: "+52" },
  { code: "AR", flag: "🇦🇷", dial: "+54" },
  { code: "CL", flag: "🇨🇱", dial: "+56" },
  { code: "CO", flag: "🇨🇴", dial: "+57" },
  { code: "GB", flag: "🇬🇧", dial: "+44" },
  { code: "DE", flag: "🇩🇪", dial: "+49" },
  { code: "FR", flag: "🇫🇷", dial: "+33" },
  { code: "IT", flag: "🇮🇹", dial: "+39" },
] as const

// ── Helpers de tema ──

function gradientCss(g: { from: string; to: string; angle?: number } | null | undefined): string | null {
  if (!g) return null
  const angle = g.angle ?? 135
  return `linear-gradient(${angle}deg, ${g.from}, ${g.to})`
}

function defaults(theme: FormTheme) {
  const dark = theme.mode === "dark"
  return {
    mode: theme.mode ?? "light",
    primary: theme.primaryColor ?? "#2563EB",
    bg: theme.backgroundColor ?? (dark ? "#0B0B14" : "#FFFFFF"),
    text: theme.textColor ?? (dark ? "#F1F5F9" : "#0F172A"),
    radius: theme.borderRadius ?? (dark ? 12 : 8),
    fontFamily: theme.fontFamily ?? "Inter, system-ui, sans-serif",
    fontSize: theme.fontSize ?? 14,
    headingSize: theme.headingSize ?? 28,
    subheadingSize: theme.subheadingSize ?? 14,
    buttonText: theme.buttonText ?? "Enviar",
    buttonTextColor: theme.buttonTextColor ?? "#FFFFFF",
    cardBg: theme.cardBgColor ?? (dark ? "rgba(20,22,40,0.6)" : "#FFFFFF"),
    cardBorder:
      theme.cardBorderColor ?? (dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)"),
    cardShadow: theme.cardShadow ?? (dark ? "lg" : "sm"),
    containerWidth: theme.containerWidth ?? 480,
    inputBg:
      theme.inputBgColor ?? (dark ? "rgba(255,255,255,0.04)" : "#F8FAFC"),
    inputBorder:
      theme.inputBorderColor ?? (dark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)"),
    inputText: theme.inputTextColor ?? (dark ? "#F1F5F9" : "#0F172A"),
    inputPlaceholder:
      theme.inputPlaceholderColor ?? (dark ? "rgba(241,245,249,0.40)" : "rgba(15,23,42,0.40)"),
  }
}

function shadowCss(level: "none" | "sm" | "md" | "lg"): string {
  switch (level) {
    case "none":
      return "none"
    case "sm":
      return "0 4px 24px rgba(15,23,42,0.06)"
    case "md":
      return "0 8px 32px rgba(15,23,42,0.12)"
    case "lg":
      return "0 24px 64px rgba(0,0,0,0.4)"
  }
}

// ── Component ──

export function PublicFormView({ slug, payload, utm, preview = false, embed = false }: Props) {
  const { form, fields } = payload
  const theme = form.theme ?? {}
  const t = defaults(theme)
  const dark = t.mode === "dark"

  const bgFill = gradientCss(theme.bgGradient) ?? t.bg
  const buttonFill = gradientCss(theme.buttonGradient) ?? t.primary

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ message: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

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
    // Preview mode: nao chama a API, mostra success state fake apos delay.
    if (preview) {
      await new Promise((r) => setTimeout(r, 600))
      setSubmitting(false)
      setDone({
        message: form.success_message ?? "Pré-visualização: a submissão real será enviada quando o form for publicado.",
      })
      return
    }
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
      if (json.redirect_url) {
        window.location.href = json.redirect_url
        return
      }
      setDone({ message: json.success_message ?? form.success_message ?? null })
    } catch {
      setError("Falha de rede. Verifique sua conexao.")
    } finally {
      setSubmitting(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: t.radius * 1.5,
    background: t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    boxShadow: shadowCss(t.cardShadow),
    color: t.text,
    backdropFilter: dark ? "blur(20px)" : undefined,
  }

  if (done) {
    const successCard = (
      <div
        className="w-full text-center px-8 py-10"
        style={{ ...cardStyle, maxWidth: t.containerWidth }}
      >
        <div
          className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4"
          style={{ background: `${t.primary}1A`, color: t.primary }}
        >
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h2 className="text-[18px] font-semibold mb-2">Recebido com sucesso!</h2>
        <p className="text-[13px] opacity-80 leading-relaxed">
          {done.message ?? "Obrigado! Sua resposta foi registrada e nossa equipe entrara em contato."}
        </p>
      </div>
    )
    if (embed) {
      // Embed: renderiza apenas o card. Sem fundo de pagina, sem altura
      // forcada. Pai do iframe controla layout.
      return (
        <div
          className="w-full"
          style={{ color: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize }}
        >
          {successCard}
        </div>
      )
    }
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4 py-12"
        style={{ background: bgFill, color: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize }}
      >
        {successCard}
      </main>
    )
  }

  const inputStyleBase: React.CSSProperties = {
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    color: t.inputText,
    borderRadius: t.radius * 0.75,
    padding: "12px 14px",
    fontSize: t.fontSize,
    width: "100%",
    outline: "none",
  }
  const focusRing = `0 0 0 3px ${t.primary}33`

  // Wrapper varia por modo:
  // - embed: apenas o card, sem fundo, sem altura forcada (ideal pra iframe)
  // - normal: pagina completa centralizada com background do tema
  const Wrapper = embed ? "div" : "main"
  const wrapperClass = embed
    ? "w-full"
    : "min-h-screen flex items-start sm:items-center justify-center px-4 py-8 sm:py-12"
  const wrapperStyle: React.CSSProperties = embed
    ? { color: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize }
    : {
        background: bgFill,
        color: t.text,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
      }

  return (
    <Wrapper className={wrapperClass} style={wrapperStyle}>
      <form
        onSubmit={handleSubmit}
        className="w-full"
        style={{
          ...cardStyle,
          maxWidth: embed ? "100%" : t.containerWidth,
        }}
      >
        {/* Header */}
        <div className="px-6 sm:px-8 pt-7 pb-4">
          {form.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.logo_url}
              alt={form.name}
              className="h-10 w-auto mb-4 object-contain"
            />
          )}

          {theme.badge && (
            <span
              className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-full text-[11px] font-medium"
              style={{
                background: `${theme.badgeColor ?? t.primary}1A`,
                color: theme.badgeColor ?? t.primary,
                border: `1px solid ${theme.badgeColor ?? t.primary}33`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: theme.badgeColor ?? t.primary }}
                aria-hidden
              />
              {theme.badge}
            </span>
          )}

          {!theme.hideTitle && (
            <h1
              className="font-semibold leading-tight tracking-tight"
              style={{ color: t.text, fontSize: t.headingSize }}
            >
              {theme.headline || form.name}
            </h1>
          )}
          {theme.subheadline && (
            <p
              className="mt-2 opacity-70 leading-relaxed"
              style={{ fontSize: t.subheadingSize }}
            >
              {theme.subheadline}
            </p>
          )}
          {form.description && !theme.subheadline && (
            <p
              className="mt-2 opacity-70 leading-relaxed"
              style={{ fontSize: t.subheadingSize }}
            >
              {form.description}
            </p>
          )}
        </div>

        {/* Campos */}
        <div className="px-6 sm:px-8 pb-2 space-y-3.5">
          {sortedFields.map((f) => (
            <FieldRenderer
              key={f.id}
              field={f}
              value={answers[f.id]}
              onChange={(v) => update(f.id, v)}
              theme={theme}
              t={t}
              inputStyle={inputStyleBase}
              focusRing={focusRing}
            />
          ))}
        </div>

        {error && (
          <div className="mx-6 sm:mx-8 mt-2 flex items-start gap-2 rounded-md border border-red-300/40 bg-red-500/10 px-3 py-2 text-[12px]"
               style={{ color: dark ? "#FCA5A5" : "#B91C1C" }}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Botao */}
        <div className="px-6 sm:px-8 pt-4 pb-6">
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-60"
            style={{
              background: buttonFill,
              color: t.buttonTextColor,
              borderRadius: t.radius,
              padding: "14px 16px",
              fontSize: t.fontSize + 1,
              boxShadow: theme.buttonGradient
                ? `0 8px 24px ${theme.buttonGradient.from}40`
                : "none",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Enviando..." : t.buttonText}
          </button>
          {!theme.hidePoweredBy && (
            <p className="mt-3 text-center text-[10px] opacity-50">
              Powered by Convertfy
            </p>
          )}
        </div>
      </form>

      {/* Placeholders dark (Tailwind nao suporta dynamic class via style) */}
      {dark && !embed && (
        <style jsx global>{`
          form input::placeholder,
          form textarea::placeholder {
            color: ${t.inputPlaceholder} !important;
          }
        `}</style>
      )}
    </Wrapper>
  )
}

// ── Field renderer ──

function FieldRenderer({
  field,
  value,
  onChange,
  theme,
  t,
  inputStyle,
  focusRing,
}: {
  field: FormField
  value: unknown
  onChange: (v: unknown) => void
  theme: FormTheme
  t: ReturnType<typeof defaults>
  inputStyle: React.CSSProperties
  focusRing: string
}) {
  const labelEl = !theme.hideLabels && field.field_type !== "checkbox" && (
    <label className="block text-[12px] font-medium mb-1.5 opacity-80">
      {field.label}
      {field.required && <span style={{ color: t.primary }}> *</span>}
    </label>
  )
  const descEl = field.description && (
    <p className="mt-1 text-[11px] opacity-60">{field.description}</p>
  )

  const opts = (field.options ?? []).map((o) =>
    typeof o === "string" ? { label: o, value: o } : o,
  )

  // Phone com seletor de pais (validation.countryCode === true)
  if (field.field_type === "phone" && field.validation?.countryCode === true) {
    return (
      <PhoneIntlField
        field={field}
        value={value}
        onChange={onChange}
        labelEl={labelEl}
        descEl={descEl}
        inputStyle={inputStyle}
        focusRing={focusRing}
        t={t}
      />
    )
  }

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
          <div className="relative">
            <select
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
              required={field.required}
              style={{ ...inputStyle, appearance: "none", paddingRight: 36 }}
              onFocus={(e) => (e.currentTarget.style.boxShadow = focusRing)}
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <option value="">{field.placeholder ?? "Selecione..."}</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60"
              aria-hidden
            />
          </div>
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
                  style={{ accentColor: t.primary }}
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
            style={{ accentColor: t.primary, marginTop: 3 }}
          />
          <span>
            {field.label}
            {field.required && <span style={{ color: t.primary }}> *</span>}
          </span>
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
            onFocus={(e) => (e.currentTarget.style.boxShadow = focusRing)}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
          {descEl}
        </div>
      )

    case "hidden":
      return null

    default: {
      const inputType =
        field.field_type === "email"
          ? "email"
          : field.field_type === "phone" ||
              field.field_type === "cpf" ||
              field.field_type === "cnpj" ||
              field.field_type === "cep"
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
            inputMode={
              inputType === "tel" ? "tel" : inputType === "number" ? "numeric" : undefined
            }
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

// ── Phone com seletor de pais ──

// Detecta o pais default a partir do navigator.language. Ex: "pt-BR" → BR,
// "en-US" → US. Se nao reconhecer, fallback BR.
function guessCountryFromBrowser(): string {
  if (typeof navigator === "undefined") return "BR"
  const lang = navigator.language || ""
  const region = lang.includes("-") ? lang.split("-")[1] : lang
  const code = region.toUpperCase()
  return COUNTRIES.find((c) => c.code === code) ? code : "BR"
}

// Aplica mascara de digitos por pais. So formata BR e US (resto so deixa
// digitos puros — funciona pra qualquer pais).
function applyPhoneMask(country: string, raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (country === "BR") {
    const t = d.slice(0, 11)
    if (t.length <= 2) return t.length ? `(${t}` : ""
    if (t.length <= 6) return `(${t.slice(0, 2)}) ${t.slice(2)}`
    if (t.length <= 10)
      return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`
    return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`
  }
  if (country === "US") {
    const t = d.slice(0, 10)
    if (t.length <= 3) return t.length ? `(${t}` : ""
    if (t.length <= 6) return `(${t.slice(0, 3)}) ${t.slice(3)}`
    return `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}`
  }
  // Resto: apenas mantem digitos com agrupamento basico.
  if (d.length <= 4) return d
  if (d.length <= 8) return `${d.slice(0, 4)} ${d.slice(4)}`
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)}`
}

const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  BR: "(11) 99999-9999",
  US: "(555) 123-4567",
  PT: "912 345 678",
  ES: "612 34 56 78",
  MX: "55 1234 5678",
  AR: "11 1234 5678",
}

function PhoneIntlField({
  field,
  value,
  onChange,
  labelEl,
  descEl,
  inputStyle,
  focusRing,
  t,
}: {
  field: FormField
  value: unknown
  onChange: (v: unknown) => void
  labelEl: React.ReactNode
  descEl: React.ReactNode
  inputStyle: React.CSSProperties
  focusRing: string
  t: ReturnType<typeof defaults>
}) {
  // Auto-detecta pais via navigator.language no primeiro render.
  const [country, setCountry] = useState<string>(() => guessCountryFromBrowser())
  const [phone, setPhone] = useState<string>("")

  // Mantem o valor sincronizado pra o submit (envia formato canonico:
  // "+DD numero_apenas_digitos").
  useEffect(() => {
    const c = COUNTRIES.find((x) => x.code === country)
    const digits = phone.replace(/\D/g, "")
    onChange(digits ? `${c?.dial ?? ""}${digits}` : "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, phone])

  // Se o pai resetar o value, reseta tambem.
  useEffect(() => {
    if (typeof value === "string" && value === "") setPhone("")
  }, [value])

  const current = COUNTRIES.find((c) => c.code === country) ?? COUNTRIES[0]
  const placeholder = field.placeholder || DEFAULT_PLACEHOLDERS[country] || "Telefone"

  return (
    <div>
      {labelEl}
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <select
            aria-label="País"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              // Re-formata o telefone com a mascara do pais novo.
              setPhone((p) => applyPhoneMask(e.target.value, p))
            }}
            style={{
              ...inputStyle,
              appearance: "none",
              paddingLeft: 12,
              paddingRight: 26,
              width: 110,
              fontSize: t.fontSize,
            }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = focusRing)}
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.dial}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60"
            aria-hidden
          />
          {/* fallback visual em browsers que esconde flags no select */}
          <span className="sr-only">{current.flag}</span>
        </div>
        <input
          type="tel"
          placeholder={placeholder}
          value={phone}
          onChange={(e) => setPhone(applyPhoneMask(country, e.target.value))}
          required={field.required}
          inputMode="tel"
          autoComplete="tel-national"
          style={{ ...inputStyle, flex: 1 }}
          onFocus={(e) => (e.currentTarget.style.boxShadow = focusRing)}
          onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
        />
      </div>
      {descEl}
    </div>
  )
}
