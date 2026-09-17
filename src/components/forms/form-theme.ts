/**
 * O tema do formulário público — uma definição para os DOIS modos.
 *
 * O clássico e o conversacional são a mesma marca: mesma cor, mesma
 * fonte, mesmo raio. Duplicar os defaults faria os dois divergirem na
 * primeira mudança, e o cliente veria dois formulários diferentes do
 * mesmo negócio conforme o modo — sem nada em tela explicando por quê.
 *
 * `theme` é uma coluna JSONB livre: todo campo é opcional e o default
 * mora aqui. Formulário criado antes de qualquer extensão continua
 * renderizando igual.
 */

/**
 * Estrutura do theme. Todos os campos sao opcionais — defaults aplicados
 * no renderer pra manter compatibilidade com forms criados antes destas
 * extensoes.
 */
export interface FormTheme {
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
  /** Sem logo nenhuma. Sem isto, a ausência de `logo_url` vira a da casa. */
  hideLogo?: boolean
  hideLabels?: boolean
  hidePoweredBy?: boolean

  // ── Conteudo extra ──
  headline?: string
  subheadline?: string
  badge?: string // chip pequeno acima do headline (ex: "Aceleradora #1")
  badgeColor?: string
}

export function gradientCss(g: { from: string; to: string; angle?: number } | null | undefined): string | null {
  if (!g) return null
  const angle = g.angle ?? 135
  return `linear-gradient(${angle}deg, ${g.from}, ${g.to})`
}

export function defaults(theme: FormTheme) {
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

export function shadowCss(level: "none" | "sm" | "md" | "lg"): string {
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

/** O tema já resolvido, com todos os defaults aplicados. */
export type TemaResolvido = ReturnType<typeof defaults>
