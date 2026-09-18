/**
 * O mapa do fluxo como um CANVAS: nós em duas linhas (telas em cima,
 * finais embaixo) e arestas entre eles — a leitura do handoff §5.
 *
 * Puro de propósito: posição, arestas e rótulos são derivados de
 * `telasDoFluxo` (a MESMA leitura por tela que o construtor usa), então o
 * que o mapa desenha é o que a engine faz. Um segundo cálculo de "para
 * onde vai a tela 3" só para o desenho divergiria do construtor no
 * primeiro agrupamento.
 *
 * Duas decisões visíveis:
 *
 * - **A aresta de ORDEM aponta para o destino EFETIVO**, não para "a
 *   próxima da fila": com `proximo` declarado para um final, a linha
 *   tracejada desce até o final. Desenhar a fila esconderia justamente o
 *   desvio padrão que alguém configurou.
 * - **Desvio com destino apagado NÃO vira aresta** — não há nó para
 *   apontar. Ele conta em `perdidas`, e o painel da tela o mostra em
 *   vermelho: sumir do desenho é esconder o erro.
 */

import type { FormSchema, LogicCondition, LogicRule } from "@/types/forms-conversational"
import { resolverAlvo, rotuloDaTela, telasDoFluxo, type TelaDoFluxo } from "./mapa-do-fluxo"

export const NO = {
  largura: 232,
  altura: 64,
  gapX: 60,
  x0: 40,
  y0: 60,
  /** Distância vertical entre a linha das telas e a dos finais. */
  gapY: 150,
  margem: 60,
} as const

export type TipoDeNo = "abertura" | "tela" | "final"

export interface NoDoCanvas {
  id: string
  tipo: TipoDeNo
  /** O `ref` que a seleção do editor entende (cabeça da tela / ref do final). */
  ref: string
  /** Rótulo em caixa alta: "TELA 2", "ABERTURA", "FINAL · PADRÃO". */
  rotulo: string
  titulo: string
  /** Tipo do bloco que abre a tela — para o ícone. */
  tipoDoBloco: string | null
  desvios: number
  x: number
  y: number
}

export interface ArestaDoCanvas {
  de: string
  para: string
  tipo: "ordem" | "desvio"
  rotulo?: string
}

export interface CanvasDoFluxo {
  nos: NoDoCanvas[]
  arestas: ArestaDoCanvas[]
  /** Desvios sem nó de destino (pergunta ou final apagados), por tela. */
  perdidas: Array<{ de: string; rotulo: string }>
  largura: number
  altura: number
  contagem: { telas: number; finais: number; desvios: number }
}

export const ID_ABERTURA = "abertura"
export function idDoFinal(ref: string): string {
  return `final:${ref}`
}

export function montarCanvas(schema: FormSchema, opts: { temAbertura: boolean }): CanvasDoFluxo {
  const telas = telasDoFluxo(schema)
  const finais = schema.endings ?? []
  const nos: NoDoCanvas[] = []
  const arestas: ArestaDoCanvas[] = []
  const perdidas: CanvasDoFluxo["perdidas"] = []

  const passo = NO.largura + NO.gapX
  let coluna = 0
  const aberturaLigada = opts.temAbertura && Boolean(schema.settings?.welcome)
  if (aberturaLigada) {
    nos.push({
      id: ID_ABERTURA,
      tipo: "abertura",
      ref: ID_ABERTURA,
      rotulo: "Abertura",
      titulo: (schema.settings?.welcome?.title ?? "").trim() || "Tela de abertura",
      tipoDoBloco: null,
      desvios: 0,
      x: NO.x0,
      y: NO.y0,
    })
    coluna = 1
    if (telas[0]) arestas.push({ de: ID_ABERTURA, para: telas[0].cabeca, tipo: "ordem" })
  }

  const yFinais = NO.y0 + NO.altura + NO.gapY
  const idDoAlvo = (goto: string): string | null => {
    const alvo = resolverAlvo(schema, goto)
    if (alvo.tipo === "tela") return alvo.goto
    if (alvo.tipo === "final") {
      const ref = alvo.ref ?? finais[0]?.ref ?? null
      return ref ? idDoFinal(ref) : null
    }
    return null
  }

  telas.forEach((t, i) => {
    nos.push({
      id: t.cabeca,
      tipo: "tela",
      ref: t.cabeca,
      rotulo: `Tela ${t.numero}`,
      titulo: t.titulo ?? rotuloDaTela(t),
      tipoDoBloco: t.blocos[0]?.type ?? null,
      desvios: t.regras.length,
      x: NO.x0 + (coluna + i) * passo,
      y: NO.y0,
    })
    const destino = idDoAlvo(t.destino.goto)
    if (destino) arestas.push({ de: t.cabeca, para: destino, tipo: "ordem" })
    for (const r of t.regras) {
      const para = idDoAlvo(r.regra.goto)
      const rotulo = rotuloDaCondicao(r.regra, schema)
      if (para) arestas.push({ de: t.cabeca, para, tipo: "desvio", rotulo })
      else perdidas.push({ de: t.cabeca, rotulo })
    }
  })

  finais.forEach((f, i) => {
    nos.push({
      id: idDoFinal(f.ref),
      tipo: "final",
      ref: f.ref,
      rotulo: i === 0 ? "Final · padrão" : f.disqualified ? "Final · desqualifica" : "Final",
      titulo: (f.title ?? "").trim() || `Final ${i + 1}`,
      tipoDoBloco: null,
      desvios: 0,
      x: NO.x0 + i * passo,
      y: yFinais,
    })
  })

  const colunas = Math.max(coluna + telas.length, finais.length, 1)
  return {
    nos,
    arestas,
    perdidas,
    largura: NO.x0 * 2 + colunas * passo,
    altura: yFinais + NO.altura + NO.margem,
    contagem: { telas: telas.length, finais: finais.length, desvios: arestas.filter((a) => a.tipo === "desvio").length },
  }
}

