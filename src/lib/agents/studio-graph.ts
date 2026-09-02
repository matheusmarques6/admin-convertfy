/**
 * Estúdio de Agentes — grafo do pipeline de geração (módulo PURO).
 *
 * Fonte única do canvas do Estúdio (`/admin/agents/studio`): nós com
 * posição, arestas, grupos visuais e a lógica de projetar as runs de uma
 * execução (email) sobre o grafo. Client-safe: sem imports de servidor.
 *
 * O grafo é o pipeline REAL completo (decisão ago/2026 — não a síntese da
 * maquete): fase 1 por loja (Curador → Montador → Blueprint → Assunto),
 * copy no n8n, fase 2 por email (Image → Merge por example → Hero →
 * Texto → Imagens → Cores) e qualidade (QA → QA Vision). O merge roda
 * ANTES da hero (D1, 20/08) e o verificador de merge morreu com a fila
 * de exceção.
 */

import {
  AGENT_VISUAL,
  type PipelineAgentKey,
} from "@/lib/agents/agent-visual"

export const NODE_W = 196
export const NODE_H = 72

export type StudioNodeType = "trigger" | "agent" | "output"

export interface StudioNode {
  key: string
  type: StudioNodeType
  /** Presente quando type='agent' — chave do AGENT_VISUAL e dos buckets da API de logs. */
  agent?: PipelineAgentKey
  /** Label para trigger/output (agentes usam AGENT_VISUAL.name). */
  label?: string
  sub?: string
  /** Nome do ícone (mapa de ícones do canvas). */
  icon: string
  x: number
  y: number
}

/**
 * Posições em coordenadas do canvas (o FlowCanvas dá pan/zoom/fit).
 * Layout: linha principal em y=452; desvios (image, subject, qavision)
 * acima em y=308. Espaçamento horizontal de 256px (NODE_W + 60).
 */
export const STUDIO_NODES: StudioNode[] = [
  { key: "trigger", type: "trigger", label: "Pesquisa completa", sub: "Fila de dispatch · por loja", icon: "zap", x: 40, y: 452 },
  // ── Fase 1: referência & estrutura (por loja × email) ──
  // Estruturador antes do Curador: decide o esqueleto (modo shadow/on) que a
  // fase 1 consome — em off o nó aparece como pulado, que é a verdade.
  { key: "estruturador", type: "agent", agent: "estruturador", icon: "layers", x: 300, y: 452 },
  { key: "assembler_chooser", type: "agent", agent: "assembler_chooser", icon: "search", x: 556, y: 452 },
  { key: "assembler", type: "agent", agent: "assembler", icon: "package", x: 812, y: 452 },
  { key: "blueprint", type: "agent", agent: "blueprint", icon: "layers", x: 1068, y: 452 },
  { key: "subject", type: "agent", agent: "subject", icon: "edit", x: 1068, y: 308 },
  // ── Copy (externo, n8n) ──
  // Dois nós, não um: o Dispatch é o que ENVIAMOS (payload com blocos,
  // campos e blueprint) e o Copy é o que VOLTOU do n8n. Colapsá-los
  // escondia o payload atrás do retorno — e era justamente o payload que
  // ninguém conseguia abrir (a run não tinha email/flow/batch).
  { key: "copy_dispatch", type: "agent", agent: "copy_dispatch", icon: "send", x: 1324, y: 452 },
  { key: "copy", type: "agent", agent: "copy", icon: "edit", x: 1580, y: 452 },
  // Encurtador (migration 20261089): roda no CALLBACK, entre a copy voltar e
  // a fase 2 começar. Fica na linha de cima porque é condicional — só existe
  // run quando algum campo passou do limite da caixa.
  { key: "copy_fit", type: "agent", agent: "copy_fit", icon: "check", x: 1580, y: 308 },
  // ── Fase 2: montagem (por email) — merge por example ANTES da hero ──
  { key: "image", type: "agent", agent: "image", icon: "file", x: 1836, y: 308 },
  { key: "copy_merge", type: "agent", agent: "copy_merge", icon: "check", x: 1836, y: 452 },
  { key: "hero_section", type: "agent", agent: "hero_section", icon: "mail", x: 2092, y: 452 },
  { key: "text_format", type: "agent", agent: "text_format", icon: "edit", x: 2348, y: 452 },
  { key: "image_format", type: "agent", agent: "image_format", icon: "file", x: 2604, y: 452 },
  { key: "color_format", type: "agent", agent: "color_format", icon: "target", x: 2860, y: 452 },
  // Fundo no tamanho declarado (código, 02/09): faixa chapada + foto quando
  // o td declara um background maior que a foto gerada. Linha de cima
  // porque é condicional — só há run quando o documento tem box de fundo.
  { key: "background_fit", type: "agent", agent: "background_fit", icon: "check", x: 2860, y: 308 },
  // ── Qualidade ──
  { key: "qa", type: "agent", agent: "qa", icon: "target", x: 3116, y: 452 },
  { key: "qavision", type: "agent", agent: "qavision", icon: "search", x: 3372, y: 308 },
  { key: "out", type: "output", label: "Email pronto", sub: "Status ready · workspace do designer", icon: "send", x: 3628, y: 452 },
]

