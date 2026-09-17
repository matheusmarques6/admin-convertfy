/**
 * Como se escreve CADA PARTE de um e-mail — a camada de método que faltava.
 *
 * Por que existe (17/09): quem escreve a copy mora fora deste repositório (um
 * flow do n8n) e recebe um payload de CONTRATO — chaves, `max_caracteres`,
 * `exemplo`, proibições — sem uma linha sobre *como* escrever. Tudo que o
 * pipeline sabia sobre qualidade era negativo e factual: não inventar oferta
 * (`validadores/claims`), caber na caixa (`copy_fit`), não vazar placeholder
 * nem link morto (`content-checks`, `lint-envio`). Nenhum check, em lugar
 * nenhum, olhava se a headline carrega o argumento ou se o rótulo do botão
 * diz o que acontece ao clicar.
 *
 * O classificador já existia: `shared/field-roles.ts` sabe, só pela chave, se
 * o campo é cupom, CTA, preço, prazo, avaliação ou item de uma família
 * numerada — e era usado **só para omitir campos**. Aqui ele ganha a metade
 * que faltava: o que dizer a quem escreve aquilo.
 *
 * Três decisões que o módulo carrega:
 *
 * 1. **Papel não reconhecido devolve `null`.** Orientação genérica colada em
 *    campo que ninguém classificou é palpite, e palpite servido como regra é
 *    pior que silêncio — o modelo obedece do mesmo jeito.
 * 2. **A orientação cadastrada à mão na variante SEMPRE vence.** Esta camada
 *    é o piso da biblioteca, não o teto: quem escreveu `guidance` no
 *    `output_schema` sabia de algo que a chave não conta.
 * 3. **Texto em português, como todo o resto do sistema** (proibições do
 *    contrato, papéis do Estruturador, `fio_narrativo`). É INSTRUÇÃO para
 *    quem redige, não texto de e-mail: a peça sai no idioma da loja, que o
 *    `language_directive` repete três vezes no payload.
 *
 * Puro.
 */

import { papelDoCampo } from "./field-roles"

export type PapelDeRedacao =
  | "headline"
  | "subhead"
  | "corpo"
  | "cta"
  | "item"
  | "depoimento"
  | "microcopy"
  | "assunto"
  | "preheader"

const RE_HEADLINE = /(^|_)(headline|title|titulo|heading|h1|h2)(_|$)/i
const RE_SUBHEAD = /(^|_)(subhead(line)?|subtitle|subtitulo|eyebrow|kicker|tagline|lockup)(_|$)/i
const RE_CORPO = /(^|_)(body|paragraph|paragrafo|text|texto|description|descricao|copy|intro|content)(_|$)/i
const RE_DEPOIMENTO = /(^|_)(quote|testimonial|depoimento|review_text)(_|$)/i
const RE_MICROCOPY = /(^|_)(note|nota|caption|legenda|disclaimer|footnote|helper|hint|micro|terms|fineprint)(_|$)/i

/**
 * Campos que são DADO, não redação: o redator não os escreve, ele os
 * transcreve. Servir régua de estilo aqui convidaria a enfeitar um preço.
 */
function ehDado(p: ReturnType<typeof papelDoCampo>, key: string): boolean {
  if (p.preco || p.prazo || p.avaliacao || p.nome || p.credencial) return true
  // O código do cupom é o código. A LINHA que o explica é microcopy.
  return p.cupom && !RE_MICROCOPY.test(key) && !RE_CORPO.test(key)
}

/**
 * O papel de redação de um campo do `output_schema`.
 *
 * `tipo` é o `ComponentOutputField.type` (`text_short` / `text_long` / …):
 * `papelDoCampo` não classifica headline, subhead nem corpo, então para
 * esses a derivação é a chave mais o tipo. Campo que não é texto
 * (`image`, `url`, `number`, `boolean`) não tem papel de redação.
 */
export function papelDeRedacao(key: string, tipo?: string | null): PapelDeRedacao | null {
  const k = (key ?? "").trim()
  if (!k) return null
  if (tipo && tipo !== "text_short" && tipo !== "text_long") return null

  const p = papelDoCampo(k)
  if (p.cta) return "cta"
  if (ehDado(p, k)) return null
  if (RE_DEPOIMENTO.test(k) || (p.familia === "review" && RE_CORPO.test(k))) return "depoimento"
  if (RE_MICROCOPY.test(k)) return "microcopy"
  if (RE_SUBHEAD.test(k)) return "subhead"
  if (RE_HEADLINE.test(k)) {
    // Título DENTRO de uma grade é item: ele é lido em paralelo com os
    // irmãos, não como a manchete da peça.
    return p.familia && p.indice != null ? "item" : "headline"
  }
  if (p.familia && p.indice != null) return "item"
  if (RE_CORPO.test(k) || tipo === "text_long") return "corpo"
  return null
}

/**
 * A régua de cada papel.
 *
 * Lastro: a doutrina `subject` (`shared/doctrine-packets.ts`), as regras de
 * botão e a seção "COMO ESCREVER" do prompt de copy
 * (`docs/n8n/email-copy-prompt-v3.2.md`), os `exige` que o Estruturador
 * escreve de verdade ("títulos que contam a história sozinhos", "CTA
 * secundário, não disputa com o hero") e a régua de especificidade e
 * linguagem de resultado em rótulo de botão da literatura de UX writing.
 */
const REGUA: Record<PapelDeRedacao, string> = {
  headline:
    "Carrega o argumento sozinha: quem ler só esta linha já entende o que está sendo dito. Uma ideia, não duas coladas. Específico no lugar de adjetivo. Não repete o assunto do e-mail.",
  subhead:
    "Completa a headline em vez de reformulá-la com outras palavras. É onde entra o 'e daí': a consequência para quem está lendo.",
  corpo:
    "Uma ideia por parágrafo. Verbo concreto no lugar de abstração. Sem estrutura binária ('não é X, é Y'). Nenhum número que não esteja no material recebido.",
  cta: "Verbo mais resultado, de 2 a 4 palavras. Diz o que acontece ao clicar, não o que a pessoa deveria fazer. 'Saiba mais' e 'Clique aqui' não dizem nada.",
  item: "O título deste item conta a história sozinho: quem ler só os títulos da lista entende a sequência. Itens paralelos entre si, na mesma forma e na mesma extensão.",
  depoimento:
    "Concreto no cotidiano de quem usou, não elogio genérico. Nenhum nome, idade, nota ou número que não esteja literalmente no material recebido.",
  microcopy:
    "Menos de três linhas, junto da ação a que se refere. Informa o próximo passo de quem está lendo. Só fato confirmado: aqui não se promete nada.",
  assunto:
    "Abre uma tensão ou entrega um benefício, em até 55 caracteres. Não começa pelo código do cupom: o código é o que a pessoa encontra dentro, não o motivo de abrir.",
  preheader:
    "Completa o assunto: nunca o repete nem o resume. É a segunda linha da mesma frase, não um segundo assunto.",
}

export function orientacaoDeRedacao(papel: PapelDeRedacao | null | undefined): string | null {
  return papel ? REGUA[papel] : null
}

/** Atalho: da chave direto para a régua. `null` quando não há papel. */
export function orientacaoParaCampo(key: string, tipo?: string | null): string | null {
  return orientacaoDeRedacao(papelDeRedacao(key, tipo))
}
