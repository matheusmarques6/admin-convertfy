/**
 * Paleta a partir de UMA cor.
 *
 * Regra do `principios-de-design` da referência, adaptada: o usuário
 * informa a cor da marca e o resto do sistema é derivado — claro, escuro,
 * fundo claro, fundo escuro, borda e gradiente. É o que faz a família
 * Alternado ficar com a cara de cada cliente sem pedir sete campos de cor
 * a quem só sabe a cor do logo.
 *
 * Duas decisões que não são estética:
 *
 * 1. **A temperatura da cor escolhe o off-white e o quase-preto.** Fundo
 *    cinza-azulado sob uma marca laranja parece erro de impressão; o
 *    desvio é pequeno e é o que faz a peça parecer desenhada junto.
 * 2. **A primária NUNCA vira fundo de texto** — ela é accent em palavra
 *    solta, borda de cartão, preenchimento da barra. Por isso a paleta
 *    devolve `tinta` (a cor do texto) separada, sempre com contraste
 *    contra o fundo em que vai ser usada, e não a primária.
 *
 * Puro e testado: quem grava é a UI, quem desenha é o `frame.tsx`.
 */

import { hex6 } from "./brand"
import type { Gradiente } from "./types"

export interface Paleta {
  primaria: string
  clara: string
  escura: string
  fundoClaro: string
  fundoEscuro: string
  borda: string
  gradiente: Gradiente
  /** `warm` (vermelho→amarelo) ou `cool` (verde→roxo). */
  temperatura: "warm" | "cool"
}

const canais = (cor: string): [number, number, number] | null => {
  const h = hex6(cor)
  if (!h) return null
  return [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)) as [number, number, number]
}

const hexDe = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase()

/** Mistura com branco. */
export function comBranco(cor: string, fracao: number): string {
  const c = canais(cor)
  if (!c) return cor
  const k = Math.max(0, Math.min(1, fracao))
  return hexDe(c.map((v) => v + (255 - v) * k) as [number, number, number])
}

/** Mistura com preto. */
export function comPreto(cor: string, fracao: number): string {
  const c = canais(cor)
  if (!c) return cor
  const k = Math.max(0, Math.min(1, fracao))
  return hexDe(c.map((v) => v * (1 - k)) as [number, number, number])
}

/**
 * Matiz em graus (0–360). Devolve `null` para cinza puro, onde matiz não
 * existe — e cinza sem matiz é `cool` por convenção declarada, porque o
 * off-white neutro combina com os dois e o azulado não destoa.
 */
export function matiz(cor: string): number | null {
  const c = canais(cor)
  if (!c) return null
  const [r, g, b] = c.map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return null
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return ((h * 60) % 360 + 360) % 360
}

/** Vermelho, laranja, amarelo e magenta são quentes; o resto é frio. */
export function temperaturaDaCor(cor: string): "warm" | "cool" {
  const h = matiz(cor)
  if (h === null) return "cool"
  return h < 70 || h >= 320 ? "warm" : "cool"
}

const FUNDO_CLARO = { warm: "#F6F3F0", cool: "#F0F2F5" } as const
const FUNDO_ESCURO = { warm: "#120E0B", cool: "#0C0D10" } as const

export function paletaDeUmaCor(primaria: string): Paleta {
  const base = hex6(primaria) ? `#${hex6(primaria)}`.toUpperCase() : "#2C6BED"
  const temperatura = temperaturaDaCor(base)
  const clara = comBranco(base, 0.2)
  const escura = comPreto(base, 0.3)
  const fundoClaro = FUNDO_CLARO[temperatura]
  return {
    primaria: base,
    clara,
    escura,
    fundoClaro,
    fundoEscuro: FUNDO_ESCURO[temperatura],
    // A borda é o próprio fundo um passo mais escuro: linha que se lê como
    // sombra, não como traço de caneta.
    borda: comPreto(fundoClaro, 0.05),
    gradiente: { de: escura, meio: base, ate: clara, angulo: 165 },
    temperatura,
  }
}

/**
 * A cor do texto sobre um fundo: quase-preto no claro, branco no escuro.
 * A primária nunca entra aqui — ela é accent, e accent como corpo de texto
 * é o erro de contraste mais comum destes formatos.
 */
export function tintaSobre(fundo: string): string {
  const c = canais(fundo)
  if (!c) return "#0F0D0C"
  const [r, g, b] = c
  return (r * 299 + g * 587 + b * 114) / 1000 < 140 ? "#FFFFFF" : "#0F0D0C"
}
