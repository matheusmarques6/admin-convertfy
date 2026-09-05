/**
 * Guarda de tamanho do payload de webhook — lógica pura, testável.
 *
 * A Evolution embute mídia em base64 no JSON do webhook. Persistíamos o
 * payload cru inteiro em `crm_webhook_events.raw_payload`: 12 linhas
 * chegaram a ocupar 266 MB (250 MB de TOAST), e era essa tabela que o
 * cron varria de minuto em minuto.
 *
 * A configuração da origem não é confiável (há relatos de payloads de
 * 12 MB com `webhookBase64` desligado — EvolutionAPI/evolution-api#956),
 * então a guarda fica do NOSSO lado. O que sai daqui é o que vai para o
 * banco; a mídia continua recuperável pelo `getBase64FromMediaMessage`,
 * que o processor já usa quando o base64 não vem no evento.
 */

/** Acima disto, a linha vira TOAST e o custo deixa de ser o dado. */
export const MAX_RAW_PAYLOAD_BYTES = 256 * 1024

/** Campos que carregam binário embutido, em qualquer profundidade. */
const HEAVY_KEYS = new Set(["base64", "jpegThumbnail", "thumbnailDirectPath", "fileEncSha256"])

export interface StripResult<T> {
  payload: T
  /** true quando algo foi removido — o processor busca a mídia depois. */
  stripped: boolean
  originalBytes: number
}

function stripDeep(value: unknown, state: { stripped: boolean }): unknown {
  if (Array.isArray(value)) return value.map((v) => stripDeep(v, state))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (HEAVY_KEYS.has(k) && typeof v === "string" && v.length > 0) {
        state.stripped = true
        continue
      }
      out[k] = stripDeep(v, state)
    }
    return out
  }
  return value
}

/**
 * Remove os campos pesados quando o payload passa do teto (ou sempre,
 * com `force`). Abaixo do teto devolve o objeto original — o payload cru
 * é o que torna o evento reprocessável, e não queremos perdê-lo à toa.
 */
export function stripHeavyFields<T>(
  payload: T,
  opts: { force?: boolean; maxBytes?: number } = {},
): StripResult<T> {
  const maxBytes = opts.maxBytes ?? MAX_RAW_PAYLOAD_BYTES
  let originalBytes = 0
  try {
    originalBytes = JSON.stringify(payload)?.length ?? 0
  } catch {
    // Payload não serializável não deveria chegar aqui; se chegar, é o
    // insert que vai reclamar, não esta função.
    return { payload, stripped: false, originalBytes: 0 }
  }

  if (!opts.force && originalBytes <= maxBytes) {
    return { payload, stripped: false, originalBytes }
  }

  const state = { stripped: false }
  const cleaned = stripDeep(payload, state) as T
  return { payload: cleaned, stripped: state.stripped, originalBytes }
}
