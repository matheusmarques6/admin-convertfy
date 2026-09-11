/**
 * Papel de um campo do `output_schema` a partir da CHAVE, e o resumo do
 * CONTRATO de uma variante — o que a anatomia dela obriga a preencher.
 *
 * Por que existe (09/09). O Curador legado escolheu, para a hero de uma
 * loja SEM incentivo, a variante cujo schema tem `coupon_line` + `cta_label`
 * — com o motivo "sem depender de cupom ausente". Ele não viu o schema: o
 * catálogo o excluía de propósito ("insumo exclusivo do Montador"), e o
 * Montador está desligado. O resumo cabe em ~150 chars por variante e diz o
 * que o Curador precisa saber para eliminar: TEM slot de cupom, TEM CTA,
 * quantos itens a grade pede, se mostra preço/avaliação.
 *
 * Medido antes de escrever: NENHUM campo da biblioteca é `required:true`.
 * Então "obrigatório" aqui não é a flag — é a presença do slot. Sem cupom,
 * o merge deixa o example ("Use code: [WELCOME-CODE]") no HTML, porque
 * `pareceExemplo` não o reconhece como mockup; o slot existir JÁ obriga.
 *
 * Fonte única: o Blueprint (omitir por campo), o Curador (contrato) e o QA
 * leem a MESMA classificação. Puro, sem I/O.
 */

export type FamiliaDeItem = "product" | "review" | "item" | "feature"

export interface PapelDoCampo {
  /** Família de item numerado, quando o campo é uma repetição. */
  familia: FamiliaDeItem | null
  /** Índice do item na família (1-based), quando numerado. */
  indice: number | null
  cupom: boolean
  cta: boolean
  preco: boolean
  /**
   * Preço ANTERIOR riscado (`price_old`, `compare_at_price`). É a metade
   * "de" do "de/por": só existe se houver desconto. Separado de `preco`
   * porque a decisão que pede preço VISÍVEL não pede preço riscado — e
   * confundir os dois foi o que fez a única variante de products com preço
   * ser descartada por inteiro (Hero Boxers, 11/09).
   */
  preco_antigo: boolean
  /** Prazo/validade da oferta (`badge_deadline`, `expires_at`). */
  prazo: boolean
  avaliacao: boolean
  /** Credencial do depoente (cargo, idade, contexto) — reviews. */
  credencial: boolean
  /** Nome/autor do depoente — reviews. */
  nome: boolean
}

const RE_CUPOM = /(^|_)(coupon|cupom|code|codigo)(_|$)/i
const RE_CTA = /(^|_)(cta|button|btn)(_|$)/i
const RE_PRECO = /(^|_)(price|preco|preço)(_|$)/i
// `price_old`, `old_price`, `preco_antigo`, `compare_at_price`, `price_was`.
// `price_new` NÃO casa: é o preço vigente, que é exatamente o que uma
// decisão com `preco: true` está pedindo.
const RE_PRECO_ANTIGO = /(^|_)(old|antigo|was|compare_at|regular|list)(_|$)/i
const RE_PRAZO = /(^|_)(deadline|prazo|expires?|expiry|until|countdown|valid_until)(_|$)/i
const RE_AVALIACAO = /(^|_)(rating|stars?|avaliacao|verified)(_|$)/i
const RE_CREDENCIAL = /(^|_)(credential|role|initial|context)(_|$)/i
const RE_NOME = /(^|_)(name|author)$/i

/**
 * Famílias numeradas. `headline_l1`/`lockup_l2` são LINHAS, não itens —
 * o `_l\d` fica fora de propósito. `cta_1_label` idem: dois botões não são
 * uma grade.
 */
const FAMILIAS: Array<{ familia: FamiliaDeItem; re: RegExp }> = [
  { familia: "product", re: /^product_(\d+)_|^product_cta_label_(\d+)$|^panel_(\d+)_/i },
  { familia: "review", re: /^(?:review|testimonial)_(\d+)_/i },
  { familia: "item", re: /_item_(\d+)$/i },
  { familia: "feature", re: /^(?:feature|marker|seal)_(\d+)_/i },
]