export const STUDIO_NODE_BY_KEY: Record<string, StudioNode> = Object.fromEntries(
  STUDIO_NODES.map((n) => [n.key, n]),
)

export const STUDIO_EDGES: Array<[string, string]> = [
  ["trigger", "estruturador"],
  ["estruturador", "assembler_chooser"],
  ["assembler_chooser", "assembler"],
  ["assembler", "blueprint"],
  ["blueprint", "subject"],
  ["blueprint", "copy_dispatch"],
  ["subject", "copy_dispatch"],
  ["copy_dispatch", "copy"],
  ["copy", "copy_fit"],
  ["copy_fit", "copy_merge"],
  ["copy", "image"],
  ["copy", "copy_merge"],
  ["image", "copy_merge"],
  ["copy_merge", "hero_section"],
  ["hero_section", "text_format"],
  ["text_format", "image_format"],
  ["image_format", "color_format"],
  ["color_format", "background_fit"],
  ["background_fit", "qa"],
  ["color_format", "qa"],
  ["qa", "qavision"],
  ["qa", "out"],
  ["qavision", "out"],
]

export interface StudioGroup {
  label: string
  x: number
  y: number
  w: number
  h: number
  bg: string
  border: string
  c: string
}

export const STUDIO_GROUPS: StudioGroup[] = [
  { label: "REFERÊNCIA & ESTRUTURA", x: 272, y: 244, w: 1048, h: 348, bg: "rgba(78,98,216,0.05)", border: "rgba(78,98,216,0.18)", c: "#4E62D8" },
  { label: "COPY (N8N)", x: 1296, y: 388, w: 252, h: 204, bg: "rgba(107,114,128,0.05)", border: "rgba(107,114,128,0.2)", c: "#6B7280" },
  { label: "MONTAGEM", x: 1552, y: 244, w: 1304, h: 348, bg: "rgba(124,58,237,0.05)", border: "rgba(124,58,237,0.16)", c: "#7C3AED" },
  { label: "QUALIDADE", x: 2832, y: 244, w: 540, h: 348, bg: "rgba(6,95,70,0.05)", border: "rgba(6,95,70,0.16)", c: "#065F46" },
]

// ── Estado de run por nó ─────────────────────────────────────────────────

export type NodeRunStatus =
  | "sucesso"
  | "erro"
  | "rodando"
  | "pulado"
  | "aguardando"

export interface NodeRun {
  status: NodeRunStatus
  /** id da run em email_generation_runs (drill-down de detalhe). */
  runId?: string
  durSec?: number | null
  usd?: number | null
  tokIn?: number | null
  tokOut?: number | null
  retries?: number | null
  err?: string | null
  /**
   * Quantas runs o nó agrega, quando é mais de uma. O agente de imagem
   * gera uma run POR SLOT (~16 num e-mail pesado), e o nó precisa dizer
   * "12 de 16" em vez de mostrar a última e esconder as falhas.
   */
  count?: number
  /** Runs com erro dentro do agregado. */
  failed?: number
}

export const RUN_STYLE: Record<
  NodeRunStatus,
  { c: string; bg: string; b: string; label: string }
