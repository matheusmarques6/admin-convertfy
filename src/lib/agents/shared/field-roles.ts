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

import { conflitoDeDispositivo } from "./dispositivos"
import { normalizarSecao } from "../architect/repeticao"

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
// Slot de logo — `brand_logo`, `logo`, `logo_url`. Não passa por
// `papelDoCampo` porque não é papel de COPY: é presença de ativo.
const RE_LOGO = /(^|_)logo(_|$)/i

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

import { conflitoCenaDirecao } from "../image/direcao-fotografica"

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
  /**
   * A FORMA da peça, derivada do MESMO `output_schema` (15/09). O catálogo
   * publicava cinco booleanos e parava; medido nas 11 famílias com mais de
   * uma variante ativa, os eixos escritos à mão deixavam três delas
   * indistinguíveis (`hero_lineup` com UMA tupla para duas variantes), e
   * estes derivados separam dez das onze. São grátis: saem de um campo que
   * já é obrigatório e nunca desatualizam.
   */
  /** Prazo/validade declarado (`badge_deadline`, `expires_at`). */
  tem_prazo: boolean
  /** Preço anterior riscado — a metade "de" do "de/por". */
  tem_preco_antigo: boolean
  /** Nome/autor do depoente (reviews). */
  tem_nome_depoente: boolean
  /** Slot de logo da marca. */
  tem_logo: boolean
  /** Quantos botões a anatomia tem (dois CTAs não são uma grade). */
  n_ctas: number
  /**
   * Dispositivo da variante (B3, coluna `email_component_variants.dispositivo`).
   * Não vem do schema — quem monta o catálogo o preenche. `null` = variante
   * ainda não classificada: nunca conflita (fail-open).
   */
  dispositivo?: string | null
  /**
   * O que a direção fotográfica cadastrada DIZ (15/09, `image/direcao-
   * fotografica.ts`): rascunho ("Pendente da referência…") e veto a
   * pessoa/mão. Não vem do schema — o catálogo preenche de
   * `photo_direction`. Ausente = não lida: nunca conflita.
   */
  direcao?: { rascunho: boolean; proibe_pessoa: boolean } | null
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
    tem_prazo: false,
    tem_preco_antigo: false,
    tem_nome_depoente: false,
    tem_logo: false,
    n_ctas: 0,
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
    // O logo é medido ANTES do `continue` abaixo porque ele quase sempre é
    // um campo de IMAGEM — checá-lo junto dos papéis de copy o deixaria
    // sempre falso.
    if (RE_LOGO.test(f.key)) out.tem_logo = true
    // Slot de cupom/preço/avaliação só conta como copy: imagem de fundo do
    // cupom (`coupon_background_image`) não obriga a escrever um código.
    if (img) continue
    if (p.cupom) out.tem_cupom = true
    if (p.cta) out.tem_cta = true
    if (p.preco) out.tem_preco = true
    if (p.avaliacao) out.tem_avaliacao = true
    if (p.credencial) out.tem_credencial = true
    if (p.prazo) out.tem_prazo = true
    if (p.preco_antigo) out.tem_preco_antigo = true
    if (p.nome) out.tem_nome_depoente = true
    // Botão NUMERADO (`cta_1_label`) conta como botão distinto; o par
    // label/url do mesmo botão conta UMA vez, senão toda variante com
    // `cta_url` apareceria com o dobro de CTAs.
    if (p.cta && !/_url$/i.test(f.key)) out.n_ctas++
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
  /** Dispositivo pedido pela decisão (B3). É o PRIMEIRO filtro. */
  dispositivo?: string | null
  cupom?: boolean | null
  cta?: boolean | null
  n_itens?: { min?: number | null; max?: number | null } | null
  preco?: boolean | null
  avaliacao?: boolean | null
  /** Cena decidida para a posição (`requisitos.imagem`) — cruza com a direção da variante. */
  imagem?: string | null
}

