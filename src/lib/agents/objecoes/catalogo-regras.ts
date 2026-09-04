/**
 * Regras do catálogo de objeções (módulo PURO, testado).
 *
 * O Catalogador (LLM) propõe; este módulo confere o que é CHECÁVEL por
 * código — regras 1, 3, 6, 7, 10 da spec §2.1 — e devolve erros legíveis
 * para o retry (o erro volta ao modelo, padrão do Estruturador). O que não
 * dá para checar em código (a frase está na voz da pessoa? o tratamento é
 * mecanismo ou adjetivo?) fica com o prompt.
 *
 * Também aqui: a PROJEÇÃO do catálogo em `icp_objections` (a UI, o n8n e o
 * PATCH continuam lendo [{objection, treatment}]), a importação do legado
 * (vira catálogo sem tipagem, para servir de baseline) e a marcação de
 * `verificado` por edição humana.
 */

import {
  ALIVIADOR_SERVE_A,
  CONFIANCAS,
  MOTIVOS_DESCARTE,
  VEICULOS,
  aliviadorServe,
  isAliviador,
  isDimensao,
  isFlowElegivel,
  isTipoDeRisco,
  type Aliviador,
  type CatalogoDeObjecoes,
  type Confianca,
  type Incentivo,
  type MedoDeCategoria,
  type MotivoDescarte,
  type ObjecaoCatalogada,
  type TipoDeRisco,
  type Veiculo,
  type VeiculoDeArgumento,
} from "./vocabulario"

export const MIN_OBJECOES = 4
export const MAX_OBJECOES = 8

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
const strOrNull = (v: unknown): string | null => str(v) || null
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt)
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function veiculoVazio(): VeiculoDeArgumento {
  return { texto: null, aplicavel: true, campo_de_origem: null, verificado: false, alerta: null }
}

function normalizarVeiculo(v: unknown): VeiculoDeArgumento {
  const r = rec(v)
  return {
    texto: strOrNull(r.texto),
    aplicavel: bool(r.aplicavel, true),
    campo_de_origem: strOrNull(r.campo_de_origem),
    // Regra 7: `verificado` nasce false — ninguém revisou.
    verificado: false,
    alerta: strOrNull(r.alerta),
  }
}

function normalizarObjecao(v: unknown, i: number): ObjecaoCatalogada {
  const r = rec(v)
  const lastro = rec(r.lastro_operacional)
  const evidencia = strOrNull(r.evidencia)
  const confiancaCrua = str(r.confianca)
  const confianca: Confianca = (CONFIANCAS as readonly string[]).includes(confiancaCrua)
    ? (confiancaCrua as Confianca)
    : "baixa"
  const sevRaw = typeof r.severidade === "number" ? r.severidade : parseInt(str(r.severidade), 10)
  const severidade = Number.isFinite(sevRaw) ? Math.min(5, Math.max(1, Math.round(sevRaw))) : 3
  return {
    // Id atribuído por código: o modelo pode repetir ou pular; o Seletor e
    // `ja_atacadas` dependem de ids únicos e estáveis dentro do catálogo.
    id: `obj_${i + 1}`,
    objecao: str(r.objecao),
    tipo_de_risco: isTipoDeRisco(r.tipo_de_risco) ? r.tipo_de_risco : null,
    dimensao_confianca: isDimensao(r.dimensao_confianca) ? r.dimensao_confianca : null,
    aliviador: isAliviador(r.aliviador) ? r.aliviador : null,
    tratamento: str(r.tratamento),
    dominante_da_categoria: bool(r.dominante_da_categoria, false),
    flows_elegiveis: arr(r.flows_elegiveis).filter(isFlowElegivel),
    lastro_operacional: {
      afirmacao: str(lastro.afirmacao),
      campo_de_origem: strOrNull(lastro.campo_de_origem),
      verificado: false,
    },
    severidade,
    evidencia,
    // Regra 9: sem trecho literal, confiança é "baixa".
    confianca: evidencia ? confianca : "baixa",
  }
}

/**
 * FORMA do catálogo (nunca lança): tudo que o modelo não mandou vira
 * ausência declarada. A validação de conteúdo é `validarCatalogo`.
 */