> = {
  sucesso: { c: "#065F46", bg: "#ECFDF5", b: "#A7F3D0", label: "ok" },
  erro: { c: "#991B1B", bg: "#FEF2F2", b: "#FECACA", label: "erro" },
  rodando: { c: "#2137B6", bg: "#EEF0FB", b: "#C7CDEF", label: "rodando" },
  pulado: { c: "#6B7280", bg: "#F3F4F6", b: "#E5E7EB", label: "pulado" },
  aguardando: { c: "#9CA3AF", bg: "#FFFFFF", b: "#E5E7EB", label: "aguardando" },
}

export const fmtDur = (s: number | null | undefined): string => {
  if (s == null) return "—"
  if (s < 1) return `${Math.round(s * 1000)}ms`
  return `${s.toFixed(1).replace(".", ",")}s`
}

// ── Projeção das runs da API sobre o grafo ───────────────────────────────

/** Run "crua" como devolvida pela API de execuções (uma por agente). */
export interface ExecutionAgentRun {
  run_id: string
  agent: PipelineAgentKey
  status: string // 'success' | 'error' | 'running' | 'skipped'
  duration_ms: number | null
  cost_cents: number | null
  tokens_input: number | null
  tokens_output: number | null
  retry_count: number | null
  error_message: string | null
}

export type ExecutionBucket = "success" | "error" | "running"

/** Ordem topológica da linha principal — usada para derivar aguardando/pulado. */
const MAIN_ORDER = [
  "trigger",
  "estruturador",
  "assembler_chooser",
  "assembler",
  "blueprint",
  "subject",
  "copy_dispatch",
  "copy",
  "image",
  "copy_merge",
  "hero_section",
  "text_format",
  "image_format",
  "color_format",
  "background_fit",
  "qa",
  "qavision",
  "out",
] as const

function apiStatusToNode(status: string): NodeRunStatus {
  if (status === "success") return "sucesso"
  if (status === "error") return "erro"
  if (status === "running") return "rodando"
  if (status === "skipped") return "pulado"
  return "aguardando"
}

/**
 * Converte as runs por agente de uma execução no mapa nó→NodeRun do canvas.
 *
 * Regras para nós SEM run registrada:
 *   - execução `running`: nós após o último com run ficam `aguardando`;
 *     nós antes (fase 1 pode ter rodado noutra janela) ficam `pulado`.
 *   - execução `success`: sem run = `pulado` (ex.: text_format pulado pelo
 *     merge, qavision OFF, fase 1 reusada de geração anterior).
 *   - execução `error`: nós após o erro = `pulado`; antes = `pulado`.
 * Trigger/out são sintéticos: seguem o bucket da execução.
 */
