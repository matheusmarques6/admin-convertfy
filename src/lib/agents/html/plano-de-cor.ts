/**
 * plano-de-cor — o que o agente Cores & Botões devolve, e como isso vira op.
 *
 * O agente não emite ops: ele devolve um PLANO (o ritmo das faixas, a cor de
 * cada botão, os botões que faltam, as trocas de valor) e este módulo o
 * traduz. É a regra da casa — o modelo devolve intenção, só código escreve
 * no HTML —, e aqui ela compra três coisas concretas:
 *
 * 1. **URL nunca é digitada por modelo.** O plano escolhe um `destino` de um
 *    enum fechado e o código resolve o endereço. Texto de botão errado é
 *    feio e corrigível; link para lugar nenhum não.
 * 2. **A oferta é verificada contra o FATO.** Um label que promete desconto
 *    numa loja sem incentivo confirmado, ou com percentual diferente do que
 *    a peça carrega, não vira botão — vira lacuna. A régua é a mesma do
 *    `oferta_sem_incentivo` que o QA já aplica ao documento, adiantada para
 *    antes do botão existir.
 * 3. **Endereço inválido é descartado com motivo**, nunca aplicado no lugar
 *    mais próximo — o tratamento que `invalid_ids` recebe no Curador.
 *
 * Puro (zero I/O) — testável.
 */

import type { FormatOp } from "./apply-patches"
import type { Cta, Faixa } from "./color-faixas"
import { escalaDoBotao } from "./escala-do-botao"
import { isColorLiteral } from "./color-inventory"

/**
 * Teto de faixas que uma peça pode ter repintadas.
 *
 * No código, não só no prompt: mudar o ritmo é a decisão de maior alcance
 * deste agente, e um plano ruim sem teto repinta o e-mail inteiro. Duas
 * cobrem o que o guia pede (separar uma seção e fechar contra o rodapé); o
 * excedente vira registro, para a telemetria mostrar que ele quis mais.
 */
export const TETO_DE_FAIXAS = 2

/** Onde um botão novo pode apontar. Enum fechado: o modelo não digita URL. */
export const DESTINOS = ["produto_do_bloco", "cta_principal", "loja"] as const
export type Destino = (typeof DESTINOS)[number]

export interface DecisaoDeFaixa {
  ordem: number
  decisao?: string
  fundo?: string
  porque?: string
}

export interface DecisaoDeBotao {
  id: string
  fundo?: string
  label?: string
  tipo?: string
  porque?: string
}

export interface BotaoQueFalta {
  bloco: number
  label: string
  destino: Destino
  fundo: string
  cor_label: string
  porque?: string
}

export interface DecisaoDeValor {
  de: string
  para: string
  onde?: string
  porque?: string
}

export interface PlanoDeCor {
  paleta_eixo?: string
  tokens?: Record<string, string>
  faixas?: DecisaoDeFaixa[]
  botoes?: DecisaoDeBotao[]
  adicionar?: BotaoQueFalta[]
  valores?: DecisaoDeValor[]
  rodape?: string
  lacunas?: string[]
}

/** O que a peça de fato carrega de oferta — o fato contra o qual se mede. */
export interface IncentivoDaPeca {
  /** `true` é a única confirmação aceita; `false` e `null` bloqueiam igual. */
  existe: boolean | null
  codigo?: string | null
  percentual?: number | null
}

export interface ContextoDoPlano {
  faixas: Faixa[]
  ctas: Cta[]
  incentivo: IncentivoDaPeca
  /** Home da loja — o destino que sempre existe. */
  urlLoja?: string | null
  /** Link do produto de cada bloco, quando o bloco mostra produto. */
  urlPorBloco?: Record<number, string>
  /** Fonte da peça, para o botão novo não estrear uma família. */
  fontFamily?: string | null
}

export interface Descarte {
  /** O que foi descartado, em uma linha. */
  o_que: string
  motivo: string
}

export interface TraducaoDoPlano {
  ops: FormatOp[]
  descartes: Descarte[]
}

const OFERTA_NO_LABEL =
  /\b\d{1,3}\s?%\s?(?:off|de desconto|discount)?\b|\bdesconto\b|\bcupom\b|\bcoupon\b|\boff\b|\bpromo\b/i
