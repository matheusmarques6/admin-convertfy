/**
 * POST /api/admin/emails/[emailId]/structure-review
 *
 * A rota faz três coisas que precisam acontecer juntas: aplica a ordem nos
 * blocos, move as REGIÕES dentro do HTML marcado e grava a revisão. O que
 * este teste protege é o que quebraria em silêncio: partição inválida
 * passando batido, HTML saindo com marcador para o cliente, e revisão nova
 * empilhando em cima da anterior em vez de substituí-la.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const EMAIL_ID = "11111111-1111-4111-8111-111111111111"
const B = {
  hero: "aaaaaaaa-1111-4111-8111-111111111111",
  body: "bbbbbbbb-1111-4111-8111-111111111111",
  offer: "cccccccc-1111-4111-8111-111111111111",
  reviews: "dddddddd-1111-4111-8111-111111111111",
}

function docMarcado(...secoes: string[]): string {
  const rows = secoes
    .map(
      (s, i) =>
        `        <!-- cfy:block:${i}:${s}:start -->\n` +
        `<tr><td>${s}</td></tr>\n` +
        `        <!-- cfy:block:${i}:${s}:end -->`,
    )
    .join("\n")
  return `<html><body><table>\n${rows}\n</table></body></html>`
}

const h = vi.hoisted(() => ({
  email: {} as Record<string, unknown>,
  blocos: [] as Array<Record<string, unknown>>,
  reviews: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string; ids: string[] }>,
  desativacoes: 0,
}))

vi.mock("@/lib/supabase/server", () => {
  // Builder encadeável: cada método devolve `this` e o `then` resolve o que
  // a tabela precisa devolver. Só o suficiente para as chamadas da rota.
  const builder = (table: string, op: "select" | "update" | "delete" | "insert", payload?: Record<string, unknown>) => {
    const state: { ids: string[] } = { ids: [] }
    const api: Record<string, unknown> = {}
    const self = () => api
    for (const m of ["eq", "is", "order", "select"]) {
      api[m] = () => self()
    }
    api.in = (_col: string, ids: string[]) => {
      state.ids = ids
      return self()
    }
    api.maybeSingle = () => Promise.resolve({ data: h.email, error: null })
    api.single = () => {
      const row = { id: "rev-1", ...(payload ?? {}) }
      h.reviews.push(row)
      return Promise.resolve({ data: row, error: null })
    }
    api.then = (resolve: (v: unknown) => unknown) => {
      if (op === "delete") h.deletes.push({ table, ids: state.ids })
      if (op === "update") {
        h.updates.push({ table, payload: payload ?? {} })
        if (table === "email_structure_reviews") h.desativacoes++
      }
      const data = table === "email_blocks" && op === "select" ? h.blocos : h.email
      return resolve({ data, error: null })
    }
    return api
  }

  return {
    createClient: vi.fn().mockResolvedValue({
      auth: {
        getUser: () => ({ data: { user: { id: "user-1" } }, error: null }),
      },
    }),
    createAdminClient: vi.fn(() => ({
      from: (table: string) => ({
        select: () => builder(table, "select"),
        update: (payload: Record<string, unknown>) => builder(table, "update", payload),
        delete: () => builder(table, "delete"),
        insert: (payload: Record<string, unknown>) => builder(table, "insert", payload),
      }),
    })),
  }
})

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))
vi.mock("@/lib/cors", () => ({ corsHeaders: () => ({}), handleCorsPreFlight: vi.fn() }))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: any, ctx: { params: Promise<{ emailId: string }> }) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  h.updates = []
  h.deletes = []
  h.reviews = []
  h.desativacoes = 0
  h.blocos = [
    { id: B.hero, position: 1, block_type: "hero" },
    { id: B.body, position: 2, block_type: "body" },
    { id: B.offer, position: 3, block_type: "offer" },
    { id: B.reviews, position: 4, block_type: "reviews" },
  ]
  h.email = {
    id: EMAIL_ID,
    number: 1,
    html: "<html>limpo</html>",
    html_marked: docMarcado("hero", "body", "offer", "reviews"),
    flow: { id: "flow-1", store_id: "loja-a", flow_type: "welcome" },
  }
  const mod = await import("./route")
  POST = mod.POST
})

function req(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/emails/${EMAIL_ID}/structure-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
const ctx = () => ({ params: Promise.resolve({ emailId: EMAIL_ID }) })

const baseBody = {
  ordem: [B.hero, B.body, B.reviews, B.offer],
  removidos: [],
  justificativa: "o cético precisa da prova antes da vitrine",
  alcance: "este_email" as const,
  leitores: { estruturador: true, curador: false, montador: true },
}

describe("POST structure-review", () => {
  it("reordena as regiões do HTML e devolve o email limpo", async () => {
    const res = await POST(req(baseBody), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.html_atualizado).toBe(true)
    expect(json.ordem).toEqual(["hero", "body", "reviews", "offer"])

    const upd = h.updates.find((u) => u.table === "email_flow_emails")!
    const marcado = String(upd.payload.html_marked)
    const limpo = String(upd.payload.html)
    // A ordem mudou no documento…
    expect(marcado.indexOf("<tr><td>reviews")).toBeLessThan(
      marcado.indexOf("<tr><td>offer"),
    )
    // …os marcadores foram renumerados pela posição…
    expect(marcado).toContain("<!-- cfy:block:2:reviews:start -->")
    // …e o que vai para o cliente não tem marcador nenhum.
    expect(limpo).not.toContain("cfy:block")
    expect(limpo.indexOf("<tr><td>reviews")).toBeLessThan(
      limpo.indexOf("<tr><td>offer"),
    )
  })

  it("remover tira a região do HTML e apaga o bloco", async () => {
    const res = await POST(
      req({ ...baseBody, ordem: [B.hero, B.body, B.reviews], removidos: [B.offer] }),
      ctx(),
    )
    expect(res.status).toBe(200)
    const upd = h.updates.find((u) => u.table === "email_flow_emails")!
    expect(String(upd.payload.html)).not.toContain("<tr><td>offer")
    expect(h.deletes.find((d) => d.table === "email_blocks")?.ids).toEqual([B.offer])
  })

  // Lista parcial deixaria bloco fora da renumeração e a posição viraria um
  // buraco silencioso — pior que recusar e pedir recarregar.
  it("ordem que não cobre todos os blocos é recusada", async () => {
    const res = await POST(req({ ...baseBody, ordem: [B.hero, B.body] }), ctx())
    expect(res.status).toBe(400)
  })

  it("id repetido é recusado", async () => {
    const res = await POST(
      req({ ...baseBody, ordem: [B.hero, B.hero, B.body, B.offer] }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("revisão sem leitor nenhum é recusada", async () => {
    const res = await POST(
      req({
        ...baseBody,
        leitores: { estruturador: false, curador: false, montador: false },
      }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })

  it("justificativa vazia é recusada", async () => {
    const res = await POST(req({ ...baseBody, justificativa: "   " }), ctx())
    expect(res.status).toBe(400)
  })

  // Email gerado antes da 20261087, ou HTML colado por fora: a ordem e a
  // revisão salvam, o HTML fica — e a resposta DIZ isso, para a tela avisar
  // em vez de mentir um "salvo".
  it("email sem html_marked salva a revisão e avisa que o HTML não mudou", async () => {
    h.email = { ...h.email, html_marked: null }
    const res = await POST(req(baseBody), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.html_atualizado).toBe(false)
    expect(h.reviews).toHaveLength(1)
    expect(h.updates.some((u) => u.table === "email_flow_emails")).toBe(false)
  })

  it("grava o diff das duas ordens, os leitores e desativa a anterior", async () => {
    await POST(req(baseBody), ctx())
    expect(h.desativacoes).toBe(1)
    const rev = h.reviews[0]
    expect(rev.ordem_anterior).toEqual(["hero", "body", "offer", "reviews"])
    expect(rev.ordem_nova).toEqual(["hero", "body", "reviews", "offer"])
    expect(rev.para_estruturador).toBe(true)
    expect(rev.para_montador).toBe(true)
    expect(rev.para_curador).toBe(false)
    expect(rev.store_id).toBe("loja-a")
  })

  it("alcance do flow grava sem loja (vale para qualquer uma)", async () => {
    await POST(req({ ...baseBody, alcance: "todo_email_do_flow" }), ctx())
    expect(h.reviews[0].store_id).toBeNull()
  })

  // Documento que não pode ser editado com segurança não vira documento
  // remendado: a revisão segue, o HTML fica intacto.
  it("HTML marcado corrompido não derruba o salvamento", async () => {
    h.email = {
      ...h.email,
      html_marked: docMarcado("hero", "body", "offer", "reviews").replace(
        "<!-- cfy:block:2:offer:end -->",
        "",
      ),
    }
    const res = await POST(req(baseBody), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).html_atualizado).toBe(false)
    expect(h.reviews).toHaveLength(1)
  })
})
