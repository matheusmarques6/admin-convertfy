/**
 * Regras do Seletor (módulo PURO, testado).
 *
 * O LLM escolhe; o código confere o que é CHECÁVEL contra o catálogo, o
 * contrato do toque e o que os irmãos já atacaram — as regras 1–7 da spec
 * §3.1. Reprovou → o erro volta ao modelo (retry); 2ª reprovação → alvo
 * sintético com `lacuna` (nunca alvo inventado).
 *
 * Normalização: o modo é o do CONTRATO (nunca o do modelo); objeção,
 * tratamento, risco e aliviador saem LITERAIS do catálogo pelo `id` (o
 * modelo tende a parafrasear); veículo `aplicavel:false` sai em silêncio e
 * veículo exigido que o modelo esqueceu entra por código com
 * `insumo_disponivel` derivado do catálogo; proibições do contrato são
 * sempre repetidas.
 */

import { aliviadorAdmissivel, type IntentContract } from "./intent-contract"
import { objecoesElegiveisNoFlow } from "./catalogo-regras"
import {
  MODOS_SEM_OBJECAO,
  isDimensao,
  isProfundidade,
  isTrabalhoFixo,
  isVeiculo,
  profundidadeIndex,
  type AlvoDoEmail,
  type AlvoObjecao,
  type AnguloDoTratamento,
  type CatalogoDeObjecoes,
  type JaAtacada,
  type ObjecaoCatalogada,
  type Profundidade,
} from "./vocabulario"

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export interface NormalizacaoAlvo {
  alvo: AlvoDoEmail
  /** Ids que o modelo citou e não existem no catálogo, veículos descartados… */
  avisos: string[]
}

export function normalizarAlvo(
  parsed: unknown,
  contrato: IntentContract,
  catalogo: CatalogoDeObjecoes,
  jaAtacadas: readonly JaAtacada[],
): NormalizacaoAlvo {
  const o = rec(parsed)
  const avisos: string[] = []
  const porId = new Map(catalogo.objecoes.map((x) => [x.id, x]))
  if (o.modo && o.modo !== contrato.modo) avisos.push(`modo devolvido "${str(o.modo)}" ignorado — o modo é do contrato (${contrato.modo})`)

  const alvos: AlvoObjecao[] = []
  for (const a of arr(o.alvos)) {
    const r = rec(a)
    const id = str(r.id)
    const obj = porId.get(id)
    if (!obj) {
      if (id) avisos.push(`alvo com id desconhecido no catálogo: ${id}`)
      continue
    }
    const prof = isProfundidade(r.profundidade_de_prova) ? r.profundidade_de_prova : contrato.profundidade_minima
    alvos.push({
      ordem: alvos.length + 1,
      primaria: r.primaria === true,
      id: obj.id,
      objecao: obj.objecao,
      tipo_de_risco: obj.tipo_de_risco,
      tratamento: obj.tratamento,
      aliviador_pedido: obj.aliviador,
      profundidade_de_prova: prof,
    })
  }
  if (alvos.length > 0 && !alvos.some((a) => a.primaria)) alvos[0].primaria = true

  // Veículos: só os válidos; aplicavel:false sai em silêncio; exigido
  // esquecido entra por código com o insumo que o catálogo tem.
  const angulos: AnguloDoTratamento[] = []
  for (const g of arr(o.angulo_do_tratamento)) {
    const r = rec(g)
    if (!isVeiculo(r.veiculo)) continue
    const v = catalogo.veiculos_de_argumento[r.veiculo]
    if (v && !v.aplicavel) continue
    const insumo = r.insumo_disponivel === "parcial" ? "parcial" : r.insumo_disponivel === true
    angulos.push({ ordem: angulos.length + 1, veiculo: r.veiculo, papel: str(r.papel), insumo_disponivel: insumo })
  }
  for (const v of contrato.veiculos_exigidos) {
    const cat = catalogo.veiculos_de_argumento[v]
    if (cat && !cat.aplicavel) continue
    if (angulos.some((g) => g.veiculo === v)) continue
    angulos.push({
      ordem: angulos.length + 1,
      veiculo: v,
      papel: "(exigido pela intenção — o Seletor não o declarou)",
      insumo_disponivel: Boolean(cat?.texto),
    })
    avisos.push(`veículo exigido ausente no output, completado por código: ${v}`)
  }

  const proibidas = new Set<string>(contrato.proibicoes)
  for (const p of arr(o.proibido_neste_toque).map(str).filter(Boolean)) proibidas.add(p)
  const trabalhos = new Set(contrato.trabalhos_fixos)
  for (const t of arr(o.trabalhos_fixos)) if (isTrabalhoFixo(t)) trabalhos.add(t)

  const lac = rec(o.lacuna)
  const lacuna = str(lac.motivo) ? { motivo: str(lac.motivo), detalhe: str(lac.detalhe) || null } : null

  return {
    alvo: {
      modo: contrato.modo,
      trabalhos_fixos: Array.from(trabalhos),
      alvos,
      medos_alvo: arr(o.medos_alvo).map(str).filter(Boolean),
      promessa_a_pagar: str(o.promessa_a_pagar) || contrato.promessa_a_pagar || null,
      criterio_de_selecao: str(o.criterio_de_selecao),
      dimensao_confianca: isDimensao(o.dimensao_confianca) ? o.dimensao_confianca : contrato.dimensao_alvo,
      angulo_do_tratamento: angulos,
      suspeita_a_antecipar: str(o.suspeita_a_antecipar) || null,
      ja_atacadas: [...jaAtacadas],
      proibido_neste_toque: Array.from(proibidas),
      alerta_de_lastro: str(o.alerta_de_lastro) || null,
      razao: str(o.razao),
      lacuna,
    },
    avisos,
  }
}