export function normalizarCatalogo(parsed: unknown): CatalogoDeObjecoes {
  const o = rec(parsed)
  const veiculosRaw = rec(o.veiculos_de_argumento)
  const veiculos = Object.fromEntries(
    VEICULOS.map((v) => [v, v in veiculosRaw ? normalizarVeiculo(veiculosRaw[v]) : veiculoVazio()]),
  ) as Record<Veiculo, VeiculoDeArgumento>
  const conc = rec(o.concorrente_nomeavel)
  const inc = rec(o.incentivo)
  const cob = rec(o.cobertura)
  return {
    objecoes: arr(o.objecoes)
      .map((x, i) => normalizarObjecao(x, i))
      .filter((x) => x.objecao.length > 0),
    veiculos_de_argumento: veiculos,
    medos_de_categoria: arr(o.medos_de_categoria)
      .map((m): MedoDeCategoria => {
        const r = rec(m)
        return {
          medo: str(r.medo),
          marca_esta_fora_porque: strOrNull(r.marca_esta_fora_porque),
          verificado: false,
          alerta: strOrNull(r.alerta),
        }
      })
      .filter((m) => m.medo.length > 0),
    concorrente_nomeavel: {
      existe: bool(conc.existe, false),
      nome: strOrNull(conc.nome),
      eixo_de_diferenca: strOrNull(conc.eixo_de_diferenca),
      observacao: strOrNull(conc.observacao),
    },
    incentivo: {
      existe: typeof inc.existe === "boolean" ? inc.existe : null,
      valor: strOrNull(inc.valor),
      codigo: strOrNull(inc.codigo),
      condicoes: strOrNull(inc.condicoes),
      prazo: strOrNull(inc.prazo),
      campo_de_origem: strOrNull(inc.campo_de_origem),
      alerta: strOrNull(inc.alerta),
    },
    cobertura: {
      tipos_cobertos: arr(cob.tipos_cobertos).filter(isTipoDeRisco),
      lacunas: arr(cob.lacunas).map(str).filter(Boolean),
    },
    descartadas: arr(o.descartadas)
      .map((d) => {
        const r = rec(d)
        const motivo = str(r.motivo)
        return {
          texto: str(r.texto),
          motivo: ((MOTIVOS_DESCARTE as readonly string[]).includes(motivo)
            ? motivo
            : "dor") as MotivoDescarte,
        }
      })
      .filter((d) => d.texto.length > 0),
  }
}

/**
 * Erros de CONTEÚDO checáveis por código. Lista vazia = aprovado. Cada
 * linha é escrita para o modelo ler no retry.
 */
export function validarCatalogo(c: CatalogoDeObjecoes): string[] {
  const erros: string[] = []
  const n = c.objecoes.length
  if (n < MIN_OBJECOES || n > MAX_OBJECOES) {
    erros.push(
      `objecoes: ${n} item(ns) — a regra pede entre ${MIN_OBJECOES} e ${MAX_OBJECOES}${n > MAX_OBJECOES ? " (funda as parecidas)" : " (não force; se a loja só sustenta menos, diga em cobertura.lacunas — mas 4 é o mínimo)"}`,
    )
  }

  const pares = new Map<string, string[]>()
  let dominantes = 0
  for (const o of c.objecoes) {
    if (!o.tipo_de_risco) erros.push(`${o.id}: tipo_de_risco ausente ou fora do vocabulário`)
    if (!o.aliviador) erros.push(`${o.id}: aliviador ausente ou fora do vocabulário`)
    if (!o.dimensao_confianca) erros.push(`${o.id}: dimensao_confianca ausente ou fora do vocabulário`)
    if (!o.tratamento) erros.push(`${o.id}: tratamento vazio`)
    if (o.flows_elegiveis.length === 0) erros.push(`${o.id}: flows_elegiveis vazio — declare em que momento do ciclo a objeção existe`)
    if (!o.lastro_operacional.afirmacao) erros.push(`${o.id}: lastro_operacional.afirmacao vazio — toda alegação é promessa operacional`)
    if (o.tipo_de_risco && o.aliviador && !aliviadorServe(o.aliviador, o.tipo_de_risco)) {
      erros.push(
        `${o.id}: aliviador "${o.aliviador}" não serve ao risco "${o.tipo_de_risco}" (serve a: ${ALIVIADOR_SERVE_A[o.aliviador].join(", ")})`,
      )
    }
    if (o.tipo_de_risco && o.aliviador) {
      const k = `${o.tipo_de_risco}|${o.aliviador}`
      pares.set(k, [...(pares.get(k) ?? []), o.id])
    }
    if (o.dominante_da_categoria) dominantes++
  }
  for (const [k, ids] of pares) {
    if (ids.length > 1) {
      erros.push(`${ids.join(" e ")}: mesmo tipo_de_risco E mesmo aliviador (${k.replace("|", " + ")}) — funda em uma`)
    }
  }
  if (dominantes > 1) erros.push(`dominante_da_categoria: ${dominantes} marcadas — no máximo UMA`)

  if (c.incentivo.existe === true && !c.incentivo.codigo && !c.incentivo.valor) {
    erros.push("incentivo.existe=true sem codigo nem valor — só registre o que aparece literalmente no contexto")
  }
  return erros
}