/** Motivo pelo qual um contrato colide com os requisitos; null = compatível. */
export function conflitoDeContrato(c: ContratoResumo, r: RequisitosDuros | null | undefined): string | null {
  if (!r) return null
  // Dispositivo ANTES de tudo (B3): variante de outro dispositivo não realiza
  // o papel por definição — o resto do contrato nem é olhado.
  const disp = conflitoDeDispositivo(c.dispositivo, r.dispositivo)
  if (disp) return disp
  // Cena × direção (15/09): a hero-3 diz "nenhuma mão, nenhuma pessoa" e o
  // Estruturador pediu "mão adulta encaixando o plug". Até aqui as duas iam
  // ao MESMO prompt de imagem e o modelo fazia o híbrido; o lugar de
  // decidir é aqui, onde a variante ainda pode ser trocada. Direção
  // ausente/rascunho nunca colide.
  const cena = conflitoCenaDirecao(r.imagem, c.direcao)
  if (cena) return cena
  if (r.cupom === false && c.tem_cupom) return "tem slot de cupom e a decisão nega cupom"
  if (r.cupom === true && !c.tem_cupom) return "não tem slot de cupom e a decisão exige cupom"
  // `cta: false` com anatomia que TEM botão NÃO é conflito de anatomia: o
  // blueprint omite o campo (`arbitrarCampos`, estruturador-consume) e a
  // linha sai no merge. Tratar como conflito eliminava body-3 da posição
  // `body_garantias` e deixava a posição VAZIA (batch 879fe6e4, 14/09) —
  // uma lacuna criada pela régua, não pela biblioteca. O validador de
  // escolhas registra `medium` (aviso), o resgate cobra 5 de custo.
  if (r.preco === true && !c.tem_preco) return "não mostra preço e a decisão exige preço"
  if (r.avaliacao === true && !c.tem_avaliacao) return "não mostra avaliação e a decisão exige avaliação"
  const max = r.n_itens?.max
  const min = r.n_itens?.min
  if (c.n_itens != null && typeof max === "number" && c.n_itens > max) {
    return `grade de ${c.n_itens} itens e a decisão pede no máximo ${max}`
  }
  // `n_itens: null` = a anatomia não tem família numerada — numa posição
  // que pede 2+ itens isso é UM item, não "qualquer quantidade". Mesma
  // régua do resgate (`resgate-de-posicao.ts`); a assimetria deixou
  // products-4 (1 item) escapar do mínimo de 2 em 11/09.
  const entrega = c.n_itens ?? 1
  if (typeof min === "number" && entrega < min) {
    return c.n_itens == null
      ? `sem família numerada (1 item) e a decisão pede no mínimo ${min}`
      : `grade de ${c.n_itens} itens e a decisão pede no mínimo ${min}`
  }
  return null
}

/**
 * Elegíveis por POSIÇÃO: as variantes da seção daquela posição menos as
 * eliminadas por requisito — fail-open: quando o filtro zeraria a seção,
 * todas continuam elegíveis (lacuna de biblioteca é dado, não corte).
 *
 * É a lista que a shortlist do Curador e o resgate consomem (14/09). Até
 * aqui a eliminação só informava o prompt (`<eliminadas_por_requisito>`) e
 * o catálogo chegava inteiro ao modelo — "eliminada" era recomendação.
 * Posição cuja seção não existe no catálogo fica FORA do mapa (o chamador
 * distingue "sem seção" de "zero elegíveis").
 */
export interface ElegiveisDaPosicao {
  ids: string[]
  /**
   * A lista veio do FAIL-OPEN de `filtrarPorRequisitos` — o requisito
   * eliminaria todas e nenhuma foi eliminada.
   *
   * Sem este campo a lista é indistinguível de uma seleção real, e quem a
   * lê conta candidatas que o contrato reprova: era assim que
   * `planejarShortlist` via "7 elegíveis", passava do limiar e pagava uma
   * chamada para escolher entre variantes que já estavam todas fora.
   */
  zerou: boolean
  /**
   * Variantes que a JANELA de e-mails recentes bloqueou nesta posição —
   * sempre preenchido, mesmo quando `aplicar` é false.
   *
   * Em shadow o campo existe e os `ids` não mudam: é assim que se mede o
   * efeito da janela antes de ligá-la. Sem isto o shadow não mede nada.
   */
  bloqueadasPelaJanela: string[]
  /** A janela foi afrouxada por escassez (ver `elegiveisPorPosicao`). */
  janelaAfrouxada: boolean
}

/**
 * A janela de repetição entre e-mails (Fase 3 do leque).
 *
 * Ela entra ANTES de `filtrarPorRequisitos`, e não depois, porque o filtro
 * é fail-open no CONJUNTO: aplicada depois, a janela poderia zerar a lista
 * e o fail-open a devolveria inteira, anulando a janela sem nada dizer.
 *
 * **O afrouxamento é por ESCASSEZ, não por zero.** A régua é "sobraram
 * menos variantes distintas do que posições desta seção neste e-mail".
 * Medido no caso real: com 2 posições `body` e 4 variantes, a janela
 * bloqueia 3, a régua de zero não dispara, as duas posições recebem a
 * MESMA variante e a segunda cai no dedupe sem alternativa. Afrouxar por
 * escassez devolve as bloqueadas e deixa o Curador escolher — variedade
 * entre e-mails não vale uma posição vazia.
 */
