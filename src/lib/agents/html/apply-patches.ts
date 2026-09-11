/**
 * apply-patches — aplicador determinístico das operações JSON do
 * color_format (o único formatador LLM que restou na cadeia).
 *
 * Vocabulário de ops (enxuto em 20/08 — texto e imagem viraram código):
 *   {action:"replace", find, replace}  → find/replace com `find` ÚNICO no
 *                                        documento (crop params, ajustes
 *                                        pontuais de estilo).
 *   {action:"recolor", from, to,      → troca por VALOR de cor — todas as
 *              where?}                   formas equivalentes (#AABBCC,
 *                                        #abc, rgb/rgba) viram `to`.
 *                                        `where` (opcional) restringe ao
 *                                        papel da ocorrência (background,
 *                                        color, border…); sem ele a troca
 *                                        é global. Atômico: não muda
 *                                        estrutura.
 *
 * Regras de segurança (nunca corrompem o documento):
 *   - op replace cujo alcance intersecta a região sentinelada da hero é
 *     rejeitada quando allowHero=false (o color_format passa true — o
 *     botão da hero também entra na paleta).
 *   - `find` ambíguo (0 ou 2+ ocorrências) → op pulada e telemetrizada.
 *   - splices sobrepostos: o da direita vence, o outro é rejeitado.
 *
 * Puro (zero deps de server) — testável.
 */

import { extractHeroBySentinels } from "./hero-locator"
import {
  applyRecolor,
  canonicalHex,
  isColorContext,
  isColorLiteral,
  type ColorContext,
} from "./color-inventory"
import { applySplices, type Range, type Splice } from "./dom-locator"
import { auditContrast, backgroundDeclarations } from "./color-contrast"
import { contrastingText } from "./color-roles"
import { linhaDeBotao, pontoDeInsercao } from "./cta-template"
import type { Cta, Faixa } from "./color-faixas"
import { locateBlockRegions } from "./slot-finder"

export type FormatOp =
  | { action: "replace"; find: string; replace: string; block_id?: string }
  | {
      action: "recolor"
      from: string
      to: string
      /** Restringe ao papel da ocorrência; ausente = global. */
      where?: ColorContext
      block_id?: string
    }
  /**
   * Pinta o fundo de UMA faixa. `bloco` é o índice do marcador `cfy:block`.
   *
   * Existe porque `recolor` é global por natureza: num e-mail em que
   * `#FFFFFF` é o fundo de quatro seções, não havia op capaz de escurecer
   * uma delas — e é disso que o ritmo de faixas depende.
   */
  | { action: "set_fundo"; bloco: number; para: string }
  /** Recolore UM botão (fundo e/ou label), pelo id do mapa de CTAs. */
  | { action: "set_botao"; cta: string; fundo?: string; label?: string }
  /**
   * Insere um botão num bloco que não tem nenhum.
   *
   * `href` chega resolvido: o modelo escolhe um destino de um enum fechado
   * e o código traduz para a URL real. URL nunca é digitada por modelo.
   */
  | {
      action: "add_cta"
      bloco: number
      label: string
      href: string
      fundo: string
      corLabel: string
      radiusPx?: number
      /** Escala da peça — ver `escala-do-botao.ts`. Ausente = padrão da casa. */
      fontSizePx?: number
      peso?: number
      paddingV?: number
      paddingH?: number
      fontFamily?: string
    }

// As três últimas NÃO saem de `parseOps`: o modelo devolve um plano, e é o
// código que o traduz em ops (ver `plano-de-cor.ts`). Assim ele é
// fisicamente incapaz de mandar inserir markup ou endereçar um bloco que o
// documento não tem — a mesma razão pela qual `TypographyOpHumana` não
// existe para o agente de tipografia.

// block_id (opcional): amarra a op ao email_blocks.id de origem — a MESMA
// chave do callback do n8n. Não muda a aplicação; existe pra telemetria.