const PERCENTUAL = /(\d{1,3})\s?%/
const COLCHETES = /\[[^\]]+\]/
const LABEL_MAX = 40


/**
 * O label pode prometer o que promete?
 *
 * Devolve o motivo da recusa, ou `null` quando pode. As duas recusas são as
 * que o usuário levantou: cupom sem incentivo, e cupom com valor diferente
 * do da peça.
 */
export function recusaDoLabel(label: string, incentivo: IncentivoDaPeca): string | null {
  const texto = label.trim()
  if (!texto) return "label vazio"
  if (texto.length > LABEL_MAX) return `label com ${texto.length} chars (teto ${LABEL_MAX})`
  if (COLCHETES.test(texto)) return "label com placeholder entre colchetes — ninguém vai resolvê-lo"
  if (!OFERTA_NO_LABEL.test(texto)) return null

  if (incentivo.existe !== true) {
    return incentivo.existe === false
      ? "promete oferta e a loja NÃO tem incentivo ativo"
      : "promete oferta e ninguém confirmou que a loja tem incentivo"
  }
  const noLabel = PERCENTUAL.exec(texto)?.[1]
  if (noLabel != null && incentivo.percentual != null && Number(noLabel) !== incentivo.percentual) {
    return `promete ${noLabel}% e a peça carrega ${incentivo.percentual}%`
  }
  return null
}

/** Resolve o endereço do botão novo. O modelo escolhe o tipo, não a URL. */
function resolverHref(destino: Destino, bloco: number, ctx: ContextoDoPlano): string | null {
  const doProduto = ctx.urlPorBloco?.[bloco]
  const doPrincipal = ctx.ctas[0]?.href
  const daLoja = ctx.urlLoja?.trim() || null
  // A ordem de fallback é a mesma para todos os destinos: o pedido primeiro,
  // depois o que existir. Botão sem href não entra — é o link para lugar
  // nenhum que este módulo existe para impedir.
  const cascata: Record<Destino, Array<string | null | undefined>> = {
    produto_do_bloco: [doProduto, doPrincipal, daLoja],
    cta_principal: [doPrincipal, daLoja],
    loja: [daLoja, doPrincipal],
  }
  for (const candidato of cascata[destino]) {
    if (candidato && candidato.trim()) return candidato.trim()
  }
  return null
}

