/**
 * Pushover — push para o celular (Fase 0: piloto single-user).
 *
 * Nesta fase TODO push vai para UMA user key fixa (env
 * PUSHOVER_PILOT_USER_KEY) — a conta do operador piloto. O sino
 * in-app continua para todos os membros normalmente; o push é uma
 * camada adicional. Fase 1 (futura): key por usuário em
 * notification_preferences + tela de configuração + envio em lote
 * (até 50 keys por request).
 *
 * Envs:
 *  - PUSHOVER_APP_TOKEN      → token da application (pushover.net/apps/build)
 *  - PUSHOVER_PILOT_USER_KEY → user key do celular piloto
 *  - PUSHOVER_ALERT_PRIORITY → prioridade dos alertas de canal
 *    ("0" normal | "1" fura o modo silencioso do Pushover; default "1")
 *
 * Best-effort SEMPRE: nenhuma função lança — falha de push não pode
 * derrubar webhook nem rota. Erros viram log.warn.
 *
 * Quota (plano grátis): 10.000 msgs/mês por CONTA. O header
 * X-Limit-App-Remaining vem em toda resposta — logamos warn quando
 * baixar de 1.000 para dar tempo de reagir antes do 429.
 *
 * Referência: https://pushover.net/api · docs/crm/pushover-push.md
 */

import { logger } from "@/lib/logger"

const log = logger.child("Pushover")

const PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json"
const REQUEST_TIMEOUT_MS = 10_000
const QUOTA_WARN_THRESHOLD = 1_000

/** TTL dos pushes de mensagem do inbox — auto-limpa do celular em 24h. */
export const INBOX_PUSH_TTL_SECONDS = 24 * 60 * 60

export interface PushoverMessage {
  title: string
  message: string
  /** Caminho relativo do admin (ex: /admin/inbox?thread=x) ou URL absoluta. */
  url?: string
  urlTitle?: string
  /** -2..2 (Pushover). Default 0. */
  priority?: number
  /** Segundos até o push se auto-deletar do device. */
  ttl?: number
  sound?: string
}

export function isPushoverConfigured(): boolean {
  return Boolean(process.env.PUSHOVER_APP_TOKEN && process.env.PUSHOVER_PILOT_USER_KEY)
}

/** Prioridade dos alertas de canal (env com default 1 — ver docs). */
export function channelAlertPriority(): number {
  // trim + truthy: env vazia ("") deve cair no default (Number("") === 0!)
  const raw = process.env.PUSHOVER_ALERT_PRIORITY?.trim()
  const parsed = raw ? Number(raw) : NaN
  return Number.isInteger(parsed) && parsed >= -2 && parsed <= 1 ? parsed : 1
}

/** Pura, testável: monta o body form-urlencoded do POST. */
export function buildPushoverParams(
  args: PushoverMessage & { token: string; user: string; appBaseUrl?: string | null },
): URLSearchParams {
  const params = new URLSearchParams()
  params.set("token", args.token)
  params.set("user", args.user)
  // Limites da API: message 1024, title 250, url 512, url_title 100.
  params.set("message", args.message.slice(0, 1024))
  params.set("title", args.title.slice(0, 250))
  if (args.url) {
    const absolute = args.url.startsWith("http")
      ? args.url
      : args.appBaseUrl
        ? `${args.appBaseUrl}${args.url}`
        : null
    if (absolute) {
      params.set("url", absolute.slice(0, 512))
      if (args.urlTitle) params.set("url_title", args.urlTitle.slice(0, 100))
    }
  }
  if (args.priority !== undefined && args.priority !== 0) params.set("priority", String(args.priority))
  if (args.ttl) params.set("ttl", String(args.ttl))
  if (args.sound) params.set("sound", args.sound)
  return params
}

/**
 * Envia um push para o celular piloto. Nunca lança; no-op silencioso
 * quando as envs não estão configuradas.
 */
export async function sendPilotPush(msg: PushoverMessage): Promise<void> {
  const token = process.env.PUSHOVER_APP_TOKEN
  const user = process.env.PUSHOVER_PILOT_USER_KEY
  if (!token || !user) return

  try {
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? null
    const params = buildPushoverParams({ ...msg, token, user, appBaseUrl })

    const response = await fetch(PUSHOVER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const remaining = Number(response.headers.get("x-limit-app-remaining"))
    if (Number.isFinite(remaining) && remaining < QUOTA_WARN_THRESHOLD) {
      log.warn("quota Pushover baixando — considerar upgrade/limpeza", { remaining })
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      // 4xx = input inválido (não adianta repetir); 429 = quota estourada
      log.warn("push falhou", { status: response.status, body: body.slice(0, 300) })
      return
    }

    log.info("push enviado", { title: msg.title, priority: msg.priority ?? 0 })
  } catch (err) {
    log.warn("push falhou (best-effort)", {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
