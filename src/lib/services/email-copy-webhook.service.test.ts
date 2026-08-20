import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Cobre o caminho que travava o botão "Gerar copies (n8n)":
 * - flows sem NENHUM email → auto-seed dos defaults + dispatch segue
 * - emails existem mas nenhum em draft → reason distinto (no_draft_emails)
 * - onlyDrafts=false com emails fora de draft → dispatch normal
 */

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {}

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let limitN: number | null = null
    let op: "select" | "insert" | "update" = "select"
    let insertRows: Row[] = []
    let updatePatch: Row = {}

    const exec = () => {
      const rows = tables[table] ?? (tables[table] = [])
      if (op === "insert") {
        for (const r of insertRows) {
          rows.push({ id: `${table}-${rows.length + 1}`, ...r })
        }
        return { data: insertRows, error: null }
      }
      if (op === "update") {
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        for (const r of matched) Object.assign(r, updatePatch)
        return { data: matched, error: null }
      }
      let out = rows.filter((r) => filters.every((f) => f(r)))
      if (limitN != null) out = out.slice(0, limitN)
      return { data: out, error: null }
    }

    const api = {
      select: () => api,
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v)
        return api
      },
      in: (c: string, vs: unknown[]) => {
        filters.push((r) => vs.includes(r[c]))
        return api
      },
      order: () => api,
      limit: (n: number) => {
        limitN = n
        return api
      },
      maybeSingle: () => {
        const res = exec()
        return Promise.resolve({ data: res.data[0] ?? null, error: null })
      },
      insert: (rows: Row | Row[]) => {
        op = "insert"
        insertRows = Array.isArray(rows) ? rows : [rows]
        return api
      },
      update: (patch: Row) => {
        op = "update"
        updatePatch = patch
        return api
      },
      then: (
        onFulfilled?: (v: { data: Row[]; error: null }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(exec()).then(onFulfilled, onRejected),
    }
    return api
  }

  return {
    tables,
    makeClient: () => ({ from: (table: string) => builder(table) }),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => h.makeClient(),
  createClient: () => ({}),
}))

vi.mock("@/lib/agents/seed-blocks", () => ({
  ensureBlocksSeeded: vi.fn().mockResolvedValue(undefined),
  reconcileBlocksAdditive: vi.fn().mockResolvedValue(undefined),
}))

const loadEffectiveBlueprintsBatch = vi.fn()
const loadTextOnlyBlueprints = vi.fn()
vi.mock("@/lib/agents/architect/blueprint-loader", () => ({
  loadEffectiveBlueprintsBatch: (...a: unknown[]) => loadEffectiveBlueprintsBatch(...a),
  loadTextOnlyBlueprints: (...a: unknown[]) => loadTextOnlyBlueprints(...a),
}))

import {
  dispatchEmailCopyWebhook,
  digestPayload,
} from "./email-copy-webhook.service"
import { reconcileBlocksAdditive } from "@/lib/agents/seed-blocks"

const fetchMock = vi.fn()

function resetTables(emailRows: Row[]) {
  for (const k of Object.keys(h.tables)) delete h.tables[k]
  h.tables.client_stores = [
    {
      id: "store1",
      store_name: "Loja Teste",
      store_url: "https://loja.test",
      platform: "shopify",
      language: "pt-BR",
      niche: "moda",
    },
  ]
  h.tables.email_flows = [
    { id: "flow1", store_id: "store1", flow_type: "welcome", name: "Welcome Flow", position: 1 },
  ]
  h.tables.email_flow_emails = emailRows
  h.tables.email_blocks = []
  h.tables.email_reference_templates = []
  h.tables.email_generation_runs = []
}