/** Objeções que passam nos filtros checáveis por código (para telemetria e lacuna). */
export function candidatasElegiveis(
  catalogo: CatalogoDeObjecoes,
  contrato: IntentContract,
  flowType: string,
  jaAtacadas: readonly JaAtacada[],
): ObjecaoCatalogada[] {
  const atacadas = new Set(jaAtacadas.map((j) => j.id))
  return objecoesElegiveisNoFlow(catalogo, flowType).filter((o) => {
    if (contrato.fonte_das_objecoes === "ja_atacadas") return atacadas.has(o.id)
    if (!o.tipo_de_risco || !contrato.riscos_elegiveis.includes(o.tipo_de_risco)) return false
    if (o.aliviador && !aliviadorAdmissivel(contrato, o.aliviador)) return false
    if (atacadas.has(o.id) && !contrato.permite_reataque) return false
    return true
  })
}

function maxProfundidadeAtacada(id: string, jaAtacadas: readonly JaAtacada[]): number {
  return jaAtacadas.filter((j) => j.id === id).reduce((m, j) => Math.max(m, profundidadeIndex(j.profundidade)), -1)
}

/** Erros checáveis. Lista vazia = aprovado. Cada linha volta ao modelo no retry. */
export function validarAlvo(
  alvo: AlvoDoEmail,
  contrato: IntentContract,
  catalogo: CatalogoDeObjecoes,
  jaAtacadas: readonly JaAtacada[],
  flowType: string,
): string[] {
  const erros: string[] = []
  const porId = new Map(catalogo.objecoes.map((x) => [x.id, x]))
  const semObjecao = MODOS_SEM_OBJECAO.includes(contrato.modo)

  if (semObjecao) {
    if (alvo.alvos.length > 0) erros.push(`modo ${contrato.modo} não ataca objeção — alvos deve ser []`)
    if (contrato.modo === "manutencao_de_confianca" && !alvo.promessa_a_pagar) erros.push("manutencao_de_confianca exige promessa_a_pagar")
    return erros
  }

  const [min, max] = contrato.n_objecoes
  if (alvo.alvos.length === 0 && !alvo.lacuna && contrato.modo !== "varredura_de_canal") {
    erros.push("nenhum alvo e nenhuma lacuna declarada — se nada sobrevive, devolva `lacuna` com motivo")
  }
  if (alvo.alvos.length > 0 && (alvo.alvos.length < min || alvo.alvos.length > max)) {
    erros.push(`n_objecoes: ${alvo.alvos.length} alvo(s) — o contrato pede entre ${min} e ${max}`)
  }
  if (alvo.alvos.filter((a) => a.primaria).length > 1) erros.push("mais de um alvo marcado como primaria — só um")

  if (contrato.modo === "varredura_de_canal") {
    if (alvo.medos_alvo.length === 0 && !alvo.lacuna) {
      erros.push("varredura_de_canal: o alvo são os medos_de_categoria — preencha medos_alvo (ou declare lacuna)")
    }
    const medosComLastro = new Set(catalogo.medos_de_categoria.filter((m) => m.marca_esta_fora_porque).map((m) => m.medo))
    for (const m of alvo.medos_alvo) {
      if (!medosComLastro.has(m)) erros.push(`medo "${m}" não está no catálogo com lastro (marca_esta_fora_porque)`)
    }
  }

  const riscos = new Map<string, string[]>()
  for (const a of alvo.alvos) {
    const obj = porId.get(a.id)
    if (!obj) continue
    if (!(obj.flows_elegiveis as readonly string[]).includes(flowType)) erros.push(`${a.id}: não é elegível no flow ${flowType} (flows_elegiveis: ${obj.flows_elegiveis.join(", ") || "vazio"})`)
    if (!obj.tipo_de_risco || !contrato.riscos_elegiveis.includes(obj.tipo_de_risco)) {
      erros.push(`${a.id}: tipo_de_risco "${obj.tipo_de_risco ?? "?"}" fora de riscos_elegiveis (${contrato.riscos_elegiveis.join(", ")})`)
    }
    if (obj.aliviador && !aliviadorAdmissivel(contrato, obj.aliviador)) erros.push(`${a.id}: aliviador "${obj.aliviador}" não é admissível neste toque`)
    if (profundidadeIndex(a.profundidade_de_prova) < profundidadeIndex(contrato.profundidade_minima)) {
      erros.push(`${a.id}: profundidade "${a.profundidade_de_prova}" abaixo do piso "${contrato.profundidade_minima}"`)
    }
    if (obj.tipo_de_risco) riscos.set(obj.tipo_de_risco, [...(riscos.get(obj.tipo_de_risco) ?? []), a.id])

    const jaMax = maxProfundidadeAtacada(a.id, jaAtacadas)
    const jaAtacada = jaMax >= 0
    if (contrato.modo === "confirmacao_por_terceiros") {
      if (!jaAtacada) erros.push(`${a.id}: confirmacao_por_terceiros só confirma objeção JÁ atacada — esta não está em <ja_atacadas>`)
      if (profundidadeIndex(a.profundidade_de_prova) < profundidadeIndex("prova_de_terceiro")) erros.push(`${a.id}: em confirmacao_por_terceiros a profundidade sobe para prova_de_terceiro`)
    } else if (jaAtacada) {
      if (!contrato.permite_reataque) erros.push(`${a.id}: já atacada neste flow e o contrato não permite reataque — escolha outra`)
      else if (profundidadeIndex(a.profundidade_de_prova) <= jaMax) {
        erros.push(`${a.id}: reataque só com profundidade acima de "${(["afirmacao", "mecanismo", "prova_de_terceiro", "garantia"] as Profundidade[])[jaMax]}"`)
      }
    } else if (contrato.fonte_das_objecoes === "ja_atacadas") {
      erros.push(`${a.id}: a fonte deste toque é ja_atacadas — objeção nova não entra`)
    }

    if (a.profundidade_de_prova === "garantia" && !obj.lastro_operacional.verificado && !alvo.alerta_de_lastro) {
      erros.push(`${a.id}: promessa dura (garantia) com lastro NÃO verificado — rebaixe a profundidade ou preencha alerta_de_lastro`)
    }
  }
  if (contrato.modo === "varredura_de_objecoes") {
    for (const [risco, ids] of riscos) {
      if (ids.length > 1) erros.push(`varredura pede naturezas diferentes: ${ids.join(" e ")} têm o mesmo risco (${risco})`)
    }
  }
  if (contrato.exige_dominante_da_categoria && alvo.alvos.length > 0) {
    const dominante = objecoesElegiveisNoFlow(catalogo, flowType).find((o) => o.dominante_da_categoria)
    const primaria = alvo.alvos.find((a) => a.primaria)
    if (dominante && primaria && primaria.id !== dominante.id) {
      erros.push(`o contrato exige a dominante da categoria (${dominante.id}) como primária — veio ${primaria.id}`)
    }
  }
  return erros
}