function aplicarJanela<T extends { variant_id: string }>(
  candidatas: T[],
  bloqueadas: ReadonlySet<string> | undefined,
  posicoesDestaSecao: number,
): { pool: T[]; bloqueadasPelaJanela: string[]; afrouxada: boolean } {
  if (!bloqueadas || bloqueadas.size === 0) {
    return { pool: candidatas, bloqueadasPelaJanela: [], afrouxada: false }
  }
  const bloqueadasPelaJanela = candidatas.filter((c) => bloqueadas.has(c.variant_id)).map((c) => c.variant_id)
  if (bloqueadasPelaJanela.length === 0) {
    return { pool: candidatas, bloqueadasPelaJanela: [], afrouxada: false }
  }
  const sobrando = candidatas.filter((c) => !bloqueadas.has(c.variant_id))
  if (sobrando.length < Math.max(1, posicoesDestaSecao)) {
    return { pool: candidatas, bloqueadasPelaJanela, afrouxada: true }
  }
  return { pool: sobrando, bloqueadasPelaJanela, afrouxada: false }
}

export function elegiveisPorPosicao(
  sections: string[],
  requisitos: Array<RequisitosDuros | null | undefined>,
  catalogo: Array<{ section: string; variantes: Array<{ variant_id: string; contrato?: ContratoResumo }> }>,
  janela?: {
    /** seção normalizada → variantes usadas nos últimos e-mails. */
    bloqueadasPorSecao: ReadonlyMap<string, ReadonlySet<string>>
    /**
     * `false` = SHADOW: calcula e não filtra. Os `ids` saem idênticos aos
     * de sempre e `bloqueadasPelaJanela` diz o que a janela teria tirado.
     */
    aplicar: boolean
  },
): Map<number, ElegiveisDaPosicao> {
  const porSecao = new Map(catalogo.map((c) => [normalizarSecao(c.section), c.variantes]))
  // Quantas posições DESTE e-mail pedem cada seção — é o piso da régua de
  // escassez.
  const posicoesPorSecao = new Map<string, number>()
  for (const s of sections) {
    const k = normalizarSecao(s)
    posicoesPorSecao.set(k, (posicoesPorSecao.get(k) ?? 0) + 1)
  }
  const out = new Map<number, ElegiveisDaPosicao>()
  sections.forEach((section, i) => {
    const chave = normalizarSecao(section)
    const candidatas = porSecao.get(chave)
    if (!candidatas) return
    const j = aplicarJanela(candidatas, janela?.bloqueadasPorSecao.get(chave), posicoesPorSecao.get(chave) ?? 1)
    const r = filtrarPorRequisitos(janela?.aplicar ? j.pool : candidatas, requisitos[i])
    out.set(i, {
      ids: r.elegiveis.map((v) => v.variant_id),
      zerou: r.zerou,
      bloqueadasPelaJanela: j.bloqueadasPelaJanela,
      janelaAfrouxada: j.afrouxada,
    })
  })
  return out
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
  /** Variantes ativas por dispositivo (B3). Só as classificadas contam. */
  por_dispositivo?: Record<string, number>
  /** Quantas variantes da seção têm dispositivo (0 = seção ainda não classificada → filtro fail-open). */
  classificadas?: number
  /** Faixa de itens das variantes que têm grade (null = nenhuma tem). */
  itens: { min: number; max: number } | null
  /**
   * Faixa de itens POR DISPOSITIVO (15/09).
   *
   * A faixa da seção inteira não responde a pergunta que importa: o
   * Estruturador escolhe um dispositivo E uma faixa de itens, e as duas
   * podem ser incompatíveis por construção. Medido na Innova (15/09): ele
   * pediu `reviews_3plus` com `n_itens: {min:2, max:2}` — "três ou mais"
   * limitado a dois. As três variantes do dispositivo entregam 3 e 4 itens,
   * então todas foram eliminadas, a seção zerou, a peça reprovou em
   * `posicao_sem_variante` e a culpa foi atribuída à BIBLIOTECA, que estava
   * certa. Com a faixa por dispositivo no prompt, o pedido impossível não
   * nasce; com ela na auditoria, não passa.
   *
   * Dispositivo cujas variantes não têm grade nenhuma fica FORA do mapa —
   * "sem grade" não é faixa, e inventar `{min:0,max:0}` reprovaria pedido
   * legítimo de quem só quer o bloco.
   */
  itens_por_dispositivo?: Record<string, { min: number; max: number }>
  com_preco: number
  com_avaliacao: number
  com_cupom: number
  com_cta: number
  com_credencial: number
  /** Variantes com slot de imagem GERADA (15/09) — onde o Estruturador tem de decidir a cena. */
  com_imagem?: number
  /** Idem, por dispositivo: a cena é obrigatória quando TODAS as variantes do dispositivo têm imagem. */
  com_imagem_por_dispositivo?: Record<string, number>
}

