/**
 * Estúdio de Agentes — tipos dos payloads consumidos pelas abas.
 * Espelham as rotas:
 *   - GET /api/admin/email-generation-logs   (LogsPayload)
 *   - GET /api/admin/agents/executions       (ExecutionsPayload)
 *   - GET /api/admin/agents/prompts          (PromptsPayload)
 */

import type {
  InputSummaryItem,
  PromptSegment,
} from "@/lib/agents/shared/prompt-provenance"
import type { PipelineAgentKey } from "@/lib/agents/agent-visual"

export interface LogsPayload {
  window_days: number
  truncated: boolean
  fx_brl_rate: number | null
  totals: {
    runs: number
    tracked_runs: number
    external_runs: number
    errors: number
    retries: number
    cost_cents: number
    cost_usd: number
    tokens_input: number
    tokens_output: number
    avg_duration_ms: number | null
  }
  by_agent: Array<{
    agent: PipelineAgentKey
    runs: number
    errors: number
    retries: number
    cost_cents: number
    cost_usd: number
    avg_duration_ms: number | null
    avg_tokens_in: number | null
    avg_tokens_out: number | null
    model: string | null
  }>
  by_day: Array<{ day: string; runs: number; cost_cents: number; cost_usd: number }>
}

/**
 * A execução vive em `@/types/agent-executions` desde set/2026: o mesmo
 * objeto é montado pela listagem REST e pelo SSE do tempo real
 * (`agent-executions.service.ts`), e um tipo por camada deixaria as duas
 * divergirem em silêncio. Os nomes antigos seguem exportados daqui porque
 * é por eles que as abas importam.
 */
export type {
  AgentExecution as ExecutionRow,
  AgentExecutionsPayload as ExecutionsPayload,
} from "@/types/agent-executions"

export interface PromptRowLite {
  id: string
  agent_type: string
  version: number
  model: string
  system_prompt: string
  user_template: string
  temperature: number
  max_tokens: number
  is_active: boolean
  created_at: string
  created_by_name?: string | null
}

export interface PromptsPayload {
  by_type: Record<string, { active: PromptRowLite | null; history: PromptRowLite[] }>
}

/**
 * Detalhe completo de uma run (GET /api/admin/email-generation-logs/[id]).
 * A rota devolve o objeto FLAT (sem wrapper).
 */
export interface RunDetailPayload {
  id: string
  agent: string
  model: string | null
  status: string
  input_vars: unknown
  rendered_prompt: string | null
  // Proveniência (migration 20261085) — null nas runs anteriores.
  prompt_segments: PromptSegment[] | null
  input_summary: InputSummaryItem[] | null
  raw_output: string | null
  parsed_output: unknown
  error_message: string | null
  error_stack: string | null
  duration_ms: number | null
  cost_cents: number | null
  tokens_input: number | null
  tokens_output: number | null
  retry_count: number | null
}
