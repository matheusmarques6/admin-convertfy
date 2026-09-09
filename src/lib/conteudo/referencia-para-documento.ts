/**
 * Referência → carrossel EDITÁVEL do Estúdio.
 *
 * A referência guarda o que o time gosta: a sequência de slides, a copy de
 * cada um e as imagens do post original. Até aqui isso só servia de exemplo
 * de estilo no prompt. Este módulo materializa a peça: um documento com um
 * frame por slide, a copy nos campos certos, a imagem no slot quando o tipo
 * desenha foto — e a identidade visual da casa por cima, para o resultado
 * ser editável em vez de uma cópia congelada.
 *
 * Três decisões que erram em silêncio se ficarem na tela:
 *
 * 1. **O tipo transcrito é uma intenção, não um layout.** O nosso `dado`
 *    desenha o título como um NÚMERO de 360px (limite de 5 caracteres); a
 *    transcrição marca "dado" em qualquer slide que carregue número, e o
 *    título dela costuma ser uma frase inteira. Copiar o rótulo faria a
 *    frase encolher até o piso e o slide sair ilegível — que é exatamente
 *    o "não gerou como eu queria". `dado` só permanece quando o título
 *    REALMENTE cabe como número; senão vira `texto`, que tem título de 64
 *    caracteres e corpo.
 * 2. **Campo errado some da tela.** O renderer só desenha o que existe em
 *    `campos`: capa e CTA usam `subtitulo`, o meio usa `corpo`. Jogar o
 *    corpo transcrito numa capa apagaria o texto sem erro nenhum.
 * 3. **A imagem só entra onde há lugar.** `dado` e `cta` não desenham foto
 *    (é o mesmo limite declarado na via B). A imagem desses slides fica de
 *    fora e o chamador DIZ quantos ficaram — inventar slot mudaria o
 *    layout do formato, e descartar calado faria o operador procurar a
 *    foto que ele acabou de ver na referência.
 *
 * A copy nunca é cortada: `fitFactor` encolhe o texto acima do limite, e
 * cortar aqui destruiria a copy real do carrossel que funcionou. Quem
 * passou do confortável é reportado para a tela avisar.
 *
 * Puro e testado.
 */

import { camposDoTipo } from "./templates"
import { limiteDe } from "./limites"
import { textoLimpo } from "./rich"
import type { Campo, DocFrame, EstruturaDetectada, FrameTipo, ReferenciaSlide } from "./types"

/** Tipos cujo renderer TEM lugar para foto (`frame.tsx`). */
export const TIPOS_COM_SLOT: FrameTipo[] = ["capa", "texto", "prova", "lista", "mec"]

export function tipoDesenhaImagem(tipo: FrameTipo): boolean {
  return TIPOS_COM_SLOT.includes(tipo)
}

/**
 * O título cabe como o número gigante do slide `dado`? Aceita "41%", "8x",
 * "R$ 300", "2.000" — e recusa frase, que é o caso comum da transcrição.
 */
export function pareceNumeroDeDestaque(titulo: string): boolean {
  const t = textoLimpo(titulo).trim()
  if (!t) return false
  if (t.length > (limiteDe("dado", "titulo") ?? 5) + 3) return false
  // O prefixo de moeda sai antes da régua: "R$" e "US$" trazem letra, e
  // sem isso o valor em reais — que é justamente o número que a casa põe
  // gigante — seria rebaixado a slide de texto.
  const semMoeda = t.replace(/^(?:R\$|US\$|BRL|USD|EUR|[\p{Sc}])\s*/iu, "")
  return /\d/.test(semMoeda) && /^[\s\d.,%×xX+\-–—/]+$/u.test(semMoeda)
}

/**
 * Separa a FALA do slide da descrição da ARTE.
 *
 * A transcrição descreve o visual entre colchetes — "[card com 4 métricas:
 * ROAS 3,2 … anotação manuscrita: 'esse ninguém sabe']" — e carrega as
 * instruções de navegação do carrossel original ("· DESLIZE →", "botão:
 * NOSSO MÉTODO →"). Jogar isso no corpo do slide entrega um parágrafo que
 * ninguém escreveria, e é metade do "não gerou como eu queria".
 *
 * A descrição não é descartada: ela vira a direção de arte do slide
 * (`promptImagem`, a via B), que é onde ela vale. O que sobra é a copy.
 */
export function separarCopyEArte(texto: string): { copy: string; arte: string } {
  const arte: string[] = []
  let copy = texto.replace(/\[([^\]]*)\]/g, (_, dentro: string) => {
    const t = String(dentro).trim()
    if (t) arte.push(t)
    return " "
  })

  // Navegação do carrossel original: não é fala nem arte.
  copy = copy.replace(/·?\s*DESLIZE\s*[→>›»]*/gi, " ")
  // "botão: NOSSO MÉTODO →" descreve o CTA desenhado na peça — vai para a
  // arte, porque quem desenha o botão aqui é o documento.
  copy = copy.replace(/·?\s*bot[ãa]o:\s*([^·]+)/gi, (_, txt: string) => {
    const t = String(txt).replace(/[→>›»]/g, "").trim()
    if (t) arte.push(`botão "${t}"`)
    return " "
  })

  // Descrição de arte SOLTA, sem colchetes: a transcrição costuma anexá-la
  // depois de um "·" ("· foto de pessoa em contraste", "· print da
  // manchete"). O vocabulário é curto e fechado de propósito — ampliá-lo
  // começaria a comer copy legítima, e o que sai daqui não some do
  // documento: vai para a direção de arte, visível na via B.
  const ARTE_RE = /^(?:foto|print|card|gr[áa]fico|anota[çc][ãa]o|chips?|logo|[íi]cone|imagem|ilustra[çc][ãa]o|selo|p[íi]lula)\b/i
  copy = copy
    .split("·")
    .filter((parte) => {
      const t = parte.trim()
      if (!t || !ARTE_RE.test(t)) return true
      arte.push(t)
      return false
    })
    .join(" · ")

  copy = copy
    .replace(/\s*·\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .trim()

  return { copy, arte: arte.join(" · ") }
}

