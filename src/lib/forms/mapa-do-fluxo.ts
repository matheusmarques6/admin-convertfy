/**
 * O fluxo visto como o visitante o percorre: **por TELA**.
 *
 * O construtor listava BLOCOS e dizia, debaixo de cada um, "segue para o
 * próximo". Com perguntas agrupadas isso é ficção: no funil de
 * diagnóstico são 10 blocos e 6 telas, e quatro daquelas linhas anunciam
 * um passo que nunca acontece — nome, sobrenome, WhatsApp e e-mail são
 * a MESMA tela e um clique só. Quem monta o fluxo lendo aquilo conta os
 * passos errado, e a pergunta que divide a tela com outra simplesmente
 * não aparece em lugar nenhum como parte dela.
 *
 * Pior: a regra escrita na 3ª pergunta de um grupo vale para a tela
 * inteira (é o que `proximoPasso` faz — lê as regras de todas), e o
 * construtor a mostrava como se fosse um passo próprio.
 *
 * Este módulo é a leitura única: uma tela, as perguntas dela, os desvios
 * que partem de qualquer uma delas, e para onde vai quem não cai em
 * desvio nenhum. Ele NÃO reimplementa a navegação — `blocosDaTela`,
 * `inicioDaTela` e `proximoDeclarado` vêm da engine, para o que a tela
 * mostra ser exatamente o que o formulário faz.
 *
 * Puro: sem I/O, sem React.
 */

import type { FormBlock, FormEnding, FormSchema, LogicRule } from "@/types/forms-conversational"
import { blocosDaTela, blocosVisiveis, proximoDeclarado } from "./engine"
import { derivadosDoSchema } from "./derivados"

const PREFIXO_ENDING = "ending:"

/** Termina o formulário no final padrão — o `goto` genérico. */
export const GOTO_FIM = PREFIXO_ENDING

/** Um desvio, com a pergunta de onde ele parte. */
export interface RegraDaTela {
  /** Bloco que CARREGA a regra: é ali que ela é gravada. */
  ref: string
  /** Índice dentro do `logic` daquele bloco — como a tela a endereça. */
  indice: number
  regra: LogicRule
  /** Rótulo da pergunta que a carrega. Numa tela de 4 campos, importa. */
  deQuemParte: string
}

/** Um destino possível, já resolvido em algo que dá para ler. */
export type AlvoDoFluxo =
  | { tipo: "tela"; goto: string; numero: number; rotulo: string }
  | { tipo: "final"; goto: string; ref: string | null; rotulo: string }
  | { tipo: "perdido"; goto: string; rotulo: string }

export interface TelaDoFluxo {
  /** 1-based — é o número que o construtor mostra. */
  numero: number
  /** `ref` do bloco que abre a tela. É por ele que a engine a endereça. */
  cabeca: string
  titulo: string | null
  blocos: FormBlock[]
  regras: RegraDaTela[]
  /**
   * O `goto` declarado no `proximo`, ou `null` quando ninguém declarou —
   * e aí vale a ordem. A distinção importa na tela: "em ordem" e
   * "configurado para a mesma tela seguinte" parecem iguais e não são,
   * porque inserir uma pergunta no meio muda um e não muda o outro.
   */
  proximoDeclarado: string | null
  /** Para onde vai, de fato, quem não cai em desvio nenhum. */
  destino: AlvoDoFluxo
}

function rotuloDoBloco(b: FormBlock, i: number): string {
  const t = (b.label ?? "").trim()
  return t || `Pergunta ${i + 1}`
}

function rotuloDoFinal(e: FormEnding | undefined, i: number): string {
  const t = (e?.title ?? "").trim()
  return t || `Final ${i + 1}`
}

/**
 * As telas, na ordem, com tudo o que o construtor precisa mostrar.
 *
 * Bloco oculto fica FORA: ele não é uma tela (o valor vem da URL), e
 * mostrá-lo como passo faria o operador contar um passo a mais do que o
 * visitante vê.
 *
 * **Limite declarado:** `telasDaSequencia` (`telas.ts`), que numera as
 * telas na aba Perguntas, NÃO filtra oculto — ela recebe a lista de
 * campos do editor, que hoje nunca tem um. Medido em 17/09: zero campos
 * ocultos em produção e nenhuma UI que os crie. No dia em que houver, as
 * duas numerações passam a discordar ("Tela 3" numa aba e "Tela 4" na
 * outra, sem nada explicando), e as duas precisam mudar juntas.
 */
