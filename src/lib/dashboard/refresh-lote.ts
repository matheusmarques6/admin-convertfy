/**
 * A régua do "Sincronizar agora" do dashboard.
 *
 * Três coisas que erravam em silêncio e agora moram aqui, testadas:
 *
 * 1. **Todo período tem janela de datas.** A rota derivava só um número
 *    de dias e, para período personalizado, RECUSAVA a loja inteira com
 *    "Omnisend não suporta range retroativo (janela é relativa a hoje)".
 *    A afirmação é falsa: `syncOmnisendForStore` aceita `startDate`/
 *    `endDate` desde sempre e o builder de campanhas já os passa. Com as
 *    54 lojas da org em Omnisend, essa linha recusava 100% da carteira —
 *    o dashboard dizia "1 de 54 lojas com receita" e o erro gravado no
 *    banco era exatamente essa frase. É o mesmo padrão do comentário
 *    "Omnisend não expõe currency via API": uma afirmação errada que
 *    virou lei porque ninguém foi conferir.
 * 2. **"Hoje" tem fuso.** A checagem usava `new Date().toISOString()`,
 *    que é o dia em UTC: às 21h de Brasília já é o dia seguinte lá, e o
 *    período de HOJE passava a ser tratado como retroativo. Quem escolhe
 *    o dia na tela escolhe no fuso dele.
 * 3. **Uma passada não cobre a carteira.** Cada loja é um sync completo
 *    da plataforma (listagem, enriquecimento por campanha, contatos,
 *    segmentos, três chamadas de analytics). Em série, com pausa entre
 *    lojas, 54 delas não cabem no teto da função — o loop parava na
 *    primeira e as outras 53 nunca chegavam a ser tentadas. O lote agora
 *    é priorizado (quem não tem dado vai antes) e a resposta diz o que
 *    ficou faltando, para a próxima passada continuar de onde parou.
 *
 * Puro: sem I/O, sem Supabase, sem fetch.
 */

import { parseCustomPeriodLabel } from "@/lib/shared/data-status"

/** Dias de cada rótulo fixo. `custom:` vem das próprias datas. */
const DIAS_POR_PERIODO: Record<string, number> = {
  today: 1,
  yesterday: 1,
  "1d": 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "12m": 365,
}

export interface JanelaDoPeriodo {
  /** Primeiro dia, inclusivo (`YYYY-MM-DD`). */
  inicio: string
  /** Último dia, inclusivo (`YYYY-MM-DD`). */
  fim: string
  /** Dias inclusivos — o que os caminhos legados ainda pedem. */
  dias: number
  /** O período termina hoje (ou depois)? Janela ainda em movimento. */
  emAndamento: boolean
}

/** Hoje em `YYYY-MM-DD` no fuso informado (não em UTC). */
export function hojeNoFuso(fuso = "America/Sao_Paulo", agora = new Date()): string {
  const formatar = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora)
  try {
    return formatar(fuso)
  } catch {
    return formatar("America/Sao_Paulo")
  }
}

