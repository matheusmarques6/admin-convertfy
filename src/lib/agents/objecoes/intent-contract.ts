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
  modo: ModoDoToque
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
 * Lê o frontmatter da intenção. `null` quando não há `modo` válido — a nota
 * ainda não foi tipada (as 26 fora do welcome) e o Seletor não roda para
 * ela.
 */
export function parseIntentContract(fm: Record<string, unknown> | null | undefined): IntentContract | null {
  const f = fm ?? {}
  const modo = f.modo
  if (!isModo(modo)) return null

  const desconhecidos: string[] = []
  const filtra = <T,>(campo: string, v: unknown, guard: (x: unknown) => x is T): T[] => {
    const out: T[] = []
    for (const x of arr(v)) {
      if (guard(x)) out.push(x)
      else if (str(x)) desconhecidos.push(`${campo}: ${str(x)}`)
    }
    return out
  }

  const semObjecao = MODOS_SEM_OBJECAO.includes(modo)
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

  return {
    modo,
    n_objecoes: semObjecao ? [0, 0] : parseN(f.n_objecoes, defaultN(modo)),
    fonte_das_objecoes: isFonte(fonteRaw) ? fonteRaw : defaultFonte(modo),
    // Sem declaração e com objeção a atacar: todos os riscos elegíveis (a
    // intenção não restringiu). Modo sem objeção: nenhum.
    riscos_elegiveis: semObjecao
      ? []
      : riscosDeclarados
        ? riscos.filter((r) => !riscosVetados.includes(r))
        : TIPOS_DE_RISCO.filter((r) => !riscosVetados.includes(r)),
    riscos_vetados: riscosVetados,
    profundidade_minima: isProfundidade(profRaw) ? profRaw : defaultProfundidade(modo),
    aliviadores_admissiveis: aliviadoresAdmissiveis,
    aliviadores_vetados: filtra("aliviadores_vetados", f.aliviadores_vetados, isAliviador),
    veiculos_exigidos: filtra("veiculos_exigidos", f.veiculos_exigidos, isVeiculo),
    trabalhos_fixos: filtra("trabalhos_fixos", f.trabalhos_fixos, isTrabalhoFixo),
    permite_reataque: f.permite_reataque === true || modo === "confirmacao_por_terceiros",
    exige_dominante_da_categoria: f.exige_dominante_da_categoria === true,
    dimensao_alvo: isDimensao(dimRaw) ? dimRaw : null,
    promessa_a_pagar: str(f.promessa_a_pagar) || null,
    proibicoes: arr(f.proibicoes).map(str).filter(Boolean),
    desconhecidos,
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
    `- modo: ${c.modo}`,
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
  ]
  return linhas.filter(Boolean).join("\n")
}
