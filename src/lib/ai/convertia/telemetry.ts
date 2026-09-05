/**
 * Telemetria por rodada e por tool de um turno da ConvertIA — módulo
 * PURO. O loop alimenta; a rota grava o `summary()` em
 * `ai_chat_messages.meta.usage` (a UI mostra) e em
 * `ai_usage_events.context` (o dashboard de custo agrega).
 *
 * É o que responde "onde foi o tempo e o dinheiro" de um turno de 90s:
 * 4 rodadas de modelo (com tokens em cache ou não) + 6 tools (com a
 * duração de cada uma e quantos retries fez).
 */

export type RoundOutcome =
  | "tools" // a rodada terminou chamando ferramentas
  | "final" // resposta final
  | "nudged" // descartada pelo guard "consulte antes de responder"
  | "rerouted" // rodada barata refeita no modelo forte (item 13)
  | "error"
  | "cancelled"
  | "budget"

export interface RoundStat {
  n: number
  model: string
  /** Papel do modelo na rodada (roteamento por rodada, item 13). */
  role: "primary" | "cheap"
  ms: number
  tokens_input: number
  tokens_output: number
  tokens_cached: number
  tokens_cache_write: number
  cost_usd: number
  tool_calls: number
  outcome: RoundOutcome
}

export interface ToolStat {
  name: string
  connector: string
  ms: number
  ok: boolean
  /** Código do erro estruturado quando falhou (rate_limited, timeout…). */
  error_code?: string
  retries?: number
}

export interface TurnUsageSummary {
  tokens_input: number
  tokens_output: number
  tokens_cached: number
  tokens_cache_write: number
  cost_usd: number
  duration_ms: number
  rounds: RoundStat[]
  tools: ToolStat[]
  /** Fração do input lida do cache (0–1) — o número que o item 1 promete. */
  cache_hit_ratio: number
}

/**
 * Aceita o `meta.usage` de QUALQUER geração e devolve o resumo no formato
 * vigente (ou null se não for usage).
 *
 * Incidente 04/09: as mensagens anteriores ao motor v3 gravaram
 * `{tokens_input, tokens_output, cost_usd}` — sem `rounds`/`tools`. A tela
 * nova fazia `usage.rounds.length` ao reabrir a conversa (que é restaurada
 * sozinha do localStorage) e a página inteira caía no ErrorBoundary:
 * "Algo deu errado" em toda abertura da ConvertIA. Dado antigo no banco
 * nunca pode derrubar a UI — quem adapta é o leitor.
 */
export function normalizeTurnUsage(raw: unknown): TurnUsageSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const u = raw as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  const rounds = Array.isArray(u.rounds)
    ? (u.rounds as unknown[]).filter((r): r is RoundStat => !!r && typeof r === "object" && typeof (r as RoundStat).n === "number")
    : []
  const tools = Array.isArray(u.tools)
    ? (u.tools as unknown[]).filter((t): t is ToolStat => !!t && typeof t === "object" && typeof (t as ToolStat).name === "string")
    : []
  const tokens_input = num(u.tokens_input)
  const tokens_cached = num(u.tokens_cached)
  return {
    tokens_input,
    tokens_output: num(u.tokens_output),
    tokens_cached,
    tokens_cache_write: num(u.tokens_cache_write),
    cost_usd: num(u.cost_usd),
    duration_ms: num(u.duration_ms),
    rounds,
    tools,
    cache_hit_ratio:
      typeof u.cache_hit_ratio === "number" && Number.isFinite(u.cache_hit_ratio)
        ? u.cache_hit_ratio
        : tokens_input > 0
          ? round4(tokens_cached / tokens_input)
          : 0,
  }
}

export class TurnTelemetry {
  readonly rounds: RoundStat[] = []
  readonly tools: ToolStat[] = []
  private readonly startedAt: number
  /** Quantas rodadas/tools vieram do seed — já foram FATURADAS pelo turno anterior. */
  private readonly seededRounds: number
  private readonly seededTools: number

  /** `seed` retoma a telemetria de um turno continuado em job. */
  constructor(
    private readonly clock: () => number = Date.now,
    seed?: { rounds?: RoundStat[]; tools?: ToolStat[]; startedAt?: number },
  ) {
    this.startedAt = seed?.startedAt ?? clock()
    if (seed?.rounds) this.rounds.push(...seed.rounds)
    if (seed?.tools) this.tools.push(...seed.tools)
    this.seededRounds = seed?.rounds?.length ?? 0
    this.seededTools = seed?.tools?.length ?? 0
  }

  /**
   * Só o que este processo executou (rodadas/tools depois do seed) — é o
   * que vai para ai_usage_events; o resumo completo (`summary`) vai para
   * o meta da mensagem. Sem isso a continuação cobrava as rodadas da
   * rota de novo e o guard-rail diário estourava antes da hora.
   */
  summaryNew(extraCostUsd = 0): TurnUsageSummary {
    const scoped = new TurnTelemetry(this.clock, {
      rounds: this.rounds.slice(this.seededRounds),
      tools: this.tools.slice(this.seededTools),
      startedAt: this.startedAt,
    })
    return scoped.summary(extraCostUsd)
  }

  round(stat: Omit<RoundStat, "n">): RoundStat {
    const full = { n: this.rounds.length + 1, ...stat }
    this.rounds.push(full)
    return full
  }

  /** Atualiza o desfecho da última rodada (ex.: "tools" → "nudged"). */
  setLastOutcome(outcome: RoundOutcome): void {
    const last = this.rounds[this.rounds.length - 1]
    if (last) last.outcome = outcome
  }

  tool(stat: ToolStat): void {
    this.tools.push(stat)
  }

  summary(extraCostUsd = 0): TurnUsageSummary {
    const tokens_input = sum(this.rounds, (r) => r.tokens_input)
    const tokens_cached = sum(this.rounds, (r) => r.tokens_cached)
    return {
      tokens_input,
      tokens_output: sum(this.rounds, (r) => r.tokens_output),
      tokens_cached,
      tokens_cache_write: sum(this.rounds, (r) => r.tokens_cache_write),
      cost_usd: round6(sum(this.rounds, (r) => r.cost_usd) + extraCostUsd),
      duration_ms: this.clock() - this.startedAt,
      rounds: [...this.rounds],
      tools: [...this.tools],
      cache_hit_ratio: tokens_input > 0 ? round4(tokens_cached / tokens_input) : 0,
    }
  }
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  let s = 0
  for (const x of arr) s += f(x) || 0
  return s
}
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

/** "12,4k" / "980" — tokens legíveis (client-safe). */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k`
  return String(Math.round(n))
}

/** "1,2 s" / "840 ms" / "1min 05s" (client-safe). */
export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}min ${String(s).padStart(2, "0")}s`
}