function somarDias(dia: string, n: number): string {
  const base = Date.parse(`${dia}T00:00:00Z`)
  return new Date(base + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * A janela de datas de um `period_label`, seja ele fixo ou personalizado.
 *
 * Rótulo fixo é "os últimos N dias, terminando hoje" — a mesma definição
 * que as telas usam. Rótulo desconhecido cai em 30 dias, como o resto do
 * código já fazia; recusar aqui deixaria o dashboard sem número nenhum
 * por causa de um rótulo novo.
 */
export function janelaDoPeriodo(
  periodLabel: string,
  hoje = hojeNoFuso(),
): JanelaDoPeriodo {
  const custom = parseCustomPeriodLabel(periodLabel)
  if (custom) {
    const dias = Math.max(
      1,
      Math.round(
        (Date.parse(`${custom.endDate}T00:00:00Z`) -
          Date.parse(`${custom.startDate}T00:00:00Z`)) /
          86_400_000,
      ) + 1,
    )
    return {
      inicio: custom.startDate,
      fim: custom.endDate,
      dias,
      emAndamento: custom.endDate >= hoje,
    }
  }
  const dias = DIAS_POR_PERIODO[periodLabel] ?? 30
  return {
    inicio: somarDias(hoje, -(dias - 1)),
    fim: hoje,
    dias,
    emAndamento: true,
  }
}

export interface LojaDoLote {
  id: string
  /** Já existe dado desta loja para este período? */
  temDado?: boolean
  /** O último sync desta loja falhou? */
  falhou?: boolean
  /** Quando esta loja foi sincronizada pela última vez neste período. */
  sincronizadaEm?: string | null
}

/**
 * Dado sincronizado há menos disto não é re-buscado na mesma sessão.
 *
 * A plataforma limita requisições POR CONTA (10/min, 55/dia nas analytics),
 * e cada loja é um sync completo. Re-tentar quem acabou de sincronizar não
 * traz número novo e queima a cota — foi o que fez o contador de erro subir
 * a cada clique (2 → 3 → 5 lojas "com erro"), porque a segunda rodada
 * atropelava a primeira e voltava sem receita.
 */
export const FRESCOR_MS = 10 * 60 * 1000

export interface PlanoDeLote<T extends LojaDoLote> {
  /** As lojas desta passada, na ordem em que devem ser processadas. */
  lote: T[]
  /** Quantas ficaram para a próxima passada. */
  restantes: number
  /** Quantas foram puladas por já terem dado fresco deste período. */
  jaFrescas: number
  /** Quantas serão processadas ao mesmo tempo. */
  concorrencia: number
}

/** Teto de lojas simultâneas. As chaves são por loja, então o limite de
 *  requisições da plataforma é por conta e não impede o paralelismo; o
 *  teto existe para não estourar memória nem soquetes da função. */
export const CONCORRENCIA_PADRAO = 5

/**
 * Quem entra nesta passada e em que ordem.
 *
 * **Sem dado vem primeiro**: o dashboard soma o que existe, então uma
 * loja sem linha nenhuma é um buraco no total, enquanto uma com dado de
 * ontem é só uma imprecisão. Entre as que têm dado, quem falhou vem antes
 * — é a que tem mais chance de estar errada por um motivo já corrigido.
 * A ordem dentro de cada grupo é preservada (estável), para duas passadas
 * seguidas não embaralharem a fila.
 */
export function planoDeLote<T extends LojaDoLote>(
  lojas: T[],
  tamanhoDoLote: number,
  concorrencia = CONCORRENCIA_PADRAO,
  agora = Date.now(),
): PlanoDeLote<T> {
  // Quem tem dado FRESCO deste período sai da fila: buscar de novo não traz
  // número diferente e gasta a cota da plataforma, que é por conta. Loja com
  // erro entra mesmo fresca — é justamente ela que pode ter sido vítima do
  // limite na rodada anterior.
  const fresca = (l: T): boolean => {
    if (!l.temDado || l.falhou) return false
    const t = l.sincronizadaEm ? Date.parse(l.sincronizadaEm) : NaN
    return Number.isFinite(t) && agora - t < FRESCOR_MS
  }
  const pendentes = lojas.filter((l) => !fresca(l))
  const jaFrescas = lojas.length - pendentes.length

  const peso = (l: T): number => (!l.temDado ? 0 : l.falhou ? 1 : 2)
  const ordenadas = pendentes
    .map((loja, i) => ({ loja, i }))
    .sort((a, b) => peso(a.loja) - peso(b.loja) || a.i - b.i)
    .map((x) => x.loja)
  const teto = Math.max(1, tamanhoDoLote)
  return {
    lote: ordenadas.slice(0, teto),
    restantes: Math.max(0, ordenadas.length - teto),
    jaFrescas,
    concorrencia: Math.max(1, Math.min(concorrencia, teto)),
  }
}

/**
 * Roda `fn` sobre os itens com no máximo `limite` em voo.
 *
 * Cada worker puxa o próximo índice livre, então uma loja lenta não
 * segura as outras — com `Promise.all` em blocos fixos, o bloco inteiro
 * espera pela mais demorada e o ganho evapora justamente na carteira
 * desigual que temos.
 */
export async function comLimite<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length)
  let proximo = 0
  const workers = Array.from(
    { length: Math.max(1, Math.min(limite, itens.length)) },
    async () => {
      for (;;) {
        const i = proximo++
        if (i >= itens.length) return
        resultados[i] = await fn(itens[i], i)
      }
    },
  )
  await Promise.all(workers)
  return resultados
}