/** Projeção para `client_stores.icp_objections` — o formato que a UI, o n8n e o PATCH já leem. */
export function projetarObjecoes(c: CatalogoDeObjecoes): Array<{ objection: string; treatment: string }> {
  return c.objecoes.map((o) => ({ objection: o.objecao, treatment: o.tratamento }))
}

/**
 * Objeções legadas ([{objection, treatment}]) como catálogo SEM tipagem —
 * baseline para comparar com a v2, e insumo do Catalogador ("material
 * anterior"). Nada é inferido: risco, aliviador e dimensão ficam null.
 */
export function importarLegado(
  objs: ReadonlyArray<{ objection?: string | null; treatment?: string | null }> | null | undefined,
): CatalogoDeObjecoes {
  const base = normalizarCatalogo({})
  base.objecoes = (objs ?? [])
    .map((o, i): ObjecaoCatalogada => ({
      id: `obj_${i + 1}`,
      objecao: str(o?.objection),
      tipo_de_risco: null,
      dimensao_confianca: null,
      aliviador: null,
      tratamento: str(o?.treatment),
      dominante_da_categoria: false,
      flows_elegiveis: [],
      lastro_operacional: { afirmacao: "", campo_de_origem: "legado", verificado: false },
      severidade: 3,
      evidencia: null,
      confianca: "baixa",
    }))
    .filter((o) => o.objecao.length > 0)
  return base
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/**
 * Edição humana da projeção = a única revisão que existe hoje. A objeção
 * do catálogo cujo texto casa (normalizado) com a editada ganha
 * `verificado: true`; o tratamento editado sobrescreve o do catálogo.
 * Devolve um NOVO catálogo e quantas objeções foram tocadas.
 */
export function marcarVerificadoPorEdicao(
  c: CatalogoDeObjecoes,
  editadas: ReadonlyArray<{ objection: string; treatment: string }>,
): { catalogo: CatalogoDeObjecoes; tocadas: number } {
  const porTexto = new Map(editadas.map((e) => [norm(e.objection), e]))
  let tocadas = 0
  const objecoes = c.objecoes.map((o) => {
    const e = porTexto.get(norm(o.objecao))
    if (!e) return o
    tocadas++
    return {
      ...o,
      tratamento: e.treatment.trim() || o.tratamento,
      lastro_operacional: { ...o.lastro_operacional, verificado: true },
    }
  })
  return { catalogo: { ...c, objecoes }, tocadas }
}

/** Objeções do catálogo elegíveis num flow (regra 2 do Seletor, metade "flow"). */
export function objecoesElegiveisNoFlow(c: CatalogoDeObjecoes, flowType: string): ObjecaoCatalogada[] {
  return c.objecoes.filter((o) => (o.flows_elegiveis as readonly string[]).includes(flowType))
}

export type { TipoDeRisco, Aliviador, Incentivo }