export function projectRuns(
  runs: ExecutionAgentRun[],
  bucket: ExecutionBucket,
): Record<string, NodeRun> {
  // Um agente pode ter VÁRIAS runs na mesma execução — o de imagem gera
  // uma por slot desde 22/08. `byAgent.set` sozinho guardava só a última:
  // uma falha em 1 de 16 imagens ficava invisível se a última desse certo.
  const byAgent = new Map<string, ExecutionAgentRun>()
  const allByAgent = new Map<string, ExecutionAgentRun[]>()
  for (const r of runs) {
    byAgent.set(r.agent, r)
    const arr = allByAgent.get(r.agent)
    if (arr) arr.push(r)
    else allByAgent.set(r.agent, [r])
  }

  /**
   * Colapsa as N runs de um agente num NodeRun só: soma custo, tokens e
   * duração, e o status do conjunto é o pior — uma imagem quebrada é
   * informação, não ruído.
   */
  const aggregate = (list: ExecutionAgentRun[]): NodeRun => {
    const failed = list.filter((r) => r.status === "error").length
    const running = list.some((r) => r.status === "running")
    const sum = (pick: (r: ExecutionAgentRun) => number | null | undefined) =>
      list.reduce((acc, r) => acc + (pick(r) ?? 0), 0)
    const withError = list.find((r) => r.status === "error")
    return {
      status: running
        ? "rodando"
        : failed === list.length
          ? "erro"
          : failed > 0
            ? "erro"
            : apiStatusToNode(list[list.length - 1].status),
      runId: (withError ?? list[list.length - 1]).run_id,
      // Duração do conjunto: as runs de imagem correm em paralelo, então
      // somar daria um número que ninguém esperou. A maior é a que o
      // usuário sentiu.
      durSec: Math.max(...list.map((r) => (r.duration_ms ?? 0) / 1000)) || null,
      usd: sum((r) => r.cost_cents) / 100,
      tokIn: sum((r) => r.tokens_input),
      tokOut: sum((r) => r.tokens_output),
      retries: sum((r) => r.retry_count),
      err: withError?.error_message ?? null,
      count: list.length,
      failed,
    }
  }

  const out: Record<string, NodeRun> = {}
  // Último índice na linha principal com run registrada.
  let lastIdx = -1
  MAIN_ORDER.forEach((k, i) => {
    if (byAgent.has(k)) lastIdx = i
  })

  MAIN_ORDER.forEach((key, i) => {
    if (key === "trigger") {
      out[key] = { status: "sucesso", durSec: null }
      return
    }
    if (key === "out") {
      out[key] =
        bucket === "success"
          ? { status: "sucesso", durSec: null }
          : bucket === "running"
            ? { status: "aguardando" }
            : { status: "pulado" }
      return
    }
    const list = allByAgent.get(key)
    const r = byAgent.get(key)
    if (list && list.length > 1) {
      out[key] = aggregate(list)
      return
    }
    if (r) {
      out[key] = {
        status: apiStatusToNode(r.status),
        runId: r.run_id,
        durSec: r.duration_ms != null ? r.duration_ms / 1000 : null,
        usd: r.cost_cents != null ? r.cost_cents / 100 : null,
        tokIn: r.tokens_input,
        tokOut: r.tokens_output,
        retries: r.retry_count,
        err: r.error_message,
      }
      return
    }
    if (bucket === "running" && i > lastIdx) {
      out[key] = { status: "aguardando" }
    } else {
      out[key] = { status: "pulado" }
    }
  })

  return out
}

/** Soma o custo (USD) das runs projetadas de uma execução. */
export function execCostUsd(runs: Record<string, NodeRun>): number {
  return Object.values(runs).reduce((s, r) => s + (r.usd ?? 0), 0)
}

// ── Projeção AO VIVO de um teste (aba Teste do Estúdio) ──────────────────

export type LiveTestMode = "default" | "phase2" | "full"

/** Run como devolvida pelo polling generation-status (batch do teste). */
export interface LiveTestRun {
  id?: string
  agent: string
  status: string
  error_message?: string | null
  duration_ms?: number | null
  tokens_input?: number | null
  tokens_output?: number | null
  cost_cents?: number | null
  retry_count?: number | null
  created_at?: string
}

const PHASE1_NODE_KEYS = ["estruturador", "assembler_chooser", "assembler", "blueprint", "subject"] as const

/**
 * Qual nó está RODANDO agora, derivado da máquina de status do email —
 * as runs só aparecem quando o agente termina (ou grava running), então
 * sem esta derivação o canvas ficaria mudo entre um agente e outro.
 * `html_pipeline_stage` é o último step CONCLUÍDO da cadeia.
 */
export function liveRunningNode(
  emailStatus: string | null | undefined,
  htmlStage: string | null | undefined,
): string | null {
  switch (emailStatus) {
    case "copy_generating":
    case "copy_generating_recovery":
      return "copy"
    case "copy_ready":
      return "image"
    case "image_done":
      return "hero_section"
    case "rendering":
      switch (htmlStage) {
        case "hero":
          return "text_format"
        case "text":
          return "image_format"
        case "image":
          return "color_format"
        default:
          return "hero_section"
      }
    case "qa_running":
      return "qa"
    default:
      return null
  }
}

/**
 * Projeta o TESTE em curso sobre o grafo:
 *   - runs do batch (última por agente; `copy_dispatch` tem nó próprio)
 *     dão status/tempo/custo dos nós que já rodaram;
 *   - o nó "rodando" vem da máquina de status do email quando nenhuma run
 *     o marca (liveRunningNode);
 *   - nós sem run: à frente da posição atual ficam `aguardando` enquanto o
 *     teste vive; atrás, `pulado`. Em modo phase2 a fase 1 é sempre
 *     `pulado` (reusada — nunca "aguardando").
 *   - terminal=done: sem run vira pulado e a saída conclui;
 *     terminal=error: downstream pulado.
 */