/**
 * Agrega os contratos por `block_type`. É o que vai em
 * `<secoes_disponiveis>` do Estruturador: ele passa a saber que a seção
 * `products` tem grades de 1 a 9 e só UMA variante mostra preço — e não
 * exige o que a biblioteca não tem (quando exige, é lacuna declarada).
 */
export function capacidadePorSecao(
  variantes: Array<{ block_type: string; output_schema?: unknown; dispositivo?: string | null }>,
): Record<string, CapacidadeDaSecao> {
  const out: Record<string, CapacidadeDaSecao> = {}
  for (const v of variantes) {
    const c = resumirContrato(v.output_schema)
    const cap = (out[v.block_type] ??= {
      variantes: 0,
      por_dispositivo: {},
      classificadas: 0,
      itens: null,
      com_preco: 0,
      com_avaliacao: 0,
      com_cupom: 0,
      com_cta: 0,
      com_credencial: 0,
      com_imagem: 0,
      com_imagem_por_dispositivo: {},
      itens_por_dispositivo: {},
    })
    cap.variantes++
    if (v.dispositivo) {
      cap.classificadas = (cap.classificadas ?? 0) + 1
      cap.por_dispositivo ??= {}
      cap.por_dispositivo[v.dispositivo] = (cap.por_dispositivo[v.dispositivo] ?? 0) + 1
    }
    if (c.imagens > 0) {
      cap.com_imagem = (cap.com_imagem ?? 0) + 1
      if (v.dispositivo) {
        cap.com_imagem_por_dispositivo ??= {}
        cap.com_imagem_por_dispositivo[v.dispositivo] = (cap.com_imagem_por_dispositivo[v.dispositivo] ?? 0) + 1
      }
    }
    if (c.n_itens != null) {
      cap.itens = cap.itens
        ? { min: Math.min(cap.itens.min, c.n_itens), max: Math.max(cap.itens.max, c.n_itens) }
        : { min: c.n_itens, max: c.n_itens }
      if (v.dispositivo) {
        cap.itens_por_dispositivo ??= {}
        const atual = cap.itens_por_dispositivo[v.dispositivo]
        cap.itens_por_dispositivo[v.dispositivo] = atual
          ? { min: Math.min(atual.min, c.n_itens), max: Math.max(atual.max, c.n_itens) }
          : { min: c.n_itens, max: c.n_itens }
      }
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
      // Onde há imagem gerada, "imagem" deixa de ser opcional (15/09): a
      // posição sem cena saiu com a mesma foto do hero.
      if ((c.com_imagem ?? 0) > 0) partes.push(`com imagem gerada: ${c.com_imagem} (decida "imagem" nessas)`)
      // Dispositivos com variante ATIVA nesta seção (B3): é a lista de onde o
      // Estruturador escolhe `requisitos.dispositivo`. Seção sem nenhuma
      // classificada diz isso — pedir dispositivo ali é lacuna declarada.
      const disps = Object.entries(c.por_dispositivo ?? {}).sort((a, b) => a[0].localeCompare(b[0]))
      const classificadas = c.classificadas ?? 0
      // A faixa de itens vai COLADA no dispositivo, e não só na linha da
      // seção: quem escolhe a forma escolhe a grade junto, e a faixa da
      // seção inteira deixa passar o pedido que se contradiz sozinho
      // (`reviews_3plus` com no máximo 2 itens — Innova, 15/09).
      const comFaixa = ([d, n]: [string, number]) => {
        const f = (c.itens_por_dispositivo ?? {})[d]
        if (!f) return `${d} (${n})`
        return `${d} (${n}, ${f.min === f.max ? `${f.min} ${f.min === 1 ? "item" : "itens"}` : `${f.min}–${f.max} itens`})`
      }
      const linhaDisp = disps.length > 0
        ? `  dispositivos: ${disps.map(comFaixa).join(", ")}${classificadas < c.variantes ? ` · ${c.variantes - classificadas} sem classificação` : ""}`
        : "  dispositivos: (nenhuma variante classificada — qualquer dispositivo desta seção é lacuna)"
      return `- ${k}: ${partes.join(" · ")}\n${linhaDisp}`
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
  // A MESMA normalização de `elegiveisPorPosicao`. Sem ela, caixa ou espaço
  // diferente entre `sections` e `catalogo.section` faziam esta função não
  // achar a seção e devolver [] — enquanto a irmã, sobre os mesmos dados,
  // achava. O prompt recebia "nenhuma eliminada" e a régua, a lista cheia.
  const porSecao = new Map(catalogo.map((c) => [normalizarSecao(c.section), c.variantes]))
  const out: EliminacaoDaPosicao[] = []
  sections.forEach((section, i) => {
    const req = requisitos[i]
    if (!req) return
    const candidatas = porSecao.get(normalizarSecao(section)) ?? []
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