beforeEach(() => {
  vi.stubEnv("N8N_EMAIL_COPY_WEBHOOK_URL", "https://n8n.test/webhook")
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, text: async () => "" })
  vi.stubGlobal("fetch", fetchMock)
  loadEffectiveBlueprintsBatch.mockReset().mockResolvedValue(new Map())
  loadTextOnlyBlueprints.mockReset().mockResolvedValue(new Map())
  vi.mocked(reconcileBlocksAdditive).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("dispatchEmailCopyWebhook — auto-seed e reasons", () => {
  it("flows sem NENHUM email: auto-seed dos defaults e dispatch segue (caso que travava com no_emails)", async () => {
    resetTables([])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(8) // welcome tem 8 emails default
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Os emails foram criados e, após dispatch ok, marcados in_progress
    const emails = h.tables.email_flow_emails
    expect(emails).toHaveLength(8)
    expect(emails.every((e) => e.status === "in_progress")).toBe(true)
  })

  it("emails existem mas nenhum em draft + onlyDrafts: reason no_draft_emails (não no_emails) e nada é semeado", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "in_progress" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(false)
    expect(res.reason).toBe("no_draft_emails")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(h.tables.email_flow_emails).toHaveLength(1)
  })

  it("onlyDrafts=false com emails fora de draft: dispatch normal (regerar)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "in_progress" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("regerar email já gerado (copy_ready) reseta status p/ in_progress — senão o callback do n8n descarta a copy nova como duplicada", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "copy_ready" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(res.email_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Pós-dispatch o status precisa sair de copy_ready (IDEMPOTENT_STATUSES no
    // callback) p/ que a copy nova do n8n seja persistida e não vire no-op.
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("in_progress")
  })

  it("dispatch novo ZERA copy_ready_dispatch_attempts — contador esgotado da geração anterior prendia o email em copy_ready pra sempre (Luxe Lift, 24/jul)", async () => {
    resetTables([
      {
        id: "e1",
        flow_id: "flow1",
        number: 1,
        name: "Welcome 1",
        status: "copy_ready",
        copy_ready_dispatch_attempts: 3,
      },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    // Sem o reset, o Front 4 do watchdog (attempts < MAX) nunca mais pega o
    // email e a fase 2 da geração nova nunca inicia — sem erro e sem log.
    expect(e1?.copy_ready_dispatch_attempts).toBe(0)
  })

  it("regerar email finalizado/publicado (live) NÃO é rebaixado de status", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "live" },
    ])

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: false,
    })

    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("live")
  })
})

describe("dispatchEmailCopyWebhook — emails somente texto (text_only)", () => {
  function payloadFromFetch(): {
    flows: Array<{
      emails: Array<{
        email_number: number
        text_only: boolean
        estrutura_geral: {
          objective: string | null
          guidance: string | null
          suggested_blocks: string[]
          tone_hint: string | null
        } | null
        blueprint: { objective: string | null } | null
      }>
    }>
  } {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string)
  }

  it("payload leva text_only:true + estrutura_geral + blueprint GLOBAL (mesmo com override da loja)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_outline_templates = [
      {
        flow_type: "welcome",
        email_number: 1,
        objective: "OUT-OBJ",
        guidance: "OUT-GUIDE",
        suggested_blocks: ["header", "text", "footer"],
        tone_hint: "caloroso",
        is_active: true,
      },
    ]
    // Cascata efetiva devolve o override da LOJA (legado do Architect)…
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-DA-LOJA",
            messaging: "MSG-DA-LOJA",
            subject_hint: null,
          },
        ],
      ]),
    )
    // …mas o email é text_only e o payload deve usar o GLOBAL.
    loadTextOnlyBlueprints.mockResolvedValue(
      new Map([
        [
          "welcome:1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-GLOBAL",
            messaging: "MSG-GLOBAL",
            subject_hint: "HINT-GLOBAL",
            text_only: true,
          },
        ],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(true)
    const email = payloadFromFetch().flows[0].emails[0]
    expect(email.text_only).toBe(true)
    expect(email.estrutura_geral).toEqual({
      objective: "OUT-OBJ",
      guidance: "OUT-GUIDE",
      suggested_blocks: ["header", "text", "footer"],
      tone_hint: "caloroso",
      // Este outline de teste não tem coupon_codes → sem cupom no idioma.
      coupon_code: null,
    })
    expect(email.blueprint?.objective).toBe("OBJ-GLOBAL")
  })

  it("seed/reconcile de email text_only roda SEM storeId (pula camada da loja)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
      { id: "e2", flow_id: "flow1", number: 2, name: "Welcome 2", status: "draft" },
    ])
    loadTextOnlyBlueprints.mockResolvedValue(
      new Map([
        [
          "welcome:1",
          { flow_type: "welcome", email_number: 1, objective: "O", messaging: "M", subject_hint: null },
        ],
      ]),
    )

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const calls = vi.mocked(reconcileBlocksAdditive).mock.calls
    expect(calls).toContainEqual(["e1", "welcome", 1, undefined])
    expect(calls).toContainEqual(["e2", "welcome", 2, "store1"])
  })

  it("email normal: text_only:false e estrutura_geral TAMBÉM presente (payload v2 envia p/ todos)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_outline_templates = [
      {
        flow_type: "welcome",
        email_number: 1,
        objective: "OUT-OBJ",
        guidance: null,
        suggested_blocks: [],
        tone_hint: null,
        is_active: true,
      },
    ]

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const email = payloadFromFetch().flows[0].emails[0]
    expect(email.text_only).toBe(false)
    expect(email.estrutura_geral?.objective).toBe("OUT-OBJ")
  })
})

