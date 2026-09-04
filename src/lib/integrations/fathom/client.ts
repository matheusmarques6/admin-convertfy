/**
 * Cliente da API pública do Fathom (server-only).
 *
 *   Base: https://api.fathom.ai/external/v1
 *   Auth: header `X-Api-Key`
 *   Limite: 60 requisições/minuto (documentado pelo Fathom)
 *
 * A chave é da CONTA Fathom da agência: vem de `FATHOM_API_KEY` ou da
 * tabela `settings` (key `fathom_api_key`, criptografada) — mesmo
 * padrão zero-migration usado em store_mcp_tokens/store_health_rules,
 * para o operador poder trocar sem deploy.
 *
 * Resolver link → reunião:
 *  - link /calls/<id>: busca direta pelo id da gravação;
 *  - link /share/<slug>: o slug não é endereçável na API, então
 *    varremos /meetings (páginas curtas, janela de 180 dias) casando
 *    share_url/url. É por isso que o link da gravação é preferível —
 *    a UI diz isso ao operador.
 */

import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/crypto"
import { logger } from "@/lib/logger"
import { buildFathomDigest, type FathomDigest, type FathomMeetingRaw } from "./meeting-digest"
import { parseFathomUrl } from "./parse-url"

const log = logger.child("Fathom")

const BASE_URL = "https://api.fathom.ai/external/v1"
const TIMEOUT_MS = 20_000
/** Páginas varridas ao procurar um share link (50 reuniões cada). */
const MAX_SHARE_PAGES = 6
const SHARE_WINDOW_DAYS = 180

export const FATHOM_SETTINGS_KEY = "fathom_api_key"

export class FathomError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "FathomError"
  }
}

let cachedKey: { value: string | null; expiresAt: number } | null = null

/** Chave da API: env primeiro, settings depois (cache de 60s). */
export async function getFathomApiKey(): Promise<string | null> {
  const fromEnv = process.env.FATHOM_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const now = Date.now()
  if (cachedKey && cachedKey.expiresAt > now) return cachedKey.value
  let value: string | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", FATHOM_SETTINGS_KEY)
      .maybeSingle()
    const raw = (data?.value ?? null) as { encrypted?: string } | string | null
    if (typeof raw === "string" && raw) value = decrypt(raw)
    else if (raw && typeof raw === "object" && raw.encrypted) value = decrypt(raw.encrypted)
  } catch (err) {
    log.warn("leitura da chave falhou", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  cachedKey = { value, expiresAt: now + 60_000 }
  return value
}

/** Zera o cache da chave (usado ao salvar uma nova). */
export function resetFathomKeyCache(): void {
  cachedKey = null
}

async function fathomGet<T>(path: string, apiKey: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    })
    if (resp.status === 401 || resp.status === 403) {
      throw new FathomError(
        "Chave da API do Fathom inválida ou sem permissão — revise em Configurações.",
        resp.status,
      )
    }
    if (resp.status === 404) {
      throw new FathomError("Reunião não encontrada no Fathom com esse link.", 404)
    }
    if (resp.status === 429) {
      throw new FathomError(
        "Limite de requisições do Fathom atingido (60/min) — tente de novo em 1 minuto.",
        429,
      )
    }
    if (!resp.ok) {
      const snippet = (await resp.text().catch(() => "")).slice(0, 200)
      throw new FathomError(`Fathom respondeu ${resp.status}: ${snippet}`, resp.status)
    }
    return (await resp.json()) as T
  } catch (err) {
    if (err instanceof FathomError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new FathomError("Fathom demorou demais para responder — tente de novo.")
    }
    throw new FathomError(err instanceof Error ? err.message : String(err))
  } finally {
    clearTimeout(timer)
  }
}

interface MeetingsPage {
  items?: FathomMeetingRaw[]
  next_cursor?: string | null
}

function includesQuery(): string {
  return "include_transcript=true&include_summary=true&include_action_items=true"
}