export function projectLiveTest(opts: {
  runs: LiveTestRun[]
  emailStatus: string | null | undefined
  htmlStage: string | null | undefined
  mode: LiveTestMode
  /** statusInfo.status do polling: 'done' | 'error' | outro. */
  terminal: string | null | undefined
}): Record<string, NodeRun> {
  const { runs, emailStatus, htmlStage, mode, terminal } = opts

  // Última run por agente (lista chega em ordem cronológica asc) e a lista
  // COMPLETA por agente — o de imagem gera uma run por slot, e mostrar só
  // a última esconderia as que falharam.
  const byAgent = new Map<string, LiveTestRun>()
  const allByAgent = new Map<string, LiveTestRun[]>()
  for (const r of runs) {
    // O dispatch tem NÓ PRÓPRIO desde ago/2026 — colapsá-lo em "copy"
    // escondia o payload enviado atrás da copy que voltou.
    const key = r.agent
    byAgent.set(key, r)
    const arr = allByAgent.get(key)
    if (arr) arr.push(r)
    else allByAgent.set(key, [r])
  }

  /** Colapsa as N runs de um agente num NodeRun só. */
  const aggregateLive = (list: LiveTestRun[]): NodeRun => {
    const failed = list.filter((r) => r.status === "error").length
    const running = list.some((r) => r.status === "running")
    const sum = (pick: (r: LiveTestRun) => number | null | undefined) =>
      list.reduce((acc, r) => acc + (pick(r) ?? 0), 0)
    const withError = list.find((r) => r.status === "error")
    return {
      status: running
        ? "rodando"
        : failed > 0
          ? "erro"
          : apiStatusToNode(list[list.length - 1].status),
      runId: (withError ?? list[list.length - 1]).id,
      // As runs de imagem correm em paralelo: somar duração daria um número
      // que ninguém esperou. A maior é a que o usuário sentiu.
      durSec: Math.max(...list.map((r) => (r.duration_ms ?? 0) / 1000)) || null,
      usd: sum((r) => r.cost_cents) / 100,
      tokIn: sum((r) => r.tokens_input),
      tokOut: sum((r) => r.tokens_output),
      retries: sum((r) => r.retry_count),
      err: withError?.error_message ?? null,
      count: list.length,
      failed,
    }
  }

  const isDone = terminal === "done" || emailStatus === "ready"
  const isError = terminal === "error" || emailStatus === "failed"
  const running = !isDone && !isError ? liveRunningNode(emailStatus, htmlStage) : null

  const out: Record<string, NodeRun> = {}
  let lastActivityIdx = -1
  MAIN_ORDER.forEach((k, i) => {
    if (byAgent.has(k) || k === running) lastActivityIdx = i
  })

  MAIN_ORDER.forEach((key, i) => {
    if (key === "trigger") {
      out[key] = { status: "sucesso", durSec: null }
      return
    }
    if (key === "out") {
      out[key] = isDone
        ? { status: "sucesso", durSec: null }
        : isError
          ? { status: "pulado" }
          : { status: "aguardando" }
      return
    }
    const multi = allByAgent.get(key)
    if (multi && multi.length > 1 && key !== running) {
      out[key] = aggregateLive(multi)
      return
    }
    const r = byAgent.get(key)
    if (r) {
      const st =
        key === running && r.status !== "error" && r.status !== "running"
          ? // Status do email diz que este nó está em curso de novo
            // (retry/nova passada) — o vivo vence a run antiga.
            "rodando"
          : apiStatusToNode(r.status)
      out[key] = {
        status: st,
        runId: r.id,
        durSec: r.duration_ms != null ? r.duration_ms / 1000 : null,
        usd: r.cost_cents != null ? r.cost_cents / 100 : null,
        tokIn: r.tokens_input ?? null,
        tokOut: r.tokens_output ?? null,
        retries: r.retry_count ?? null,
        err: r.error_message ?? null,
      }
      return
    }
    if (key === running) {
      out[key] = { status: "rodando", durSec: null }
      return
    }
    // Sem run e sem estar rodando:
    if (mode === "phase2" && (PHASE1_NODE_KEYS as readonly string[]).includes(key)) {
      out[key] = { status: "pulado" }
      return
    }
    if (!isDone && !isError && i > lastActivityIdx) {
      out[key] = { status: "aguardando" }
    } else {
      out[key] = { status: "pulado" }
    }
  })

  return out
}