describe("dispatchEmailCopyWebhook — o BLOCO é o schema (20261065)", () => {
  it("lê fields/variant_id da LINHA; não casa por índice", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    // A linha carrega o contrato. Repare que a ORDEM do blueprint está
    // invertida em relação às positions: antes isso deslocava o match e
    // zerava os fields do bloco inteiro; agora é irrelevante.
    h.tables.email_blocks = [
      {
        id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: "v-hero",
        fields: [
          { key: "hero_headline", tag: "HERO_HEADLINE", type: "text_short",
            nature: "copy", max_len: 40, required: true, source: "schema" },
          { key: "hero_cta_2_label", tag: "HERO_CTA_2_LABEL", type: "text_short",
            nature: "copy", max_len: 20, required: false, source: "schema" },
          { key: "hero_image", tag: "HERO_IMAGE", type: "image",
            nature: "imagem_gerada", max_len: 0, required: true, source: "schema" },
        ],
      },
      {
        id: "b2", email_id: "e1", position: 2, block_type: "coupon", label: "Cupom",
        content: {}, variant_id: "v-coupon",
        fields: [
          { key: "coupon_code", tag: "COUPON_CODE", type: "text_short",
            nature: "copy", max_len: 15, required: true, source: "schema" },
        ],
      },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        ["welcome__1", {
          flow_type: "welcome", email_number: 1, objective: "OBJ",
          messaging: "MSG", subject_hint: null,
          blocks: [
            { type: "coupon", label: "Cupom", purpose: "P-COUPON",
              variant_id: "v-coupon", variant_name: "cupom 2", copy_spec: [] },
            { type: "hero", label: "Hero", purpose: "P-HERO",
              variant_id: "v-hero", variant_name: "welcome - hero section 9", copy_spec: [] },
          ],
        }],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{
        blocks: Array<Record<string, unknown>>
      }> }>
    }
    const blocks = body.flows[0].emails[0].blocks
    expect(blocks.map((b) => b.type)).toEqual(["hero", "coupon"])

    // O contrato veio da LINHA, não do índice do blueprint.
    expect(Object.keys((blocks[0].schema as { campos: object }).campos)).toEqual([
      "hero_headline",
      "hero_cta_2_label", // o campo que sumia
    ])
    expect(Object.keys((blocks[1].schema as { campos: object }).campos)).toEqual([
      "coupon_code",
    ])

    // Rótulo/diretriz vêm do blueprint casado por variant_id — não por posição.
    expect((blocks[0].schema as { variante: string }).variante).toBe(
      "welcome - hero section 9",
    )
    expect((blocks[0].schema as { diretriz: string }).diretriz).toBe("P-HERO")
    // Ponte de transição: o flow atual lê `purpose` do BLOCO. Some quando a
    // taxa de contrato chegar a 100.
    expect(blocks[0].purpose).toBe("P-HERO")
    expect((blocks[1].schema as { variante: string }).variante).toBe("cupom 2")
    expect((blocks[1].schema as { diretriz: string }).diretriz).toBe("P-COUPON")

    // Segunda fonte de schema morreu: nem `tags` nem `fields` cru no bloco,
    // nem `component_variants` no email.
    expect(blocks[0]).not.toHaveProperty("tags")
    expect(blocks[0]).not.toHaveProperty("fields")
    expect(blocks[0]).not.toHaveProperty("copy_spec")
    expect(body.flows[0].emails[0]).not.toHaveProperty("component_variants")
  })

  it("bloco legado (fields vazio) resolve do blueprint UMA vez e grava na linha", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: null, fields: [] },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        ["welcome__1", {
          flow_type: "welcome", email_number: 1, objective: "OBJ",
          messaging: "MSG", subject_hint: null,
          blocks: [
            { type: "hero", label: "Hero", purpose: "P-HERO",
              variant_id: "v-hero", variant_name: "hero 9", copy_spec: [],
              fields: [
                { key: "hero_headline", tag: "HERO_HEADLINE", type: "text_short",
                  nature: "copy", max_len: 40, required: true, source: "schema" },
              ] },
          ],
        }],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<Record<string, unknown>> }> }>
    }
    const bloco = body.flows[0].emails[0].blocks[0]
    expect(Object.keys((bloco.schema as { campos: object }).campos)).toEqual([
      "hero_headline",
    ])
    // Auto-cura: a linha foi atualizada para não voltar por este caminho.
    // (na LINHA o snapshot segue sendo o array `fields` — o objeto `schema`
    // é só a forma de viagem até o n8n)
    const row = h.tables.email_blocks.find((b: Row) => b.id === "b1")!
    expect(row.variant_id).toBe("v-hero")
    expect((row.fields as Array<{ key: string }>).map((f) => f.key)).toEqual([
      "hero_headline",
    ])
  })

  it("bloco sem campo de COPY nao vai pro payload (header/footer)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      // header estrutural: preenchido por codigo (LOGO/PREHEADER), nada a pedir.
      { id: "b1", email_id: "e1", position: 1, block_type: "header", label: "Logo da marca",
        content: {}, variant_id: null, fields: [] },
      { id: "b2", email_id: "e1", position: 2, block_type: "hero", label: "Hero",
        content: {}, variant_id: "v-hero",
        fields: [
          { key: "hero_headline", tag: "HERO_HEADLINE", type: "text_short",
            nature: "copy", max_len: 40, required: true, source: "schema" },
        ] },
      // bloco com schema SO de imagem: tem contrato, mas nada de copy.
      { id: "b3", email_id: "e1", position: 3, block_type: "image", label: "Arte",
        content: {}, variant_id: "v-img",
        fields: [
          { key: "banner", tag: "BANNER", type: "image",
            nature: "imagem_gerada", max_len: 0, required: true, source: "schema" },
        ] },
      { id: "b4", email_id: "e1", position: 4, block_type: "footer", label: "Rodape",
        content: {}, variant_id: "v-footer", fields: [] },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        ["welcome__1", {
          flow_type: "welcome", email_number: 1, objective: "OBJ",
          messaging: "MSG", subject_hint: null, blocks: [],
        }],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<{ type: string }> }> }>
    }
    // So o hero sobra: header/footer sem campo, image so com imagem_gerada.
    expect(body.flows[0].emails[0].blocks.map((b) => b.type)).toEqual(["hero"])

    const run = h.tables.email_generation_runs.find(
      (r: Row) => r.agent === "copy_dispatch",
    )
    const omitidos = (run?.parsed_output as {
      blocos_omitidos?: Array<{ type: string }>
    })?.blocos_omitidos
    // Omissao NUNCA e silenciosa.
    expect(omitidos?.map((b) => b.type).sort()).toEqual(["footer", "header", "image"])
  })

  it("bloco SEM schema é omitido e registrado como erro de curadoria", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: null, fields: [] },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        ["welcome__1", {
          flow_type: "welcome", email_number: 1, objective: "OBJ",
          messaging: "MSG", subject_hint: null,
          blocks: [{ type: "hero", label: "Hero", purpose: "P", copy_spec: [] }],
        }],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<{ fields: unknown[] }> }> }>
    }
    // Sem schema NÃO vira default do copy_spec, e o bloco nem chega a ser
    // enviado: mandá-lo vazio junto do `purpose` era convite pro modelo
    // improvisar. O problema aparece na telemetria, nas duas listas.
    expect(body.flows[0].emails[0].blocks).toEqual([])
    const run = h.tables.email_generation_runs.find(
      (r: Row) => r.agent === "copy_dispatch",
    )
    const parsed = run?.parsed_output as {
      blocos_sem_schema?: unknown[]
      blocos_omitidos?: unknown[]
    }
    expect(parsed?.blocos_sem_schema).toHaveLength(1)
    expect(parsed?.blocos_omitidos).toHaveLength(1)
  })
})

