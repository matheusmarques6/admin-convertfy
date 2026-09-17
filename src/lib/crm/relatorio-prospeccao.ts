/**
 * Relatório da campanha de prospecção, por segmento.
 *
 * A pergunta que ele responde é qual segmento vale o dia: o A converte
 * o dobro do D? O C responde e some? Sem isso a lista inteira é tratada
 * igual e o tempo vai pro balde errado.
 *
 * Puro porque toda taxa aqui pode mentir de duas formas: dividindo por
 * zero (e virando 0%, que se lê como "ninguém respondeu" quando a
 * verdade é "ninguém foi abordado ainda") e contando quem nunca chegou
 * lá (o lead perdido por SILÊNCIO não pode entrar em "respondeu").
 */

import { SEGMENTOS } from "./prospeccao"

/**
 * Degraus da cadência. O número é ordinal: entrar no degrau 5 implica
 * ter passado pelos anteriores, e é isso que torna a contagem
 * cumulativa sem precisar do histórico completo de cada um.
 *
 * Terminais (Nutrir, Perdido) NÃO são degraus: quem foi perdido por
 * silêncio no T3 não "chegou mais longe" que quem está no T3 — contar
 * assim inflaria a taxa de resposta com exatamente quem não respondeu.
 */
export const DEGRAUS: Record<string, number> = {
  "T1 · Abordado": 1,
  "T2 · Follow-up com valor": 2,
  "T3 · Último toque": 3,
  "Respondeu · qualificar": 4,
  "Diagnóstico agendado": 5,
  "Diagnóstico feito": 6,
  "Proposta enviada": 7,
  Ganho: 8,
}

export const DEGRAU_ABORDADO = 1
export const DEGRAU_RESPONDEU = 4
export const DEGRAU_DIAGNOSTICO_AGENDADO = 5
export const DEGRAU_DIAGNOSTICO_FEITO = 6
export const DEGRAU_PROPOSTA = 7

export interface NegocioDoRelatorio {
  id: string
  /** Segmento de entrada (`custom_fields.segmento_parceiro`). */
  segmento: string | null
  /** Maturidade declarada na qualificação. */
  maturidade: string | null
  status: string
  value: number | null
  lost_reason: string | null
  /**
   * Nomes de TODAS as etapas por onde o negócio passou, incluindo a
   * atual. Vem de `crm_deal_history` + a etapa de agora — o mesmo eixo
   * que o dashboard de funil usa.
   */
  etapasVisitadas: string[]
  /** Quando virou ganho, pra série e pro extrato do parceiro. */
  won_at?: string | null
  /** Data do primeiro toque, pra evolução diária. */
  abordado_em?: string | null
}

export interface LinhaDoSegmento {
  segmento: string
  total: number
  abordados: number
  responderam: number
  /** `null` sem abordados: 0% se leria como "ninguém respondeu". */
  taxaDeResposta: number | null
  vendendo: number
  /** Vendendo sobre quem RESPONDEU — sobre o total seria outra conta. */
  percentualVendendo: number | null
  diagnosticosAgendados: number
  diagnosticosFeitos: number
  propostas: number
  ganhos: number
  receita: number
  perdidos: number
}

export interface RelatorioDaCampanha {
  linhas: LinhaDoSegmento[]
  total: LinhaDoSegmento
  /** Perdas agrupadas pelo motivo, ordenadas da maior pra menor. */
  perdidosPorMotivo: Array<{ motivo: string; quantidade: number }>
}

/** Degrau mais alto que o negócio alcançou. 0 = nunca foi abordado. */
export function degrauAlcancado(etapas: string[]): number {
  let maior = 0
  for (const e of etapas) {
    const d = DEGRAUS[e]
    if (d != null && d > maior) maior = d
  }
  return maior
}

function taxa(parte: number, todo: number): number | null {
  // Denominador zero devolve `null`, não 0: a tela mostra "—" e quem lê
  // sabe que não há medição, em vez de ler um zero que parece resultado.
  if (todo <= 0) return null
  return (parte / todo) * 100
}

function linhaVazia(segmento: string): LinhaDoSegmento {
  return {
    segmento,
    total: 0,
    abordados: 0,
    responderam: 0,
    taxaDeResposta: null,
    vendendo: 0,
    percentualVendendo: null,
    diagnosticosAgendados: 0,
    diagnosticosFeitos: 0,
    propostas: 0,
    ganhos: 0,
    receita: 0,
    perdidos: 0,
  }
}

const VENDENDO = "vendendo"