export function telasDoFluxo(schema: FormSchema): TelaDoFluxo[] {
  const vis = blocosVisiveis(schema)
  const telas: TelaDoFluxo[] = []

  // Cabeças na ordem: o primeiro visível e todo bloco que não divide a
  // tela com o anterior.
  const cabecas = vis.filter((b, i) => i === 0 || !b.mesma_tela)

  cabecas.forEach((cabeca, i) => {
    const blocos = blocosDaTela(schema, cabeca.ref)
    const regras: RegraDaTela[] = []
    blocos.forEach((b) => {
      const idx = vis.findIndex((v) => v.ref === b.ref)
      ;(b.logic ?? []).forEach((regra, indice) => {
        regras.push({ ref: b.ref, indice, regra, deQuemParte: rotuloDoBloco(b, idx) })
      })
    })

    const declarado = proximoDeclarado(blocos) ?? null
    const seguinte = cabecas[i + 1]
    const gotoEfetivo = declarado ?? (seguinte ? seguinte.ref : GOTO_FIM)

    telas.push({
      numero: i + 1,
      cabeca: cabeca.ref,
      titulo: (cabeca.titulo_da_tela ?? "").trim() || null,
      blocos,
      regras,
      proximoDeclarado: declarado,
      destino: resolverAlvo(schema, gotoEfetivo),
    })
  })

  return telas
}

/**
 * Traduz um `goto` no destino que a tela mostra.
 *
 * Apontar para uma pergunta AGRUPADA resolve para a tela dela — é o que
 * a engine faz (`inicioDaTela`), e mostrar o nome da pergunta do meio
 * faria o construtor prometer um pouso que não acontece.
 *
 * `perdido` é o destino que não existe mais. Ele não vira "fim" nem some:
 * some seria esconder o erro, virar fim seria inventar um desfecho.
 */
export function resolverAlvo(schema: FormSchema, goto: string): AlvoDoFluxo {
  const finais = schema.endings ?? []
  if (goto.startsWith(PREFIXO_ENDING)) {
    const ref = goto.slice(PREFIXO_ENDING.length)
    if (!ref) {
      return {
        tipo: "final",
        goto,
        ref: null,
        rotulo: finais[0] ? rotuloDoFinal(finais[0], 0) : "a tela final",
      }
    }
    const i = finais.findIndex((f) => f.ref === ref)
    if (i < 0) return { tipo: "perdido", goto, rotulo: "final apagado" }
    return { tipo: "final", goto, ref, rotulo: rotuloDoFinal(finais[i], i) }
  }

  const telas = cabecasComNumero(schema)
  const vis = blocosVisiveis(schema)
  const alvo = vis.find((b) => b.ref === goto)
  if (!alvo) return { tipo: "perdido", goto, rotulo: "pergunta apagada" }
  const cabeca = cabecaDe(vis, goto)
  const numero = telas.get(cabeca) ?? 1
  const bloco = vis.find((b) => b.ref === cabeca)
  const i = vis.findIndex((b) => b.ref === cabeca)
  return {
    tipo: "tela",
    // O `goto` é normalizado para a CABEÇA: gravar o ref do meio do
    // grupo funcionaria (a engine corrige), mas o rascunho passaria a
    // discordar do que a tela mostra assim que alguém reagrupasse.
    goto: cabeca,
    numero,
    rotulo: bloco ? rotuloDoBloco(bloco, i) : goto,
  }
}

function cabecaDe(vis: FormBlock[], ref: string): string {
  let i = vis.findIndex((b) => b.ref === ref)
  if (i < 0) return ref
  while (i > 0 && vis[i].mesma_tela) i -= 1
  return vis[i].ref
}

function cabecasComNumero(schema: FormSchema): Map<string, number> {
  const vis = blocosVisiveis(schema)
  const out = new Map<string, number>()
  let n = 0
  vis.forEach((b, i) => {
    if (i === 0 || !b.mesma_tela) {
      n += 1
      out.set(b.ref, n)
    }
  })
  return out
}

