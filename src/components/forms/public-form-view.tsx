"use client"

import { useEffect, useState, useMemo, useId } from "react"
import { CheckCircle2, AlertCircle, Loader2, ChevronDown } from "lucide-react"
import {
  fireConversionPixels,
  matchingDoBrowser,
  useFormPixels,
  type FormTracking,
  type SubmitTracking,
} from "./form-pixels"
import { alturaDaLogo, logoDoFormulario } from "@/lib/forms/logo"
import { ESPERA_DO_DESTINO_MS, montarDestino, type DestinoPronto } from "@/lib/forms/destino"
import type { DestinoDoFinal, FormAnswers, FormBlock } from "@/types/forms-conversational"
import { defaults, gradientCss, shadowCss, type FormTheme } from "./form-theme"
import {
  mascaraDeTelefone,
  paisDeTelefone,
  paisSugeridoPeloNavegador,
  PAISES_DE_TELEFONE,
  PLACEHOLDERS_DE_TELEFONE,
  telefoneCanonico,
} from "@/lib/forms/telefone"

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
  theme: FormTheme
  logo_url: string | null
  success_message: string | null
  redirect_url: string | null
  /**
   * Para onde vai o lead QUALIFICADO. O formato de página única não tem
   * finais, então o destino é do formulário e quem decide quem o recebe
   * é a régua de qualificação — a MESMA do evento `LeadQualificado`,
   * avaliada no servidor. Quem não qualifica segue no caminho de sempre.
   */
  destino_qualificado?: DestinoDoFinal | null
  tracking?: FormTracking
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

