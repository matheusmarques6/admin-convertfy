import { describe, expect, it } from "vitest"

import { proporLacunas } from "./vault-propostas.service"

/**
 * O defeito que este teste guarda (14/09): a busca do nome da loja pedia
 * `client_stores.name`, coluna que não existe — a resposta era 400 do
 * PostgREST em toda rodada, o `error` não era lido, e cada proposta saía com
 * "(loja não identificada)" no "Onde apareceu". Nome de coluna trocado não
 * aparece em `tsc` nem em lint: ou tem teste, ou só o log do Postgres conta.
 */

const RUN = {
  id: "11111111-2222-3333-4444-555555555555",
  store_id: "store-1",
  created_at: "2026-09-14T07:00:00.000Z",
  parsed_output: {
    protocol_violations: [
      { tipo: "aliviador_ausente", detalhe: "nenhuma posição realiza o aliviador pedido (reputacao_da_loja)" },
    ],
  },
}

/** Stub do SupabaseClient que REGISTRA o que foi pedido a cada tabela. */
function makeAdmin(opts: { lojaCols?: string[] } = {}) {
  const selects: Record<string, string> = {}
  const upserts: Array<Record<string, unknown>> = []

  const runsQuery = {
    select: (cols: string) => {
      selects.email_generation_runs = cols
      const q = {
        in: () => q,
        gte: () => q,
        order: () => q,
        limit: async () => ({ data: [RUN], error: null }),
      }
      return q
    },
  }

  // A loja só responde às colunas que EXISTEM — pedir outra devolve o 42703
  // do Postgres, como em produção.
  const lojasQuery = {
    select: (cols: string) => {
      selects.client_stores = cols
      const pedidas = cols.split(",").map((c) => c.trim())
      const existem = opts.lojaCols ?? ["id", "store_name"]
      const invalida = pedidas.find((c) => !existem.includes(c))
      return {
        in: async () =>
          invalida
            ? { data: null, error: { code: "42703", message: `column client_stores.${invalida} does not exist` } }
            : { data: [{ id: "store-1", store_name: "Hero Boxers" }], error: null },
      }
    },
  }

  const propostasQuery = {
    select: () => ({ in: async () => ({ data: [], error: null }) }),
    upsert: async (row: Record<string, unknown>) => {
      upserts.push(row)
      return { error: null }
    },
  }

  const admin = {
    from: (name: string) => {
      if (name === "email_generation_runs") return runsQuery
      if (name === "client_stores") return lojasQuery
      if (name === "vault_propostas") return propostasQuery
      throw new Error(`tabela inesperada: ${name}`)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return { admin, selects, upserts }
}

describe("proporLacunas — nome da loja", () => {
  it("pede `store_name` (a coluna que existe) e leva o nome ao exemplo", async () => {
    const { admin, selects, upserts } = makeAdmin()

    const r = await proporLacunas(admin, { minimo: 1 })

    expect(selects.client_stores).toContain("store_name")
    expect(selects.client_stores).not.toMatch(/\bname\b(?!_)/)
    expect(r.gravadas).toBe(1)
    const exemplos = upserts[0].exemplos as Array<{ storeName: string | null }>
    expect(exemplos[0].storeName).toBe("Hero Boxers")
    expect(upserts[0].markdown as string).toContain("Hero Boxers")
  })

  // Fail-open: sem o nome a proposta continua valendo — o que não pode é a
  // falha passar calada, que foi o que fez o defeito durar.
  it("falha na busca do nome não derruba a proposta", async () => {
    const { admin, upserts } = makeAdmin({ lojaCols: ["id"] })

    const r = await proporLacunas(admin, { minimo: 1 })

    expect(r.schema_missing).toBe(false)
    expect(r.gravadas).toBe(1)
    expect(upserts[0].markdown as string).toContain("(loja não identificada)")
  })
})