/** Traduz o plano do agente nas ops que o aplicador executa. */
export function planoParaOps(plano: PlanoDeCor, ctx: ContextoDoPlano): TraducaoDoPlano {
  const ops: FormatOp[] = []
  const descartes: Descarte[] = []
  const porOrdem = new Map(ctx.faixas.map((f) => [f.ordem, f]))
  const idsDeCta = new Set(ctx.ctas.map((c) => c.id))
  // Botão que só existe no ramo do Outlook NÃO conta como botão presente:
  // fora dali o lugar está vazio, e tratá-lo como CTA do bloco deixaria a
  // seção sem botão para quase todo leitor. Ele aparece no `ctas_json` com
  // `somente_outlook: true` para ser visto, não para calar a inserção.
  const blocosComCta = new Set(
    ctx.ctas.filter((c) => !c.somente_outlook).map((c) => c.bloco),
  )
  // Escala da peça: o botão novo nasce do tamanho dos botões que já estão
  // lá, não de uma constante. Ver `escala-do-botao.ts`.
  const escala = escalaDoBotao(ctx.ctas)

  // ── Faixas ───────────────────────────────────────────────────────────
  let pintadas = 0
  for (const d of plano.faixas ?? []) {
    const alvo = `faixa ${d.ordem}`
    const faixa = porOrdem.get(d.ordem)
    if (!faixa) {
      descartes.push({ o_que: alvo, motivo: "não existe no documento" })
      continue
    }
    if (d.decisao === "manter" || !d.fundo) continue
    if (!isColorLiteral(d.fundo)) {
      descartes.push({ o_que: alvo, motivo: `fundo "${d.fundo}" não é cor` })
      continue
    }
    if (faixa.foto) {
      descartes.push({ o_que: alvo, motivo: "o fundo é foto — a hero não se decide aqui" })
      continue
    }
    if (!faixa.editavel) {
      descartes.push({ o_que: alvo, motivo: "pousa no canvas: não há declaração para trocar" })
      continue
    }
    if (pintadas >= TETO_DE_FAIXAS) {
      descartes.push({ o_que: alvo, motivo: `acima do teto de ${TETO_DE_FAIXAS} faixas por peça` })
      continue
    }
    ops.push({ action: "set_fundo", bloco: faixa.bloco, para: d.fundo })
    pintadas++
  }

  // ── Botões que existem ───────────────────────────────────────────────
  for (const d of plano.botoes ?? []) {
    if (!idsDeCta.has(d.id)) {
      descartes.push({ o_que: `botão ${d.id}`, motivo: "não existe no documento" })
      continue
    }
    const fundo = d.fundo && isColorLiteral(d.fundo) ? d.fundo : undefined
    const label = d.label && isColorLiteral(d.label) ? d.label : undefined
    if (!fundo && !label) {
      descartes.push({ o_que: `botão ${d.id}`, motivo: "sem cor válida para aplicar" })
      continue
    }
    ops.push({
      action: "set_botao",
      cta: d.id,
      ...(fundo ? { fundo } : {}),
      ...(label ? { label } : {}),
    })
  }

  // ── Botões que faltam ────────────────────────────────────────────────
  for (const d of plano.adicionar ?? []) {
    const alvo = `botão novo no bloco ${d.bloco}`
    if (!ctx.faixas.some((f) => f.bloco === d.bloco)) {
      descartes.push({ o_que: alvo, motivo: "bloco não existe no documento" })
      continue
    }
    if (blocosComCta.has(d.bloco)) {
      descartes.push({ o_que: alvo, motivo: "o bloco já tem botão" })
      continue
    }
    // A HERO nunca recebe botão inserido, mesmo quando `<ctas>` chega sem
    // nenhum nela.
    //
    // 11/09, Hero Boxers: os dois botões da hero perderam o href no caminho,
    // `extrairCtas` (que então exigia href) ficou cego e o agente escreveu,
    // com todas as letras, "a hero é o único bloco em <faixas> sem entrada em
    // <ctas>" — e inseriu um terceiro botão numa hero que já tinha dois. As
    // duas causas foram corrigidas na origem; isto é a terceira linha de
    // defesa, e ela vale por si:
    //
    // A hero é ENXERTADA da variante canônica, curada por gente. Hero sem
    // botão é decisão do designer, não lacuna a preencher aqui — e inserir
    // `<tr>` dentro da região enxertada briga com o splice das sentinelas.
    // Se faltar CTA na hero, o lugar de consertar é a variante.
    if (ctx.faixas.find((f) => f.bloco === d.bloco)?.tipo === "hero") {
      descartes.push({
        o_que: alvo,
        motivo: "a hero vem enxertada da variante — botão nela é decisão da biblioteca",
      })
      continue
    }
    const recusa = recusaDoLabel(d.label ?? "", ctx.incentivo)
    if (recusa) {
      descartes.push({ o_que: `${alvo} ("${(d.label ?? "").slice(0, 40)}")`, motivo: recusa })
      continue
    }
    if (!DESTINOS.includes(d.destino)) {
      descartes.push({ o_que: alvo, motivo: `destino "${d.destino}" fora do vocabulário` })
      continue
    }
    const href = resolverHref(d.destino, d.bloco, ctx)
    if (!href) {
      descartes.push({ o_que: alvo, motivo: "nenhum destino disponível — a loja não tem URL conhecida" })
      continue
    }
    if (!isColorLiteral(d.fundo) || !isColorLiteral(d.cor_label)) {
      descartes.push({ o_que: alvo, motivo: "cor do botão inválida" })
      continue
    }
    ops.push({
      action: "add_cta",
      bloco: d.bloco,
      label: d.label.trim(),
      href,
      fundo: d.fundo,
      corLabel: d.cor_label,
      radiusPx: escala.radiusPx,
      fontSizePx: escala.fontSizePx,
      peso: escala.peso,
      paddingV: escala.paddingV,
      paddingH: escala.paddingH,
      ...(ctx.fontFamily ? { fontFamily: ctx.fontFamily } : {}),
    })
    // Um botão por bloco: duas entradas para o mesmo bloco no mesmo plano
    // sairiam empilhadas.
    blocosComCta.add(d.bloco)
  }

  // ── Valores (a conformidade de identidade de sempre) ─────────────────
  for (const d of plano.valores ?? []) {
    if (!isColorLiteral(d.de) || !isColorLiteral(d.para)) {
      descartes.push({ o_que: `valor ${d.de} → ${d.para}`, motivo: "de/para não é cor" })
      continue
    }
    const onde = d.onde
    ops.push({
      action: "recolor",
      from: d.de,
      to: d.para,
      ...(onde === "background" ||
      onde === "color" ||
      onde === "border" ||
      onde === "bgcolor" ||
      onde === "css-var" ||
      onde === "outro"
        ? { where: onde }
        : {}),
    })
  }

  return { ops, descartes }
}

