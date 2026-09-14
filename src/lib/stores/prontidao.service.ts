/**
 * Prontidão da loja — o I/O. Monta a entrada de `avaliarProntidao` a partir
 * do banco (loja, ÚLTIMA identidade, produtos, ficha, idioma × outline) e
 * grava o run `gate`/`gate_override` na telemetria.
 *
 * Único ponto de leitura: o card da produção (`GET /prontidao`), o
 * enfileiramento (`enqueueDispatchJob`) e as rotas manuais chamam
 * `carregarProntidao` — a régua é uma só, e o card mostra exatamente o que
 * o gate vai decidir.
 *
 * Fail-open na LEITURA: se o banco falhar, a prontidão sai "pronta" com o
 * erro no log — bloquear geração porque uma query caiu seria trocar uma
 * falha barata por uma cara (o precedente é o `resolveQaMode`).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { logGenerationRun } from "@/lib/agents/callbacks/telemetry.callback"
import { carregarIdiomaDaLoja, carregarOutlineComCupom } from "@/lib/agents/objecoes/incentivo-da-loja.service"
import { incentivoDoOutline } from "@/lib/agents/objecoes/incentivo"
import { normalizarFicha } from "./ficha-operacional"
import {
  PILARES_DA_PESQUISA,
  avaliarProntidao,
  resumoDaProntidao,
  type EntradaDeProntidao,
  type Prontidao,
} from "./prontidao"

const log = logger.child("Prontidao")

export type GateMode = "off" | "shadow" | "on"
const GATE_MODES: GateMode[] = ["off", "shadow", "on"]

/**
 * `gate_mode` da org (migration 20261147): `on` corta; `shadow` só grava o
 * run; `off` nem avalia. Env `EMAIL_GATE_MODE` vence o banco (freio de
 * emergência, como o QA).
 */
export async function resolveGateMode(storeId: string): Promise<GateMode> {
  const env = (process.env.EMAIL_GATE_MODE ?? "").trim().toLowerCase()
  if ((GATE_MODES as string[]).includes(env)) return env as GateMode
  try {
    const admin = createAdminClient()
    const { data: store } = await admin.from("client_stores").select("org_id").eq("id", storeId).maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return "on"
    const { data, error } = await admin.from("email_generation_settings").select("gate_mode").eq("org_id", orgId).maybeSingle()
    if (error) {
      log.warn("gate_mode.load_failed", { storeId, error: error.message, hint: "aplicar a migration 20261147" })
      return "on"
    }
    const v = (data as { gate_mode?: unknown } | null)?.gate_mode
    return typeof v === "string" && (GATE_MODES as string[]).includes(v) ? (v as GateMode) : "on"
  } catch {
    return "on"
  }
}

export interface CarregarProntidaoOpts {
  /** Toque de referência para o aviso de cupom (default: welcome 1). */
  flowType?: string
  emailNumber?: number
}