/**
 * O que uma op endereça, em uma linha — para log e telemetria.
 *
 * Existe para o call site não precisar conhecer a forma de cada op: a
 * telemetria do runner lia `op.from` para tudo que não fosse `replace`, e a
 * primeira op nova quebrou o typecheck ali. Op futura entra aqui, não em
 * cada lugar que loga.
 */
export function alvoDaOp(op: FormatOp): string {
  switch (op.action) {
    case "replace":
      return op.find.slice(0, 60)
    case "recolor":
      return op.from
    case "set_fundo":
      return `bloco ${op.bloco} → ${op.para}`
    case "set_botao":
      return `${op.cta} → ${op.fundo ?? "="}/${op.label ?? "="}`
    case "add_cta":
      return `bloco ${op.bloco} + "${op.label.slice(0, 40)}"`
  }
}

export class OpsParseError extends Error {
  readonly raw: string
  constructor(message: string, raw = "") {
    super(message)
    this.name = "OpsParseError"
    this.raw = raw
  }
}

export interface SkippedOp {
  op: FormatOp
  reason:
    | "find_not_found"
    | "find_ambiguous"
    | "hero_protected"
    // Duas ops disputam a mesma região do documento: a da direita vence; a
    // outra é rejeitada em vez de corromper o documento.
    | "overlapping_edit"
    // Escopo resolve papel, não legibilidade: mandar o FUNDO e o TEXTO da
    // mesma cor para o mesmo destino produz texto invisível. A segunda op
    // do par é recusada.
    | "contrast_risk"
    // Op endereçada a um bloco ou botão que o documento não tem. Descarta
    // com motivo em vez de aplicar no lugar errado — é o tratamento que
    // `invalid_ids` recebe no Curador.
    | "endereco_inexistente"
    // A faixa não declara fundo de seção: pousa no canvas, e não há hex ali
    // para uma op trocar. Pintá-la exigiria inserir declaração, que é outra
    // natureza de mudança.
    | "sem_fundo_editavel"
    // O bloco não termina em `</tr>` nem em `</table>`: não há lugar seguro
    // para a linha do botão. Não inventar lugar é o que separa inserir de
    // corromper.
    | "sem_ponto_de_insercao"
    // A cor já saiu do documento por uma op de REGIÃO desta mesma rodada.
    // Não é erro do agente: ele pediu "inverta o botão da faixa 3" e
    // "troque o roxo pelo preto", e as duas apontam para a mesma
    // declaração. Reportar isso como `find_not_found` faria a sobreposição
    // benigna parecer endereço inventado — que é o oposto do que é.
    | "ja_aplicado"
}

export interface ApplyOpsResult {
  html: string
  applied: number
  skipped: SkippedOp[]
  /**
   * Ocorrências de cor efetivamente trocadas. `applied` conta OPS — uma op
   * que trocou 1 ocorrência valia o mesmo que uma que trocaria 30, e foi
   * por isso que a Luxe Lift saiu com 11 ops "aplicadas" e o email inteiro
   * fora da marca. Este número é o que diz quanto do email virou marca.
   */
  recoloredOccurrences: number
  /**
   * Declarações de cor de TEXTO reescritas para restaurar a legibilidade
   * sobre um fundo que estas ops acabaram de pintar.
   */
  pairedTextFixes: number
  /**
   * Pares texto/fundo que continuam abaixo do mínimo AA depois do conserto
   * — fundo em foto, ou contraste que já estava quebrado antes deste step e
   * não foi causado por ele.
   */
  contrastRemaining: number
  /**
   * Painéis que colapsaram no próprio fundo e o código reergueu.
   *
   * `0` é o resultado bom quando o agente escolheu certo sozinho; `> 0`
   * significa que a guarda trabalhou. O que não pode acontecer é `0` com
   * painel sumido — foi o estado das quatro gerações de 23-24/08.
   */
  panelFixes: number
  /** Faixas cujo fundo foi repintado (`set_fundo`). */
  faixasPintadas: number
  /** Botões recoloridos (`set_botao`), somando o par VML quando existe. */
  botoesRecoloridos: number
  /** Botões inseridos (`add_cta`). */
  botoesInseridos: number
}

