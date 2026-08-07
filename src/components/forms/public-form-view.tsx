"use client"

import { useEffect, useState, useMemo, useId } from "react"
import { CheckCircle2, AlertCircle, Loader2, ChevronDown } from "lucide-react"
import {
  loadMetaPixel,
  fireMetaEvent,
  setMetaUserData,
  loadGtag,
  fireGtagConversion,
  ensureFbp,
  ensureFbc,
} from "@/lib/tracking/browser-pixels"
import type { MetaAdvancedMatching } from "@/types/form-tracking"

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
  inputRadius?: number // override do borderRadius para inputs

  // ── Botao ──
  buttonText?: string
  buttonTextColor?: string
  buttonGradient?: { from: string; to: string; angle?: number } | null
  buttonRadius?: number // override do borderRadius para botao

  // ── Tipografia ──
  fontFamily?: string
  fontSize?: number // base
  headingSize?: number // tamanho do <h1> em px
  subheadingSize?: number // tamanho do subtitulo em px
  labelColor?: string // cor das labels dos campos (default: textColor com opacity)
  labelSize?: number // tamanho das labels em px
  subtitleColor?: string // cor do subtitulo (default: textColor com opacity)

  // ── Layout / labels ──
  borderRadius?: number
  cardPadding?: number // padding interno do card em px (default: 28)
  fieldGap?: number // espacamento entre campos em px (default: 14)
  hideTitle?: boolean
  hideLabels?: boolean
  hidePoweredBy?: boolean

  // ── Conteudo extra ──
  headline?: string
  subheadline?: string
  badge?: string // chip pequeno acima do headline (ex: "Aceleradora #1")
  badgeColor?: string
}

/** Descritor de tracking retornado pelo GET publico (sem token/regras). */
interface FormTracking {
  meta_browser_pixel: boolean
  meta_pixel_id: string | null
  google_enabled: boolean
  google_ads_id: string | null
  google_ads_conversion_label: string | null
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
  tracking?: FormTracking
}

