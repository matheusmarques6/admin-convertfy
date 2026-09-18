/**
 * A espinha do formulário no editor: o que a coluna da esquerda lista, e
 * o que o painel da direita mostra quando cada item é escolhido.
 *
 * Existe como módulo puro por uma razão só, e ela já custou caro neste
 * repositório: **campo que o formato não desenha não pode aparecer na
 * tela**. O editor antigo mostrava "Headline (título grande)" e
 * "Subtítulo" no formato conversacional com um parágrafo explicando que
 * ali eles não valem — quem os preenchia escrevia para ninguém. Aqui a
 * lista é DERIVADA do formato, então o campo fantasma não tem por onde
 * nascer.
 *
 * O que cada formato tem:
 *
 * | | página única | conversacional |
 * |---|---|---|
 * | abre com | cabeçalho (badge, título, subtítulo) | tela de abertura |
 * | perguntas | todas numa página | agrupadas em telas |
 * | desvio | não existe (tudo aparece junto) | por tela |
 * | fecha com | botão de envio | telas finais |
 */

import type { FormSchema } from "@/types/forms-conversational"

export type ModoDoFormulario = "classic" | "conversational"

/** O que está selecionado. `null` = nada, e aí o inspetor ensina. */
export type Selecao =
  | { tipo: "abertura" }
  | { tipo: "cabecalho" }
  | { tipo: "tela"; ref: string }
  | { tipo: "pergunta"; ref: string }
  | { tipo: "final"; ref: string }
  | { tipo: "envio" }
  | null

export type EspecieDeItem = Exclude<Selecao, null>["tipo"]

export interface PerguntaNaEspinha {
  ref: string
  rotulo: string
  tipo: string
  obrigatoria: boolean
  /** Quantos desvios PARTEM desta pergunta. Só no conversacional. */
  desvios: number
  /** Ela é a primeira da tela — a que carrega o título e o destino. */
  cabecaDaTela: boolean
}

export interface TelaNaEspinha {
  /** `ref` da pergunta que ABRE a tela: é por ele que a tela é endereçada. */
  ref: string
  numero: number
  titulo: string
  perguntas: PerguntaNaEspinha[]
  /** Desvios que partem de qualquer pergunta desta tela. */
  desvios: number
}

export interface Espinha {
  /** O item de abertura, quando o formato tem um. */
  abre: { tipo: "abertura" | "cabecalho"; rotulo: string; preenchido: boolean } | null
  telas: TelaNaEspinha[]
  /** Perguntas soltas (formato de página única): uma "tela" só. */
  finais: Array<{ ref: string; titulo: string; padrao: boolean; desqualifica: boolean; temDestino: boolean }>
  /** O item de fecho do formato de página única. */
  fecha: { tipo: "envio"; rotulo: string } | null
}

export interface CampoDaEspinha {
  ref: string
  label: string
  field_type: string
  required?: boolean
  hidden?: boolean
}

/**
 * Monta a espinha. As perguntas vêm da lista viva (`crm_form_fields`,
 * que é quem manda na ORDEM) e o agrupamento vem do schema — os dois
 * estão partidos no editor, e juntá-los aqui é o que impede a tela de
 * discordar do que será publicado.
 */
export function montarEspinha(
  campos: readonly CampoDaEspinha[],
  schema: FormSchema,
  modo: ModoDoFormulario,
  opts: { temAbertura?: boolean; temCabecalho?: boolean } = {},
): Espinha {
  const conversa = modo === "conversational"
  const blocoPorRef = new Map((schema.blocks ?? []).map((b) => [b.ref, b]))
  const visiveis = campos.filter((c) => !c.hidden && !blocoPorRef.get(c.ref)?.hidden)

  const telas: TelaNaEspinha[] = []
  for (const campo of visiveis) {
    const bloco = blocoPorRef.get(campo.ref)
    const pergunta: PerguntaNaEspinha = {
      ref: campo.ref,
      rotulo: campo.label,
      tipo: campo.field_type,
      obrigatoria: Boolean(campo.required),
      desvios: conversa ? (bloco?.logic?.length ?? 0) : 0,
      cabecaDaTela: false,
    }
    // No formato de página única não existe tela: tudo aparece de uma
    // vez, e numerar seis "telas" prometeria um passo a passo que o
    // visitante nunca vê.
    const juntaComAnterior = conversa && Boolean(bloco?.mesma_tela) && telas.length > 0
    if (juntaComAnterior || (!conversa && telas.length > 0)) {
      telas[telas.length - 1].perguntas.push(pergunta)
    } else {
      pergunta.cabecaDaTela = conversa
      telas.push({
        ref: campo.ref,
        numero: telas.length + 1,
        titulo: (bloco?.titulo_da_tela ?? "").trim(),
        perguntas: [pergunta],
        desvios: 0,
      })
    }
  }
  for (const t of telas) t.desvios = t.perguntas.reduce((s, p) => s + p.desvios, 0)

  return {
    abre: conversa
      ? { tipo: "abertura", rotulo: "Tela de abertura", preenchido: Boolean(schema.settings?.welcome) }
      : opts.temCabecalho === false
        ? null
        : { tipo: "cabecalho", rotulo: "Cabeçalho", preenchido: true },
    telas,
    finais: conversa
      ? (schema.endings ?? []).map((e, i) => ({
          ref: e.ref,
          titulo: (e.title ?? "").trim() || e.ref,
          padrao: i === 0,
          desqualifica: Boolean(e.disqualified),
          temDestino: Boolean(e.destino),
        }))
      : [],
    fecha: conversa ? null : { tipo: "envio", rotulo: "Botão de envio" },
  }
}

