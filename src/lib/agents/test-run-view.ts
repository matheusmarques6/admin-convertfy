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

import { translateFailureReason } from "@/lib/email-workspace/failure-reason"

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
  estruturador: "Estruturador",
  assembler_chooser: "Curador",
  assembler: "Montador",
  blueprint: "Blueprint (estrutura)",
  subject: "Assunto",
  seed: "Seed Blocos",
  copy_dispatch: "Dispatch (envio ao n8n)",
  copy: "Copy (n8n)",
  // Condicional: só existe run quando algum campo voltou acima do limite.
  // Por isso fica FORA de TEST_BASE_AGENT_KEYS — uma linha pendente que
  // nunca chega mentiria sobre o pipeline.
  copy_fit: "Encurtador de Copy",
  background_fit: "Fundo no Tamanho",
  image: "Imagem (IA)",
  hero_section: "Hero Section",
  copy_merge: "Merge de Copy (código)",
  merge_verifier: "Verificador de Merge",
  text_format: "Formatação de Texto",
  image_format: "Formatação de Imagem",
  typography: "Tipografia",
  color_format: "Cores & Botões",
  qa: "QA",
  qavision: "QA Vision",
  html: "HTML (legado)",
  refiner: "Refinador (legado)",
}

/** Ordem canônica exibida nas listas (extras aparecem quando têm run). */
export const TEST_BASE_AGENT_KEYS = [
  // O Estruturador roda ANTES do Curador quando ligado; em 'off' a linha
  // aparece pendente e a run nunca chega — que é a verdade, e melhor do que
  // o agente não existir na tela.
  "estruturador",
  "assembler_chooser",
  "assembler",
  "blueprint",
  // O Assunto roda em TODA geração (é a contribuição criativa da rota
  // determinística do blueprint) e estava tratado como "extra que aparece
  // se tiver run" — junto dos legados html/refiner. Com a lista em branco,
  // antes da primeira run, ele simplesmente não existia na tela.
  "subject",
  "seed",
  // Dois passos, não um: o Dispatch é o que ENVIAMOS ao n8n e o Copy é o
  // que voltou. Colapsá-los escondia o payload atrás do retorno.
  "copy_dispatch",
  "copy",
  "image",
  "hero_section",
  "copy_merge",
  "text_format",
  "image_format",
  "typography",
  "color_format",
  "qa",
] as const

/**
 * Agentes do mapa que NÃO entram na linha base: eles só existem quando uma
 * condição acontece, e uma linha "pendente" que nunca chega mente sobre o
 * pipeline tanto quanto a ausência do agente mentiria.
 *
 * - `qavision`: é a run de QA com visão (`agent='qa'` + `is_qa_vision`),
 *   não um step próprio — aparece dentro do QA.
 * - `copy_fit`: só roda quando algum campo voltou do n8n acima do limite
 *   da caixa (migration 20261089).
 *
 * Ambos aparecem na lista quando TÊM run, como qualquer extra.
 */
// - `background_fit`: só roda quando o documento tem elemento com
//   background e tamanho declarado (migration 20261102).
export const TEST_CONDITIONAL_AGENT_KEYS = ["qavision", "copy_fit", "background_fit"] as const

const PHASE2_STEP_KEYS = [
  "image",
  "hero_section",
  "text_format",
  "image_format",
  "typography",
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
    { agent: "estruturador", status: "pending" },
    { agent: "assembler_chooser", status: "pending" },
    { agent: "assembler", status: "pending" },
    { agent: "blueprint", status: "pending" },
    { agent: "subject", status: "pending" },
    { agent: "seed", status: "pending" },
    { agent: "copy_dispatch", status: "pending" },
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
 * O `fetch` morreu na REDE — nenhuma resposta HTTP chegou.
 *
 * Irmão do 504 e, até 27/08, tratado ao contrário dele: o marcador
 * `__timeout__` só nasce quando o gateway RESPONDE algo que não é JSON
 * (ver o `catch` do parse). Quando a conexão cai, o `fetch` LANÇA e aquele
 * trecho nunca roda — o operador via "Erro na geração: Failed to fetch"
 * numa geração que terminou em `ready` com 73k de HTML.
 *
 * O teste é `TypeError` E a mensagem: erro com resposta HTTP nunca é
 * `TypeError`, então a checagem de tipo é o que impede de confundir isto
 * com falha REAL relatada pelo servidor — a mesma cautela que o comentário
 * do `canRecoverAfterInterrupt` registra. A lista de mensagens cobre os
 * textos que cada navegador usa para a mesma coisa.
 */
const NETWORK_FAILURE_MESSAGES = [
  "failed to fetch", // Chrome/Edge
  "networkerror when attempting to fetch resource", // Firefox
  "load failed", // Safari
  "network error",
  "network request failed",
]

export function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  const msg = (err.message ?? "").toLowerCase()
  return NETWORK_FAILURE_MESSAGES.some((m) => msg.includes(m))
}

/**
 * Recovery pós-interrupção SÓ vale no fullPipeline: é o único caminho cujo
 * claim grava o batch ANTES da fase 1 — nos demais, o batch do email
 * ainda é o de uma geração antiga.
 *
 * Duas interrupções, mesmo desfecho no servidor (o trabalho continua):
 * o gateway cortar depois de 300s (`__timeout__`) e a conexão cair sem
 * resposta nenhuma. O que NÃO entra aqui é erro que o servidor relatou —
 * casar texto de erro do servidor mascararia falha real.
 */
export function canRecoverAfterInterrupt(
  err: unknown,
  msg: string,
  fullPipeline: boolean,
): boolean {
  return fullPipeline && (isTimeoutMarker(msg) || isNetworkFailure(err))
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
  /**
   * `email_flow_emails.failure_reason` — POR QUE falhou. Sem isto o header
   * dizia só "Erro na geração": o `hero_failed` da Innova (27/08) chegou ao
   * operador como um título vermelho sozinho, com um aviso de brand
   * tolerante embaixo que nada tinha a ver com a causa. E a falha nem
   * deixava run para consultar — o step morre antes de abrir uma.
   */
  failureReason?: string | null
}): string | null {
  const { resultStatus, pollStatus, emailStatus, hasRun } = opts
  if (pollStatus === "done" || resultStatus === "done") return "Geração concluída"
  if (pollStatus === "error" || resultStatus === "error") {
    const motivo = opts.failureReason?.trim()
    return motivo
      ? `Erro na geração — ${translateFailureReason(motivo)}`
      : "Erro na geração"
  }
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