/** Extrai o objeto {"ops":[...]} do output do LLM. Lança OpsParseError. */
export function parseOps(raw: string): FormatOp[] {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end <= start) {
    throw new OpsParseError("output sem objeto JSON", raw)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new OpsParseError("JSON inválido", raw)
  }
  const ops = (parsed as { ops?: unknown })?.ops
  if (!Array.isArray(ops)) {
    throw new OpsParseError('JSON sem array "ops"', raw)
  }
  const out: FormatOp[] = []
  for (const op of ops) {
    if (!op || typeof op !== "object") {
      throw new OpsParseError("op não é objeto", raw)
    }
    const o = op as Record<string, unknown>
    const bid: { block_id?: string } =
      typeof o.block_id === "string" && o.block_id ? { block_id: o.block_id } : {}
    if (o.action === "recolor") {
      if (
        typeof o.from !== "string" ||
        typeof o.to !== "string" ||
        !isColorLiteral(o.from) ||
        !isColorLiteral(o.to)
      ) {
        throw new OpsParseError("op recolor com from/to não-cor", raw)
      }
      let where: { where?: ColorContext } = {}
      if (o.where != null) {
        if (!isColorContext(o.where)) {
          throw new OpsParseError(`op recolor com where inválido: ${String(o.where)}`, raw)
        }
        where = { where: o.where }
      }
      out.push({ action: "recolor", from: o.from, to: o.to, ...where, ...bid })
    } else if (o.action === "replace") {
      if (
        typeof o.find !== "string" ||
        !o.find ||
        typeof o.replace !== "string"
      ) {
        throw new OpsParseError("op replace sem find/replace", raw)
      }
      out.push({ action: "replace", find: o.find, replace: o.replace, ...bid })
    } else {
      // img/set_text/remove_slot/remove_row morreram com o merge por código
      // (20/08) — um prompt antigo que ainda as emita é erro de config.
      throw new OpsParseError(`action desconhecida: ${String(o.action)}`, raw)
    }
  }
  return out
}

/**
 * Aplica as ops contra um SNAPSHOT IMUTÁVEL do documento (todo endereço é
 * resolvido no HTML que o agente viu); as edições viram splices aplicados
 * de trás pra frente — offsets não se invalidam entre si.
 */