/**
 * A seleção continua válida?
 *
 * Apagar a pergunta selecionada, ou trocar de formato, deixaria o painel
 * da direita mostrando algo que não existe mais — e no formato errado
 * mostraria um campo que ninguém desenha, que é o defeito que este
 * módulo existe para fechar.
 */
export function selecaoValida(sel: Selecao, espinha: Espinha, modo: ModoDoFormulario): boolean {
  if (!sel) return true
  const conversa = modo === "conversational"
  switch (sel.tipo) {
    case "abertura":
      return conversa
    case "cabecalho":
      return !conversa && espinha.abre?.tipo === "cabecalho"
    case "envio":
      return !conversa
    case "final":
      return conversa && espinha.finais.some((f) => f.ref === sel.ref)
    case "tela":
      return conversa && espinha.telas.some((t) => t.ref === sel.ref)
    case "pergunta":
      return espinha.telas.some((t) => t.perguntas.some((p) => p.ref === sel.ref))
  }
}

/**
 * Para onde a seleção vai quando a atual deixa de existir.
 *
 * Volta para a PRIMEIRA pergunta, não para `null`: o painel vazio faz o
 * operador procurar o que clicar, e depois de apagar uma pergunta ele
 * quase sempre quer a vizinha. `null` só quando não há pergunta nenhuma.
 */
export function selecaoDeReserva(espinha: Espinha): Selecao {
  const primeira = espinha.telas[0]?.perguntas[0]
  if (primeira) return { tipo: "pergunta", ref: primeira.ref }
  if (espinha.abre) return { tipo: espinha.abre.tipo }
  return null
}

export function podarSelecao(sel: Selecao, espinha: Espinha, modo: ModoDoFormulario): Selecao {
  return selecaoValida(sel, espinha, modo) ? sel : selecaoDeReserva(espinha)
}

/** A pergunta selecionada — ou a que abre a tela selecionada. */
export function refDaPergunta(sel: Selecao, espinha: Espinha): string | null {
  if (!sel) return null
  if (sel.tipo === "pergunta") return sel.ref
  if (sel.tipo === "tela") return espinha.telas.find((t) => t.ref === sel.ref)?.ref ?? null
  return null
}

/**
 * Qual tela a PRÉVIA deve mostrar para a seleção — o `ref` do bloco onde
 * ela deve pousar, ou `null` para a abertura/o fim.
 *
 * A prévia é o renderizador de PRODUÇÃO e navega por tela, então uma
 * pergunta agrupada endereça a CABEÇA: pousar no meio de um grupo
 * mostraria meia tela, que é o que a engine já proíbe para quem responde.
 */
export function telaDaPrevia(sel: Selecao, espinha: Espinha): string | null {
  if (!sel) return null
  if (sel.tipo === "tela") return sel.ref
  if (sel.tipo === "pergunta") {
    const t = espinha.telas.find((x) => x.perguntas.some((p) => p.ref === sel.ref))
    return t?.ref ?? null
  }
  return null
}

export function ehSelecaoIgual(a: Selecao, b: Selecao): boolean {
  if (a === null || b === null) return a === b
  if (a.tipo !== b.tipo) return false
  return "ref" in a && "ref" in b ? a.ref === b.ref : true
}

/** Rótulo curto do tipo, para a lista. O nome cru (`multi_select`) não é legível. */
export const TIPO_CURTO: Record<string, string> = {
  text: "Texto",
  textarea: "Texto longo",
  email: "E-mail",
  phone: "Telefone",
  number: "Número",
  url: "Site",
  date: "Data",
  select: "Escolha",
  radio: "Escolha",
  multi_select: "Várias",
  checkbox: "Sim/Não",
  hidden: "Oculto",
}

export function rotuloDoTipo(tipo: string): string {
  return TIPO_CURTO[tipo] ?? tipo
}
