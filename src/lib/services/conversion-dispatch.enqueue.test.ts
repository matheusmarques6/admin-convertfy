/**
 * Enfileiramento dos eventos de conversão.
 *
 * Existe por causa de um defeito medido em produção: entre 06/08 e
 * 29/08 de 2026, treze cadastros e ZERO linhas em
 * `crm_conversion_events`. O enqueue fazia `upsert` em lote com
 * `onConflict`, o índice de dedupe era PARCIAL, o Postgres recusava a
 * statement inteira com 42P10 e o código fazia `log.error` + `return`.
 * O "Lead" morria junto com o "LeadQualificado", sem nada em tela.
 *
 * A regra que estes testes travam: **uma linha que falha nunca leva a
 * outra junto**, e só o 23505 conta como "já estava lá".
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const inserts: Array<Record<string, unknown>> = []
/** Erro a devolver por índice de chamada; `null` = inseriu. */
let errosPorChamada: Array<{ code: string; message: string } | null> = []
const enviados: string[] = []

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        const i = inserts.length
        inserts.push(row)
        const erro = errosPorChamada[i] ?? null
        return {
          select: () => ({
            maybeSingle: async () =>
              erro
                ? { data: null, error: erro }
                : {
                    data: {
                      id: `row-${i}`,
                      form_id: row.form_id,
                      updated_at: "2026-09-11T00:00:00Z",
                      attempts: 0,
                      payload: row.payload,
                    },
                    error: null,
                  },
          }),
        }
      },
      // Encadeamento permissivo: o claim usa
      // `.eq().eq().select().maybeSingle()` e a gravação do desfecho usa
      // só `.eq()`. Um objeto que responde a tudo cobre os dois sem
      // acoplar o teste à ordem exata das chamadas.
      update: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.select = () => chain
        chain.maybeSingle = async () => ({ data: { id: "claimed" }, error: null })
        return chain
      },
    }),
  }),
}))

vi.mock("@/lib/crypto", () => ({ decrypt: () => "token-aberto" }))

vi.mock("@/lib/integrations/meta-capi", async () => {
  const real = await vi.importActual<typeof import("@/lib/integrations/meta-capi")>(
    "@/lib/integrations/meta-capi",
  )
  return {
    ...real,
    sendMetaConversionEvent: async ({ event }: { event: { event_name: string } }) => {
      enviados.push(event.event_name)
      return { ok: true, status: 200, body: { events_received: 1 } }
    },
  }
})

const { enqueueConversionEvents } = await import("./conversion-dispatch.service")

/**
 * O envio inline roda destacado (`void Promise.allSettled`) porque em
 * serverless o processo congela depois da resposta. Para observá-lo no
 * teste é preciso deixar a fila de microtasks correr.
 */
const deixarOEnvioCorrer = () => new Promise((r) => setTimeout(r, 0))

const params = (over: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  formId: "form-1",
  submissionId: "sub-1",
  leadId: "lead-1",
  eventId: "evt-1",
  qualified: true,
  qualifiedEventName: "LeadQualificado",
  eventSourceUrl: "https://app.convertfy.me/forms/pagina-de-vendas",
  meta: { pixelId: "694200440166500", capiTokenEnc: "enc:v1:x", testEventCode: null },
  lead: { email: "a@b.com", phone: null, firstName: "A", lastName: null },
  request: { ip: null, userAgent: null, fbc: null, fbp: null },
  ...over,
})

beforeEach(() => {
  inserts.length = 0
  enviados.length = 0
  errosPorChamada = []
})

describe("enqueueConversionEvents", () => {
  it("insere UMA statement por evento, nunca as duas juntas", async () => {
    await enqueueConversionEvents(params())
    expect(inserts).toHaveLength(2)
    expect(inserts.map((r) => r.event_name)).toEqual(["Lead", "LeadQualificado"])
  })

  it("o qualificado só entra quando qualifica", async () => {
    await enqueueConversionEvents(params({ qualified: false }))
    expect(inserts.map((r) => r.event_name)).toEqual(["Lead"])
  })

  it("erro no qualificado NÃO derruba o Lead — era esse o defeito", async () => {
    errosPorChamada = [null, { code: "42P10", message: "no unique constraint" }]
    await enqueueConversionEvents(params())
    await deixarOEnvioCorrer()
    expect(inserts).toHaveLength(2)
    expect(enviados).toEqual(["Lead"])
  })

  it("erro no Lead NÃO impede o qualificado de seguir", async () => {
    errosPorChamada = [{ code: "42P10", message: "no unique constraint" }, null]
    await enqueueConversionEvents(params())
    await deixarOEnvioCorrer()
    expect(enviados).toEqual(["LeadQualificado"])
  })

  it("linha já existente (23505) é ignorada sem virar falha", async () => {
    errosPorChamada = [{ code: "23505", message: "duplicate key" }, null]
    await enqueueConversionEvents(params())
    await deixarOEnvioCorrer()
    expect(enviados).toEqual(["LeadQualificado"])
  })

  it("reenvio inteiro do mesmo cadastro não manda nada de novo", async () => {
    errosPorChamada = [
      { code: "23505", message: "duplicate key" },
      { code: "23505", message: "duplicate key" },
    ]
    await enqueueConversionEvents(params())
    await deixarOEnvioCorrer()
    expect(enviados).toEqual([])
  })

  it("sem pixel ou sem token não tenta nada", async () => {
    await enqueueConversionEvents(
      params({ meta: { pixelId: null, capiTokenEnc: "enc:v1:x", testEventCode: null } }),
    )
    expect(inserts).toHaveLength(0)
  })

  it("a URL de origem viaja no payload dos dois eventos", async () => {
    await enqueueConversionEvents(params())
    for (const row of inserts) {
      const payload = row.payload as { action_source: string; event_source_url?: string }
      expect(payload.action_source).toBe("website")
      expect(payload.event_source_url).toBe("https://app.convertfy.me/forms/pagina-de-vendas")
    }
  })
})