export function applyOps(
  html: string,
  ops: FormatOp[],
  opts: {
    allowHero: boolean
    /**
     * Tons de painel da loja (`ColorRoles.surface` / `surface_strong`).
     * Ausentes, a guarda de painel não roda — nada para onde reerguer.
     */
    surfaces?: { surface: string; surface_strong: string }
    /**
     * A sequência de faixas e os botões, do mesmo snapshot que o agente viu
     * (`color-faixas.ts`). É o que dá endereço às ops de região; ausentes,
     * `set_fundo`/`set_botao`/`add_cta` são descartadas com motivo.
     */
    faixas?: Faixa[]
    ctas?: Cta[]
  },
): ApplyOpsResult {
  const doc = html
  let applied = 0
  const skipped: SkippedOp[] = []
  const splices: Array<Splice & { op: FormatOp }> = []
  const recolors: Array<{
    op: FormatOp
    from: string
    to: string
    where?: ColorContext
  }> = []

  const hero = extractHeroBySentinels(doc)
  const intersectsHero = (start: number, end: number): boolean => {
    if (opts.allowHero || !hero) return false
    return start < hero.end && end > hero.start
  }

  // Ops que endereçam um LUGAR. Ficam separadas porque são aplicadas de
  // trás para frente sobre o documento: cada uma muda o tamanho do texto, e
  // processar da direita para a esquerda mantém válidos os offsets que
  // ainda faltam.
  const regionais: Array<{ op: FormatOp; pos: number }> = []
  const regioes = new Map(locateBlockRegions(doc).map((b) => [b.indice, b.range]))
  const faixaDe = new Map((opts.faixas ?? []).map((f) => [f.bloco, f]))
  const ctaDe = new Map((opts.ctas ?? []).map((c) => [c.id, c]))

  for (const op of ops) {
    if (op.action === "recolor") {
      // Global e atômico por natureza; a hero entra de propósito (recolor
      // nunca muda estrutura, e o botão da hero pertence à paleta).
      recolors.push({
        op,
        from: op.from,
        to: op.to,
        ...(op.where ? { where: op.where } : {}),
      })
      continue
    }
    if (op.action === "set_fundo" || op.action === "add_cta") {
      const regiao = regioes.get(op.bloco)
      if (!regiao) {
        skipped.push({ op, reason: "endereco_inexistente" })
        continue
      }
      // `add_cta` entra no FIM do bloco e `set_fundo` pinta o começo:
      // ordenar pelo ponto em que cada uma escreve deixa as duas
      // conviverem no mesmo bloco sem uma invalidar o offset da outra.
      regionais.push({ op, pos: op.action === "add_cta" ? regiao.end : regiao.start })
      continue
    }
    if (op.action === "set_botao") {
      const cta = ctaDe.get(op.cta)
      if (!cta) {
        skipped.push({ op, reason: "endereco_inexistente" })
        continue
      }
      regionais.push({ op, pos: cta.range.start })
      continue
    }
    const idx = doc.indexOf(op.find)
    if (idx === -1) {
      skipped.push({ op, reason: "find_not_found" })
      continue
    }
    if (doc.indexOf(op.find, idx + 1) !== -1) {
      skipped.push({ op, reason: "find_ambiguous" })
      continue
    }
    if (intersectsHero(idx, idx + op.find.length)) {
      skipped.push({ op, reason: "hero_protected" })
      continue
    }
    splices.push({
      op,
      start: idx,
      end: idx + op.find.length,
      replacement: op.replace,
    })
    applied++
  }

  // Aplica todas as edições de uma vez, de trás pra frente. Edições que se
  // sobrepõem são rejeitadas em vez de corromper o documento.
  const res = applySplices(doc, splices)
  const rejectedOps = new Set(
    res.rejected.map((r) => (r as Splice & { op: FormatOp }).op),
  )
  for (const op of rejectedOps) {
    skipped.push({ op, reason: "overlapping_edit" })
    applied--
  }

  // Recolors por último: troca por VALOR, não compete por posição.
  //
  // Guard de contraste: escopo separa papéis, mas não garante que dê pra
  // ler. O caso catastrófico é o FUNDO e o TEXTO da mesma cor de origem
  // caírem no mesmo destino — aí a seção inteira fica de uma cor só e a
  // copy some. Recusa a segunda op do par (a primeira já vale) em vez de
  // entregar um email invisível.
  const destinoPorOrigem = new Map<string, string>()
  /** Destinos que ESTE step pintou — escopo do conserto de par abaixo. */
  const pintados = new Set<string>()
  const isPar = (a: ColorContext | undefined, b: string): boolean =>
    (a === "background" && b === "color") || (a === "color" && b === "background")

  let out = res.html

  // ── Ops de REGIÃO ──────────────────────────────────────────────────
  //
  // Rodam antes dos recolors globais e de trás para frente. O ganho é o que
  // o `recolor` sozinho não dá: escurecer UMA faixa sem tocar nas outras
  // três do mesmo hex, e inverter o botão que ficou dentro dela.
  //
  // A ordem entre elas importa por um motivo mecânico: cada edição desloca
  // tudo o que vem depois. Descendo por posição, o que ainda falta processar
  // está sempre antes do que já foi escrito.
  let faixasPintadas = 0
  let botoesRecoloridos = 0
  let botoesInseridos = 0
  /** Ranges de botão — o conserto de painel abaixo não pode tocá-los. */
  const rangesDeBotao: Range[] = (opts.ctas ?? []).map((c) => c.range)
  /** Cores que as ops de região tiraram do documento nesta rodada. */
  const substituidos = new Set<string>()

  // Os ranges de `faixas`/`ctas` foram medidos no snapshot que o agente
  // viu. Um `replace` aplicado mudou o tamanho do documento e os invalidou
  // — e op de região com offset velho pinta a seção errada. Na prática o
  // color_format só emite recolor (o chain filtra), então este caminho não
  // acontece; a guarda existe para o dia em que alguém reabrir o `replace`.
  const enderecosValidos = out === doc
  regionais.sort((a, b) => b.pos - a.pos)
  for (const { op } of enderecosValidos ? regionais : []) {
    if (op.action === "set_fundo") {
      const faixa = faixaDe.get(op.bloco)
      if (!faixa || !faixa.editavel || !faixa.fundo || faixa.decls.length === 0) {
        skipped.push({ op, reason: "sem_fundo_editavel" })
        continue
      }
      // Reescreve as DECLARAÇÕES da faixa, não todo o hex do bloco. Trocar
      // "todo #FFFFFF daqui" repintaria o card branco e o botão branco que
      // moram dentro dela — e desfaria a inversão que o `set_botao` acabou
      // de fazer, que é o par que o C3 exige.
      for (const d of [...faixa.decls].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, d.start) + op.para + out.slice(d.end)
      }
      substituidos.add(canonicalHex(faixa.fundo))
      pintados.add(canonicalHex(op.para))
      faixasPintadas++
      applied++
      continue
    }

    if (op.action === "set_botao") {
      const cta = ctaDe.get(op.cta)
      if (!cta) {
        skipped.push({ op, reason: "endereco_inexistente" })
        continue
      }
      let mexeu = 0
      if (op.fundo && cta.fundo) {
        for (const papel of ["background", "bgcolor"] as const) {
          const rc = applyRecolor(out, cta.fundo, op.fundo, papel, cta.range)
          out = rc.html
          mexeu += rc.replaced
        }
        // O botão declara a cor DUAS vezes quando vem embrulhado no VML do
        // Outlook, e a segunda fica FORA do range do elemento. Trocar só a
        // do `<td>` deixa o Outlook mostrando a cor antiga — quebra em
        // silêncio, num cliente só.
        if (cta.vml) {
          const janela = { start: Math.max(0, cta.range.start - 600), end: cta.range.start }
          const rc = applyRecolor(out, cta.fundo, op.fundo, undefined, janela)
          out = rc.html
          mexeu += rc.replaced
        }
      }
      if (op.label && cta.label) {
        const rc = applyRecolor(out, cta.label, op.label, "color", cta.range)
        out = rc.html
        mexeu += rc.replaced
      }
      if (mexeu === 0) {
        skipped.push({ op, reason: "find_not_found" })
        continue
      }
      if (op.fundo) {
        pintados.add(canonicalHex(op.fundo))
        if (cta.fundo) substituidos.add(canonicalHex(cta.fundo))
      }
      if (op.label && cta.label) substituidos.add(canonicalHex(cta.label))
      botoesRecoloridos++
      applied++
      continue
    }

    if (op.action === "add_cta") {
      const regiao = regioes.get(op.bloco)
      if (!regiao) {
        skipped.push({ op, reason: "endereco_inexistente" })
        continue
      }
      const at = pontoDeInsercao(out, regiao)
      if (at == null) {
        skipped.push({ op, reason: "sem_ponto_de_insercao" })
        continue
      }
      // O fundo da banda vem da FAIXA, não da op: a linha do botão é irmã
      // da que pinta o bloco e não herda nada dela. Sem isto o botão pousa
      // no canvas e aparece flutuando fora da faixa.
      const faixaDestino = faixaDe.get(op.bloco)
      const linha = linhaDeBotao({
        label: op.label,
        href: op.href,
        fundo: op.fundo,
        corLabel: op.corLabel,
        ...(op.radiusPx != null ? { radiusPx: op.radiusPx } : {}),
        ...(op.fontFamily ? { fontFamily: op.fontFamily } : {}),
        ...(faixaDestino?.fundo ? { fundoFaixa: faixaDestino.fundo } : {}),
      })
      out = out.slice(0, at) + linha + out.slice(at)
      botoesInseridos++
      applied++
      continue
    }
  }

  if (!enderecosValidos) {
    for (const { op } of regionais) skipped.push({ op, reason: "endereco_inexistente" })
  }

  let recoloredOccurrences = 0
  for (const r of recolors) {
    const chaveOrigem = r.from.toUpperCase()
    const conflito = Array.from(destinoPorOrigem.entries()).find(
      ([k, v]) =>
        k.startsWith(chaveOrigem) &&
        v === r.to.toUpperCase() &&
        isPar(r.where, k.slice(chaveOrigem.length + 1)),
    )
    if (conflito) {
      skipped.push({ op: r.op, reason: "contrast_risk" })
      continue
    }

    const rc = applyRecolor(out, r.from, r.to, r.where)
    if (rc.replaced === 0) {
      skipped.push({
        op: r.op,
        reason: substituidos.has(canonicalHex(r.from)) ? "ja_aplicado" : "find_not_found",
      })
      continue
    }
    out = rc.html
    recoloredOccurrences += rc.replaced
    destinoPorOrigem.set(`${chaveOrigem}:${r.where ?? "global"}`, r.to.toUpperCase())
    pintados.add(canonicalHex(r.to))
    applied++
  }

  // ── Conserto do PAINEL ─────────────────────────────────────────────
  //
  // O agente decide sem ver o documento: ele não sabe que `#D9D9D9` é um
  // card DENTRO do `#FFFFFF`. Com a paleta da loja tendo um único valor
  // claro, todo cinza de superfície tem um destino legal só — o `bg` — e em
  // quatro gerações seguidas (Luxe Lift, 23-24/08) ele mandou de 6 a 10
  // cinzas para o mesmo hex do canvas. Figura e fundo viram a mesma cor: o
  // destaque não ficou feio, ficou INVISÍVEL. A guarda `isPar` acima não
  // pega isso — ela só olha fundo↔texto da MESMA origem.
  //
  // Casamento por POSIÇÃO na ordem de documento: recolor troca valor, nunca
  // cria nem remove declaração, então a n-ésima da entrada é a n-ésima da
  // saída. Offset não serve (`#abc` → `#AABBCC` cresce e desloca o resto) e
  // valor menos ainda — depois do colapso o painel e o pai são o MESMO
  // valor, que é exatamente o que se quer detectar.
  //
  // O "era distinto ANTES" é o que impede reerguer `<td>` e `<table>` que já
  // nasceram da mesma cor (redundância de compatibilidade que e-mail usa o
  // tempo todo): esses nunca foram painel, e pintá-los criaria uma camada
  // que o designer não desenhou.
  //
  // Tom inválido = guarda desligada, nunca exceção: um contexto montado sem
  // os papéis novos (fixture, chamada antiga, ctx parcial) derrubaria o step
  // de cor INTEIRO — o e-mail sairia sem marca nenhuma para consertar um
  // painel. Guarda de acabamento falha para o lado aberto.
  let panelFixes = 0
  const tons =
    opts.surfaces &&
    isColorLiteral(opts.surfaces.surface ?? "") &&
    isColorLiteral(opts.surfaces.surface_strong ?? "")
      ? opts.surfaces
      : null
  if (tons) {
    const surface = canonicalHex(tons.surface)
    const surfaceStrong = canonicalHex(tons.surface_strong)
    const antes = backgroundDeclarations(res.html)
    // Duas rodadas: painel dentro de painel colapsa de novo quando os dois
    // são reerguidos para o mesmo tom. Na segunda, o de dentro já vê o pai
    // em `surface` e sobe para `surface_strong`.
    for (let rodada = 0; rodada < 2; rodada++) {
      const depois = backgroundDeclarations(out)
      if (antes.length !== depois.length) break
      const consertos: Array<{ start: number; end: number; tom: string }> = []
      for (let i = 0; i < antes.length; i++) {
        const a = antes[i]
        const d = depois[i]
        if (a.parent.kind !== "color" || d.parent.kind !== "color") continue
        if (a.hex === a.parent.hex) continue
        if (d.hex !== d.parent.hex) continue
        if (!pintados.has(d.hex)) continue
        // BOTÃO não é painel. Ele colapsa no fundo da faixa por decisão —
        // faixa escurecida com botão invertido para o mesmo escuro é o
        // caminho normal do C3 — e reerguê-lo para `surface` devolveria um
        // retângulo cinza no meio da banda: o defeito que a op `set_botao`
        // existe para evitar, refeito pela guarda logo depois dela.
        if (rangesDeBotao.some((r) => d.valueRange.start >= r.start && d.valueRange.start < r.end)) {
          continue
        }
        consertos.push({
          ...d.valueRange,
          tom: d.parent.hex === surface ? surfaceStrong : surface,
        })
      }
      if (consertos.length === 0) break
      // De trás pra frente: cada splice só desloca offsets maiores que ele.
      consertos.sort((x, y) => y.start - x.start)
      for (const c of consertos) {
        out = out.slice(0, c.start) + c.tom + out.slice(c.end)
        // Entra em `pintados` para o conserto de par abaixo medir o texto
        // contra o fundo FINAL, não contra o que colapsou.
        pintados.add(canonicalHex(c.tom))
        panelFixes++
      }
    }
  }

  // ── Conserto do PAR ────────────────────────────────────────────────
  //
  // O recolor troca por VALOR e o agente não vê o documento: ele não tem
  // como saber o que pousa sobre o fundo que acabou de pintar. Na Luxe Lift
  // (22/08) uma op legítima (`#BEBEBE → #FAF5F3` no fundo de um botão)
  // deixou o `color:#FFFFFF` do rótulo intacto — contraste 1,05:1, texto
  // invisível, e `skipped` vazio porque o guard acima só pega o par
  // mesma-origem/mesmo-destino.
  //
  // Aqui o código mede de verdade (luminância WCAG) e conserta o texto em
  // cima. Escopo deliberado: só ocorrências cujo fundo efetivo é um destino
  // QUE ESTAS OPS PINTARAM. Contraste que já estava ruim antes não é
  // problema deste step consertar em silêncio — vira issue do render-check.
  let pairedTextFixes = 0
  const findings = auditContrast(out)
  const consertar = findings
    .filter((f) => f.bgHex && f.ratio != null && pintados.has(f.bgHex))
    // De trás pra frente: cada splice só desloca offsets maiores que ele.
    .sort((a, b) => b.offset - a.offset)
  for (const f of consertar) {
    const novo = contrastingText(f.bgHex as string)
    out = out.slice(0, f.offset) + novo + out.slice(f.offset + f.textHex.length)
    pairedTextFixes++
  }

  const contrastRemaining = pairedTextFixes
    ? auditContrast(out).filter((f) => f.ratio != null).length
    : findings.filter((f) => f.ratio != null).length

  return {
    html: out,
    applied,
    skipped,
    recoloredOccurrences,
    pairedTextFixes,
    contrastRemaining,
    panelFixes,
    faixasPintadas,
    botoesRecoloridos,
    botoesInseridos,
  }
}