describe("dispatchEmailCopyWebhook — payload v2 (fields/variant/tones)", () => {
  function firstEmail(): {
    objective: string | null
    tones: string[]
    blocks: Array<Record<string, unknown>>
  } {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{
        emails: Array<{
          objective: string | null
          tones: string[]
          blocks: Array<Record<string, unknown>>
        }>
      }>
    }
    return body.flows[0].emails[0]
  }

  it("bloco com snapshot de fields no blueprint usa o snapshot VERBATIM + variant_id/variant_name", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero", content: {} },
    ]
    const snapshot = [
      {
        key: "headline",
        label: "Headline",
        type: "text_short",
        max_len: 40,
        min_len: null,
        required: true,
        example: "Bem-vindo!",
        guidance: "Tom acolhedor",
        tag: "HERO_HEADLINE",
        source: "schema",
      },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-BP",
            messaging: "MSG",
            subject_hint: null,
            blocks: [
              {
                type: "hero",
                label: "Hero",
                purpose: "P-HERO",
                copy_spec: [],
                tags: ["HERO_HEADLINE"],
                variant_id: "var-1",
                variant_name: "Hero Editorial",
                fields: snapshot,
              },
            ],
          },
        ],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const block = firstEmail().blocks[0]
    const schema = block.schema as {
      variante: string
      diretriz: string
      obrigatorios: string[]
      campos: Record<string, Record<string, unknown>>
    }
    // Snapshot vence a derivação por tags (senão viria source tag_registry).
    expect(Object.keys(schema.campos)).toEqual(["headline"])
    expect(schema.campos.headline).toEqual({
      label: "Headline",
      tipo: "text_short",
      obrigatorio: true,
      max_caracteres: 40,
      min_caracteres: null,
      exemplo: "Bem-vindo!",
      orientacao: "Tom acolhedor",
    })
    expect(schema.obrigatorios).toEqual(["headline"])
    expect(block.variant_id).toBe("var-1")
    expect(schema.variante).toBe("Hero Editorial")
    expect(schema.diretriz).toBe("P-HERO")
    expect(block).not.toHaveProperty("copy_spec")
  })

  it("T8 (naturezas): payload leva SÓ campos de copy — imagem gerada e asset_fixo ficam fora", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero", content: {} },
    ]
    const base = {
      label: "F",
      max_len: 40,
      min_len: null,
      required: true,
      example: "",
      guidance: "",
      tag: null,
      source: "schema",
    }
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ",
            messaging: "MSG",
            subject_hint: null,
            blocks: [
              {
                type: "hero",
                label: "Hero",
                purpose: "P",
                copy_spec: [],
                tags: [],
                variant_id: "var-1",
                variant_name: "V",
                fields: [
                  { ...base, key: "headline", type: "text_short", nature: "copy" },
                  // imagem do agente de imagem — fora do payload de copy
                  { ...base, key: "hero_image", type: "image" },
                  // arte fixa da biblioteca — fora do payload de copy
                  { ...base, key: "selo", type: "image", nature: "asset_fixo" },
                  // texto marcado como asset_fixo também fica de fora
                  { ...base, key: "carimbo_texto", type: "text_short", nature: "asset_fixo" },
                ],
              },
            ],
          },
        ],
      ]),
    )

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const block = firstEmail().blocks[0]
    const keys = Object.keys((block.schema as { campos: object }).campos)
    expect(keys).toEqual(["headline"])
  })

  it("objective (blueprint > outline) e tones canônicos da loja vão por email", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.client_stores[0].tom_de_voz = "Voz premium, urgente nas ofertas"
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-BP",
            messaging: "MSG",
            subject_hint: null,
          },
        ],
      ]),
    )

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const email = firstEmail()
    expect(email.objective).toBe("OBJ-BP")
    expect(email.tones).toEqual(["Urgente", "Premium"])
  })

  it("sem blueprint: objective cai no da estrutura geral; sem tom de voz: tones []", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_outline_templates = [
      {
        flow_type: "welcome",
        email_number: 1,
        objective: "OBJ-OUTLINE",
        guidance: null,
        suggested_blocks: [],
        tone_hint: null,
        is_active: true,
      },
    ]

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const email = firstEmail()
    expect(email.objective).toBe("OBJ-OUTLINE")
    expect(email.tones).toEqual([])
  })
})

