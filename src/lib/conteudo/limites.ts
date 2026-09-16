/**
 * Limites de texto por tipo de frame — o auto-fit do canvas e o aviso da
 * interface saem daqui. Acima do limite o texto ENCOLHE (nunca estoura o
 * slide) e a pill de contexto avisa "título longo".
 */

import { limitePost } from "./formato-post"
import { LIMITES_THREAD } from "./formato-thread"
import { LIMITES_MANCHETE } from "./formato-manchete"
import { textoLimpo } from "./rich"
import type { Campo, DocFrame, FamiliaVisual, FrameTipo, Limites } from "./types"

export const ST_LIMITES: Limites = {
  capa: { titulo: 56, subtitulo: 90, gancho: 48, anotacao: 60 },
  dado: { titulo: 5, corpo: 120, gancho: 48, anotacao: 60 },
  texto: { titulo: 64, corpo: 180, gancho: 48, anotacao: 60 },
  prova: { titulo: 70, corpo: 120, gancho: 48, anotacao: 60 },
  lista: { titulo: 64, corpo: 170, gancho: 48, anotacao: 60 },
  mec: { titulo: 64, corpo: 170, gancho: 48, anotacao: 60 },
  cta: { titulo: 40, subtitulo: 110, botao: 18, anotacao: 60 },
}

/** Piso do encolhimento: abaixo disso a legibilidade a 1080px já foi. */
export const FIT_MINIMO = 0.58

/**
 * Limite do campo naquele frame.
 *
 * Quem decide é a IDENTIDADE, não só o tipo. No print de tweet o texto
 * ocupa a peça inteira, sem título gigante concorrendo, e o limite do TIPO
 * faria o auto-fit encolher uma frase que cabe — a peça deixaria de ser
 * idêntica à referência sem nada avisar. Na Manchete o título é a massa da
 * peça e passa folgado dos 56 caracteres da capa da casa.
 *
 * Família ausente = as réguas do tipo, que é o que toda peça anterior a
 * esta assinatura usava.
 */
export function limiteDe(tipo: FrameTipo, campo: Campo, familia?: FamiliaVisual | boolean): number | null {
  // O booleano é a assinatura antiga (`cartaoPerfil`) e continua valendo:
  // trocar os dois sentidos de uma vez faria um chamador esquecido passar
  // `true` e receber a régua do tipo, em silêncio.
  const f: FamiliaVisual | undefined = familia === true ? "post" : familia === false ? undefined : familia
  if (f === "post" || f === "post-largo") return limitePost(campo)
  if (f === "thread") {
    const lt = LIMITES_THREAD[campo]
    if (typeof lt === "number") return lt
  }
  if (f === "manchete") {
    const lim = LIMITES_MANCHETE[campo]
    if (typeof lim === "number") return lim
  }
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
export function camposExcedidos(frame: DocFrame, familia?: FamiliaVisual | boolean): Campo[] {
  return frame.campos.filter((c) => {
    const lim = limiteDe(frame.tipo, c, familia)
    // Conta o texto SEM os marcadores de destaque: `**` não ocupa pixel.
    return lim != null && textoLimpo(frame.textos[c] ?? "").length > lim
  })
}

export const CAMPO_LABEL: Record<Campo, string> = {
  titulo: "título",
  subtitulo: "subtítulo",
  corpo: "corpo",
  botao: "botão",
  gancho: "gancho",
  anotacao: "anotação",
  destaque: "destaque",
}