/** Classifica a chave. Puro. */
export function papelDoCampo(key: string): PapelDoCampo {
  const k = key.trim()
  let familia: FamiliaDeItem | null = null
  let indice: number | null = null
  for (const f of FAMILIAS) {
    const m = f.re.exec(k)
    if (!m) continue
    const n = m.slice(1).find((g) => g != null)
    familia = f.familia
    indice = n ? Number(n) : null
    break
  }
  return {
    familia,
    indice,
    cupom: RE_CUPOM.test(k),
    cta: RE_CTA.test(k),
    preco: RE_PRECO.test(k),
    preco_antigo: RE_PRECO.test(k) && RE_PRECO_ANTIGO.test(k),
    prazo: RE_PRAZO.test(k),
    avaliacao: RE_AVALIACAO.test(k),
    credencial: familia === "review" && RE_CREDENCIAL.test(k),
    nome: familia === "review" && RE_NOME.test(k),
  }
}

/** Resumo do contrato de uma variante — o que a anatomia obriga. */
export interface ContratoResumo {
  /** Campos com `required:true` (raro na biblioteca; fica por honestidade). */
  campos_obrigatorios: string[]
  /** A anatomia TEM slot de cupom/código: sem incentivo, o example fica. */
  tem_cupom: boolean
  tem_cta: boolean
  tem_preco: boolean
  tem_avaliacao: boolean
  /** Reviews com credencial do depoente (cargo/idade/contexto). */
  tem_credencial: boolean
  /** Itens por família numerada (product: 4 = grade de 4). */
  itens: Partial<Record<FamiliaDeItem, number>>
  /** Maior grade da variante; null sem item numerado. */
  n_itens: number | null
  /** Contagem de campos de copy e de imagem. */
  copy: number
  imagens: number
}

type CampoMinimo = { key?: unknown; type?: unknown; nature?: unknown; required?: unknown }

function ehImagem(f: CampoMinimo): boolean {
  if (f.nature === "imagem_gerada" || f.nature === "asset_fixo") return true
  return f.type === "image"
}

/** Resume o `output_schema`. Puro; schema inválido → contrato vazio. */
export function resumirContrato(schema: unknown): ContratoResumo {
  const campos = (Array.isArray(schema) ? schema : []).filter(
    (f): f is CampoMinimo & { key: string } => !!f && typeof f === "object" && typeof (f as CampoMinimo).key === "string",
  )
  const itens: Partial<Record<FamiliaDeItem, number>> = {}
  const out: ContratoResumo = {
    campos_obrigatorios: [],
    tem_cupom: false,
    tem_cta: false,
    tem_preco: false,
    tem_avaliacao: false,
    tem_credencial: false,
    itens,
    n_itens: null,
    copy: 0,
    imagens: 0,
  }
  for (const f of campos) {
    const img = ehImagem(f)
    if (img) out.imagens++
    else out.copy++
    if (f.required === true) out.campos_obrigatorios.push(f.key)
    const p = papelDoCampo(f.key)
    if (p.familia && p.indice != null) {
      itens[p.familia] = Math.max(itens[p.familia] ?? 0, p.indice)
    }
    // Slot de cupom/preço/avaliação só conta como copy: imagem de fundo do
    // cupom (`coupon_background_image`) não obriga a escrever um código.
    if (img) continue
    if (p.cupom) out.tem_cupom = true
    if (p.cta) out.tem_cta = true
    if (p.preco) out.tem_preco = true
    if (p.avaliacao) out.tem_avaliacao = true
    if (p.credencial) out.tem_credencial = true
  }
  const ns = Object.values(itens).filter((n): n is number => typeof n === "number")
  out.n_itens = ns.length ? Math.max(...ns) : null
  return out
}

/**
 * Requisitos DUROS de uma posição — o que a decisão (Estruturador) exige
 * ou nega. `null`/ausente = indiferente. Preenchido pelo Estruturador
 * (passo 2 do plano); até lá o filtro só recebe o que o alvo já sabe.
 */
export interface RequisitosDuros {
  cupom?: boolean | null
  cta?: boolean | null
  n_itens?: { min?: number | null; max?: number | null } | null
  preco?: boolean | null
  avaliacao?: boolean | null
}

