import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }))
vi.mock("@/lib/services/credentials.service", () => ({ getStoreCredentials: vi.fn() }))

import { cupomExisteNaPlataforma } from "./discount-lookup"

const resposta = (codes: string[]) => ({
  discountNodes: { edges: codes.length ? [{ node: { id: "gid://1", discount: { title: "Welcome", codes: { nodes: codes.map((code) => ({ code })) } } } }] : [] },
})

describe("cupomExisteNaPlataforma", () => {
  it("sem token: NÃO conferido (nota, não issue) e nenhuma chamada", async () => {
    const consultar = vi.fn()
    const r = await cupomExisteNaPlataforma("s1", "WELCOME10", { credenciais: async () => ({ shopify_access_token: null }), consultar })
    expect(r).toEqual({ conferido: false, motivo: "sem_token", codigo: "WELCOME10" })
    expect(consultar).not.toHaveBeenCalled()
  })
  it("com token e código cadastrado: existe", async () => {
    const r = await cupomExisteNaPlataforma("s1", "welcome10", {
      credenciais: async () => ({ shopify_access_token: "tok", shopify_store_domain: "loja.myshopify.com" }),
      consultar: async () => resposta(["WELCOME10"]),
    })
    expect(r).toMatchObject({ conferido: true, existe: true, titulo: "Welcome" })
  })
  it("com token e código ausente: conferido e NÃO existe", async () => {
    const r = await cupomExisteNaPlataforma("s1", "WELCOME10", {
      credenciais: async () => ({ shopify_access_token: "tok", shopify_store_domain: "loja.myshopify.com" }),
      consultar: async () => resposta(["OUTRO"]),
    })
    expect(r).toMatchObject({ conferido: true, existe: false })
  })
  it("erro da API vira não conferido com o detalhe — nunca lança", async () => {
    const r = await cupomExisteNaPlataforma("s1", "WELCOME10", {
      credenciais: async () => ({ shopify_access_token: "tok", shopify_store_domain: "loja.myshopify.com" }),
      consultar: async () => { throw new Error("Shopify GraphQL error: 401") },
    })
    expect(r).toMatchObject({ conferido: false, motivo: "erro" })
  })
})
