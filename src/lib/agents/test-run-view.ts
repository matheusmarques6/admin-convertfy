/**
 * Derivações PURAS do teste de geração — compartilhadas pela aba Testar do
 * hub e pela aba Teste do Estúdio de Agentes (extraídas de test-tab.tsx
 * na criação do hook useTestGeneration, ago/2026).
 *
 * Regras aqui nasceram de incidentes reais e são cobertas por teste:
 *   - phaseMessage: espelha a máquina de status + html_pipeline_stage;
 *   - isTimeoutMarker/canRecoverAfterTimeout: recovery do 504 (incidente
 *     Luxe Lift 27/07 — reclique abria pipeline duplicado);
 *   - computeStale: aviso de geração travada (>90s sem atividade in-flight).
 */

export interface RunStep {
  agent: string
  status: "pending" | "success" | "error" | "skipped" | "running"
  error?: string
  durationMs?: number
  tokens?: number
  cost?: number
}

export type TestRunMode = "default" | "phase2" | "full"

/** Labels PT-BR dos agentes nas listas de teste. */
export const TEST_AGENT_LABELS: Record<string, string> = {
  assembler_chooser: "Curador",
  assembler: "Montador",
  blueprint: "Blueprint (estrutura)",
  subject: "Assunto",
  seed: "Seed Blocos",
  copy: "Copy (n8n)",
  image: "Imagem (IA)",
  hero_section: "Hero Section",
  copy_merge: "Merge de Copy (código)",
  merge_verifier: "Verificador de Merge",
  text_format: "Formatação de Texto",
  image_format: "Formatação de Imagem",
  color_format: "Cores & Botões",
  qa: "QA",
  html: "HTML (legado)",
  refiner: "Refinador (legado)",
}

/** Ordem canônica exibida nas listas (extras aparecem quando têm run). */
export const TEST_BASE_AGENT_KEYS = [
  "assembler_chooser",
  "assembler",
  "blueprint",
  "seed",
  "copy",
  "image",
  "hero_section",
  "copy_merge",
  "text_format",
  "image_format",
  "color_format",
  "qa",
] as const

const PHASE2_STEP_KEYS = [
  "image",
  "hero_section",
  "text_format",
  "image_format",
  "color_format",
  "qa",
] as const

/** Steps esperados por modo — placeholder até o polling trazer runs reais. */
export function expectedSteps(mode: TestRunMode): RunStep[] {
  const phase2 = PHASE2_STEP_KEYS.map(
    (agent): RunStep => ({ agent, status: "pending" }),
  )
  if (mode === "phase2") return phase2
  return [
    { agent: "assembler_chooser", status: "pending" },
    { agent: "assembler", status: "pending" },
    { agent: "blueprint", status: "pending" },
    { agent: "seed", status: "pending" },
    { agent: "copy", status: "pending" },
    ...phase2,
  ]
}

/**
 * Normaliza qualquer payload de erro (string, Error-like, objeto da API)
 * para texto legível — evita o clássico "[object Object]".
 */
export function errText(x: unknown): string {
  if (x == null) return ""
  if (typeof x === "string") return x
  if (typeof x === "object") {
    const o = x as Record<string, unknown>
    for (const k of ["error", "message", "reason", "failure_reason", "detail"]) {
      if (typeof o[k] === "string") return o[k] as string
    }
    try {
      return JSON.stringify(x)
    } catch {
      return String(x)
    }
  }
  return String(x)
}

/**
 * Texto do estágio atual da fase 2, derivado do email_status do polling.
 * Dentro de `rendering`, html_pipeline_stage é o último step CONCLUÍDO da
 * cadeia de formatação — por isso 'hero' vira "Formatação de Texto…".
 */
