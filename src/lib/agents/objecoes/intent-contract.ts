/**
 * Contrato tipado da intenção de um toque (módulo PURO, client-safe).
 *
 * A doutrina das intenções mora em `email_intents.body_md`, em prosa — e o
 * Seletor não filtra bem contra prosa: `riscos_elegiveis`, `permite_reataque`,
 * `profundidade_minima` precisam ser CAMPOS. Eles entram pelo frontmatter da
 * nota do Obsidian (spec §4; proposta para as 8 do welcome em
 * docs/email-generation/intencoes-welcome-frontmatter.md) e chegam aqui via
 * `email_intents.frontmatter` (o sync já grava o frontmatter inteiro).
 *
 * Regra: sem `modo` válido não há contrato (`null`) — o Seletor grava run
 * `skipped` e o pipeline segue como hoje. NUNCA se inventa modo. Os demais
 * campos têm default POR MODO (o que a spec descreve para cada um); valor
 * fora do vocabulário é descartado e listado em `desconhecidos` (telemetria).
 */

import {
  ALIVIADORES,
  MODOS_SEM_OBJECAO,
  TIPOS_DE_RISCO,
  isAliviador,
  isDimensao,
  isFonte,
  isModo,
  isProfundidade,
  isTipoDeRisco,
  isTrabalhoFixo,
  isVeiculo,
  type Aliviador,
  type DimensaoConfianca,
  type FonteDasObjecoes,
  type ModoDoToque,
  type Profundidade,
  type TipoDeRisco,
  type TrabalhoFixo,
  type Veiculo,
} from "./vocabulario"

export interface IntentContract {
  /**
   * `null` quando a nota não declara — o Seletor deduz da prosa da intenção e
   * ecoa em `modo_adotado`. Ver `parseIntentContract`.
   */
  modo: ModoDoToque | null
  /** [mín, máx] de objeções a selecionar. [0,0] nos modos sem objeção. */
  n_objecoes: [number, number]
  fonte_das_objecoes: FonteDasObjecoes
  riscos_elegiveis: TipoDeRisco[]
  riscos_vetados: TipoDeRisco[]
  profundidade_minima: Profundidade
  /** Lista fechada ou "todos". */
  aliviadores_admissiveis: Aliviador[] | "todos"
  /** Extensão à spec: "não depender de prova social" vira veto de aliviador. */
  aliviadores_vetados: Aliviador[]
  veiculos_exigidos: Veiculo[]
  trabalhos_fixos: TrabalhoFixo[]
  permite_reataque: boolean
  exige_dominante_da_categoria: boolean
  dimensao_alvo: DimensaoConfianca | null
  promessa_a_pagar: string | null
  proibicoes: string[]
  /** Valores do frontmatter fora do vocabulário — descartados, não silenciados. */
  desconhecidos: string[]
  /**
   * De onde veio cada campo preenchido: `nota` (frontmatter tipado),
   * `catalogo` (catálogo da loja) ou `default` (derivado do modo). O contrato
   * deixou de ter fonte única, então a origem deixou de ser óbvia.
   */
  origens: Partial<Record<keyof IntentContract, "nota" | "catalogo" | "default">>
}

/** O que o montador precisa do catálogo da loja — subconjunto de `CatalogoDeObjecoes`. */
export interface CatalogoParaContrato {
  objecoes: Array<{
    tipo_de_risco: TipoDeRisco | null
    aliviador: Aliviador | null
    dimensao_confianca: DimensaoConfianca | null
    dominante_da_categoria: boolean
    flows_elegiveis: readonly string[]
    lastro_operacional?: { verificado?: boolean } | null
  }>
  veiculos_de_argumento?: Record<string, { texto?: string | null; aplicavel?: boolean; alerta?: string | null }> | null
  incentivo?: { existe?: boolean | null; valor?: string | null; codigo?: string | null; alerta?: string | null } | null
  medos_de_categoria?: Array<{ medo?: string; verificado?: boolean; alerta?: string | null }> | null
}

export interface ParseIntentContractInput {
  frontmatter?: Record<string, unknown> | null
  /** Catálogo da loja, já filtrado pelo flow deste email (ou inteiro). */
  catalogo?: CatalogoParaContrato | null
  /** Flow deste email — filtra as objeções por `flows_elegiveis`. */
  flowType?: string | null
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])

function defaultN(modo: ModoDoToque): [number, number] {
  switch (modo) {
    case "quebra_de_objecao":
      return [1, 1]
    case "varredura_de_objecoes":
      return [3, 5]
    case "confirmacao_por_terceiros":
      return [2, 3]
    case "varredura_de_canal":
      return [3, 6]
    default:
      return [0, 0]
  }
}