// ── Visual das arestas conforme runs ─────────────────────────────────────

export interface EdgeVisual {
  stroke: string
  w: number
  dash: string | null
}

export function edgeVisual(
  from: string,
  to: string,
  runs: Record<string, NodeRun> | null,
): EdgeVisual {
  if (!runs) return { stroke: "#D1D5DB", w: 1.75, dash: null }
  const a = runs[from]
  const b = runs[to]
  if (b && b.status === "erro") return { stroke: "#DC8686", w: 2, dash: null }
  if (
    a &&
    b &&
    a.status === "sucesso" &&
    (b.status === "sucesso" || b.status === "erro" || b.status === "rodando")
  ) {
    return { stroke: "#6EBB9A", w: 2, dash: null }
  }
  return { stroke: "#D1D5DB", w: 1.5, dash: "5 5" }
}

// ── Plano de re-execução por nó ──────────────────────────────────────────

export type RerunMode = "full_pipeline" | "phase2" | "blueprints"

export interface RerunPlan {
  mode: RerunMode
  /** Rótulo do botão. */
  label: string
  /** Explicação curta mostrada no painel. */
  hint: string
}

const PHASE1_KEYS = new Set(["estruturador", "assembler_chooser", "assembler", "blueprint", "subject"])
const PHASE2_KEYS = new Set([
  "image",
  "copy_merge",
  "hero_section",
  "text_format",
  "image_format",
  "color_format",
  "background_fit",
  "qa",
  "qavision",
])

/**
 * Qual re-execução REAL existe para cada nó. O pipeline expõe três
 * alavancas (nenhuma nova foi inventada):
 *   - fase 1: regenerar reference+blueprint da loja (generate-blueprints);
 *   - copy: pipeline completo do email via n8n (full_pipeline);
 *   - fase 2: re-render do email reusando copy (phase2_only).
 * Trigger/out não têm re-execução.
 */
export function rerunPlanFor(nodeKey: string): RerunPlan | null {
  if (PHASE1_KEYS.has(nodeKey)) {
    return {
      mode: "blueprints",
      label: "Regenerar referência",
      hint: "Roda Curador + Montador + Blueprint da loja de novo (fase 1).",
    }
  }
  if (nodeKey === "copy" || nodeKey === "copy_dispatch") {
    return {
      mode: "full_pipeline",
      label: "Reexecutar com copy nova",
      hint: "Pipeline completo deste email: copy nova via n8n e fase 2 na sequência.",
    }
  }
  if (PHASE2_KEYS.has(nodeKey)) {
    return {
      mode: "phase2",
      label: "Reexecutar fase 2",
      hint: "Re-renderiza este email reusando a copy existente (imagem → HTML → QA).",
    }
  }
  return null
}

// ── Meta visual de um nó ─────────────────────────────────────────────────

export interface NodeMeta {
  name: string
  sub: string
  color: string
  bg: string
  border: string
  external: boolean
}

export function nodeMeta(n: StudioNode, modelByAgent?: Record<string, string | null>): NodeMeta {
  if (n.type === "agent" && n.agent) {
    const a = AGENT_VISUAL[n.agent]
    const model = modelByAgent?.[n.agent]
    return {
      name: a.name,
      sub: model ?? (a.external ? "n8n (externo)" : a.desc),
      color: a.color,
      bg: a.bg,
      border: a.border,
      external: a.external === true,
    }
  }
  return {
    name: n.label ?? n.key,
    sub: n.sub ?? "",
    color: "#4B5563",
    bg: "#F3F4F6",
    border: "#E5E7EB",
    external: false,
  }
}