export function phaseMessage(
  emailStatus: string | null | undefined,
  htmlStage: string | null | undefined,
): string | null {
  switch (emailStatus) {
    case "pending":
      return "Na fila…"
    case "copy_generating":
    case "copy_generating_recovery":
      return "Gerando copy (n8n)…"
    case "copy_ready":
      return "Copy pronta — gerando imagens…"
    case "image_done":
      return "Imagens prontas — iniciando montagem HTML (Hero Section)…"
    case "rendering": {
      switch (htmlStage) {
        case "hero":
          return "Hero pronta — Formatação de Texto…"
        case "text":
          return "Texto posicionado — Formatação de Imagem…"
        case "image":
          return "Imagens posicionadas — Cores & Botões…"
        default:
          return "Montagem HTML — Hero Section…"
      }
    }
    case "qa_running":
      return "HTML pronto — validando (QA)…"
    default:
      return null
  }
}

/** Estado terminal do polling (para parar e reconciliar a UI). */
export function isTerminalStatus(statusInfo: {
  status?: string | null
  email_status?: string | null
} | null | undefined): boolean {
  return Boolean(
    statusInfo &&
      (statusInfo.status === "done" ||
        statusInfo.status === "error" ||
        statusInfo.email_status === "failed" ||
        statusInfo.email_status === "ready"),
  )
}

/** Marcador de timeout de GATEWAY (504/corpo detectado no parse). */
export const TIMEOUT_MARKER = "__timeout__"

export function isTimeoutMarker(msg: string): boolean {
  return msg.startsWith(TIMEOUT_MARKER)
}

/**
 * Recovery pós-timeout SÓ vale no fullPipeline: é o único caminho cujo
 * claim grava o batch ANTES da fase 1 — nos demais, o batch do email
 * ainda é o de uma geração antiga.
 */
export function canRecoverAfterTimeout(
  msg: string,
  fullPipeline: boolean,
): boolean {
  return isTimeoutMarker(msg) && fullPipeline
}

/**
 * Geração travada: fase in-flight (rendering/image_done/qa_running) sem
 * atualização há mais de `staleMs` (default 90s) — o watchdog vai limpar.
 *
 * Quando a ÚLTIMA run está `running`, o step ainda está legitimamente
 * trabalhando — o maior budget da cadeia é o da Formatação de Texto
 * (540s), então o limiar sobe para `runningStaleMs` (default 10min).
 * Sem isso, todo step longo disparava "parece travada" aos 90s (alarme
 * falso observado em produção, ago/2026).
 */
export function computeStale(
  opts: {
    emailStatus: string | null | undefined
    lastRunCreatedAt: string | null | undefined
    /** Status da última run — `running` estende o limiar. */
    lastRunStatus?: string | null
    emailUpdatedAt: string | null | undefined
    nowMs: number
    staleMs?: number
    runningStaleMs?: number
  },
): boolean {
  const staleMs =
    opts.lastRunStatus === "running"
      ? (opts.runningStaleMs ?? 10 * 60 * 1000)
      : (opts.staleMs ?? 90 * 1000)
  const lastTs = opts.lastRunCreatedAt ?? opts.emailUpdatedAt
  if (!lastTs) return false
  const ageMs = opts.nowMs - new Date(lastTs).getTime()
  const isInFlight = ["rendering", "image_done", "qa_running"].includes(
    opts.emailStatus ?? "",
  )
  return isInFlight && ageMs > staleMs
}

/**
 * Título do estado do teste. A resposta inicial "dispatched" ("Copy
 * disparada ao N8N") só vale ENQUANTO o email não progrediu além da copy —
 * no teste completo a fase 2 dispara sozinha e o header precisa acompanhar
 * (bug observado em produção: header preso em "Copy disparada" com a
 * montagem já rodando).
 */
export function runHeaderLabel(opts: {
  resultStatus: string | null | undefined
  pollStatus: string | null | undefined
  emailStatus: string | null | undefined
  hasRun: boolean
}): string | null {
  const { resultStatus, pollStatus, emailStatus, hasRun } = opts
  if (pollStatus === "done" || resultStatus === "done") return "Geração concluída"
  if (pollStatus === "error" || resultStatus === "error") return "Erro na geração"
  const progressed =
    emailStatus != null &&
    ["copy_ready", "image_done", "rendering", "qa_running"].includes(emailStatus)
  if (resultStatus === "dispatched" && !progressed) return "Copy disparada ao N8N"
  return hasRun ? "Gerando email…" : null
}

/** "3m07s" / "42s" para o cronômetro. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`
}