/** O caminho SVG de uma aresta e onde a pílula do rótulo pousa. */
export function caminhoDaAresta(
  a: NoDoCanvas,
  b: NoDoCanvas,
  tipo: ArestaDoCanvas["tipo"],
): { d: string; lx: number; ly: number } {
  const { largura: W, altura: H } = NO
  // Mesma linha, vizinha à direita: reta, como uma fila.
  if (tipo === "ordem" && b.y === a.y && b.x > a.x) {
    return { d: `M${a.x + W},${a.y + H / 2} L${b.x},${b.y + H / 2}`, lx: (a.x + W + b.x) / 2, ly: a.y + H / 2 - 8 }
  }
  // Mesma linha, para TRÁS (laço): arco por cima, para não cruzar os nós.
  if (b.y === a.y) {
    const sx = a.x + W / 2
    const tx = b.x + W / 2
    const topo = a.y - 36
    return { d: `M${sx},${a.y} C${sx},${topo} ${tx},${topo} ${tx},${b.y}`, lx: (sx + tx) / 2, ly: topo + 8 }
  }
  // Para a linha de baixo: curva em S saindo do pé do nó.
  const sx = a.x + W / 2
  const sy = a.y + H
  const tx = b.x + W / 2
  const ty = b.y
  const my = (sy + ty) / 2
  return { d: `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`, lx: (sx + tx) / 2, ly: my }
}

/**
 * A condição numa frase de pílula: "Até R$ 50 mil", "≤ 5", "Sim".
 *
 * Só a PRIMEIRA condição cabe numa pílula de 88px; as demais viram "+N".
 * Sem condição a regra nunca casa — o diagnóstico já acusa — e aqui ela
 * é dita como tal, não escondida.
 */
export function rotuloDaCondicao(regra: LogicRule, schema: FormSchema): string {
  const conds = regra.conditions ?? []
  if (conds.length === 0) return "sem condição"
  const primeira = rotuloDeUmaCondicao(conds[0], schema)
  return conds.length > 1 ? `${primeira} +${conds.length - 1}` : primeira
}

function rotuloDeUmaCondicao(c: LogicCondition, schema: FormSchema): string {
  const bloco = (schema.blocks ?? []).find((b) => b.ref === c.ref)
  const valor = Array.isArray(c.value) ? c.value.join(" / ") : c.value == null ? "" : String(c.value)
  const legivel = (v: string) => {
    if (bloco?.type === "yes_no") return v === "sim" ? "Sim" : v === "nao" ? "Não" : v
    if (bloco?.type === "rating") return `${v} ★`
    const opcao = (bloco?.options ?? []).find((o) => o.value === v)
    return opcao?.label ?? v
  }
  switch (c.operator) {
    case "equals":
      return legivel(valor)
    case "not_equals":
      return `≠ ${legivel(valor)}`
    case "in":
      return Array.isArray(c.value) ? c.value.map(legivel).join(" / ") : legivel(valor)
    case "not_in":
      return `fora de ${valor}`
    case "contains":
      return `contém ${valor}`
    case "gt":
      return `> ${valor}`
    case "gte":
      return `≥ ${valor}`
    case "lt":
      return `< ${valor}`
    case "lte":
      return `≤ ${valor}`
    case "is_set":
      return "respondeu"
    default:
      return valor
  }
}

/** Qual nó a seleção do editor Criar corresponde — para os dois lados andarem juntos. */
export function noDaSelecao(
  telas: readonly TelaDoFluxo[],
  sel: { tipo: string; ref?: string } | null,
): string | null {
  if (!sel) return null
  if (sel.tipo === "abertura") return ID_ABERTURA
  if (sel.tipo === "final" && sel.ref) return idDoFinal(sel.ref)
  if ((sel.tipo === "tela" || sel.tipo === "pergunta") && sel.ref) {
    const t = telas.find((x) => x.cabeca === sel.ref || x.blocos.some((b) => b.ref === sel.ref))
    return t?.cabeca ?? null
  }
  return null
}
