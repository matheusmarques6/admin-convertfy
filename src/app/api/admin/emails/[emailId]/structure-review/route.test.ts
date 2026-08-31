/**
 * POST /api/admin/emails/[emailId]/structure-review
 *
 * A rota faz três coisas que precisam acontecer JUNTAS: aplica a ordem nos
 * blocos, move as REGIÕES dentro do HTML marcado e grava a revisão. Desde
 * 28/08 as três vão numa transação só, pela RPC `aplicar_estrutura_email`
 * (migration 20261091).
 *
 * O motivo é um incidente: a rota renumerava `position` um bloco por vez e
 * `email_blocks` tem UNIQUE (email_id, position) — mover o 2º bloco para a
 * 1ª posição colidia com o 1º, e QUALQUER troca falhava com "Registro
 * duplicado". Pior, o HTML era gravado ANTES, então o email ficava com o
 * documento na ordem nova e os blocos na antiga.
 *
 * Estes testes rodam contra um mock em memória, que NÃO tem índice único —
 * é justamente por isso que o bug passou verde aqui. Então o que se cobra
 * agora é o CONTRATO com o banco: uma chamada de RPC, com os argumentos
 * certos, e nenhum UPDATE solto de posição ou de HTML. Que a transação
 * funciona sob o UNIQUE é coisa que só o Postgres prova (ver a migration).
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
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}))

/** Argumentos da única chamada de RPC que a rota deve fazer. */
function argsDaRpc(): Record<string, unknown> {
  expect(h.rpcs.map((r) => r.fn)).toEqual(["aplicar_estrutura_email"])
  return h.rpcs[0].args
}

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
      rpc: (fn: string, args: Record<string, unknown>) => {
        h.rpcs.push({ fn, args })
        return Promise.resolve({
          data: {
            blocos: (args.p_ordem as string[]).length,
            removidos: (args.p_removidos as string[]).length,
            html_atualizado: args.p_html_marked != null,
            revisao_id: "rev-1",
          },
          error: null,
        })
      },
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
  h.rpcs = []
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

    const args = argsDaRpc()
    const marcado = String(args.p_html_marked)
    const limpo = String(args.p_html)
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
    const args = argsDaRpc()
    expect(String(args.p_html)).not.toContain("<tr><td>offer")
    // A remoção vai NA transação, não como um delete solto antes dela.
    expect(args.p_removidos).toEqual([B.offer])
    expect(h.deletes.filter((d) => d.table === "email_blocks")).toEqual([])
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
    // A revisão salva mesmo assim, e o documento vai NULL: a função sabe
    // que "não mexer" é diferente de "gravar vazio".
    const args = argsDaRpc()
    expect(args.p_html).toBeNull()
    expect(args.p_html_marked).toBeNull()
    expect((args.p_revisao as Record<string, unknown>).justificativa).toBeTruthy()
  })

  it("manda o diff das duas ordens e os leitores para a transação", async () => {
    await POST(req(baseBody), ctx())
    const rev = argsDaRpc().p_revisao as Record<string, unknown>
    expect(rev.ordem_anterior).toEqual(["hero", "body", "offer", "reviews"])
    expect(rev.ordem_nova).toEqual(["hero", "body", "reviews", "offer"])
    expect(rev.para_estruturador).toBe(true)
    expect(rev.para_montador).toBe(true)
    expect(rev.para_curador).toBe(false)
    expect(rev.store_id).toBe("loja-a")
    // A desativação da anterior é da função, não da rota.
    expect(h.desativacoes).toBe(0)
  })

  it("alcance do flow vai sem loja (vale para qualquer uma)", async () => {
    await POST(req({ ...baseBody, alcance: "todo_email_do_flow" }), ctx())
    expect((argsDaRpc().p_revisao as Record<string, unknown>).store_id).toBeNull()
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
    // A ordem e a revisão seguem; só o documento fica de fora.
    const args = argsDaRpc()
    expect(args.p_html_marked).toBeNull()
    expect(args.p_ordem).toEqual(baseBody.ordem)
  })

  // ── Contrato com o banco (28/08) ──────────────────────────────────────
  //
  // O mock não tem UNIQUE (email_id, position), então nenhum teste daqui
  // consegue reproduzir o "Registro duplicado". O que dá para cobrar é que
  // a rota não volte a escrever posição a posição — que era a causa.

  it("uma transação só: nenhum UPDATE solto de posição ou de HTML", async () => {
    await POST(req(baseBody), ctx())
    argsDaRpc() // exige exatamente uma chamada, e da função certa
    expect(h.updates.filter((u) => u.table === "email_blocks")).toEqual([])
    expect(h.updates.filter((u) => u.table === "email_flow_emails")).toEqual([])
    expect(h.updates.filter((u) => u.table === "email_structure_reviews")).toEqual([])
  })

  it("a ordem enviada é a ordem completa dos blocos que ficam", async () => {
    await POST(
      req({ ...baseBody, ordem: [B.reviews, B.hero, B.body], removidos: [B.offer] }),
      ctx(),
    )
    const args = argsDaRpc()
    expect(args.p_ordem).toEqual([B.reviews, B.hero, B.body])
    expect(args.p_removidos).toEqual([B.offer])
    expect(args.p_email_id).toBe(EMAIL_ID)
  })
})
