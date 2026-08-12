/**
 * Normalizador do envelope da copy que volta do n8n.
 *
 * O contrato é `content[key] = valor` — chaves do schema no primeiro nível,
 * é assim que o `copy_merge` ancora e que o callback audita. Mas o payload de
 * IDA leva o contrato em `schema.campos`, e o flow do n8n espelhou essa
 * estrutura na VOLTA (Luxe Lift, 12/08):
 *
 *     {"campos": [ {"key": "hero_headline", "valor": "We saved it for you"} ]}
 *
 * A copy estava perfeita — todas as 24 chaves, com os nomes exatos do
 * contrato — só que um nível fundo demais. O callback lia
 * `content["hero_headline"]`, achava `undefined`, e o run registrava
 * `taxa_pct: 0` com uma única chave recebida por bloco (`campos`). Daí
 * `merged: 0`, os 20 slots caíam no `text_format`, que improvisava: copy
 * repetida em três seções e os depoimentos removidos por "slot vazio".
 *
 * Desembrulhar aqui, e não no n8n, é deliberado e DEFINITIVO — não é ponte
 * para uma migração futura. O flow é editado por fora, já mudou de formato
 * duas vezes, e quem tem de se adaptar é quem recebe. As duas formas são
 * suportadas em pé de igualdade; nenhuma é "a errada".
 *
 * Puro — sem I/O, testável.
 */

/** Nomes que o flow já usou para embrulhar as chaves. */
const WRAPPERS = ["campos", "fields"] as const

/** Nomes que o flow já usou para o valor dentro de cada item. */
const VALUE_KEYS = ["valor", "value", "content", "texto"] as const

export interface EnvelopeReport {
  /** Chaves promovidas do embrulho para o primeiro nível. */
  unwrapped: string[]
  /** Nome do embrulho encontrado (`campos`/`fields`), ou null. */
  wrapper: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Primeiro valor não-vazio entre os apelidos conhecidos. */
function readValue(item: Record<string, unknown>): unknown {
  for (const k of VALUE_KEYS) {
    const v = item[k]
    if (typeof v === "string" ? v.trim() !== "" : v != null) return v
  }
  return undefined
}

/**
 * Achata `{campos: [...]}` / `{campos: {...}}` para o primeiro nível.
 *
 * O que já está no primeiro nível VENCE: `image_url`/`image_alt` são
 * gravados pelo agente de imagem depois da copy, e um embrulho que
 * repetisse a chave não pode desfazer isso.
 *
 * Formato plano (o contrato) passa intacto — inclusive o objeto vazio.
 */
export function normalizeCopyEnvelope(content: unknown): {
  content: Record<string, unknown>
  report: EnvelopeReport
} {
  const empty: EnvelopeReport = { unwrapped: [], wrapper: null }
  if (!isRecord(content)) return { content: {}, report: empty }

  const wrapper = WRAPPERS.find((w) => content[w] != null)
  if (!wrapper) return { content, report: empty }

  const raw = content[wrapper]
  const flat: Record<string, unknown> = {}

  if (Array.isArray(raw)) {
    // [{key, valor}] — a forma que o n8n devolveu.
    for (const item of raw) {
      if (!isRecord(item)) continue
      const key = typeof item.key === "string" ? item.key.trim() : ""
      if (!key) continue
      const value = readValue(item)
      if (value === undefined) continue
      flat[key] = value
    }
  } else if (isRecord(raw)) {
    // {hero_headline: "..."} — embrulho de mapa, mesma correção.
    for (const [key, value] of Object.entries(raw)) {
      if (key.trim() === "") continue
      flat[key] = value
    }
  } else {
    // `campos` escalar não é envelope — deixa o bloco como está para o
    // callback registrar o desvio em vez de a gente inventar um formato.
    return { content, report: empty }
  }

  const rest = { ...content }
  delete rest[wrapper]

  return {
    // `rest` por último: o primeiro nível vence o embrulho.
    content: { ...flat, ...rest },
    report: {
      unwrapped: Object.keys(flat),
      wrapper,
    },
  }
}