describe("dispatchEmailCopyWebhook — fallback DEFAULT_BLUEPRINTS no payload", () => {
  it("sem blueprint no banco (loja e global): payload usa DEFAULT_BLUEPRINTS — blueprint + objective + purpose por bloco", async () => {
    // post_purchase só existe em DEFAULT_BLUEPRINTS (sem migration de seed
    // global) — antes do fix chegava ao n8n com blueprint:null e blocos sem
    // purpose.
    resetTables([
      { id: "e1", flow_id: "flowPP", number: 1, name: "Post Purchase 1", status: "draft" },
    ])
    h.tables.email_flows = [
      { id: "flowPP", store_id: "store1", flow_type: "post_purchase", name: "Post Purchase", position: 1 },
    ]
    // Blocos semeados na mesma ordem do default (text, cta, footer), 1-based.
    h.tables.email_blocks = [
      { id: "b1", email_id: "e1", position: 1, block_type: "text", label: "Texto", content: {} },
      { id: "b2", email_id: "e1", position: 2, block_type: "cta", label: "CTA", content: {} },
      { id: "b3", email_id: "e1", position: 3, block_type: "footer", label: "Rodapé", content: {} },
    ]
    // Cascata do banco vazia — cenário do bug.
    loadEffectiveBlueprintsBatch.mockResolvedValue(new Map())

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flowPP"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{
        emails: Array<{
          objective: string | null
          blueprint: { objective: string; messaging: string; subject_hint: string } | null
          blocks: Array<{ type: string; purpose: string | null }>
        }>
      }>
    }
    const email = body.flows[0].emails[0]
    expect(email.blueprint).toEqual({
      objective: "Agradecer pela compra e reforçar confiança",
      messaging: "Obrigado pela compra, suporte disponível, conteúdo de uso do produto",
      subject_hint: "Obrigado pela compra! Confira dicas exclusivas",
    })
    // Sem outline: o objective por email também cai no default in-code.
    expect(email.objective).toBe("Agradecer pela compra e reforçar confiança")
    // O contexto do email (blueprint/objective) continua indo. Os BLOCOS,
    // não: sem blueprint de loja não há variante casada, logo não há schema,
    // e bloco sem contrato de copy não vai mais ao n8n (20261065). Antes
    // eles iam com `fields` derivado do copy_spec — que era justamente a
    // porta pelo qual o n8n inventava o vocabulário.
    expect(email.blocks).toEqual([])
    const run = h.tables.email_generation_runs.find(
      (r: Row) => r.agent === "copy_dispatch",
    )
    expect(
      (run?.parsed_output as { blocos_omitidos?: Array<{ type: string }> })
        ?.blocos_omitidos?.map((b) => b.type),
    ).toEqual(["text", "cta", "footer"])
  })

  it("row do banco vence: fallback NÃO sobrescreve blueprint vindo da cascata", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        [
          "welcome__1",
          {
            flow_type: "welcome",
            email_number: 1,
            objective: "OBJ-DO-BANCO",
            messaging: "MSG-DO-BANCO",
            subject_hint: "HINT-DO-BANCO",
            blocks: [{ type: "text", label: "Texto", purpose: "P-BANCO" }],
          },
        ],
      ]),
    )

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blueprint: { objective: string } | null }> }>
    }
    expect(body.flows[0].emails[0].blueprint?.objective).toBe("OBJ-DO-BANCO")
  })

  it("outline (Estrutura geral) vence o default in-code no objective por email", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_outline_templates = [
      {
        flow_type: "welcome",
        email_number: 1,
        objective: "OBJ-OUTLINE",
        guidance: null,
        suggested_blocks: [],
        tone_hint: null,
        is_active: true,
      },
    ]
    // Sem blueprint no banco: default in-code preenche o objeto blueprint,
    // mas o objective por email respeita a cascata bp(banco) > outline > default.
    loadEffectiveBlueprintsBatch.mockResolvedValue(new Map())

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{
        emails: Array<{
          objective: string | null
          blueprint: { objective: string } | null
        }>
      }>
    }
    const email = body.flows[0].emails[0]
    expect(email.objective).toBe("OBJ-OUTLINE")
    expect(email.blueprint?.objective).toBe(
      "Boas-vindas + apresentação da marca. Cria pertencimento e desejo no primeiro contato.",
    )
  })
})

