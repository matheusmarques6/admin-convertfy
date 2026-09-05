/**
 * Limites de texto por tipo de frame — o auto-fit do canvas e o aviso da
 * interface saem daqui. Acima do limite o texto ENCOLHE (nunca estoura o
 * slide) e a pill de contexto avisa "título longo".
 */

import type { Campo, DocFrame, FrameTipo, Limites } from "./types"

export const ST_LIMITES: Limites = {
  capa: { titulo: 56, subtitulo: 90 },
  dado: { titulo: 5, corpo: 120 },
  texto: { titulo: 64, corpo: 180 },
  prova: { titulo: 70, corpo: 120 },
  lista: { titulo: 64, corpo: 170 },
  mec: { titulo: 64, corpo: 170 },
  cta: { titulo: 40, subtitulo: 110, botao: 18 },
}

/** Piso do encolhimento: abaixo disso a legibilidade a 1080px já foi. */
export const FIT_MINIMO = 0.58

export function limiteDe(tipo: FrameTipo, campo: Campo): number | null {
  const lim = ST_LIMITES[tipo]?.[campo]
  return typeof lim === "number" ? lim : null
}

/**
 * Fator de escala do texto (1 = tamanho do template). Curva suave
 * (expoente 0,75) para o texto encolher gradualmente, com piso.
 */
export function fitFactor(comprimento: number, limite: number | null): number {
  if (!limite || comprimento <= limite) return 1
  return Math.max(FIT_MINIMO, Math.pow(limite / comprimento, 0.75))
}

/** Campos do frame cujo texto passou do limite (para o aviso da pill). */
export function camposExcedidos(frame: DocFrame): Campo[] {
  return frame.campos.filter((c) => {
    const lim = limiteDe(frame.tipo, c)
    return lim != null && (frame.textos[c] ?? "").length > lim
  })
}

export const CAMPO_LABEL: Record<Campo, string> = {
  titulo: "título",
  subtitulo: "subtítulo",
  corpo: "corpo",
  botao: "botão",
}