/**
 * O tipo do frame a partir do slide transcrito. Sem tipo declarado, a
 * POSIÇÃO decide — primeiro é capa, último é CTA, o resto é texto. Nada de
 * adivinhar `prova` ou `lista`: errar o tipo troca o layout inteiro, e
 * `texto` é o único que aceita qualquer copy sem deformar.
 */
export function tipoDoSlide(slide: ReferenciaSlide, indice: number, total: number): FrameTipo {
  const declarado = slide.tipo
  if (!declarado) return indice === 0 ? "capa" : indice === total - 1 ? "cta" : "texto"
  if (declarado === "dado" && !pareceNumeroDeDestaque(slide.titulo ?? "")) return "texto"
  return declarado
}

/** Onde cada texto da referência entra, por tipo. */
function camposDaCopy(tipo: FrameTipo): { titulo: Campo; corpo: Campo | null } {
  if (tipo === "capa" || tipo === "cta") return { titulo: "titulo", corpo: "subtitulo" }
  return { titulo: "titulo", corpo: "corpo" }
}

export interface CampoLongo {
  ordem: number
  campo: Campo
  chars: number
  limite: number
}

export interface FramesDaReferencia {
  frames: DocFrame[]
  /** Ordem dos slides cuja imagem não tem onde entrar neste tipo de frame. */
  imagemSemLugar: number[]
  /** Copy acima do limite confortável — encolhe no canvas, não é cortada. */
  camposLongos: CampoLongo[]
}

/**
 * Os frames do documento a partir dos slides da referência. Slide sem copy
 * NENHUMA continua virando frame: a sequência é metade do valor da
 * referência, e pular o slide vazio desalinharia o resto da peça.
 */
export function framesDaReferencia(slides: ReferenciaSlide[]): FramesDaReferencia {
  const ordenados = [...slides].sort((a, b) => a.ordem - b.ordem)
  const imagemSemLugar: number[] = []
  const camposLongos: CampoLongo[] = []

  const frames = ordenados.map((s, i): DocFrame => {
    const tipo = tipoDoSlide(s, i, ordenados.length)
    const campos = camposDoTipo(tipo)
    const alvo = camposDaCopy(tipo)
    const textos: Partial<Record<Campo, string>> = {}

    const titulo = separarCopyEArte(s.titulo ?? "").copy
    const { copy: corpo, arte } = separarCopyEArte(s.corpo ?? "")
    if (titulo) textos[alvo.titulo] = titulo
    if (corpo && alvo.corpo && campos.includes(alvo.corpo)) textos[alvo.corpo] = corpo

    for (const [campo, valor] of Object.entries(textos) as Array<[Campo, string]>) {
      const lim = limiteDe(tipo, campo)
      const chars = textoLimpo(valor).length
      if (lim != null && chars > lim) camposLongos.push({ ordem: s.ordem, campo, chars, limite: lim })
    }

    const temLugar = tipoDesenhaImagem(tipo)
    if (s.imagemUrl && !temLugar) imagemSemLugar.push(s.ordem)

    return {
      frameId: `f${i + 1}`,
      tipo,
      label: tipo === "capa" ? "Capa" : tipo === "cta" ? "CTA" : `Slide ${i + 1}`,
      slotsImagem: temLugar && s.imagemUrl ? 1 : 0,
      campos,
      textos,
      imagens:
        temLugar && s.imagemUrl
          ? { slot1: { url: s.imagemUrl, zoom: 1, x: 0, y: 0, larguraSlot: 0, alturaSlot: 0 } }
          : {},
      // A descrição da arte do slide original vira a direção de arte deste
      // — é o campo que a via B usa para gerar ou pedir a imagem.
      ...(arte ? { promptImagem: arte } : {}),
    }
  })

  return { frames, imagemSemLugar, camposLongos }
}

/**
 * O texto do botão do CTA a partir da palavra-chave do comment gate. Sem
 * palavra, mantém o que o documento já tinha — botão dizendo "Comente
 * PALAVRA" é o placeholder do template, não uma promessa da referência.
 */
export function botaoDoGate(palavraChave: string | null | undefined, atual: string): string {
  const kw = (palavraChave ?? "").trim().toUpperCase()
  return kw ? `Comente ${kw}` : atual
}

/**
 * A ESTRUTURA da referência, para virar um "Meu template" reutilizável: os
 * mesmos tipos e slots do carrossel gerado, sem a copy. É o outro sentido de
 * "transformar em modelo" — um pede a peça pronta para editar, o outro pede
 * a forma para escrever de novo.
 */
export function estruturaDaReferencia(slides: ReferenciaSlide[]): EstruturaDetectada[] {
  return framesDaReferencia(slides).frames.map((f) => ({
    tipo: f.tipo,
    slotImagem: f.slotsImagem > 0,
    ...(f.promptImagem ? { descricao: f.promptImagem } : {}),
  }))
}
