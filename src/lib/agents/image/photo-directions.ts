/**
 * Direção fotográfica das variantes (migration 20261060), indexada por
 * `variant_id`.
 *
 * Vivia privada dentro do `phase2-runner.service.ts`, e por isso o caminho
 * da regeneração manual (`resolve-block-prompt.service`) nunca a carregou:
 * a var `PHOTO_DIRECTION` saía VAZIA e a imagem regerada à mão perdia a
 * direção de arte escrita no cadastro da variante. Módulo próprio para os
 * dois caminhos lerem do mesmo lugar.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

const log = logger.child("PhotoDirections")

/**
 * Uma query por email em vez de uma por bloco: os blocos de um email
 * costumam repetir variantes (dois blocos de produto da mesma grade), e a
 * direção é o mesmo texto. Blueprint ausente, legado (sem `variant_id`) ou
 * nenhuma direção escrita → mapa vazio, e o prompt de imagem fica idêntico
 * ao de antes.
 */
export async function loadPhotoDirections(
  admin: SupabaseClient,
  blocks: Array<{ variant_id?: string | null }> | undefined,
): Promise<Record<string, string>> {
  const ids = [
    ...new Set(
      (blocks ?? [])
        .map((b) => (b.variant_id ?? "").trim())
        .filter((id): id is string => id.length > 0),
    ),
  ]
  if (ids.length === 0) return {}

  const { data, error } = await admin
    .from("email_component_variants")
    .select("id, photo_direction")
    .in("id", ids)
  if (error) {
    // Sem direção o agente compõe como sempre compôs — não é motivo para
    // derrubar a geração da imagem.
    log.warn("phase2.image.photo_direction_load_failed", {
      error: error.message,
      ids: ids.length,
    })
    return {}
  }

  const out: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{
    id: string
    photo_direction: string | null
  }>) {
    const text = (row.photo_direction ?? "").trim()
    if (text) out[row.id] = text
  }
  return out
}