/** `ja_atacadas` deste email a partir dos alvos vigentes dos irmãos com número menor. */
export function jaAtacadasDe(
  anteriores: ReadonlyArray<{ email_number: number; target: AlvoDoEmail }>,
): JaAtacada[] {
  const out: JaAtacada[] = []
  for (const t of [...anteriores].sort((a, b) => a.email_number - b.email_number)) {
    for (const a of t.target.alvos ?? []) {
      out.push({ id: a.id, email_number: t.email_number, profundidade: a.profundidade_de_prova, via: a.primaria ? "primaria" : "varredura" })
    }
  }
  return out
}

/** Alvo gravado quando o Seletor falha ou não há contrato — lacuna declarada, nunca alvo inventado. */
export function alvoSintetico(
  contrato: IntentContract | null,
  motivo: string,
  detalhe: string | null,
  jaAtacadas: readonly JaAtacada[] = [],
): AlvoDoEmail {
  return {
    modo: contrato?.modo ?? "quebra_de_objecao",
    trabalhos_fixos: contrato?.trabalhos_fixos ?? [],
    alvos: [],
    medos_alvo: [],
    promessa_a_pagar: contrato?.promessa_a_pagar ?? null,
    criterio_de_selecao: "",
    dimensao_confianca: contrato?.dimensao_alvo ?? null,
    angulo_do_tratamento: [],
    suspeita_a_antecipar: null,
    ja_atacadas: [...jaAtacadas],
    proibido_neste_toque: contrato?.proibicoes ?? [],
    alerta_de_lastro: null,
    razao: "",
    lacuna: { motivo, detalhe },
  }
}