/**
 * Os destinos que um `select` pode oferecer, na ordem em que fazem
 * sentido: as telas, os finais nomeados e "terminar aqui".
 *
 * A tela de ORIGEM continua na lista: apontar para si mesma é laço e o
 * diagnóstico o acusa — tirá-la daqui esconderia a opção sem explicar, e
 * o operador tentaria de novo por outro caminho.
 */
export function alvosDoFluxo(schema: FormSchema): AlvoDoFluxo[] {
  const out: AlvoDoFluxo[] = telasDoFluxo(schema).map((t) => ({
    tipo: "tela" as const,
    goto: t.cabeca,
    numero: t.numero,
    rotulo: t.titulo ?? rotuloDaTela(t),
  }))
  ;(schema.endings ?? []).forEach((e, i) => {
    out.push({ tipo: "final", goto: `${PREFIXO_ENDING}${e.ref}`, ref: e.ref, rotulo: rotuloDoFinal(e, i) })
  })
  out.push({ tipo: "final", goto: GOTO_FIM, ref: null, rotulo: "Terminar o formulário" })
  return out
}

/** Como a tela se chama quando não tem título próprio: pela 1ª pergunta. */
export function rotuloDaTela(t: TelaDoFluxo): string {
  const primeira = t.blocos[0]
  const texto = (primeira?.label ?? "").trim()
  if (texto) return texto
  return `Tela ${t.numero}`
}

/** De onde uma condição pode tirar o valor que testa. */
export interface SujeitoDaCondicao {
  ref: string
  rotulo: string
  grupo: "desta_tela" | "anteriores" | "posteriores" | "calculado" | "oculto"
  /** Só aceita comparação aritmética (é o caso do piso derivado). */
  numerico?: boolean
  /**
   * O bloco, quando o sujeito É uma pergunta — é dele que saem as opções
   * que o construtor oferece no lugar de um campo de texto livre. Ausente
   * no valor calculado, que ninguém responde.
   */
  bloco?: FormBlock
}

/**
 * O que o `select` de "SE …" oferece, visto de uma tela.
 *
 * Três coisas que o construtor não mostrava e custam caro:
 *
 * 1. **Os valores calculados.** O piso em real da faixa de faturamento é
 *    o pivô do corte do funil, e como ele não é uma pergunta o select
 *    ficava sem nada marcado — a regra parecia apontar para o vazio.
 *    Quem "consertasse" aquilo escolhendo uma pergunta desligaria o
 *    corte.
 * 2. **A separação por tela.** Testar resposta de uma tela POSTERIOR é
 *    legítimo em alguns desenhos e quase sempre é engano; ficar no mesmo
 *    balde das anteriores não dá chance de perceber.
 * 3. **Os ocultos.** O valor vem da URL e está disponível desde o
 *    primeiro instante — dá para ramificar por `?plano=x` sem que a
 *    pessoa responda nada.
 */
export function sujeitosDaCondicao(schema: FormSchema, cabeca: string): SujeitoDaCondicao[] {
  const vis = blocosVisiveis(schema)
  const numeros = cabecasComNumero(schema)
  const minha = numeros.get(cabecaDe(vis, cabeca)) ?? 1
  const out: SujeitoDaCondicao[] = []

  vis.forEach((b, i) => {
    const n = numeros.get(cabecaDe(vis, b.ref)) ?? 1
    const grupo = n === minha ? "desta_tela" : n < minha ? "anteriores" : "posteriores"
    out.push({ ref: b.ref, rotulo: rotuloDoBloco(b, i), grupo, bloco: b })
  })

  for (const d of derivadosDoSchema(schema)) {
    out.push({ ref: d.ref, rotulo: d.label, grupo: "calculado", numerico: true })
  }

  for (const b of schema.blocks ?? []) {
    if (!b.hidden) continue
    const i = (schema.blocks ?? []).findIndex((x) => x.ref === b.ref)
    out.push({ ref: b.ref, rotulo: rotuloDoBloco(b, i), grupo: "oculto", bloco: b })
  }

  return out
}
