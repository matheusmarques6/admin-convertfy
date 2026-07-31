/**
 * O formato de resposta de /chat/findChats e /chat/findMessages mudou
 * entre versões da Evolution (array cru → {records} → {chats|messages:
 * {records}}). Como não controlamos a versão instalada no servidor, o
 * parser aceita as três formas — estes testes travam esse contrato.
 */

import { describe, it, expect } from "vitest"
import { unwrapRecords, pickEnvelope } from "./evolution-api"

describe("unwrapRecords", () => {
  it("aceita array cru (builds antigas)", () => {
    const json = [{ id: "1" }, { id: "2" }]
    expect(unwrapRecords(json, "messages")).toHaveLength(2)
  })

  it("aceita {records} na raiz", () => {
    const json = { records: [{ id: "1" }] }
    expect(unwrapRecords(json, "messages")).toHaveLength(1)
  })

  it("aceita envelope {messages:{records}} (v2)", () => {
    const json = { messages: { total: 40, pages: 4, currentPage: 1, records: [{ id: "1" }, { id: "2" }] } }
    expect(unwrapRecords(json, "messages")).toHaveLength(2)
  })

  it("aceita {chats:[...]} — lista direto sob a chave", () => {
    const json = { chats: [{ remoteJid: "5511@s.whatsapp.net" }] }
    expect(unwrapRecords(json, "chats")).toHaveLength(1)
  })

  it("devolve vazio para null, string e objeto sem lista", () => {
    expect(unwrapRecords(null, "messages")).toEqual([])
    expect(unwrapRecords("erro", "messages")).toEqual([])
    expect(unwrapRecords({ error: "boom" }, "messages")).toEqual([])
  })

  it("não confunde envelope de outra chave", () => {
    const json = { chats: { records: [{ id: "1" }] } }
    expect(unwrapRecords(json, "messages")).toEqual([])
  })
})

describe("pickEnvelope", () => {
  it("extrai total/pages do envelope v2", () => {
    const json = { messages: { total: 120, pages: 2, records: [] } }
    const env = pickEnvelope(json, "messages")
    expect(env?.total).toBe(120)
    expect(env?.pages).toBe(2)
  })

  it("devolve null quando a chave é uma lista, não um envelope", () => {
    expect(pickEnvelope({ messages: [{ id: "1" }] }, "messages")).toBeNull()
  })

  it("devolve null para array cru e para null", () => {
    expect(pickEnvelope([{ id: "1" }], "messages")).toBeNull()
    expect(pickEnvelope(null, "messages")).toBeNull()
  })
})