function defaultFonte(modo: ModoDoToque): FonteDasObjecoes {
  if (modo === "confirmacao_por_terceiros") return "ja_atacadas"
  if (modo === "varredura_de_canal") return "medos_de_categoria"
  return "nao_atacadas"
}

function defaultProfundidade(modo: ModoDoToque): Profundidade {
  return modo === "confirmacao_por_terceiros" ? "prova_de_terceiro" : "afirmacao"
}

function parseN(v: unknown, dflt: [number, number]): [number, number] {
  const a = arr(v).map((x) => (typeof x === "number" ? x : parseInt(str(x), 10)))
  if (a.length === 0 || a.some((x) => !Number.isFinite(x))) return dflt
  const min = Math.max(0, Math.round(a[0]))
  const max = Math.max(min, Math.round(a.length > 1 ? a[1] : a[0]))
  return [min, max]
}

/**
 * Monta o contrato do toque a partir das TRÊS fontes, nesta precedência:
 * **nota tipada > catálogo da loja > default por modo**.
 *
 * Incidente 07/09: a versão anterior lia SÓ o frontmatter e devolvia `null`
 * sem `modo` — o Seletor gravava `skipped` e nunca rodava. Duas coisas
 * erradas de uma vez. A primeira: fonte única, quando 11 dos 15 campos já
 * estão no catálogo da loja, com os mesmos enums (`tipo_de_risco`,
 * `aliviador`, `dimensao_confianca`) — a run de 14:06 provou, porque as 8
 * proibições e os 3 trabalhos fixos dela saíram do catálogo e da prosa, não
 * do frontmatter, que tinha uma chave só. A segunda: ausência de uma
 * ETIQUETA anulando o contrato inteiro, em vez de degradar para o que dá
 * para saber.
 *
 * Agora nunca devolve `null`. Sem `modo` declarado ele sai `null` no campo, e
 * quem decide é o Seletor lendo a prosa da intenção (que ele já recebe
 * inteira) — ecoando em `modo_adotado`.
 */