export async function carregarProntidao(storeId: string, opts: CarregarProntidaoOpts = {}): Promise<Prontidao> {
  const admin = createAdminClient()
  try {
    const colunas = [
      "id",
      ...PILARES_DA_PESQUISA.flatMap((p) => p.campos),
      "devolucao_politica",
      "frete_prazo",
      "frete_cobertura",
      "ficha_operacional",
    ].join(", ")
    const [storeRes, identityRes, produtosRes, idioma] = await Promise.all([
      admin.from("client_stores").select(colunas).eq("id", storeId).maybeSingle(),
      admin
        .from("store_brand_identity")
        .select("colors_primary, colors_secondary, logo_main_svg, logo_main_png, logo_alt_svg, logo_alt_png, logo_monogram_svg, logo_monogram_png, font_heading, font_body, trust_icons, confirmed_at, top_products")
        .eq("store_id", storeId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("store_top_products").select("rank").eq("store_id", storeId).limit(5),
      carregarIdiomaDaLoja(admin, storeId).catch(() => null),
    ])
    if (storeRes.error) throw storeRes.error
    const store = (storeRes.data ?? null) as Record<string, unknown> | null
    const identity = (identityRes.data ?? null) as (EntradaDeProntidao["identity"] & { top_products?: unknown }) | null

    // Produtos: tabela viva, senão o snapshot da identidade (mesma cascata
    // do `loadTopProducts`).
    const vivos = (produtosRes.data ?? []).length
    const snapshot = Array.isArray(identity?.top_products) ? (identity!.top_products as unknown[]).length : 0
    const produtos = vivos > 0 ? vivos : snapshot

    const outline = await carregarOutlineComCupom(admin, opts.flowType ?? "welcome", opts.emailNumber ?? 1).catch(() => null)
    const decisao = incentivoDoOutline(outline, idioma)

    const entrada: EntradaDeProntidao = {
      store: store ? ({ ...store, id: storeId } as EntradaDeProntidao["store"]) : null,
      identity,
      produtos,
      ficha: normalizarFicha(store?.ficha_operacional),
      idioma: { codigo: idioma, outline_tem_cupom: decisao.existe, traducao_presente: !decisao.traducao_faltante },
    }
    return avaliarProntidao(entrada)
  } catch (err) {
    log.warn("prontidao.load_failed", { storeId, error: err instanceof Error ? err.message : String(err) })
    return { pronta: true, bloqueios: [], avisos: [] }
  }
}

export interface GateResultado {
  mode: GateMode
  prontidao: Prontidao
  /** true = a geração NÃO deve seguir. */
  bloqueada: boolean
}

/**
 * Avalia, grava o run e decide. `override` (motivo humano) transforma o
 * bloqueio em run `gate_override` e libera. Nunca lança.
 */
export async function aplicarGate(input: {
  storeId: string
  batchId: string
  triggeredBy?: string | null
  origem: string
  override?: { motivo: string } | null
  flowType?: string
  emailNumber?: number
}): Promise<GateResultado> {
  const mode = await resolveGateMode(input.storeId)
  if (mode === "off") return { mode, prontidao: { pronta: true, bloqueios: [], avisos: [] }, bloqueada: false }
  const prontidao = await carregarProntidao(input.storeId, { flowType: input.flowType, emailNumber: input.emailNumber })
  const bloqueiaDeVerdade = mode === "on" && !prontidao.pronta
  const override = bloqueiaDeVerdade && input.override?.motivo?.trim() ? input.override : null
  const bloqueada = bloqueiaDeVerdade && !override

  const base = {
    storeId: input.storeId,
    batchId: input.batchId,
    triggeredBy: input.triggeredBy ?? undefined,
    model: "deterministic",
    costCents: 0,
    durationMs: 0,
    inputSummary: [
      { rotulo: "Origem", cls: "sistema" as const, valor: input.origem },
      { rotulo: "Modo", cls: "sistema" as const, valor: mode },
      { rotulo: "Resultado", cls: "sistema" as const, valor: resumoDaProntidao(prontidao) },
    ],
  }
  const parsed = {
    pronta: prontidao.pronta,
    bloqueios: prontidao.bloqueios,
    avisos: prontidao.avisos,
    modo: mode,
    origem: input.origem,
    ...(override ? { override_motivo: override.motivo.trim() } : {}),
  }
  await logGenerationRun({
    ...base,
    agent: override ? "gate_override" : "gate",
    status: bloqueada ? "skipped" : "success",
    parsedOutput: parsed,
    ...(bloqueada ? { errorMessage: resumoDaProntidao(prontidao) } : {}),
  }).catch((err) => log.warn("gate.run_log_failed", { storeId: input.storeId, error: err instanceof Error ? err.message : String(err) }))

  if (bloqueada) log.info("gate.bloqueado", { storeId: input.storeId, batchId: input.batchId, origem: input.origem, resumo: resumoDaProntidao(prontidao) })
  else if (override) log.info("gate.override", { storeId: input.storeId, batchId: input.batchId, motivo: override.motivo })
  return { mode, prontidao, bloqueada }
}

/** Avisos do run `gate` mais recente de um batch (para a notificação). */
export async function avisosDoBatch(storeId: string, batchId: string): Promise<string[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("email_generation_runs")
      .select("parsed_output")
      .eq("store_id", storeId)
      .eq("batch_id", batchId)
      .in("agent", ["gate", "gate_override"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const avisos = (data as { parsed_output?: { avisos?: Array<{ titulo?: string }> } } | null)?.parsed_output?.avisos
    return Array.isArray(avisos) ? avisos.map((a) => a.titulo).filter((t): t is string => typeof t === "string") : []
  } catch {
    return []
  }
}
