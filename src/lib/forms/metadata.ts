/**
 * O título e a descrição da PÁGINA pública do formulário.
 *
 * A página não declarava nenhum: `/forms/diagnostico` herdava o título
 * do app — "Convertfy Admin - Sistema de Gestão para Agências" — na aba
 * do navegador e, pior, na prévia do link. Quem recebe o endereço no
 * WhatsApp (que é por onde este público manda coisa um para o outro) via
 * a descrição de um produto administrativo interno no lugar da oferta.
 * Num destino de anúncio isso é vazamento de conversão, não detalhe.
 *
 * A regra é uma só: **o que vai na aba é o que o visitante lê na tela.**
 *
 * - No conversacional, a tela de abertura (`settings.welcome`) — é ela
 *   que carrega a copy do anúncio;
 * - no clássico, o cabeçalho do cartão (`theme.headline` /
 *   `theme.subheadline`, com o nome e a descrição do formulário como
 *   queda).
 *
 * `crm_forms.description` é a ÚLTIMA opção de propósito: no clássico ela
 * aparece na tela, mas quem escreve ali costuma escrever para si mesmo
 * ("Diagnóstico conversacional para tráfego pago (uma pergunta por
 * vez)"), e no conversacional ela não é exibida em lugar nenhum.
 *
 * O recall passa pelo MESMO `aplicarRecall` da tela, com as respostas
 * vazias: na abertura ninguém respondeu nada, então "Prazer, {{nome}}"
 * vira "Prazer," na aba exatamente como viraria na tela — e nunca a
 * chave crua.
 */

import { aplicarRecall } from "./recall"
import type { FormSchema } from "@/types/forms-conversational"

export interface FormParaMetadata {
  name?: string | null
  description?: string | null
  theme?: { headline?: unknown; subheadline?: unknown; hideTitle?: unknown } | null
}

export interface MetadataDoFormulario {
  title: string
  description: string | null
}

/** O teto que os dois lados (aba e prévia do link) respeitam. */
const MAX_TITULO = 70
const MAX_DESCRICAO = 200

/**
 * Limpa a pontuação que sobra quando o recall não tem o que preencher.
 *
 * "Prazer, {{nome}}. Vamos começar?" na abertura é "Prazer, . Vamos
 * começar?" — a vírgula ficou pendurada. Ela some, sobra "Prazer.", que
 * é o que uma pessoa escreveria. Sem isto o título do anúncio abre com
 * um erro de digitação na aba.
 */
export function limparPontuacaoOrfa(s: string): string {
  return s
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[,;:]+(?=[.!?])/g, "")
    .replace(/([,;:])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t === "" ? null : t
}

/** Corta na PALAVRA e marca o corte — meia palavra parece defeito. */
export function encurtar(s: string | null, max: number): string | null {
  if (!s) return null
  const limpo = s.replace(/\s+/g, " ").trim()
  if (limpo.length <= max) return limpo
  const corte = limpo.slice(0, max - 1)
  const espaco = corte.lastIndexOf(" ")
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`
}

export function metadataDoFormulario(params: {
  form: FormParaMetadata
  schema?: FormSchema | null
  displayMode?: "classic" | "conversational"
}): MetadataDoFormulario {
  const { form, schema, displayMode } = params
  const tema = form.theme ?? {}
  const welcome = displayMode === "conversational" ? schema?.settings?.welcome : undefined

  // O recall roda sem resposta nenhuma — é o estado da abertura.
  const ctx = { answers: {}, hidden: {}, variables: {}, blocks: schema?.blocks ?? [] }
  const comRecall = (v: string | null) => {
    const r = v ? limparPontuacaoOrfa(aplicarRecall(v, ctx)) : ""
    return r === "" ? null : r
  }

  // `hideTitle` esconde o título NA TELA (headline dentro da arte, por
  // exemplo). A aba continua precisando de um, e aí o nome do formulário
  // é a queda certa.
  const doTema = tema.hideTitle === true ? null : comRecall(texto(tema.headline))
  const titulo =
    comRecall(texto(welcome?.title)) ?? doTema ?? comRecall(texto(form.name)) ?? "Formulário"

  const descricao =
    comRecall(texto(welcome?.description)) ??
    comRecall(texto(tema.subheadline)) ??
    comRecall(texto(form.description))

  return {
    title: encurtar(titulo, MAX_TITULO) ?? "Formulário",
    description: encurtar(descricao, MAX_DESCRICAO),
  }
}
