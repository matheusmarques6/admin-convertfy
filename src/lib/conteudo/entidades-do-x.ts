/**
 * `@menção`, `#hashtag` e link saem em AZUL dentro do texto do post.
 *
 * É o detalhe que mais denuncia um print falso: num tweet de verdade
 * nenhuma dessas três coisas é da cor do texto, e a nossa peça escrevia
 * tudo branco. A cor vem do tema (`--tweet-color-blue-secondary` no
 * `react-tweet`: `#006FD6` no claro, `#6BC9FB` no escuro), e o que é
 * entidade segue a regra do PRÓPRIO X, não uma regex de conveniência:
 *
 * As três regras vêm da lib OFICIAL do Twitter (`twitter-text` 3.1.0,
 * Apache-2.0), lida do pacote — `regexp/validMentionOrList.js`,
 * `regexp/validMentionPrecedingChars.js`, `regexp/endMentionMatch.js` e
 * `regexp/hashtagAlpha.js`. Foram lidas porque o meu palpite errou: eu
 * tinha escrito "handle de 1 a 15" e a régua da plataforma é **1 a 20**
 * (15 é o limite de CADASTRO, não o de extração).
 *
 * - **A menção precisa de fronteira à esquerda.** Sem isso
 *   `joao@convertfy.me` viraria a menção `@convertfy` no meio de um
 *   e-mail — o X não faz isso, e pintar metade de um e-mail de azul é pior
 *   que não pintar nada. A classe é a oficial: nem letra, nem dígito, nem
 *   `_ ! # $ % & * @`.
 * - **A menção morre pelo que vem DEPOIS** (`endMentionMatch`): outro `@`,
 *   uma letra acentuada, ou `://`. É o que impede `@convertfyé` e o host
 *   de uma URL de virarem menção.
 * - **Hashtag só de dígitos NÃO é hashtag** (`#2026` é texto no X, porque
 *   senão toda data e todo preço virariam link). Precisa de ao menos uma
 *   letra, e aceita acento — `#e-commerce` para no hífen, `#vendas2026`
 *   entra inteira.
 * - **Cashtag (`$AAPL`) ficou de fora**, declarado: o X a linka, mas num
 *   carrossel de e-commerce o `$` aparece em preço, e o ganho não paga o
 *   risco de pintar o que não é entidade.
 * - **URL** cobre `https?://…` e `www.…`; domínio solto (`convertfy.me`)
 *   fica FORA de propósito: o X o linka, mas aqui reconhecê-lo faria
 *   qualquer frase com ponto e sem espaço ("comprou.Depois") virar link.
 *   Errar para menos aqui custa uma cor; errar para mais pinta texto comum.
 *
 * Puro, sem React: quem desenha é o `frame.tsx`. Compõe com o `rich.ts` —
 * o `**destaque**` continua valendo, e uma menção dentro de um destaque
 * sai azul (a entidade é do X, o destaque é nosso; empatar nos dois
 * deixaria a palavra com duas cores impossíveis).
 */

import { partesDestacadas, type PedacoTexto } from "./rich"

export interface PedacoDeTweet extends PedacoTexto {
  /** `@menção`, `#hashtag` ou URL — pinta com a cor de link do tema. */
  link: boolean
}

/** `latinAccentChars` da lib oficial, recortado ao que o pt-BR usa. */
const ACENTO = "\\xC0-\\xD6\\xD8-\\xF6\\xF8-\\xFF\\u0100-\\u024F\\u0300-\\u036F\\u1E00-\\u1EFF"

/**
 * Uma alternativa só, para a varredura ser da esquerda para a direita e o
 * primeiro casamento vencer — como o X resolve sobreposição. A classe do
 * caractere precedente é a de `validMentionPrecedingChars`.
 */
const ENTIDADE = new RegExp(
  "(https?://[^\\s<>\"]+[^\\s<>\".,;:!?)\\]}]|www\\.[^\\s<>\"]+[^\\s<>\".,;:!?)\\]}])" +
    "|(^|[^a-zA-Z0-9_!#$%&*@])([@#])([A-Za-z0-9_" +
    ACENTO +
    "]+)",
  "g",
)

/** `endMentionMatch`: o que vem depois pode MATAR a menção. */
const FIM_DE_MENCAO = new RegExp("^(?:@|[" + ACENTO + "]|://)")

function ehEntidadeValida(marca: string, corpo: string, depois: string): boolean {
  if (marca === "@") {
    // `[a-zA-Z0-9_]{1,20}` — 20, não 15: 15 é o limite de cadastro.
    if (!/^[A-Za-z0-9_]{1,20}$/.test(corpo)) return false
    return !FIM_DE_MENCAO.test(depois)
  }
  // Hashtag: precisa de pelo menos UMA letra — `#2026` é texto.
  return new RegExp("[A-Za-z" + ACENTO + "]").test(corpo)
}

/** Quebra UM trecho de texto em pedaços de link e não-link, na ordem. */
export function partesDeEntidades(texto: string): Array<{ texto: string; link: boolean }> {
  const out: Array<{ texto: string; link: boolean }> = []
  let i = 0
  for (const m of texto.matchAll(new RegExp(ENTIDADE.source, "g"))) {
    const inicio = m.index ?? 0
    const [, url, antes, marca, corpo] = m
    let de: number
    let ate: number
    if (url) {
      de = inicio
      ate = inicio + url.length
    } else {
      const inicioDaMarca = inicio + (antes?.length ?? 0)
      const fim = inicioDaMarca + 1 + corpo.length
      if (!ehEntidadeValida(marca, corpo, texto.slice(fim))) continue
      de = inicioDaMarca
      ate = fim
    }
    if (de < i) continue
    if (de > i) out.push({ texto: texto.slice(i, de), link: false })
    out.push({ texto: texto.slice(de, ate), link: true })
    i = ate
  }
  if (i < texto.length) out.push({ texto: texto.slice(i), link: false })
  return out.filter((p) => p.texto.length > 0)
}

export function temEntidadeDoX(texto: string): boolean {
  return partesDeEntidades(texto).some((p) => p.link)
}

/**
 * O texto do post pronto para desenhar: destaque da casa + entidades do X.
 *
 * A ordem importa — o destaque é marcação NOSSA (`**x**`) e some do texto
 * visível, então ele é resolvido primeiro; as entidades são lidas no texto
 * já limpo, que é o que o leitor vê.
 */
export function partesDeTweet(texto: string): PedacoDeTweet[] {
  const out: PedacoDeTweet[] = []
  for (const pedaco of partesDestacadas(texto)) {
    for (const parte of partesDeEntidades(pedaco.texto)) {
      out.push({ texto: parte.texto, destaque: pedaco.destaque, link: parte.link })
    }
  }
  return out
}