export function parseIntentContract(
  input?: ParseIntentContractInput | Record<string, unknown> | null,
): IntentContract {
  // Compatibilidade: o call site antigo passava o frontmatter cru.
  const ehInput =
    input != null &&
    ("frontmatter" in input || "catalogo" in input || "flowType" in input)
  const p: ParseIntentContractInput = ehInput
    ? (input as ParseIntentContractInput)
    : { frontmatter: (input as Record<string, unknown> | null) ?? null }

  const f = p.frontmatter ?? {}
  const modo = isModo(f.modo) ? f.modo : null
  const origens: IntentContract["origens"] = {}
  if (modo) origens.modo = "nota"

  // ── O que o catálogo da loja sustenta ────────────────────────────────
  const objecoes = (p.catalogo?.objecoes ?? []).filter(
    (o) => !p.flowType || o.flows_elegiveis.includes(p.flowType),
  )
  const doCatalogo = {
    riscos: Array.from(
      new Set(objecoes.map((o) => o.tipo_de_risco).filter((r): r is TipoDeRisco => r != null)),
    ),
    aliviadores: Array.from(
      new Set(objecoes.map((o) => o.aliviador).filter((a): a is Aliviador => a != null)),
    ),
    // Lastro não verificado é teto de prova: sem confirmação da loja não dá
    // para exigir prova dura, e prometer o que não se sustenta é pior que
    // afirmar. Só sobe quando ALGUMA objeção tem lastro verificado.
    temLastro: objecoes.some((o) => o.lastro_operacional?.verificado === true),
    dominante: objecoes.find((o) => o.dominante_da_categoria) ?? null,
    veiculosComInsumo: Object.entries(p.catalogo?.veiculos_de_argumento ?? {})
      .filter(([, v]) => v?.aplicavel !== false && Boolean(v?.texto))
      .map(([nome]) => nome)
      .filter(isVeiculo),
    incentivo: p.catalogo?.incentivo ?? null,
  }

  // Alertas do catálogo viram proibição de REDAÇÃO — é o que a loja não pode
  // afirmar hoje. A prosa da intenção acrescenta as dela pelo frontmatter.
  const proibicoesDoCatalogo: string[] = []
  if (doCatalogo.incentivo?.alerta) proibicoesDoCatalogo.push(doCatalogo.incentivo.alerta)
  for (const [, v] of Object.entries(p.catalogo?.veiculos_de_argumento ?? {})) {
    if (v?.alerta && v.texto) proibicoesDoCatalogo.push(v.alerta)
  }
  for (const m of p.catalogo?.medos_de_categoria ?? []) {
    if (m?.alerta && m.verificado === false) proibicoesDoCatalogo.push(m.alerta)
  }

  const desconhecidos: string[] = []
  const filtra = <T,>(campo: string, v: unknown, guard: (x: unknown) => x is T): T[] => {
    const out: T[] = []
    for (const x of arr(v)) {
      if (guard(x)) out.push(x)
      else if (str(x)) desconhecidos.push(`${campo}: ${str(x)}`)
    }
    return out
  }

  const semObjecao = modo != null && MODOS_SEM_OBJECAO.includes(modo)
  const riscosDeclarados = "riscos_elegiveis" in f
  const riscos = filtra("riscos_elegiveis", f.riscos_elegiveis, isTipoDeRisco)
  const riscosVetados = filtra("riscos_vetados", f.riscos_vetados, isTipoDeRisco)

  const admRaw = f.aliviadores_admissiveis
  const admLista = arr(admRaw).map(str)
  const admTodos = admRaw == null || admLista.length === 0 || admLista.includes("todos")
  const aliviadoresAdmissiveis = admTodos ? "todos" : filtra("aliviadores_admissiveis", admRaw, isAliviador)

  const profRaw = f.profundidade_minima
  if (profRaw != null && !isProfundidade(profRaw)) desconhecidos.push(`profundidade_minima: ${str(profRaw)}`)
  const fonteRaw = f.fonte_das_objecoes
  if (fonteRaw != null && !isFonte(fonteRaw)) desconhecidos.push(`fonte_das_objecoes: ${str(fonteRaw)}`)
  const dimRaw = f.dimensao_alvo
  if (dimRaw != null && !isDimensao(dimRaw)) desconhecidos.push(`dimensao_alvo: ${str(dimRaw)}`)

  // ── Cada campo: nota, senão catálogo, senão default ──────────────────
  const marca = (campo: keyof IntentContract, origem: "nota" | "catalogo" | "default") => {
    origens[campo] = origem
  }

  // Riscos: a nota restringe; sem ela, os riscos que a loja de fato tem.
  // `TIPOS_DE_RISCO` inteiro (o comportamento antigo) só quando não há
  // catálogo — servir risco que a loja não catalogou não ajuda a decidir.
  let riscosElegiveis: TipoDeRisco[]
  if (semObjecao) {
    riscosElegiveis = []
    marca("riscos_elegiveis", "default")
  } else if (riscosDeclarados) {
    riscosElegiveis = riscos.filter((r) => !riscosVetados.includes(r))
    marca("riscos_elegiveis", "nota")
  } else if (doCatalogo.riscos.length > 0) {
    riscosElegiveis = doCatalogo.riscos.filter((r) => !riscosVetados.includes(r))
    marca("riscos_elegiveis", "catalogo")
  } else {
    riscosElegiveis = TIPOS_DE_RISCO.filter((r) => !riscosVetados.includes(r))
    marca("riscos_elegiveis", "default")
  }

  // Aliviadores: idem. "todos" só sobrevive sem catálogo — com ele, a lista
  // fechada é a dos aliviadores que as objeções desta loja pedem.
  let aliviadores: Aliviador[] | "todos" = aliviadoresAdmissiveis
  if (!admTodos) marca("aliviadores_admissiveis", "nota")
  else if (doCatalogo.aliviadores.length > 0) {
    aliviadores = doCatalogo.aliviadores
    marca("aliviadores_admissiveis", "catalogo")
  } else marca("aliviadores_admissiveis", "default")

  let profundidade: Profundidade
  if (isProfundidade(profRaw)) {
    profundidade = profRaw
    marca("profundidade_minima", "nota")
  } else if (objecoes.length > 0 && !doCatalogo.temLastro) {
    profundidade = "afirmacao"
    marca("profundidade_minima", "catalogo")
  } else {
    profundidade = modo ? defaultProfundidade(modo) : "afirmacao"
    marca("profundidade_minima", modo ? "default" : "catalogo")
  }

  let dimensao: DimensaoConfianca | null = null
  if (isDimensao(dimRaw)) {
    dimensao = dimRaw
    marca("dimensao_alvo", "nota")
  } else if (doCatalogo.dominante?.dimensao_confianca) {
    dimensao = doCatalogo.dominante.dimensao_confianca
    marca("dimensao_alvo", "catalogo")
  }

  // Promessa a pagar: só existe com incentivo CONFIRMADO. `existe: null` é
  // "não dá para saber" e não vira promessa — inventar oferta é o pior erro
  // possível aqui.
  let promessa = str(f.promessa_a_pagar) || null
  if (promessa) marca("promessa_a_pagar", "nota")
  else if (doCatalogo.incentivo?.existe === true) {
    promessa = [doCatalogo.incentivo.valor, doCatalogo.incentivo.codigo].filter(Boolean).join(" · ") || null
    if (promessa) marca("promessa_a_pagar", "catalogo")
  }

  const veiculosDaNota = filtra("veiculos_exigidos", f.veiculos_exigidos, isVeiculo)
  let veiculos = veiculosDaNota
  if (veiculosDaNota.length > 0) marca("veiculos_exigidos", "nota")
  else if (doCatalogo.veiculosComInsumo.length > 0) {
    veiculos = doCatalogo.veiculosComInsumo
    marca("veiculos_exigidos", "catalogo")
  }

  const proibicoesDaNota = arr(f.proibicoes).map(str).filter(Boolean)
  const proibicoes = Array.from(new Set([...proibicoesDaNota, ...proibicoesDoCatalogo]))
  if (proibicoes.length > 0) {
    marca("proibicoes", proibicoesDaNota.length > 0 ? "nota" : "catalogo")
  }

  const exigeDominante =
    f.exige_dominante_da_categoria === true
      ? (marca("exige_dominante_da_categoria", "nota"), true)
      : false

  return {
    modo,
    n_objecoes: semObjecao ? [0, 0] : parseN(f.n_objecoes, modo ? defaultN(modo) : [1, 1]),
    fonte_das_objecoes: isFonte(fonteRaw) ? fonteRaw : modo ? defaultFonte(modo) : "nao_atacadas",
    riscos_elegiveis: riscosElegiveis,
    riscos_vetados: riscosVetados,
    profundidade_minima: profundidade,
    aliviadores_admissiveis: aliviadores,
    aliviadores_vetados: filtra("aliviadores_vetados", f.aliviadores_vetados, isAliviador),
    veiculos_exigidos: veiculos,
    trabalhos_fixos: filtra("trabalhos_fixos", f.trabalhos_fixos, isTrabalhoFixo),
    permite_reataque: f.permite_reataque === true || modo === "confirmacao_por_terceiros",
    exige_dominante_da_categoria: exigeDominante,
    dimensao_alvo: dimensao,
    promessa_a_pagar: promessa,
    proibicoes,
    desconhecidos,
    origens,
  }
}

