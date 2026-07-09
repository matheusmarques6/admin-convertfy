/**
 * Guard de identidade da loja nos callbacks de Pesquisa & Diagnóstico do n8n.
 *
 * Os callbacks (brand/icp/tone/store-story/ads-analyzer/competitors/
 * top-products) gravam em `client_stores` confiando cegamente no `store_id`
 * que o n8n ecoa. Quando o workflow cruza execuções (retry com payload
 * antigo, variável global vazada, pesquisa do domínio errado), a pesquisa
 * de UMA loja é gravada em OUTRA — e briefing/copy saem contaminados.
 *
 * Este guard é a trava do lado de cá: se o n8n enviar `store_url` no body
 * (echo do payload que recebeu), comparamos o host com o da loja do
 * `store_id`. Divergiu → 409, nada é gravado. Sem `store_url` no body o
 * guard é no-op (retrocompatível com o workflow atual do n8n; atualizar o
 * workflow para ecoar `store_url` liga a proteção).
 */

import { createAdminClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"

const log = logger.child("N8nStoreGuard")

/** "https://www.vorrelle.com/x?y" → "vorrelle.com" (null se não parsear). */
export function normalizeStoreHost(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null
  const trimmed = url.trim().toLowerCase()
  if (!trimmed) return null
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const host = new URL(withProto).hostname
    return host.replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/**
 * Lança 409 quando o `store_url` ecoado pelo n8n não bate com o host da
 * loja do `store_id`. No-op quando o body não traz `store_url` ou quando
 * algum dos lados não é parseável (não bloqueia por dado ruim — só por
 * divergência inequívoca).
 */
export async function assertStoreUrlMatches(
  storeId: string,
  providedUrl: string | null | undefined,
  context: string,
): Promise<void> {
  const provided = normalizeStoreHost(providedUrl)
  if (!provided) return

  const admin = createAdminClient()
  const { data } = await admin
    .from("client_stores")
    .select("store_url")
    .eq("id", storeId)
    .maybeSingle()
  const expected = normalizeStoreHost(
    (data as { store_url?: string | null } | null)?.store_url,
  )
  if (!expected) return

  if (provided !== expected) {
    log.error("store_url_mismatch", {
      context,
      storeId,
      expected,
      provided,
    })
    throw new AppError(
      `store_url divergente: payload é de "${provided}" mas o store_id pertence a "${expected}" — gravação recusada para não contaminar a pesquisa da loja errada`,
      409,
    )
  }
}
