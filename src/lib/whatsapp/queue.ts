/**
 * Fila QStash (Upstash) pro processamento assíncrono de webhooks.
 *
 * O webhook persiste o evento cru em crm_webhook_events e publica só o
 * eventId; o worker (/api/workers/whatsapp-webhook) faz claim atômico e
 * processa. Sem QStash configurado, enqueue retorna null e o caller cai
 * no processamento inline (o cron de reprocess cobre falhas nos dois
 * modos).
 */

import { Client, Receiver } from "@upstash/qstash"
import { logger } from "@/lib/logger"

const log = logger.child("WhatsAppQueue")

export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN)
}

function appUrl(): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return null
}

/**
 * Publica o eventId no QStash apontando pro worker. Retorna o messageId
 * do QStash ou null (não configurado / falha de publish — quem cobre é
 * o cron de reprocess; nunca lança).
 */
export async function enqueueWhatsAppWebhookEvent(eventId: string): Promise<string | null> {
  const token = process.env.QSTASH_TOKEN
  const base = appUrl()
  if (!token || !base) {
    if (!base) log.warn("NEXT_PUBLIC_APP_URL/VERCEL_URL ausentes — enqueue pulado")
    return null
  }

  try {
    const client = new Client({
      token,
      // Endpoint regional opcional (GeoDNS do endereço global já falhou
      // em produção no worder — ver docs de setup).
      ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
    })
    const result = await client.publishJSON({
      url: `${base}/api/workers/whatsapp-webhook`,
      body: { eventId },
      retries: 3,
    })
    return result.messageId ?? null
  } catch (error) {
    log.error("enqueue falhou (cron de reprocess cobre)", {
      eventId,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Verifica a assinatura do QStash (Upstash-Signature) sobre o raw body.
 * Fail-closed em produção; em dev sem signing keys, aceita (facilita
 * teste local com curl).
 */
export async function verifyQStashRequest(
  rawBody: string,
  signature: string | null,
  requestUrl?: string,
): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY

  if (!currentKey || !nextKey) {
    if (process.env.NODE_ENV === "production") {
      log.error("QSTASH signing keys ausentes em produção — request rejeitada")
      return false
    }
    return true
  }

  if (!signature) return false

  try {
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey })
    await receiver.verify({ body: rawBody, signature, url: requestUrl })
    return true
  } catch {
    return false
  }
}
