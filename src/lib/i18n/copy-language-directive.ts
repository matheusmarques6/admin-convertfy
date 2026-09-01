/**
 * A ordem de idioma que vai junto com a copy — porque um campo não venceu
 * quinze mil caracteres de contexto.
 *
 * O que aconteceu (Innova Bay, Welcome 1, 01/09): o payload saiu com
 * `language: "en"`, `language_source: "store"`, tudo certo — a loja é
 * americana e a coluna estava preenchida. E a copy voltou MISTURADA, dentro
 * do mesmo bloco:
 *
 *   offer_headline  → "Does it work on my car?"
 *   offer_cta_label → "SEE HOW IT WORKS"
 *   offer_body      → "Plug-and-play, compatível com OBD2 (veículos 1996+)…
 *                      Garantia vitalícia, sem risco. Menos de R$ 70."
 *
 * O motivo é o mesmo do gerador de imagens que desenhava a headline que
 * recebia: o material fala mais alto que a instrução. Um campo diz "en" e
 * todo o resto do payload — `brand.about`, `icp`, `story`,
 * `pesquisa_diagnostico`, `ads_review` — está em português, porque a
 * pesquisa é gerada em PT-BR para o time interno. Pior: `tone.use_words` é
 * uma LISTA DE FRASES em português ("garantia vitalícia", "veja como
 * funciona") e `tone.do` são quatro frases-exemplo inteiras da voz
 * desejada, também em português. O copywriter é literalmente instruído a
 * imitar aquilo.
 *
 * A moeda vem pelo mesmo caminho: a pesquisa descreve uma loja que vende em
 * USD dizendo "ticket médio abaixo de R$ 100", e o R$ atravessa para a copy.
 *
 * Este módulo escreve a ordem que faltava — explícita, no topo, dizendo
 * também o que a pesquisa É (referência sobre a VOZ) e o que ela NÃO é
 * (texto para copiar ou traduzir). Puro, sem I/O.
 *
 * A ordem sai em INGLÊS para loja não-lusófona: é a língua em que os
 * modelos seguem instrução com mais confiabilidade, e escrevê-la em
 * português seria repetir o erro que ela existe para corrigir. Loja pt-BR
 * recebe em português, onde não há conflito nenhum.
 */

import type { StoreLanguageCode } from "./store-language"

/** Nome do idioma em inglês — o rótulo do `store-language` é em PT ("Inglês"). */
const LANGUAGE_NAMES: Record<StoreLanguageCode, string> = {
  "pt-BR": "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
  de: "German",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
  nb: "Norwegian Bokmål",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  pl: "Polish",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
}

export interface CopyLanguageDirectiveInput {
  /** Código resolvido (`resolveStoreLanguage`). Fora da lista = texto livre. */
  code: string
  /** Rótulo em PT ("Inglês") — usado quando o código não é canônico. */
  label?: string | null
  /**
   * Moeda REAL da loja, de `store_top_products.currency`. Sem ela a ordem
   * ainda proíbe herdar a moeda da pesquisa, só não nomeia a certa —
   * inventar uma a partir do idioma seria pior que omitir.
   */
  currency?: string | null
}

function nomeDoIdioma(code: string, label?: string | null): string {
  const conhecido = LANGUAGE_NAMES[code as StoreLanguageCode]
  if (conhecido) return conhecido
  // "Outro" do formulário: o rótulo cru é o que existe. O agente é LLM e
  // entende "Afrikaans" tanto quanto entenderia um código ISO.
  return (label ?? "").trim() || code
}

/**
 * A ordem completa. `researchLanguage` é o idioma em que a pesquisa do
 * payload está escrita — hoje sempre pt-BR (os agentes de pesquisa rodam no
 * n8n em português). Quando ele coincidir com o da loja, o parágrafo do
 * conflito é omitido: não há nada de que se defender.
 */
export function buildCopyLanguageDirective(
  input: CopyLanguageDirectiveInput,
  researchLanguage: StoreLanguageCode = "pt-BR",
): string {
  const alvo = nomeDoIdioma(input.code, input.label)
  const moeda = (input.currency ?? "").trim().toUpperCase()
  const mesmoIdioma = input.code === researchLanguage

  if (mesmoIdioma && researchLanguage === "pt-BR") {
    const linhas = [
      "IDIOMA — INEGOCIÁVEL",
      `Escreva cada palavra deste email em ${alvo} (${input.code}): assunto, preheader e todos os campos de todos os blocos.`,
    ]
    linhas.push(
      moeda
        ? `MOEDA: esta loja vende em ${moeda}. Todo preço citado usa essa moeda.`
        : "MOEDA: use a moeda dos próprios produtos da loja (ver top_products). Nunca uma moeda tirada do texto da pesquisa.",
    )
    return linhas.join("\n")
  }

  const pesquisaEm = nomeDoIdioma(researchLanguage)
  const linhas = [
    "LANGUAGE — NOT NEGOTIABLE",
    `Write every word of this email in ${alvo} (${input.code}): the subject, the preheader and every field of every block. Not one sentence, not one word in another language.`,
    "",
    `The store research in this payload — brand, icp, tone, story, pesquisa_diagnostico, ads_review — is written in ${pesquisaEm}. It is internal material for the Convertfy team, never for this store's customers. It tells you HOW this brand sounds; it is reference about the voice, not text to copy, quote or translate.`,
    `In particular: \`tone.use_words\` and \`tone.do\` are examples of the VOICE written in ${pesquisaEm}. Match their register, their directness and their level of concreteness — never their actual words.`,
  ]
  linhas.push(
    "",
    moeda
      ? `MONEY: this store sells in ${moeda}. Every price you write uses that currency. Prices in Brazilian reais (R$) appear in the research only because the research was written in Brazil — never carry one into the copy.`
      : "MONEY: use the currency of the store's own products (see top_products). Never a currency taken from the research text.",
  )
  return linhas.join("\n")
}
