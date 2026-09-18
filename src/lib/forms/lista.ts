/**
 * A lista de formulários: o que cada linha e cada KPI dizem, e quando
 * dizem "—".
 *
 * Duas regras que erram em silêncio se ficarem na tela:
 *
 * 1. **Só o conversacional registra visita por período.** O clássico
 *    tem um contador de vida inteira (`views_count`) e nenhuma sessão.
 *    Somar "0 visitas nos últimos 30 dias" para a Página de vendas — que
 *    tem 467 no total — faria a conversão dela sair 100% ou infinita, e
 *    a média da lista viraria ficção. Visita não medida é `null`, e a
 *    conversão de quem não mede visita também.
 * 2. **Delta sem base é `null`, não 100%.** "+100% vs mês anterior" com
 *    o mês anterior em zero é o alarme que ensina a ignorar o alarme.
 *
 * Puro: sem I/O, sem React.
 */

import type { FormSchema } from "@/types/forms-conversational"
import { telasDaSequencia } from "./telas"

export interface ResumoDoForm {
  form_id: string
  registra_visitas: boolean
  visitas: number
  visitas_anterior: number
  envios: number
  envios_anterior: number
  deals: number
  deals_anterior: number
}

/** O que a rota da lista devolve por formulário, além do cadastro. */
export interface LinhaDaLista {
  id: string
  name: string
  slug: string
  status: "draft" | "published" | "archived"
  display_mode: "classic" | "conversational"
  has_unpublished_changes: boolean
  /** Número da versão no ar; `null` = nunca publicou uma versão. */
  versao: number | null
  telas: { n: number; unidade: "tela" | "campo" }
  pipeline: { id: string; name: string; color: string | null } | null
  stage: { id: string; name: string } | null
  resumo: ResumoDoForm | null
  /** Vida inteira — o que o clássico tem no lugar de visitas por período. */
  views_count: number
  submissions_count: number
}

/** Variação percentual; `null` sem base (senão zero → um vira "+100%"). */
export function deltaPercent(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior <= 0) return null
  return Math.round(((atual - anterior) / anterior) * 100)
}

/** Envios ÷ visitas em %, `null` quando a visita não foi medida. */
export function conversao(envios: number, visitas: number | null): number | null {
  if (visitas === null || visitas <= 0) return null
  return Math.round((envios / visitas) * 1000) / 10
}

/** Visitas da janela, ou `null` quando o formulário não as registra. */
export function visitasMedidas(r: ResumoDoForm | null): number | null {
  if (!r || !r.registra_visitas) return null
  return r.visitas
}

export interface KpisDaLista {
  visitas: number | null
  visitasDelta: number | null
  /** Quantos formulários entram na conta de visitas (os que medem). */
  formsComVisita: number
  envios: number
  enviosDelta: number | null
  /** Média = soma dos envios ÷ soma das visitas de quem mede. */
  conversao: number | null
  deals: number
  dealsDelta: number | null
  /** Publicados sem pipeline: os envios viram lead solto. */
  semPipeline: number
}

export function kpisDaLista(linhas: readonly LinhaDaLista[]): KpisDaLista {
  let visitas = 0
  let visitasAnt = 0
  let formsComVisita = 0
  let envios = 0
  let enviosAnt = 0
  let enviosDeQuemMede = 0
  let deals = 0
  let dealsAnt = 0
  for (const l of linhas) {
    const r = l.resumo
    if (!r) continue
    envios += r.envios
    enviosAnt += r.envios_anterior
    deals += r.deals
    dealsAnt += r.deals_anterior
    if (r.registra_visitas) {
      formsComVisita += 1
      visitas += r.visitas
      visitasAnt += r.visitas_anterior
      enviosDeQuemMede += r.envios
    }
  }
  const semPipeline = linhas.filter((l) => l.status === "published" && !l.pipeline).length
  return {
    visitas: formsComVisita > 0 ? visitas : null,
    visitasDelta: formsComVisita > 0 ? deltaPercent(visitas, visitasAnt) : null,
    formsComVisita,
    envios,
    enviosDelta: deltaPercent(envios, enviosAnt),
    // A média cruza envios COM visitas do mesmo conjunto — misturar os
    // envios do clássico com as visitas do conversacional daria uma
    // taxa que não é de formulário nenhum.
    conversao: formsComVisita > 0 ? conversao(enviosDeQuemMede, visitas) : null,
    deals,
    dealsDelta: deltaPercent(deals, dealsAnt),
    semPipeline,
  }
}

export type TomDeStatus = "pos" | "warn" | "neut"

/** A pill de status, nas três formas do handoff. */
export function statusDaLinha(l: Pick<LinhaDaLista, "status" | "has_unpublished_changes">): {
  label: string
  tom: TomDeStatus
} {
  if (l.status === "published") {
    return l.has_unpublished_changes
      ? { label: "No ar · rascunho pendente", tom: "warn" }
      : { label: "No ar", tom: "pos" }
  }
  if (l.status === "archived") return { label: "Arquivado", tom: "neut" }
  return { label: "Rascunho", tom: "neut" }
}

/**
 * Quantas TELAS o visitante percorre.
 *
 * No conversacional, perguntas agrupadas contam uma vez (é a leitura da
 * engine, `telasDaSequencia`) e a tela de conteúdo conta. No clássico é
 * uma página só — mas "1 tela" para um formulário de 6 campos esconde o
 * tamanho; ali contamos CAMPOS e a tela rotula como tal.
 */
export function contagemDeTelas(
  schema: FormSchema | null,
  camposNaTabela: number,
  displayMode: "classic" | "conversational",
): { n: number; unidade: "tela" | "campo" } {
  if (displayMode === "classic") return { n: camposNaTabela, unidade: "campo" }
  if (!schema) return { n: camposNaTabela, unidade: "tela" }
  const visiveis = schema.blocks.filter((b) => !b.hidden)
  const telas = new Set(Object.values(telasDaSequencia(visiveis)).map((t) => t.numero))
  return { n: telas.size, unidade: "tela" }
}

export type FiltroDaLista = "todos" | "ar" | "rascunhos"

export function filtrarLista(
  linhas: readonly LinhaDaLista[],
  busca: string,
  filtro: FiltroDaLista,
): LinhaDaLista[] {
  const q = busca.trim().toLowerCase()
  return linhas.filter((l) => {
    if (l.status === "archived") return false
    if (filtro === "ar" && l.status !== "published") return false
    if (filtro === "rascunhos" && l.status === "published") return false
    if (!q) return true
    return l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q)
  })
}