export function PublicFormView({ slug, payload, utm, clickIds, preview = false, embed = false }: Props) {
  const { form, fields } = payload
  const theme = form.theme ?? {}
  const t = defaults(theme)
  /**
   * A logo da casa entra só no formulário STANDALONE.
   *
   * Embutido, a página que hospeda já carrega a marca dela, e uma
   * segunda logo dentro do card parece erro de montagem. Logo própria
   * (`logo_url`) continua aparecendo nos dois — ali alguém escolheu.
   */
  const logo = embed
    ? { url: (form.logo_url ?? "").trim() || null, daCasa: false }
    : logoDoFormulario({ logoUrl: form.logo_url, ocultar: theme.hideLogo, modo: theme.mode })
  const dark = t.mode === "dark"

  // ID unico por instancia, usado pra escopar o CSS reset (isola estilos
  // do form de qualquer CSS herdado — Tailwind preflight do iframe ou
  // CSS da landing host quando renderizado fora de iframe).
  const reactId = useId()
  const scopeId = `cf-form-${reactId.replace(/:/g, "")}`

  const bgFill = gradientCss(theme.bgGradient) ?? t.bg
  const buttonFill = gradientCss(theme.buttonGradient) ?? t.primary

  const [answers, setAnswers] = useState<Record<string, unknown>>({})

  /**
   * Os campos vistos como blocos, só para montar o destino: é o que
   * permite ao `{{Seu nome}}` da mensagem do WhatsApp e ao
   * pré-preenchimento do Calendly lerem as respostas pelo MESMO caminho
   * do formato conversacional. O `ref` é o `crm_form_fields.id`, que é o
   * endereço da resposta nos dois formatos.
   */
  const blocosParaDestino = useMemo<FormBlock[]>(
    () =>
      fields.map((f) => ({
        ref: f.id,
        type: "text",
        label: f.label,
        map_to_lead_field: f.map_to_lead_field,
      })) as FormBlock[],
    [fields],
  )
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ message: string | null; destino?: DestinoPronto | null } | null>(null)

  // O automático leva sozinho, mas só depois de a tela de sucesso
  // existir: ver `ESPERA_DO_DESTINO_MS`. Na PRÉVIA não navega — ela roda
  // dentro do editor, na mesma janela, e levaria junto o rascunho que o
  // operador ainda não salvou.
  const destinoAutomatico = !preview && done?.destino?.automatico ? done.destino.url : null
  useEffect(() => {
    if (!destinoAutomatico) return
    const id = window.setTimeout(() => {
      window.location.href = destinoAutomatico
    }, ESPERA_DO_DESTINO_MS)
    return () => window.clearTimeout(id)
  }, [destinoAutomatico])

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

  // Pixels de browser (Meta/Google) no mount — mesmo hook do conversacional.
  useFormPixels(form.tracking, preview)

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
    //
    // O destino do qualificado NÃO é montado aqui, e isso é declarado: a
    // régua de qualificação roda no SERVIDOR, e na prévia não há resposta
    // dele. Fingir que qualificou mostraria um botão que o visitante real
    // pode não ver — pior que não mostrar nada.
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
      const { fbc, fbp } = matchingDoBrowser(clickIds?.fbclid)
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

      // Lead qualificado com destino configurado: ele VENCE o
      // `redirect_url`, que é um endereço fixo para todo mundo. É o
      // ponto do funil em que a pessoa está mais perto de falar com a
      // gente — mandá-la para a página genérica aqui é jogar fora a
      // intenção que ela acabou de demonstrar.
      const qualificado = Boolean((json.tracking as SubmitTracking | undefined)?.qualified)
      const destino = qualificado
        ? montarDestino(form.destino_qualificado, {
            answers: answers as FormAnswers,
            blocks: blocosParaDestino,
            utm: utm as Record<string, string | null>,
          })
        : null

      if (!destino && json.redirect_url) {
        window.location.href = json.redirect_url
        return
      }
      setDone({ message: json.success_message ?? form.success_message ?? null, destino })
    } catch {
      setError("Falha de rede. Verifique sua conexao.")
    } finally {
      setSubmitting(false)
    }
  }

  // O gradiente VENCE a cor sólida do card, como `bgGradient` vence
  // `backgroundColor` na página. O `backdrop-filter` sai junto: ele é
  // para o card translúcido do modo escuro, e sobre um gradiente opaco
  // só custa composição.
  const cardGradiente = gradientCss(theme.cardGradient)
  const cardStyle: React.CSSProperties = {
    borderRadius: t.radius,
    background: cardGradiente ?? t.cardBg,
    border: `1px solid ${t.cardBorder}`,
    boxShadow: shadowCss(t.cardShadow),
    color: t.text,
    backdropFilter:
      !cardGradiente && dark && t.cardBg.includes("rgba") ? "blur(20px)" : undefined,
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
        {done.destino && (
          <>
            <a
              href={done.destino.url}
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                marginTop: 20,
                padding: "11px 22px",
                borderRadius: t.buttonRadius,
                background: t.primary,
                color: t.buttonTextColor,
                fontWeight: 600,
                fontSize: 13.5,
                textDecoration: "none",
              }}
            >
              {done.destino.rotulo}
            </a>
            {done.destino.automatico && (
              <p style={{ marginTop: 10, fontSize: 11.5, opacity: 0.6, color: t.subtitleColor }}>
                {preview
                  ? "No ar, esta tela leva sozinha em ~1s. Na prévia, não."
                  : done.destino.tipo === "whatsapp"
                    ? "Abrindo o WhatsApp… se não abrir sozinho, toque no botão."
                    : "Levando para a agenda… se não abrir sozinho, toque no botão."}
              </p>
            )}
          </>
        )}
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
        {(logo.url ||
          theme.badge ||
          (!theme.hideTitle && (theme.headline || form.name)) ||
          theme.subheadline ||
          form.description) && (
          <div style={{ marginBottom: t.fieldGap + 6 }}>
            {logo.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo.url}
                alt={logo.daCasa ? "Convertfy" : form.name}
                style={{
                  height: alturaDaLogo(theme.logoHeight, "classic"),
                  width: "auto",
                  marginBottom: 12,
                  objectFit: "contain",
                  ...(theme.logoAlign === "center"
                    ? { marginLeft: "auto", marginRight: "auto" }
                    : null),
                }}
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
  const [country, setCountry] = useState<string>(() => paisSugeridoPeloNavegador())
  const [phone, setPhone] = useState<string>("")

  // Mantem o valor sincronizado pra o submit (envia formato canonico:
  // "+DD numero_apenas_digitos").
  useEffect(() => {
    onChange(telefoneCanonico(country, phone))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, phone])

  // Se o pai resetar o value, reseta tambem.
  useEffect(() => {
    if (typeof value === "string" && value === "") setPhone("")
  }, [value])

  const current = paisDeTelefone(country)
  // A máscara do PAÍS vence a do cadastro, pelo mesmo motivo do
  // conversacional: com o seletor de DDI ao lado, "+1" com
  // "(11) 99999-9999" manda digitar no formato de outro país.
  const placeholder = PLACEHOLDERS_DE_TELEFONE[country] || field.placeholder || "Telefone"

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
              setPhone((p) => mascaraDeTelefone(e.target.value, p))
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
            {PAISES_DE_TELEFONE.map((c) => (
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
          onChange={(e) => setPhone(mascaraDeTelefone(country, e.target.value))}
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