export class PlanoParseError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "PlanoParseError"
    this.raw = raw
  }
}

/**
 * Lê o plano do output do modelo.
 *
 * Tolerante no formato, estrito no conteúdo: campo ausente vira lista vazia
 * (plano vazio é decisão legítima — "o e-mail já está certo"), mas entrada
 * malformada dentro de uma lista é DESCARTADA aqui em vez de virar op
 * inválida lá na frente. É o mesmo desenho de `parseTypographyDecision`.
 */
export function parsePlanoDeCor(raw: string): PlanoDeCor {
  const limpo = raw.replace(/```(?:json)?\s*/gi, "").trim()
  const inicio = limpo.indexOf("{")
  const fim = limpo.lastIndexOf("}")
  if (inicio === -1 || fim <= inicio) {
    throw new PlanoParseError("output sem objeto JSON", raw)
  }
  let dado: unknown
  try {
    dado = JSON.parse(limpo.slice(inicio, fim + 1))
  } catch {
    throw new PlanoParseError("JSON inválido", raw)
  }
  if (!dado || typeof dado !== "object") {
    throw new PlanoParseError("plano não é objeto", raw)
  }
  const o = dado as Record<string, unknown>
  const lista = <T>(v: unknown, mapa: (x: Record<string, unknown>) => T | null): T[] => {
    if (!Array.isArray(v)) return []
    const out: T[] = []
    for (const item of v) {
      if (!item || typeof item !== "object") continue
      const t = mapa(item as Record<string, unknown>)
      if (t) out.push(t)
    }
    return out
  }
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)

  return {
    ...(str(o.paleta_eixo) ? { paleta_eixo: str(o.paleta_eixo) } : {}),
    ...(o.tokens && typeof o.tokens === "object"
      ? { tokens: Object.fromEntries(Object.entries(o.tokens as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string> }
      : {}),
    faixas: lista<DecisaoDeFaixa>(o.faixas, (x) => {
      const ordem = Number(x.ordem)
      if (!Number.isInteger(ordem)) return null
      return {
        ordem,
        ...(str(x.decisao) ? { decisao: str(x.decisao) } : {}),
        ...(str(x.fundo) ? { fundo: str(x.fundo) } : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    botoes: lista<DecisaoDeBotao>(o.botoes, (x) => {
      const id = str(x.id)
      if (!id) return null
      return {
        id,
        ...(str(x.fundo) ? { fundo: str(x.fundo) } : {}),
        ...(str(x.label) ? { label: str(x.label) } : {}),
        ...(str(x.tipo) ? { tipo: str(x.tipo) } : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    adicionar: lista<BotaoQueFalta>(o.adicionar, (x) => {
      const bloco = Number(x.bloco)
      const label = str(x.label)
      const destino = str(x.destino) as Destino | undefined
      const fundo = str(x.fundo)
      const corLabel = str(x.cor_label) ?? str(x.corLabel)
      if (!Number.isInteger(bloco) || !label || !destino || !fundo || !corLabel) return null
      return {
        bloco,
        label,
        destino,
        fundo,
        cor_label: corLabel,
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    valores: lista<DecisaoDeValor>(o.valores, (x) => {
      const de = str(x.de)
      const para = str(x.para)
      if (!de || !para) return null
      return {
        de,
        para,
        ...(str(x.onde) ? { onde: str(x.onde) } : {}),
        ...(str(x.porque) ? { porque: str(x.porque) } : {}),
      }
    }),
    ...(str(o.rodape) ? { rodape: str(o.rodape) } : {}),
    lacunas: Array.isArray(o.lacunas) ? o.lacunas.filter((l): l is string => typeof l === "string") : [],
  }
}
