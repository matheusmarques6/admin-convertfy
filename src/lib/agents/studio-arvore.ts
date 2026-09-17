/**
 * studio-arvore — as FOLHAS de um nó do canvas: as chamadas que ele agrega.
 *
 * Um nó do Estúdio esconde dois casos diferentes com a mesma aparência:
 *
 * - **Imagem**: N runs REAIS, uma por campo, cada uma com prompt, entrada,
 *   saída, tempo e custo próprios. Elas sempre existiram; o `DISTINCT ON`
 *   da RPC é que entregava só a mais recente (medido em 17/09: 11 runs,
 *   US$ 2,321 — a tela dizia US$ 0,254).
 * - **Curador**: UMA run com N chamadas ao modelo (`shortlist`/`escolha`
 *   hoje, uma `posicao_N` por posição com o leque ligado). Não há `run_id`
 *   por chamada; o que existe é `parsed_output.consumo_por_chamada`.
 *
 * Os dois viram o MESMO tipo de folha aqui, para a árvore não precisar
 * saber de qual lado veio. A diferença fica num campo só (`runId`), que é
 * o que decide se o painel abre a run ou lê a chamada de dentro do pai.
 */

import type { ConsumoDaChamada, ConsumoPorChamada } from "./architect/curador-telemetria-chamada"

export type FolhaStatus = "sucesso" | "erro" | "rodando" | "pulado"

export interface FolhaDoNo {
  /** Chave estável para React e para a seleção. */
  chave: string
  /** `run` abre por id; `chamada` lê do `consumo_por_chamada` do pai. */
  tipo: "run" | "chamada"
  /** `run_id` quando `tipo === "run"`; a etapa quando é `chamada`. */
  runId?: string
  etapa?: string
  rotulo: string
  sub?: string | null
  status: FolhaStatus
  durSec?: number | null
  usd?: number | null
  tokIn?: number | null
  tokOut?: number | null
  err?: string | null
  /** Miniatura, quando a run gerou imagem. É a comprovação visual. */
  thumbUrl?: string | null
}

/** Uma run filha como a rota `/filhos` a devolve. */
export interface RunFilhaRow {
  run_id: string
  agent: string
  status: string
  model: string | null
  created_at: string
  duration_ms: number | null
  cost_cents: number | null
  tokens_input: number | null
  tokens_output: number | null
  retry_count: number | null
  error_message: string | null
  rotulo: string | null
  sub_rotulo: string | null
  image_url: string | null
}

function statusDaRun(status: string): FolhaStatus {
  if (status === "error") return "erro"
  if (status === "running") return "rodando"
  if (status === "skipped") return "pulado"
  return "sucesso"
}

/** As folhas do nó de IMAGEM (e de qualquer agente com N runs reais). */
export function filhosDeRuns(linhas: ReadonlyArray<RunFilhaRow>): FolhaDoNo[] {
  return linhas.map((r, i) => ({
    chave: r.run_id,
    tipo: "run" as const,
    runId: r.run_id,
    // O rótulo já vem derivado do banco (fieldKey → avatar N → blockId →
    // agente), mas um filho sem rótulo nenhum seria um cartão em branco.
    rotulo: r.rotulo?.trim() || `chamada ${i + 1}`,
    sub: r.sub_rotulo ?? null,
    status: statusDaRun(r.status),
    durSec: r.duration_ms != null ? r.duration_ms / 1000 : null,
    usd: r.cost_cents != null ? r.cost_cents / 100 : null,
    tokIn: r.tokens_input,
    tokOut: r.tokens_output,
    err: r.error_message,
    thumbUrl: r.image_url,
  }))
}

/**
 * Ordem das etapas do Curador.
 *
 * `shortlist` e `escolha` são o caminho de hoje; `posicao_N` é o leque.
 * Cada retomada vem LOGO APÓS a sua etapa — ela é a segunda tentativa da
 * mesma coisa, e separá-las esconderia o par que explica o custo.
 */
function ordemDaEtapa(etapa: string): [number, number, number] {
  const retomada = etapa.endsWith("_retomada") ? 1 : 0
  const base = retomada ? etapa.slice(0, -"_retomada".length) : etapa
  if (base === "shortlist") return [0, 0, retomada]
  if (base === "escolha") return [1, 0, retomada]
  if (base === "retomada") return [1, 0, 1]
  const m = /^posicao_(\d+)$/.exec(base)
  if (m) return [2, Number(m[1]), retomada]
  const t = /^tentativa_(\d+)$/.exec(base)
  if (t) return [3, Number(t[1]), retomada]
  return [4, 0, retomada]
}

function rotuloDaEtapa(etapa: string, item: ConsumoDaChamada | null): string {
  const retomada = etapa.endsWith("_retomada")
  const base = retomada ? etapa.slice(0, -"_retomada".length) : etapa
  const m = /^posicao_(\d+)$/.exec(base)
  const nome = m
    ? `posição ${m[1]}${item?.chave?.section ? ` · ${item.chave.section}` : ""}`
    : base.replace(/_/g, " ")
  return retomada ? `${nome} (retomada)` : nome
}

/** As folhas do nó do CURADOR, lidas do `consumo_por_chamada` do pai. */
export function filhosDeChamadas(consumo: ConsumoPorChamada | null | undefined): FolhaDoNo[] {
  if (!consumo) return []
  return Object.entries(consumo)
    .sort((a, b) => {
      const oa = ordemDaEtapa(a[0])
      const ob = ordemDaEtapa(b[0])
      return oa[0] - ob[0] || oa[1] - ob[1] || oa[2] - ob[2] || a[0].localeCompare(b[0])
    })
    .map(([etapa, item]) => ({
      chave: etapa,
      tipo: "chamada" as const,
      etapa,
      rotulo: rotuloDaEtapa(etapa, item),
      sub: item?.modelo ?? null,
      // `null` é "houve esta etapa e ela foi PULADA" (a shortlist que o
      // limiar dispensou). Virar ausência diria que a etapa não existe, e
      // virar sucesso diria que uma chamada aconteceu.
      status: item ? (item.erro ? "erro" : "sucesso") : "pulado",
      durSec: item ? (item.ms != null ? item.ms / 1000 : item.seg) : null,
      usd: item?.custo_usd ?? null,
      tokIn: item?.tokens_input ?? null,
      tokOut: item?.tokens_output ?? null,
      err: item?.erro ?? null,
      thumbUrl: null,
    }))
}

/** O resumo do leque: é o cabeçalho do cartão. */
export interface ResumoDasFolhas {
  total: number
  falhas: number
  usd: number
  /** A maior duração: o tempo que o passo custou de relógio. */
  maiorSec: number | null
  /** A soma: o trabalho total. As duas juntas porque cada uma sozinha mente. */
  somaSec: number | null
}

export function resumirFolhas(folhas: ReadonlyArray<FolhaDoNo>): ResumoDasFolhas {
  const duracoes = folhas.map((f) => f.durSec).filter((d): d is number => typeof d === "number")
  return {
    total: folhas.length,
    falhas: folhas.filter((f) => f.status === "erro").length,
    usd: folhas.reduce((s, f) => s + (f.usd ?? 0), 0),
    maiorSec: duracoes.length ? Math.max(...duracoes) : null,
    somaSec: duracoes.length ? duracoes.reduce((s, d) => s + d, 0) : null,
  }
}
