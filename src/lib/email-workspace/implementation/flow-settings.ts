/**
 * Config global do "Setup de Implementação" por flow type — editável em
 * Configurações (`/admin/settings/implementation`) e persistido na tabela
 * global `settings` (key `implementation_flow_setup`, value JSONB).
 *
 * Os campos (Gatilho/Público/Evento/UTM) eram constantes hardcoded; agora
 * `FLOW_META_DEFAULTS` + UTM defaults são o FALLBACK e os overrides salvos
 * vencem. Funções puras — usadas pela API, pela página e pela tela de
 * implementação.
 */

import type { FlowType } from "@/types/email-workspace"
import { FLOW_META_DEFAULTS, IMPLEMENTATION_FLOW_TYPES } from "./flow-meta"
import { UTM_SOURCE_DEFAULT, UTM_MEDIUM_DEFAULT } from "./utm"

/** Key da row na tabela global `settings`. */
export const FLOW_SETUP_SETTINGS_KEY = "implementation_flow_setup"

export interface FlowSetupConfig {
  trigger: string
  audience: string
  metricEvent: string
  utmSource: string
  utmMedium: string
}

/** Overrides salvos: parcial por flow type (campos faltantes caem no default). */
export type FlowSetupOverrides = Partial<
  Record<FlowType, Partial<FlowSetupConfig>>
>

/** Config efetiva resolvida pra todos os flows da UI. */
export type ResolvedFlowSetup = Record<string, FlowSetupConfig>

/** Default de um flow type (constantes de flow-meta + UTM). */
export function defaultFlowSetup(flowType: FlowType): FlowSetupConfig {
  const meta = FLOW_META_DEFAULTS[flowType] ?? FLOW_META_DEFAULTS.custom
  return {
    trigger: meta.trigger,
    audience: meta.audience,
    metricEvent: meta.metricEvent,
    utmSource: UTM_SOURCE_DEFAULT,
    utmMedium: UTM_MEDIUM_DEFAULT,
  }
}

/** Trim defensivo: ignora strings vazias do override (caem no default). */
function pick(override: string | undefined, fallback: string): string {
  const v = (override ?? "").trim()
  return v || fallback
}

/** Merge de um override sobre o default de um flow type. */
export function resolveFlowSetupFor(
  flowType: FlowType,
  overrides?: FlowSetupOverrides,
): FlowSetupConfig {
  const base = defaultFlowSetup(flowType)
  const o = overrides?.[flowType]
  if (!o) return base
  return {
    trigger: pick(o.trigger, base.trigger),
    audience: pick(o.audience, base.audience),
    metricEvent: pick(o.metricEvent, base.metricEvent),
    utmSource: pick(o.utmSource, base.utmSource),
    utmMedium: pick(o.utmMedium, base.utmMedium),
  }
}

/** Resolve a config efetiva de todos os flow types da UI de implementação. */
export function resolveFlowSetup(
  overrides?: FlowSetupOverrides,
): ResolvedFlowSetup {
  const out: ResolvedFlowSetup = {}
  for (const ft of IMPLEMENTATION_FLOW_TYPES) {
    out[ft] = resolveFlowSetupFor(ft, overrides)
  }
  return out
}