/** Aliviador admissível neste toque (lista fechada ou "todos", menos os vetados). */
export function aliviadorAdmissivel(c: IntentContract, a: Aliviador): boolean {
  if (c.aliviadores_vetados.includes(a)) return false
  return c.aliviadores_admissiveis === "todos" || c.aliviadores_admissiveis.includes(a)
}

/** Bloco `<contrato_do_toque>` do prompt do Seletor — o contrato em linhas legíveis. */
export function renderIntentContract(c: IntentContract): string {
  const linhas = [
    c.modo
      ? `- modo: ${c.modo}`
      : "- modo: NÃO DECLARADO — deduza de <intencao_do_toque> (o texto diz o que este toque faz) e ecoe o adotado em `modo`",
    `- n_objecoes: ${c.n_objecoes[0]}–${c.n_objecoes[1]}`,
    `- fonte_das_objecoes: ${c.fonte_das_objecoes}`,
    `- riscos_elegiveis: ${c.riscos_elegiveis.length ? c.riscos_elegiveis.join(", ") : "(nenhum — modo sem objeção)"}`,
    c.riscos_vetados.length ? `- riscos_vetados: ${c.riscos_vetados.join(", ")}` : null,
    `- profundidade_minima: ${c.profundidade_minima}`,
    `- aliviadores_admissiveis: ${c.aliviadores_admissiveis === "todos" ? `todos (${ALIVIADORES.length})` : c.aliviadores_admissiveis.join(", ")}`,
    c.aliviadores_vetados.length ? `- aliviadores_vetados: ${c.aliviadores_vetados.join(", ")}` : null,
    c.veiculos_exigidos.length ? `- veiculos_exigidos: ${c.veiculos_exigidos.join(", ")}` : null,
    c.trabalhos_fixos.length ? `- trabalhos_fixos: ${c.trabalhos_fixos.join(", ")}` : null,
    `- permite_reataque: ${c.permite_reataque}`,
    c.exige_dominante_da_categoria ? "- exige_dominante_da_categoria: true" : null,
    c.dimensao_alvo ? `- dimensao_alvo: ${c.dimensao_alvo}` : null,
    c.promessa_a_pagar ? `- promessa_a_pagar: ${c.promessa_a_pagar}` : null,
    c.proibicoes.length ? `- proibicoes:\n${c.proibicoes.map((p) => `  - ${p}`).join("\n")}` : null,
    // Origem por campo: sem isto o modelo não distingue "a intenção MANDOU"
    // de "derivamos do catálogo da loja", e trata default como ordem.
    Object.keys(c.origens).length
      ? `- origem dos campos: ${Object.entries(c.origens).map(([k, v]) => `${k}=${v}`).join(" · ")}`
      : null,
  ]
  return linhas.filter(Boolean).join("\n")
}
