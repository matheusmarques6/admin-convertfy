/**
 * Os temas prontos do Design (handoff §6) e o que cada atalho escreve
 * no `theme` — a camada RÁPIDA por cima dos controles finos que a aba já
 * tinha (fundo, card, inputs, tamanhos).
 *
 * Puro por três razões que os testes travam:
 *
 * 1. **Aplicar um tema é escrever só o que o tema decide** (modo, fundo,
 *    card, texto, destaque, fonte) e LIMPAR o que o contradiz (o gradiente
 *    de fundo e o do card). O resto do `theme` — tamanhos, logo, textos
 *    do cabeçalho — fica. Zerar tudo apagaria a logo que alguém subiu.
 * 2. **Detectar o tema é comparar as chaves que ele escreve**, e mais
 *    nada: mexer no raio dos botões não deixa de ser "Grafite". Mas mexer
 *    na cor de destaque deixa — e aí o selo diz "Personalizado", que é o
 *    contrato do handoff.
 * 3. **O formato do botão é o RAIO**: 3, 9 e 999. Qualquer outro valor é
 *    formato próprio e o segmento não marca nenhum — marcar o mais
 *    próximo mentiria sobre o que está gravado.
 */

import type { FormTheme } from "@/components/forms/form-theme"

export interface TemaPronto {
  id: string
  nome: string
  bg: string
  card: string
  texto: string
  destaque: string
  fonte: string
}

export const TEMAS: readonly TemaPronto[] = [
  { id: "grafite", nome: "Grafite", bg: "#0B0F1A", card: "#121826", texto: "#F3F6FC", destaque: "#4E62D8", fonte: "Inter" },
  { id: "claro", nome: "Claro", bg: "#F6F7FB", card: "#FFFFFF", texto: "#111827", destaque: "#4E62D8", fonte: "Inter" },
  { id: "areia", nome: "Areia", bg: "#F4EFE6", card: "#FBF8F2", texto: "#2B241B", destaque: "#B4531B", fonte: "Georgia" },
  { id: "floresta", nome: "Floresta", bg: "#0F1F19", card: "#15291F", texto: "#EAF4EE", destaque: "#3DD6A3", fonte: "Inter" },
  { id: "meia-noite", nome: "Meia-noite", bg: "#0E1220", card: "#161C30", texto: "#F0F3FA", destaque: "#7C90F2", fonte: "Inter" },
  { id: "papel", nome: "Papel", bg: "#FFFFFF", card: "#FFFFFF", texto: "#1F2937", destaque: "#111827", fonte: "Georgia" },
]

export const GRADIENTES: ReadonlyArray<readonly [string, string]> = [
  ["#4E62D8", "#041366"],
  ["#0B0F1A", "#1E2A5A"],
  ["#7C3AED", "#DB2777"],
  ["#0F766E", "#0B0F1A"],
  ["#F97316", "#DB2777"],
  ["#F4EFE6", "#FBD9B5"],
  ["#111827", "#374151"],
  ["#0EA5E9", "#4E62D8"],
]

export const ACENTOS: readonly string[] = [
  "#4E62D8", "#2563EB", "#7C3AED", "#DB2777", "#DC2626", "#F97316",
  "#D97706", "#0F766E", "#3DD6A3", "#111827", "#FFFFFF",
]

/** `valor` é o que vai em `theme.fontFamily`; a pilha de fallback é do renderer. */
export const FONTES: ReadonlyArray<{ valor: string; rotulo: string }> = [
  { valor: "Inter", rotulo: "Inter · neutra" },
  { valor: "Georgia", rotulo: "Georgia · editorial" },
  { valor: "'Barlow Condensed'", rotulo: "Barlow Condensed · impacto" },
  { valor: "system-ui", rotulo: "Sistema" },
  { valor: "Helvetica", rotulo: "Helvetica" },
]

export type FormatoDoBotao = "reto" | "arredondado" | "pill"
export const RAIO_DO_FORMATO: Record<FormatoDoBotao, number> = { reto: 3, arredondado: 9, pill: 999 }

/** A luminância decide se o tema é claro ou escuro — é o que o renderer lê em `mode`. */
export function ehEscuro(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5
}

export function aplicarTema(theme: FormTheme, id: string): FormTheme {
  const t = TEMAS.find((x) => x.id === id)
  if (!t) return theme
  return {
    ...theme,
    mode: ehEscuro(t.bg) ? "dark" : "light",
    backgroundColor: t.bg,
    bgGradient: null,
    cardBgColor: t.card,
    cardGradient: null,
    textColor: t.texto,
    primaryColor: t.destaque,
    fontFamily: t.fonte,
  }
}

/** Qual tema está aplicado — ou `null` ("Personalizado"). */
export function temaAtual(theme: FormTheme): string | null {
  const igual = (a: string | undefined | null, b: string) =>
    (a ?? "").trim().toLowerCase() === b.toLowerCase()
  for (const t of TEMAS) {
    if (
      igual(theme.backgroundColor, t.bg) &&
      !theme.bgGradient &&
      igual(theme.cardBgColor, t.card) &&
      !theme.cardGradient &&
      igual(theme.textColor, t.texto) &&
      igual(theme.primaryColor, t.destaque) &&
      igual(theme.fontFamily, t.fonte)
    ) {
      return t.id
    }
  }
  return null
}

export function formatoDoBotao(theme: FormTheme): FormatoDoBotao | null {
  const raio = theme.buttonRadius ?? theme.borderRadius
  if (raio === undefined) return null
  for (const [k, v] of Object.entries(RAIO_DO_FORMATO) as Array<[FormatoDoBotao, number]>) {
    if (raio === v) return k
  }
  return null
}

/**
 * Escreve o raio do botão E dos inputs — o handoff chama a seção de
 * "Botões e campos", e um botão pill ao lado de um input quadrado é o
 * que ninguém pede.
 */
export function aplicarFormato(theme: FormTheme, f: FormatoDoBotao): FormTheme {
  const raio = RAIO_DO_FORMATO[f]
  return { ...theme, buttonRadius: raio, inputRadius: f === "pill" ? 14 : raio }
}

/**
 * Aplica um preset de gradiente. Quando as duas pontas mudam o MODO
 * (claro ↔ escuro), a cor de texto explícita do tema anterior é solta —
 * o marrom da Areia sobre o roxo→rosa era ilegível, e a cor "certa" é o
 * padrão do modo novo, que o renderer já sabe escolher.
 */
export function aplicarGradiente(theme: FormTheme, par: readonly [string, string]): FormTheme {
  const modo: FormTheme["mode"] =
    ehEscuro(par[0]) && ehEscuro(par[1]) ? "dark" : ehEscuro(par[0]) || ehEscuro(par[1]) ? theme.mode : "light"
  const trocouModo = modo !== undefined && modo !== (theme.mode ?? "light")
  return {
    ...theme,
    bgGradient: { from: par[0], to: par[1], angle: theme.bgGradient?.angle ?? 135 },
    mode: modo,
    ...(trocouModo ? { textColor: undefined } : {}),
  }
}