/** Resposta de tracking do submit — event ids p/ deduplicar com o browser. */
interface SubmitTracking {
  event_id: string | null
  qualified: boolean
  qualified_event_id: string | null
  qualified_event_name: string | null
  /** Advanced matching do lead — presente SO quando qualified. */
  qualified_user_data?: MetaAdvancedMatching | null
  /** Params do evento custom (lead_source, company, utm_*, custom fields). */
  qualified_custom_data?: Record<string, unknown> | null
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
    gclid: string | null
    fbclid: string | null
  }
  /** Click ids capturados do query string na pagina (Meta/Google). */
  clickIds?: {
    fbclid: string | null
    gclid: string | null
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
  const text = theme.textColor ?? (dark ? "#F1F5F9" : "#0F172A")
  const radius = theme.borderRadius ?? (dark ? 12 : 8)
  return {
    mode: theme.mode ?? "light",
    primary: theme.primaryColor ?? "#2563EB",
    bg: theme.backgroundColor ?? (dark ? "#0B0B14" : "#FFFFFF"),
    text,
    radius,
    fontFamily: theme.fontFamily ?? "Inter, system-ui, sans-serif",
    fontSize: theme.fontSize ?? 14,
    headingSize: theme.headingSize ?? 28,
    subheadingSize: theme.subheadingSize ?? 14,
    labelColor: theme.labelColor ?? text,
    labelSize: theme.labelSize ?? 12,
    subtitleColor: theme.subtitleColor ?? text,
    buttonText: theme.buttonText ?? "Enviar",
    buttonTextColor: theme.buttonTextColor ?? "#FFFFFF",
    buttonRadius: theme.buttonRadius ?? radius,
    cardBg: theme.cardBgColor ?? (dark ? "rgba(20,22,40,0.6)" : "#FFFFFF"),
    cardBorder:
      theme.cardBorderColor ?? (dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)"),
    cardShadow: theme.cardShadow ?? (dark ? "lg" : "sm"),
    cardPadding: theme.cardPadding ?? 28,
    fieldGap: theme.fieldGap ?? 14,
    containerWidth: theme.containerWidth ?? 480,
    inputBg:
      theme.inputBgColor ?? (dark ? "rgba(255,255,255,0.04)" : "#F8FAFC"),
    inputBorder:
      theme.inputBorderColor ?? (dark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.10)"),
    inputText: theme.inputTextColor ?? (dark ? "#F1F5F9" : "#0F172A"),
    inputPlaceholder:
      theme.inputPlaceholderColor ?? (dark ? "rgba(241,245,249,0.40)" : "rgba(15,23,42,0.40)"),
    inputRadius: theme.inputRadius ?? Math.max(4, Math.round(radius * 0.75)),
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

// ── Disparo dos pixels de conversao no sucesso do submit ──

function fireConversionPixels(
  tracking: FormTracking | undefined,
  submit: SubmitTracking | undefined,
): void {
  if (!tracking) return
  // Meta: evento Lead (deduplicado por event_id) + qualificado se aplicavel.
  if (tracking.meta_browser_pixel && tracking.meta_pixel_id) {
    // Advanced matching antes do evento: o fbevents hasheia no browser e
    // chega ao mesmo SHA-256 que a CAPI manda, então os dois lados do
    // mesmo event_id casam e a Meta conta UMA conversao.
    if (submit?.qualified && submit.qualified_user_data) {
      setMetaUserData(tracking.meta_pixel_id, submit.qualified_user_data)
    }

    // "Lead" — evento PADRAO, nome de uma palavra: viaja pelo pixel sem
    // problema e deduplica com o servidor pelo event_id.
    fireMetaEvent("Lead", { eventId: submit?.event_id ?? undefined })

    // O evento QUALIFICADO nao sai daqui, de proposito.
    //
    // O pixel do browser manda o nome do evento na URL da requisicao.
    // Um nome com espaco ("Lead qualificado") chegava a Meta como
    // "Lead%20qualificado" e virava um evento SEPARADO do que a API de
    // Conversoes envia: dois eventos com nomes diferentes nao deduplicam
    // pelo event_id (a conversao contava duas vezes) e a conversao
    // personalizada da campanha so enxerga um dos dois.
    //
    // A CAPI manda o nome intacto, e leva fbc/fbp/IP/User-Agent do mesmo
    // visitante — o matching nao piora por sair so do servidor. Alem
    // disso ela atravessa bloqueador de anuncio, que derruba o pixel.
  }
  // Google Ads: conversao via gtag ("AW-XXXX/label").
  if (
    tracking.google_enabled &&
    tracking.google_ads_id &&
    tracking.google_ads_conversion_label
  ) {
    fireGtagConversion(`${tracking.google_ads_id}/${tracking.google_ads_conversion_label}`)
  }
}

// ── Component ──

export function PublicFormView({ slug, payload, utm, clickIds, preview = false, embed = false }: Props) {
  const { form, fields } = payload
  const theme = form.theme ?? {}
  const t = defaults(theme)
  const dark = t.mode === "dark"

  // ID unico por instancia, usado pra escopar o CSS reset (isola estilos
  // do form de qualquer CSS herdado — Tailwind preflight do iframe ou
  // CSS da landing host quando renderizado fora de iframe).
  const reactId = useId()
  const scopeId = `cf-form-${reactId.replace(/:/g, "")}`

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

  // Inicializa os pixels de browser (Meta/Google) uma vez, no mount. O
  // preview do editor nunca dispara pixel real.
  useEffect(() => {
    if (preview) return
    const tracking = form.tracking
    if (!tracking) return
    if (tracking.meta_browser_pixel && tracking.meta_pixel_id) {
      loadMetaPixel(tracking.meta_pixel_id)
      fireMetaEvent("PageView")
    }
    if (tracking.google_enabled && tracking.google_ads_id) {
      loadGtag(tracking.google_ads_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      // Click ids p/ matching de conversao. Garante _fbp (gera se o
      // ad-blocker impediu o fbevents de setar) e _fbc (deriva do fbclid).
      const fbc = ensureFbc(clickIds?.fbclid)
      const fbp = ensureFbp()
      const eventSourceUrl = typeof window !== "undefined" ? window.location.href : null

      const res = await fetch(`/api/public/forms/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          ...utm,
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
          fbc,
          fbp,
          fbclid: clickIds?.fbclid ?? null,
          gclid: clickIds?.gclid ?? null,
          event_source_url: eventSourceUrl,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.success === false) {
        // errorResponse devolve { error: string, code, details? } — error e
        // STRING, nao objeto. Sem isso o visitante so via o generico e o
        // motivo real (ex.: campo obrigatorio) nunca aparecia.
        const serverMsg =
          typeof json.error === "string"
            ? json.error
            : json.error?.message
        setError(serverMsg || "Erro ao enviar. Tente novamente.")
        return
      }

      // Dispara os pixels de browser (deduplicados com o server via event_id).
      fireConversionPixels(form.tracking, json.tracking as SubmitTracking | undefined)

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
    borderRadius: t.radius,
    background: t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    boxShadow: shadowCss(t.cardShadow),
    color: t.text,
    backdropFilter: dark && t.cardBg.includes("rgba") ? "blur(20px)" : undefined,
  }

  // Reset CSS isolado: garante que tudo dentro do form tem aparencia
  // controlada pelo tema, independente do contexto (iframe com globals.css
  // ou pagina host com CSS proprio). Sem isso, o body do iframe (Next.js)
  // aplica `bg-background text-foreground` do Tailwind preflight,
  // pintando o body de branco e fazendo cards transparentes virarem
  // brancos visiveis e labels claras desaparecerem.
  const resetCss = `
    /* Reset escopado: nao vaza pra fora do form. */
    .${scopeId}, .${scopeId} * {
      box-sizing: border-box;
    }
    .${scopeId} input,
    .${scopeId} textarea,
    .${scopeId} select,
    .${scopeId} button {
      font-family: inherit;
      font-size: inherit;
      line-height: 1.4;
    }
    .${scopeId} input::placeholder,
    .${scopeId} textarea::placeholder {
      color: ${t.inputPlaceholder};
      opacity: 1;
    }
    /* Standalone (nao embed): zera bg do html/body do iframe pra
       deixar o background da pagina controlado SO pelo Wrapper. */
    ${
      embed
        ? `html, body { background: transparent !important; margin: 0 !important; padding: 0 !important; }`
        : `html, body { margin: 0; padding: 0; background: ${bgFill}; }`
    }
  `

  if (done) {
    const successCard = (
      <div
        className="w-full text-center"
        style={{
          ...cardStyle,
          maxWidth: embed ? "100%" : t.containerWidth,
          padding: `${t.cardPadding + 12}px ${t.cardPadding}px`,
        }}
      >
        <div
          className="mx-auto h-12 w-12 rounded-full flex items-center justify-center mb-4"
          style={{ background: `${t.primary}1A`, color: t.primary }}
        >
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h2 style={{ color: t.text, fontSize: 18, fontWeight: 600, margin: "0 0 8px 0" }}>
          Recebido com sucesso!
        </h2>
        <p style={{ color: t.subtitleColor, opacity: 0.8, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          {done.message ?? "Obrigado! Sua resposta foi registrada e nossa equipe entrara em contato."}
        </p>
      </div>
    )
    const Wrap = embed ? "div" : "main"
    return (
      <Wrap
        className={
          (embed ? "w-full" : "min-h-screen flex items-center justify-center px-4 py-12") +
          ` ${scopeId}`
        }
        style={
          embed
            ? { color: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize }
            : {
                background: bgFill,
                color: t.text,
                fontFamily: t.fontFamily,
                fontSize: t.fontSize,
              }
        }
      >
        <style>{resetCss}</style>
        {successCard}
      </Wrap>
    )
  }

  const inputStyleBase: React.CSSProperties = {
    background: t.inputBg,
    border: `1px solid ${t.inputBorder}`,
    color: t.inputText,
    borderRadius: t.inputRadius,
    padding: "12px 14px",
    fontSize: t.fontSize,
    fontFamily: t.fontFamily,
    width: "100%",
    outline: "none",
    boxShadow: "none",
    appearance: "none",
    margin: 0,
  }
  const focusRing = `0 0 0 3px ${t.primary}33`

  // Wrapper varia por modo:
  // - embed: apenas o card, sem fundo, sem altura forcada (ideal pra iframe)
  // - normal: pagina completa centralizada com background do tema
  const Wrapper = embed ? "div" : "main"
  const wrapperClass =
    (embed
      ? "w-full"
      : "min-h-screen flex items-start sm:items-center justify-center px-4 py-8 sm:py-12") +
    ` ${scopeId}`
  const wrapperStyle: React.CSSProperties = embed
    ? { color: t.text, fontFamily: t.fontFamily, fontSize: t.fontSize, width: "100%" }
    : {
        background: bgFill,
        color: t.text,
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
      }

  return (
    <Wrapper className={wrapperClass} style={wrapperStyle}>
      <style>{resetCss}</style>
      <form
        onSubmit={handleSubmit}
        className="w-full"
        style={{
          ...cardStyle,
          maxWidth: embed ? "100%" : t.containerWidth,
          padding: t.cardPadding,
          margin: embed ? 0 : "0 auto",
        }}
      >
        {/* Header */}
        {(form.logo_url ||
          theme.badge ||
          (!theme.hideTitle && (theme.headline || form.name)) ||
          theme.subheadline ||
          form.description) && (
          <div style={{ marginBottom: t.fieldGap + 6 }}>
            {form.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logo_url}
                alt={form.name}
                style={{ height: 40, width: "auto", marginBottom: 12, objectFit: "contain" }}
              />
            )}

            {theme.badge && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 12,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 500,
                  background: `${theme.badgeColor ?? t.primary}1A`,
                  color: theme.badgeColor ?? t.primary,
                  border: `1px solid ${theme.badgeColor ?? t.primary}33`,
                }}
              >
                <span
                  style={{
                    height: 6,
                    width: 6,
                    borderRadius: 9999,
                    background: theme.badgeColor ?? t.primary,
                    display: "inline-block",
                  }}
                  aria-hidden
                />
                {theme.badge}
              </span>
            )}

            {!theme.hideTitle && (
              <h1
                style={{
                  color: t.text,
                  fontSize: t.headingSize,
                  fontWeight: 600,
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                {theme.headline || form.name}
              </h1>
            )}
            {theme.subheadline && (
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  color: t.subtitleColor,
                  opacity: 0.7,
                  lineHeight: 1.5,
                  fontSize: t.subheadingSize,
                }}
              >
                {theme.subheadline}
              </p>
            )}
            {form.description && !theme.subheadline && (
              <p
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  color: t.subtitleColor,
                  opacity: 0.7,
                  lineHeight: 1.5,
                  fontSize: t.subheadingSize,
                }}
              >
                {form.description}
              </p>
            )}
          </div>
        )}

        {/* Campos */}
        <div style={{ display: "flex", flexDirection: "column", gap: t.fieldGap }}>
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
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              borderRadius: 6,
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.1)",
              padding: "8px 12px",
              fontSize: 12,
              color: dark ? "#FCA5A5" : "#B91C1C",
            }}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Botao */}
        <div style={{ marginTop: t.fieldGap + 4 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontWeight: 600,
              fontFamily: t.fontFamily,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "transform 120ms ease, opacity 120ms ease",
              opacity: submitting ? 0.6 : 1,
              background: buttonFill,
              color: t.buttonTextColor,
              borderRadius: t.buttonRadius,
              border: "none",
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
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                textAlign: "center",
                fontSize: 10,
                color: t.text,
                opacity: 0.5,
              }}
            >
              Powered by Convertfy
            </p>
          )}
        </div>
      </form>
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
    <label
      style={{
        display: "block",
        fontSize: t.labelSize,
        fontWeight: 500,
        marginBottom: 6,
        color: t.labelColor,
        opacity: 0.85,
        fontFamily: t.fontFamily,
      }}
    >
      {field.label}
      {field.required && <span style={{ color: t.primary }}> *</span>}
    </label>
  )
  const descEl = field.description && (
    <p
      style={{
        marginTop: 4,
        marginBottom: 0,
        fontSize: 11,
        color: t.labelColor,
        opacity: 0.6,
        fontFamily: t.fontFamily,
      }}
    >
      {field.description}
    </p>
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
              {/* Fundo/cor explicitos e OPACOS no <option>: o dropdown nativo
                  ignora o inputBg translucido (dark mode) e cai no branco
                  padrao do SO -> com texto claro herdado do select, as opcoes
                  ficavam invisiveis (texto claro sobre fundo claro). */}
              <option value="" style={{ background: t.bg, color: t.inputText }}>
                {field.placeholder ?? "Selecione..."}
              </option>
              {opts.map((o) => (
                <option key={o.value} value={o.value} style={{ background: t.bg, color: t.inputText }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {opts.map((o) => (
              <label
                key={o.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  color: t.text,
                  fontFamily: t.fontFamily,
                }}
              >
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
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 13,
            cursor: "pointer",
            color: t.text,
            fontFamily: t.fontFamily,
          }}
        >
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
              <option key={c.code} value={c.code} style={{ background: t.bg, color: t.inputText }}>
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