/** Reunião pelo id da gravação (caminho rápido, 1 requisição). */
async function meetingByRecordingId(
  recordingId: string,
  apiKey: string,
): Promise<FathomMeetingRaw | null> {
  // A listagem aceita os includes num payload só; filtrar pelo id
  // evita depender de endpoints por-gravação que variam de plano.
  const page = await fathomGet<MeetingsPage>(
    `/meetings?${includesQuery()}&limit=50`,
    apiKey,
  )
  const match = (page.items ?? []).find(
    (m) => String(m.recording_id ?? "") === recordingId,
  )
  if (match) return match
  // Não estava na primeira página: tenta o endpoint direto da gravação
  try {
    const [summary, transcript] = await Promise.all([
      fathomGet<Record<string, unknown>>(`/recordings/${recordingId}/summary`, apiKey),
      fathomGet<{ transcript?: FathomMeetingRaw["transcript"] }>(
        `/recordings/${recordingId}/transcript`,
        apiKey,
      ).catch(() => ({ transcript: null })),
    ])
    return {
      recording_id: recordingId,
      ...(summary as FathomMeetingRaw),
      transcript: transcript.transcript ?? null,
    }
  } catch (err) {
    if (err instanceof FathomError && err.status === 404) return null
    throw err
  }
}

/** Reunião pelo slug do link público — varredura paginada. */
async function meetingByShareSlug(
  slug: string,
  apiKey: string,
): Promise<FathomMeetingRaw | null> {
  const createdAfter = new Date(
    Date.now() - SHARE_WINDOW_DAYS * 86_400_000,
  ).toISOString()
  let cursor: string | null = null
  for (let page = 0; page < MAX_SHARE_PAGES; page++) {
    const qs = new URLSearchParams({ created_after: createdAfter, limit: "50" })
    if (cursor) qs.set("cursor", cursor)
    const data: MeetingsPage = await fathomGet<MeetingsPage>(
      `/meetings?${includesQuery()}&${qs.toString()}`,
      apiKey,
    )
    const match = (data.items ?? []).find(
      (m) =>
        (m.share_url ?? "").includes(slug) || (m.url ?? "").includes(slug),
    )
    if (match) return match
    cursor = data.next_cursor ?? null
    if (!cursor) break
  }
  return null
}

/**
 * Resolve o link colado pelo operador num digest pronto para gravar.
 * Lança FathomError com mensagem em pt-BR pronta para a tela.
 */
export async function fetchFathomMeetingByUrl(url: string): Promise<FathomDigest> {
  const link = parseFathomUrl(url)
  if (!link) {
    throw new FathomError(
      "Link do Fathom inválido. Cole o link da gravação (fathom.video/calls/123456789) ou o de compartilhamento (fathom.video/share/abc123).",
      400,
    )
  }
  const apiKey = await getFathomApiKey()
  if (!apiKey) {
    throw new FathomError(
      "Fathom não conectado: falta a chave da API (FATHOM_API_KEY ou Configurações → Integrações).",
      412,
    )
  }

  const started = Date.now()
  const meeting =
    link.kind === "recording"
      ? await meetingByRecordingId(link.recordingId, apiKey)
      : await meetingByShareSlug(link.slug, apiKey)

  if (!meeting) {
    throw new FathomError(
      link.kind === "share"
        ? `Não achei essa reunião nas gravações dos últimos ${SHARE_WINDOW_DAYS} dias da conta. Use o link da gravação (fathom.video/calls/…) se a call for mais antiga.`
        : "Reunião não encontrada no Fathom com esse link.",
      404,
    )
  }

  const digest = buildFathomDigest(meeting)
  if (!digest) {
    throw new FathomError("O Fathom devolveu a reunião sem id de gravação — não dá para importar.")
  }
  log.info("reunião importada", {
    recording_id: digest.recording_id,
    kind: link.kind,
    ms: Date.now() - started,
    action_items: digest.action_items.length,
    has_summary: Boolean(digest.summary_markdown),
  })
  // O link que o operador colou é a referência que ele reconhece
  return { ...digest, url: digest.url ?? link.url }
}
