/**
 * color-plano-mode — o kill-switch do ritmo de faixas e dos botões.
 *
 * Até esta frente, o agente Cores & Botões nunca alterava a APARÊNCIA da
 * peça: trocava valores de cor por valores da paleta, e o resultado era mais
 * conforme, não diferente. Escurecer uma faixa, inverter um botão e inserir
 * um CTA mudam o desenho — e por isso entram atrás de um interruptor, no
 * padrão que a casa já usa (`montador_mode`, `seletor_mode`,
 * `blueprint_mode`).
 *
 * - `off`   — comportamento anterior: só as ops de VALOR (`valores`) são
 *             aplicadas. O plano continua sendo gravado.
 * - `shadow` — o agente decide tudo, o plano é gravado na run e **nada de
 *             faixa/botão é aplicado**. É onde se lê se as decisões fazem
 *             sentido antes de deixá-las mexer em peça de cliente: com 4.877
 *             tokens de system, o risco não é o custo, é a obediência.
 * - `on`    — aplica.
 *
 * O default é `shadow`: a frente nasce medindo. Falha de leitura também cai
 * em `shadow` — o lado seguro de errar aqui é decidir e não aplicar, nunca
 * aplicar sem querer.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("ColorPlanoMode")

export const COLOR_PLANO_MODES = ["off", "shadow", "on"] as const
export type ColorPlanoMode = (typeof COLOR_PLANO_MODES)[number]

export const COLOR_PLANO_MODE_PADRAO: ColorPlanoMode = "shadow"

export function normalizarModo(valor: unknown): ColorPlanoMode {
  return (COLOR_PLANO_MODES as readonly string[]).includes(valor as string)
    ? (valor as ColorPlanoMode)
    : COLOR_PLANO_MODE_PADRAO
}

/** Só as ops de faixa e botão dependem do modo; as de valor rodam sempre. */
export function aplicaFaixasEBotoes(modo: ColorPlanoMode): boolean {
  return modo === "on"
}

export async function loadColorPlanoMode(storeId: string): Promise<ColorPlanoMode> {
  try {
    const admin = createAdminClient()
    const { data: store } = await admin
      .from("client_stores")
      .select("org_id")
      .eq("id", storeId)
      .maybeSingle()
    const orgId = (store as { org_id?: string | null } | null)?.org_id
    if (!orgId) return COLOR_PLANO_MODE_PADRAO
    const { data, error } = await admin
      .from("email_generation_settings")
      .select("color_plano_mode")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) {
      // Coluna ausente (migration não aplicada) é o caso comum aqui — a
      // migration deste repo é aplicada à mão e escorrega. Degrada para o
      // padrão e DIZ, em vez de sumir: é a lição do `copy_fit`, que passou
      // quatro dias sem gravar run porque o CHECK não tinha o valor.
      log.warn("color_plano_mode.load_failed", { storeId, error: error.message })
      return COLOR_PLANO_MODE_PADRAO
    }
    return normalizarModo((data as { color_plano_mode?: string | null } | null)?.color_plano_mode)
  } catch {
    return COLOR_PLANO_MODE_PADRAO
  }
}