/** Motivo pelo qual um contrato colide com os requisitos; null = compatível. */
export function conflitoDeContrato(c: ContratoResumo, r: RequisitosDuros | null | undefined): string | null {
  if (!r) return null
  if (r.cupom === false && c.tem_cupom) return "tem slot de cupom e a decisão nega cupom"
  if (r.cupom === true && !c.tem_cupom) return "não tem slot de cupom e a decisão exige cupom"
  if (r.cta === false && c.tem_cta) return "tem CTA e a decisão nega CTA"
  if (r.preco === true && !c.tem_preco) return "não mostra preço e a decisão exige preço"
  if (r.avaliacao === true && !c.tem_avaliacao) return "não mostra avaliação e a decisão exige avaliação"
  const max = r.n_itens?.max
  const min = r.n_itens?.min
  if (c.n_itens != null) {
    if (typeof max === "number" && c.n_itens > max) return `grade de ${c.n_itens} itens e a decisão pede no máximo ${max}`
    if (typeof min === "number" && c.n_itens < min) return `grade de ${c.n_itens} itens e a decisão pede no mínimo ${min}`
  }
  return null
}

/**
 * Filtra candidatas pelo contrato × requisitos. FAIL-OPEN: se o filtro
 * zerar a lista, devolve todas e declara `zerou` — lacuna de biblioteca é
 * dado para a curadoria, não motivo para o e-mail sair sem a seção.
 */
export function filtrarPorRequisitos<T extends { variant_id: string; contrato?: ContratoResumo }>(
  candidatas: T[],
  requisitos: RequisitosDuros | null | undefined,
): { elegiveis: T[]; eliminadas: Array<{ variant_id: string; motivo: string }>; zerou: boolean } {
  const eliminadas: Array<{ variant_id: string; motivo: string }> = []
  const elegiveis: T[] = []
  for (const c of candidatas) {
    const motivo = c.contrato ? conflitoDeContrato(c.contrato, requisitos) : null
    if (motivo) eliminadas.push({ variant_id: c.variant_id, motivo })
    else elegiveis.push(c)
  }
  if (elegiveis.length === 0 && candidatas.length > 0) {
    return { elegiveis: candidatas, eliminadas, zerou: true }
  }
  return { elegiveis, eliminadas, zerou: false }
}

// ── Capacidade da biblioteca por seção (o que o Estruturador pode exigir) ──

export interface CapacidadeDaSecao {
  variantes: number
  /** Faixa de itens das variantes que têm grade (null = nenhuma tem). */
  itens: { min: number; max: number } | null
  com_preco: number
  com_avaliacao: number
  com_cupom: number
  com_cta: number
  com_credencial: number
}

/**
 * Agrega os contratos por `block_type`. É o que vai em
 * `<secoes_disponiveis>` do Estruturador: ele passa a saber que a seção
 * `products` tem grades de 1 a 9 e só UMA variante mostra preço — e não
 * exige o que a biblioteca não tem (quando exige, é lacuna declarada).
 */
export function capacidadePorSecao(
  variantes: Array<{ block_type: string; output_schema?: unknown }>,
): Record<string, CapacidadeDaSecao> {
  const out: Record<string, CapacidadeDaSecao> = {}
  for (const v of variantes) {
    const c = resumirContrato(v.output_schema)
    const cap = (out[v.block_type] ??= {
      variantes: 0,
      itens: null,
      com_preco: 0,
      com_avaliacao: 0,
      com_cupom: 0,
      com_cta: 0,
      com_credencial: 0,
    })
    cap.variantes++
    if (c.n_itens != null) {
      cap.itens = cap.itens
        ? { min: Math.min(cap.itens.min, c.n_itens), max: Math.max(cap.itens.max, c.n_itens) }
        : { min: c.n_itens, max: c.n_itens }
    }
    if (c.tem_preco) cap.com_preco++
    if (c.tem_avaliacao) cap.com_avaliacao++
    if (c.tem_cupom) cap.com_cupom++
    if (c.tem_cta) cap.com_cta++
    if (c.tem_credencial) cap.com_credencial++
  }
  return out
}

