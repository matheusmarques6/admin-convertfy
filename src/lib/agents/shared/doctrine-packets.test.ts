import { describe, expect, it } from "vitest"

import {
  doctrinePacket,
  doctrinePromptSegment,
  withDoctrine,
  type DoctrineOwner,
} from "./doctrine-packets"

const owners: DoctrineOwner[] = ["hero", "subject", "copy", "typography", "color"]

describe("pacotes de doutrina por responsabilidade", () => {
  it.each(owners)("serve somente o subconjunto de %s e registra versão/hash", (owner) => {
    const prompt = withDoctrine("PROMPT APROVADO", owner)
    const packet = doctrinePacket(owner)
    const segment = doctrinePromptSegment(owner)

    expect(prompt.startsWith("PROMPT APROVADO\n\n")).toBe(true)
    expect(prompt).toContain(packet.text)
    expect(packet.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(packet.sha8).toMatch(/^[a-f0-9]{8}$/)
    expect(segment).toMatchObject({ cls: "vault", sha8: packet.sha8, parte: "system" })

    for (const other of owners.filter((candidate) => candidate !== owner)) {
      expect(prompt).not.toContain(`<doutrina_${other}`)
    }
  })

  it("impede a fase 2 de sobrepor restrições factuais da loja", () => {
    const copy = doctrinePacket("copy").text
    const subject = doctrinePacket("subject").text

    for (const packet of [copy, subject]) {
      expect(packet).toMatch(/restrições factuais/i)
      expect(packet).toMatch(/precedência|ignore a regra conflitante/i)
      expect(packet).toMatch(/desconto.*prazo.*estoque.*frete.*cupom/i)
    }
  })

  it("separa doutrina visual de conteúdo editorial", () => {
    expect(doctrinePacket("typography").text).not.toMatch(/subject line|preview text/i)
    expect(doctrinePacket("color").text).not.toMatch(/subject line|preview text/i)
    expect(doctrinePacket("hero").text).not.toMatch(/segunda fonte|três pesos/i)
  })
})