function normalizar(v: string | null): string {
  return (v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export function montarRelatorio(
  negocios: NegocioDoRelatorio[],
): RelatorioDaCampanha {
  // Segmentos na ordem da cadência; um segmento fora da lista ganha
  // linha própria no fim, em vez de ser somado no balde errado.
  const mapa = new Map<string, LinhaDoSegmento>()
  for (const s of SEGMENTOS) mapa.set(s, linhaVazia(s))

  const motivos = new Map<string, number>()

  for (const n of negocios) {
    const chave = n.segmento ?? "Sem segmento"
    if (!mapa.has(chave)) mapa.set(chave, linhaVazia(chave))
    const l = mapa.get(chave)!

    l.total++
    const degrau = degrauAlcancado(n.etapasVisitadas)
    if (degrau >= DEGRAU_ABORDADO) l.abordados++
    if (degrau >= DEGRAU_RESPONDEU) l.responderam++
    if (degrau >= DEGRAU_DIAGNOSTICO_AGENDADO) l.diagnosticosAgendados++
    if (degrau >= DEGRAU_DIAGNOSTICO_FEITO) l.diagnosticosFeitos++
    if (degrau >= DEGRAU_PROPOSTA) l.propostas++

    if (normalizar(n.maturidade) === VENDENDO) l.vendendo++

    if (n.status === "won") {
      l.ganhos++
      l.receita += Number(n.value ?? 0)
    } else if (n.status === "lost") {
      l.perdidos++
      const m = (n.lost_reason ?? "").trim() || "Sem motivo registrado"
      motivos.set(m, (motivos.get(m) ?? 0) + 1)
    }
  }

  const linhas = [...mapa.values()].map((l) => ({
    ...l,
    taxaDeResposta: taxa(l.responderam, l.abordados),
    percentualVendendo: taxa(l.vendendo, l.responderam),
  }))

  const total = linhas.reduce<LinhaDoSegmento>((acc, l) => {
    acc.total += l.total
    acc.abordados += l.abordados
    acc.responderam += l.responderam
    acc.vendendo += l.vendendo
    acc.diagnosticosAgendados += l.diagnosticosAgendados
    acc.diagnosticosFeitos += l.diagnosticosFeitos
    acc.propostas += l.propostas
    acc.ganhos += l.ganhos
    acc.receita += l.receita
    acc.perdidos += l.perdidos
    return acc
  }, linhaVazia("Total"))
  total.taxaDeResposta = taxa(total.responderam, total.abordados)
  total.percentualVendendo = taxa(total.vendendo, total.responderam)

  return {
    linhas,
    total,
    perdidosPorMotivo: [...motivos.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.motivo.localeCompare(b.motivo)),
  }
}

// ── Evolução diária ──────────────────────────────────────────────────

export interface DiaDaCampanha {
  dia: string
  abordados: number
  /** Quanto falta pra meta do dia. Negativo = passou. */
  faltaParaMeta: number
}

export const META_DIARIA = 40

/**
 * Quantos foram abordados por dia. Dia SEM abordagem aparece com zero —
 * buraco na série se lê como "não medimos", e aqui zero é medição: foi
 * um dia em que ninguém foi chamado.
 */
export function evolucaoDiaria(
  datas: Array<string | null | undefined>,
  opts?: { de?: string; ate?: string; meta?: number },
): DiaDaCampanha[] {
  const meta = opts?.meta ?? META_DIARIA
  const porDia = new Map<string, number>()
  for (const d of datas) {
    if (!d) continue
    const dia = d.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
  }
  if (porDia.size === 0) return []

  const chaves = [...porDia.keys()].sort()
  const de = opts?.de ?? chaves[0]
  const ate = opts?.ate ?? chaves[chaves.length - 1]

  const out: DiaDaCampanha[] = []
  const cursor = new Date(`${de}T12:00:00Z`)
  const fim = new Date(`${ate}T12:00:00Z`)
  // Teto de segurança: janela absurda (data suja) não vira laço infinito.
  for (let i = 0; cursor <= fim && i < 400; i++) {
    const dia = cursor.toISOString().slice(0, 10)
    const abordados = porDia.get(dia) ?? 0
    out.push({ dia, abordados, faltaParaMeta: meta - abordados })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

// ── Contagem regressiva ──────────────────────────────────────────────

export interface Marco {
  nome: string
  data: string
  /** Dias inteiros que faltam. Negativo = já passou. */
  diasRestantes: number
}

/** Corte pra fechar e implementar antes da Black Friday. */
export const MARCOS_DA_CAMPANHA: Array<{ nome: string; data: string }> = [
  { nome: "Corte para fechar e implementar", data: "2026-10-23" },
  { nome: "Black Friday", data: "2026-11-27" },
]

export function contagemRegressiva(agora: Date, marcos = MARCOS_DA_CAMPANHA): Marco[] {
  // Dia a dia em UTC: a diferença em milissegundos erraria por um dia
  // toda vez que a hora local passasse da meia-noite.
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())
  return marcos.map((m) => {
    const [a, mes, d] = m.data.split("-").map(Number)
    const alvo = Date.UTC(a, mes - 1, d)
    return {
      ...m,
      diasRestantes: Math.round((alvo - hoje) / 86_400_000),
    }
  })
}

// ── Extrato do parceiro ──────────────────────────────────────────────

export interface ExtratoDoParceiro {
  ganhos: number
  receita: number
  /** `null` sem percentual cadastrado — 0 diria que não há comissão. */
  comissao: number | null
  percentual: number | null
}

export function extratoDoParceiro(
  linhaTotal: LinhaDoSegmento,
  percentual: number | null | undefined,
): ExtratoDoParceiro {
  const pct = percentual == null || !Number.isFinite(percentual) ? null : percentual
  return {
    ganhos: linhaTotal.ganhos,
    receita: linhaTotal.receita,
    percentual: pct,
    comissao: pct == null ? null : (linhaTotal.receita * pct) / 100,
  }
}