/** Uma linha por seção, em ordem alfabética. Puro. */
export function renderCapacidade(cap: Record<string, CapacidadeDaSecao>): string {
  const secoes = Object.keys(cap).filter((k) => cap[k].variantes > 0).sort()
  if (secoes.length === 0) return "(nenhuma seção com variante ativa na biblioteca)"
  return secoes
    .map((k) => {
      const c = cap[k]
      const partes = [`${c.variantes} variante${c.variantes === 1 ? "" : "s"}`]
      if (c.itens) partes.push(c.itens.min === c.itens.max ? `${c.itens.max} itens` : `${c.itens.min}–${c.itens.max} itens`)
      partes.push(`com preço: ${c.com_preco}`, `com avaliação: ${c.com_avaliacao}`, `com cupom: ${c.com_cupom}`, `com CTA: ${c.com_cta}`)
      if (c.com_credencial > 0) partes.push(`com credencial do depoente: ${c.com_credencial}`)
      return `- ${k}: ${partes.join(" · ")}`
    })
    .join("\n")
}

// ── Eliminação por requisito × contrato, posição a posição ─────────────

export interface EliminadaPorRequisito {
  variant_id: string
  nome: string
  motivo: string
}

export interface EliminacaoDaPosicao {
  block_index: number
  section: string
  eliminadas: EliminadaPorRequisito[]
  /** O filtro zerou a seção: nada foi eliminado de fato (fail-open) e isto é lacuna de biblioteca. */
  zerou: boolean
}

/**
 * Cruza os `requisitos` do Estruturador (por posição) com o `contrato` das
 * variantes da seção correspondente do catálogo. Puro. O que sai daqui vai
 * ao prompt dos dois Curadores (bloco `<eliminadas_por_requisito>`), à
 * telemetria e ao medidor (`requisito_violado` quando o rank-1 está aqui).
 */
export function eliminarPorRequisitos(
  sections: string[],
  requisitos: Array<RequisitosDuros | null | undefined>,
  catalogo: Array<{ section: string; variantes: Array<{ variant_id: string; name?: string; contrato?: ContratoResumo }> }>,
): EliminacaoDaPosicao[] {
  const porSecao = new Map(catalogo.map((c) => [c.section, c.variantes]))
  const out: EliminacaoDaPosicao[] = []
  sections.forEach((section, i) => {
    const req = requisitos[i]
    if (!req) return
    const candidatas = porSecao.get(section) ?? []
    if (candidatas.length === 0) return
    const r = filtrarPorRequisitos(candidatas, req)
    if (r.eliminadas.length === 0) return
    const nomes = new Map(candidatas.map((c) => [c.variant_id, c.name ?? c.variant_id]))
    out.push({
      block_index: i,
      section,
      eliminadas: r.eliminadas.map((e) => ({ variant_id: e.variant_id, nome: nomes.get(e.variant_id) ?? e.variant_id, motivo: e.motivo })),
      zerou: r.zerou,
    })
  })
  return out
}

/** Bloco de prompt. Ausência declarada quando não há eliminação. */
export function renderEliminadasPorRequisito(lista: EliminacaoDaPosicao[]): string {
  if (lista.length === 0) return "(nenhuma — sem requisito do Estruturador que colida com o contrato de alguma variante)"
  return lista
    .map((p) => {
      const cab = `[${p.block_index}] ${p.section}${p.zerou ? " — ATENÇÃO: o requisito eliminaria TODAS as variantes da seção; nenhuma foi eliminada (lacuna de biblioteca — escolha a menos incompatível e diga na justificativa)" : ""}`
      const linhas = p.eliminadas.map((e) => `  - ${e.nome} (${e.variant_id}): ${e.motivo}`)
      return [cab, ...linhas].join("\n")
    })
    .join("\n")
}

/** `block_index → (variant_id → motivo)` para o medidor. */
export function indiceDeEliminadas(lista: EliminacaoDaPosicao[]): Map<number, Map<string, string>> {
  const m = new Map<number, Map<string, string>>()
  for (const p of lista) {
    if (p.zerou) continue
    m.set(p.block_index, new Map(p.eliminadas.map((e) => [e.variant_id, e.motivo])))
  }
  return m
}
