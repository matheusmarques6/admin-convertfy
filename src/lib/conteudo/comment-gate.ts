/**
 * Comment gate no Estúdio: ligar a palavra do carrossel à automação.
 *
 * O carrossel termina em "comente SEGMENTO e eu te mando no direct". Até
 * aqui isso era só texto no slide: quem comentava não recebia nada, e o
 * autor não tinha como saber que faltava alguém do outro lado. Este
 * módulo decide o que o Estúdio pode ligar sozinho e o que ainda falta —
 * puro, porque a resposta muda o que a tela oferece e errar de leve
 * (oferecer o botão sem palavra, sugerir uma resposta que não menciona a
 * palavra) é o tipo de coisa que ninguém percebe até o público reclamar.
 */

import type { Documento, Perfil } from "./types"

export type ImpedimentoDoGate = "sem_palavra" | "sem_perfil" | "canal_nao_suportado"

export const IMPEDIMENTO_TEXTO: Record<ImpedimentoDoGate, string> = {
  sem_palavra: "Escreva a palavra do comment gate (ex.: SEGMENTO) para poder ligar a automação.",
  sem_perfil: "Escolha o perfil do carrossel — a automação responde pela conta que publicou.",
  canal_nao_suportado: "Por enquanto o comment gate só existe no Instagram.",
}

/** A palavra como ela vai para o gatilho: sem espaço em volta, em caixa alta. */
export function palavraDoDocumento(doc: Pick<Documento, "palavraChave">): string {
  return (doc.palavraChave ?? "").trim().toUpperCase()
}

/** O que falta para ligar. Lista vazia = pode ligar. */
export function impedimentosDoGate(
  doc: Pick<Documento, "palavraChave" | "perfil">,
  perfil: Pick<Perfil, "canal"> | null | undefined,
): ImpedimentoDoGate[] {
  const faltas: ImpedimentoDoGate[] = []
  if (!palavraDoDocumento(doc)) faltas.push("sem_palavra")
  if (!doc.perfil || !perfil) faltas.push("sem_perfil")
  else if (perfil.canal !== "instagram") faltas.push("canal_nao_suportado")
  return faltas
}

/**
 * A resposta que a pessoa recebe no direct.
 *
 * Sai do CTA do próprio carrossel quando ele diz algo além de "comente
 * X" — é o texto que o autor já escreveu para este público. Senão, um
 * texto que NOMEIA a palavra: quem comentou precisa reconhecer que a
 * mensagem é a resposta ao que ele pediu, e não um direct qualquer.
 */
export function respostaSugerida(
  doc: Pick<Documento, "palavraChave" | "cta" | "frames">,
): string {
  const palavra = palavraDoDocumento(doc)
  const frameCta = doc.frames.find((f) => f.tipo === "cta" && !f.oculto)
  const doSlide = [frameCta?.textos?.corpo, frameCta?.textos?.subtitulo]
    .map((t) => (t ?? "").trim())
    .find((t) => t.length >= 15 && !ehSoOPedido(t, palavra))

  if (doSlide) return doSlide
  return palavra
    ? `Oi! Vi seu comentário "${palavra}" 👋 Tô te mandando aqui o que prometi no carrossel.`
    : "Oi! Vi seu comentário 👋 Tô te mandando aqui o que prometi no carrossel."
}

/** "Comente SEGMENTO" não serve de resposta — é o pedido, não a entrega. */
function ehSoOPedido(texto: string, palavra: string): boolean {
  const t = texto.toLowerCase()
  if (!palavra) return /^comente\b/.test(t)
  return t.replace(palavra.toLowerCase(), "").replace(/[^a-zà-ú]/gi, "").length <= 8
}
