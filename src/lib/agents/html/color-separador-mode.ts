/**
 * color-separador-mode — o interruptor da separação entre seções.
 *
 * Desenho de `color-plano-mode.ts`, com uma diferença deliberada: este
 * nasce **`on`**. O que substituiu a leitura em shadow foi olhar as oito
 * formas do catálogo renderizadas no Chromium antes de subir — e foi esse
 * olhar que pegou o defeito que nenhum teste pegaria (com tinta de baixo
 * contraste, as quatro formas de "marca" somem da tela; ver
 * `separador-tinta.ts`).
 *
 * - `off`    — o catálogo não entra no prompt e nenhuma op é emitida. O
 *              prompt fica byte a byte o de antes desta frente.
 * - `shadow` — o agente decide, o plano é gravado na run e nada é
 *              inserido.
 * - `on`     — aplica.
 *
 * A env **vence o banco**: é o freio que não depende do Postgres
 * responder, o mesmo arranjo de `EMAIL_QA_MODE`. Falha de leitura cai no
 * padrão e DIZ — a migration deste repo é aplicada à mão e escorrega.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ColorSeparadorMode")

export const SEPARADOR_MODES = ["off", "shadow", "on"] as const
export type SeparadorMode = (typeof SEPARADOR_MODES)[number]

export const SEPARADOR_MODE_PADRAO: SeparadorMode = "on"

export function normalizarSeparadorMode(valor: unknown): SeparadorMode {
  return (SEPARADOR_MODES as readonly string[]).includes(valor as string)
    ? (valor as SeparadorMode)
    : SEPARADOR_MODE_PADRAO
}

/** Em `off` o catálogo nem é servido: o agente não decide o que não vê. */
export function serveCatalogo(modo: SeparadorMode): boolean {
  return modo !== "off"
}

/** Só `on` insere. Em `shadow` o plano é gravado e o documento não muda. */
export function aplicaSeparacoes(modo: SeparadorMode): boolean {
  return modo === "on"
}

export async function loadSeparadorMode(storeId: string): Promise<SeparadorMode> {
  const daEnv = process.env.EMAIL_SEPARADOR_MODE
  if (daEnv && (SEPARADOR_MODES as readonly string[]).includes(daEnv)) {
    return daEnv as SeparadorMode
  }
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return SEPARADOR_MODE_PADRAO
    const { data, error } = await admin
      .from("email_generation_settings")
      .select("color_separador_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) {
      log.warn("color_separador_mode.load_failed", {
        storeId,
        error: error.message,
        hint: "aplicar a migration 20261160",
      })
      return SEPARADOR_MODE_PADRAO
    }
    return normalizarSeparadorMode(
      (data as { color_separador_mode?: string | null } | null)?.color_separador_mode,
    )
  } catch {
    return SEPARADOR_MODE_PADRAO
  }
}