describe("dispatchEmailCopyWebhook — regenerateAll", () => {
  // Cada bloco carrega contrato: estes testes são sobre QUAIS blocos são
  // selecionados (misto vs regenerateAll), não sobre o filtro de blocos sem
  // copy — sem `fields` o filtro novo os removeria e o teste viraria vácuo.
  const campo = (key: string) => ({
    key, tag: key.toUpperCase(), type: "text_short",
    nature: "copy", max_len: 40, required: false, source: "schema",
  })
  const mixedBlocks = () => [
    { id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
      content: { headline: "copy antiga" }, variant_id: "v1", fields: [campo("headline")] },
    { id: "b2", email_id: "e1", position: 2, block_type: "coupon", label: "Cupom",
      content: {}, variant_id: "v2", fields: [campo("code")] },
    { id: "b3", email_id: "e1", position: 3, block_type: "footer", label: "Rodapé",
      content: { text: "copy antiga" }, variant_id: "v3", fields: [campo("text")] },
  ]

  function sentBlocks(): Array<{ position: number; type: string }> {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<{ position: number; type: string }> }> }>
    }
    return body.flows[0].emails[0].blocks
  }

  it("sem o flag: email misto envia só os blocos VAZIOS (mixed mode)", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = mixedBlocks()

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(sentBlocks().map((b) => b.position)).toEqual([2])
  })

  it("com regenerateAll: envia TODOS os blocos mesmo em email misto", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = mixedBlocks()

    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "test_full_pipeline",
      flowIds: ["flow1"],
      onlyDrafts: true,
      regenerateAll: true,
    })
    expect(sentBlocks().map((b) => b.position)).toEqual([1, 2, 3])
  })
})

