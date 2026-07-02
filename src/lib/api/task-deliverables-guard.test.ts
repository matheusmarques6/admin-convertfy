import { describe, it, expect, beforeEach } from "vitest"

// Mock admin client: banco em memória com a cadeia usada pelo guard
// (from -> select -> eq -> eq -> await). Suporta `await query` direto.
type Row = Record<string, unknown>
const db: Record<string, Row[]> = {
  task_deliverables: [],
}
function resetDb() {
  for (const k of Object.keys(db)) db[k] = []
}
function makeQuery(table: string) {
  const filters: Array<[string, unknown]> = []
  const run = () =>
    (db[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return chain
    },
    // suporta `await query` (o guard destrutura { data })
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: run(), error: null }),
  }
  return chain
}
const admin = { from: (t: string) => makeQuery(t) } as never

import { guardRequiredDeliverables } from "./task-deliverables-guard"

beforeEach(() => {
  resetDb()
})

describe("guardRequiredDeliverables — gate de entregável obrigatório por task", () => {
  it("libera (null) quando a task NÃO tem entregável (ex.: as 3 tasks de produção)", async () => {
    expect(await guardRequiredDeliverables(admin, "t-prod")).toBeNull()
  })

  it("bloqueia quando o entregável required (Figma) está vazio", async () => {
    db.task_deliverables.push({
      task_id: "t-estrutura",
      field_label: "Link do Figma",
      field_type: "url",
      required: true,
      value: null,
      file_url: null,
      filled_at: null,
    })
    const reason = await guardRequiredDeliverables(admin, "t-estrutura")
    expect(reason).toContain("Anexe antes de concluir")
    expect(reason).toContain("Link do Figma")
  })

  it("libera (null) quando o entregável required tem value preenchido", async () => {
    db.task_deliverables.push({
      task_id: "t-estrutura",
      field_label: "Link do Figma",
      required: true,
      value: "https://figma.com/file/abc",
      file_url: null,
      filled_at: null,
    })
    expect(await guardRequiredDeliverables(admin, "t-estrutura")).toBeNull()
  })

  it("libera (null) quando preenchido via file_url (upload de arquivo)", async () => {
    db.task_deliverables.push({
      task_id: "t-estrutura",
      field_label: "Arquivo final",
      required: true,
      value: null,
      file_url: "https://cdn/arquivo.pdf",
      filled_at: null,
    })
    expect(await guardRequiredDeliverables(admin, "t-estrutura")).toBeNull()
  })

  it("ignora entregáveis NÃO obrigatórios — só required entra no gate", async () => {
    // `required=false` nem é retornado pela query (.eq('required', true)),
    // então uma task só com entregáveis opcionais vazios conclui livremente.
    db.task_deliverables.push({
      task_id: "t-estrutura",
      field_label: "Observação opcional",
      required: false,
      value: null,
      file_url: null,
      filled_at: null,
    })
    expect(await guardRequiredDeliverables(admin, "t-estrutura")).toBeNull()
  })

  it("lista TODOS os obrigatórios faltando, separados por vírgula", async () => {
    db.task_deliverables.push({
      task_id: "t-multi",
      field_label: "Link do Figma",
      required: true,
      value: null,
      file_url: null,
      filled_at: null,
    })
    db.task_deliverables.push({
      task_id: "t-multi",
      field_label: "Briefing aprovado",
      required: true,
      value: null,
      file_url: null,
      filled_at: null,
    })
    const reason = await guardRequiredDeliverables(admin, "t-multi")
    expect(reason).toContain("Link do Figma")
    expect(reason).toContain("Briefing aprovado")
  })

  it("bloqueia parcial: um preenchido, outro vazio => reporta só o vazio", async () => {
    db.task_deliverables.push({
      task_id: "t-parcial",
      field_label: "Link do Figma",
      required: true,
      value: "https://figma.com/x",
      file_url: null,
      filled_at: null,
    })
    db.task_deliverables.push({
      task_id: "t-parcial",
      field_label: "Briefing aprovado",
      required: true,
      value: null,
      file_url: null,
      filled_at: null,
    })
    const reason = await guardRequiredDeliverables(admin, "t-parcial")
    expect(reason).toContain("Briefing aprovado")
    expect(reason).not.toContain("Link do Figma")
  })
})