// ── Snapshot do payload no run copy_dispatch ────────────────────────
describe("digestPayload", () => {
  const payload = {
    flows: [
      {
        flow_type: "welcome",
        emails: [
          {
            email_number: 1,
            blocks: [
              {
                position: 0,
                type: "hero",
                schema: {
                  variante: "welcome - hero section 9",
                  campos: {
                    hero_headline: { exemplo: "Bem-vinda ao clube" },
                    hero_cta_2_label: { exemplo: "Ver coleção" },
                    orfao: { exemplo: null },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  }

  it("guarda as keys pedidas por bloco e as que foram sem example (sem âncora)", () => {
    const d = digestPayload(payload) as {
      flows: Array<{
        emails: Array<{
          blocks: Array<{ field_keys: string[]; fields_sem_example: string[] }>
        }>
      }>
    }
    const bloco = d.flows[0].emails[0].blocks[0]
    expect(bloco.field_keys).toEqual([
      "hero_headline",
      "hero_cta_2_label",
      "orfao",
    ])
    expect(bloco.fields_sem_example).toEqual(["orfao"])
  })

  it("não quebra com payload vazio ou malformado", () => {
    expect(digestPayload({})).toEqual({ flows: [] })
    expect(digestPayload(null)).toEqual({ flows: [] })
    expect(digestPayload({ flows: [{ flow_type: "x" }] })).toEqual({
      flows: [{ flow_type: "x", emails: [] }],
    })
  })
})

// ── MC-1: só se pede copy para seção que ENTROU no documento ─────────
describe("dispatchEmailCopyWebhook — seção fora do documento não pede copy", () => {
  const campo = (key: string) => ({
    key,
    tag: key.toUpperCase(),
    type: "text_short",
    nature: "copy",
    max_len: 40,
    required: false,
    source: "schema",
  })

  function doisBlocos() {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      {
        id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: "v-hero", fields: [campo("hero_headline")],
      },
      {
        id: "b2", email_id: "e1", position: 2, block_type: "coupon", label: "Cupom",
        content: {}, variant_id: "v-coupon", fields: [campo("coupon_code")],
      },
    ]
    loadEffectiveBlueprintsBatch.mockResolvedValue(
      new Map([
        ["welcome__1", {
          flow_type: "welcome", email_number: 1, objective: "OBJ",
          messaging: "MSG", subject_hint: null,
          blocks: [
            { type: "hero", label: "Hero", purpose: "P-HERO",
              variant_id: "v-hero", variant_name: "hero 9", copy_spec: [] },
            { type: "coupon", label: "Cupom", purpose: "P-COUPON",
              variant_id: "v-coupon", variant_name: "cupom 2", copy_spec: [] },
          ],
        }],
      ]),
    )
  }

  async function dispatch() {
    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ blocks: Array<Record<string, unknown>> }> }>
    }
    return body.flows[0].emails[0].blocks
  }

  function omitidos() {
    const run = h.tables.email_generation_runs.find(
      (r: Row) => r.agent === "copy_dispatch",
    )
    return ((run?.parsed_output as Record<string, unknown>)?.blocos_omitidos ??
      []) as Array<Record<string, unknown>>
  }

  it("variante que a montagem descartou sai do payload, com motivo", async () => {
    // O cupom tem contrato (o blueprint casou variante), mas o
    // assembleDocument recusou o HTML dela — a seção não existe no email.
    // Pedir a copy seria pagar por texto que ninguém usa; foi o que
    // aconteceu com a faixa de cupom da Luxe Lift.
    doisBlocos()
    h.tables.store_email_references = [
      {
        store_id: "store1", flow_type: "welcome", email_number: 1,
        slot_map: [
          { block_index: 0, section: "hero", label: "Hero",
            variant_id: "v-hero", variant_name: "hero 9", assembled: true },
          { block_index: 1, section: "coupon", label: "Cupom",
            variant_id: "v-coupon", variant_name: "cupom 2", assembled: false },
        ],
      },
    ]

    const blocks = await dispatch()
    expect(blocks.map((b) => b.type)).toEqual(["hero"])
    expect(omitidos()).toEqual([
      expect.objectContaining({
        type: "coupon",
        motivo: "descartado_na_montagem",
        variant_name: "cupom 2",
      }),
    ])
  })

  it("bloco sem variante nenhuma sai com motivo sem_variante", async () => {
    doisBlocos()
    h.tables.email_blocks[1].variant_id = null
    h.tables.store_email_references = [
      {
        store_id: "store1", flow_type: "welcome", email_number: 1,
        slot_map: [
          { block_index: 0, section: "hero", label: "Hero",
            variant_id: "v-hero", variant_name: "hero 9", assembled: true },
        ],
      },
    ]

    const blocks = await dispatch()
    expect(blocks.map((b) => b.type)).toEqual(["hero"])
    expect(omitidos()).toEqual([
      expect.objectContaining({ type: "coupon", motivo: "sem_variante" }),
    ])
  })

  it("slot_map antigo (sem `assembled`) NÃO filtra nada", async () => {
    // Descartar tudo por falta de dado trocaria copy desperdiçada por email
    // sem copy nenhuma. Referência anterior a ago/2026 fica fora do filtro.
    doisBlocos()
    h.tables.store_email_references = [
      {
        store_id: "store1", flow_type: "welcome", email_number: 1,
        slot_map: [
          { block_index: 0, section: "hero", label: "Hero",
            variant_id: "v-hero", variant_name: "hero 9" },
        ],
      },
    ]

    const blocks = await dispatch()
    expect(blocks.map((b) => b.type)).toEqual(["hero", "coupon"])
    expect(omitidos()).toEqual([])
  })

  it("sem reference nenhuma: comportamento antigo preservado", async () => {
    doisBlocos()
    const blocks = await dispatch()
    expect(blocks.map((b) => b.type)).toEqual(["hero", "coupon"])
  })
})

// ── MC-2: piso — email sem seção nenhuma não é gerável ───────────────
describe("dispatchEmailCopyWebhook — piso de seções", () => {
  function emailComBlocoOmitido() {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
      { id: "e2", flow_id: "flow1", number: 2, name: "Welcome 2", status: "draft" },
    ])
    // e1 fica sem seção (a variante não foi montada); e2 tem uma.
    h.tables.email_blocks = [
      {
        id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: "v-morta",
        fields: [{ key: "hero_headline", tag: "HERO_HEADLINE", type: "text_short",
          nature: "copy", max_len: 40, required: false, source: "schema" }],
      },
      {
        id: "b2", email_id: "e2", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: "v-viva",
        fields: [{ key: "hero_headline", tag: "HERO_HEADLINE", type: "text_short",
          nature: "copy", max_len: 40, required: false, source: "schema" }],
      },
    ]
    h.tables.store_email_references = [
      {
        store_id: "store1", flow_type: "welcome", email_number: 1,
        slot_map: [{ block_index: 0, section: "hero", label: "Hero",
          variant_id: "v-morta", variant_name: "hero morta", assembled: false }],
      },
      {
        store_id: "store1", flow_type: "welcome", email_number: 2,
        slot_map: [{ block_index: 0, section: "hero", label: "Hero",
          variant_id: "v-viva", variant_name: "hero viva", assembled: true }],
      },
    ]
  }

  it("email sem seção sai do payload, vira failed com motivo, e os demais seguem", async () => {
    emailComBlocoOmitido()

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    expect(res.ok).toBe(true)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ email_number: number }> }>
    }
    expect(body.flows[0].emails.map((e) => e.email_number)).toEqual([2])

    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("failed")
    expect(e1?.failure_reason).toBe("sem_secao_montada")
    // O que foi despachado NÃO pode ser revertido pelo update final...
    const e2 = h.tables.email_flow_emails.find((e) => e.id === "e2")
    expect(e2?.status).toBe("in_progress")
  })

  it("o email marcado failed NÃO volta para in_progress no update final", async () => {
    // `failed` está na lista de status que o UPDATE de sucesso aceita —
    // sem separar os ids, o piso seria desfeito na linha seguinte.
    emailComBlocoOmitido()
    await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("failed")
  })

  it("nenhum email gerável: não dispara o n8n e devolve o motivo", async () => {
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    h.tables.email_blocks = [
      {
        id: "b1", email_id: "e1", position: 1, block_type: "hero", label: "Hero",
        content: {}, variant_id: "v-morta",
        fields: [{ key: "hero_headline", tag: "HERO_HEADLINE", type: "text_short",
          nature: "copy", max_len: 40, required: false, source: "schema" }],
      },
    ]
    h.tables.store_email_references = [
      {
        store_id: "store1", flow_type: "welcome", email_number: 1,
        slot_map: [{ block_index: 0, section: "hero", label: "Hero",
          variant_id: "v-morta", variant_name: "hero morta", assembled: false }],
      },
    ]

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(false)
    expect(res.reason).toBe("no_assembled_sections")
    expect(fetchMock).not.toHaveBeenCalled()
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.failure_reason).toBe("sem_secao_montada")
  })

  it("email somente-texto sem blocos NÃO é reprovado pelo piso", async () => {
    // A copy do text_only vem da estrutura geral; `blocks: []` é o normal.
    resetTables([
      { id: "e1", flow_id: "flow1", number: 1, name: "Welcome 1", status: "draft" },
    ])
    loadTextOnlyBlueprints.mockResolvedValue(new Map([["welcome:1", true]]))

    const res = await dispatchEmailCopyWebhook("store1", {
      triggerSource: "manual_store_button",
      flowIds: ["flow1"],
      onlyDrafts: true,
    })

    expect(res.ok).toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      flows: Array<{ emails: Array<{ text_only: boolean; blocks: unknown[] }> }>
    }
    expect(body.flows[0].emails[0].text_only).toBe(true)
    expect(body.flows[0].emails[0].blocks).toEqual([])
    const e1 = h.tables.email_flow_emails.find((e) => e.id === "e1")
    expect(e1?.status).toBe("in_progress")
  })
})
