import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { motivoDoEnvio } from "./motivo-do-envio"

describe("motivoDoEnvio", () => {
  it("traduz a variavel faltando com o mesmo rotulo do dialogo", () => {
    // Quem leu "falta o link do Figma do preview" antes de avancar tem de ler
    // a MESMA frase depois, no registro — vocabulario diferente dos dois lados
    // faz o operador achar que sao dois problemas.
    expect(motivoDoEnvio("vars_faltando:figma_link")).toBe(
      "faltava o link do Figma do preview",
    )
  })

  it("junta duas variaveis com 'e'", () => {
    expect(motivoDoEnvio("vars_faltando:figma_link,tutorial_link")).toBe(
      "faltava o link do Figma do preview e o link do tutorial",
    )
  })

  it("traduz cada motivo constante", () => {
    expect(motivoDoEnvio("no_phone")).toContain("telefone")
    expect(motivoDoEnvio("no_channel")).toContain("canal de WhatsApp")
    expect(motivoDoEnvio("channel_missing_creds")).toContain("credenciais")
    expect(motivoDoEnvio("send_failed")).toContain("provedor")
    expect(motivoDoEnvio("no_template")).toContain("não tem mensagem")
  })

  it("motivo desconhecido aparece CRU, nao vira explicacao inventada", () => {
    const m = motivoDoEnvio("motivo_que_nao_existe")
    expect(m).toContain("motivo_que_nao_existe")
    expect(m).toContain("não reconhecido")
  })

  it("sem motivo nao inventa causa", () => {
    expect(motivoDoEnvio(null)).toBe("motivo não informado")
    expect(motivoDoEnvio(undefined)).toBe("motivo não informado")
    expect(motivoDoEnvio("")).toBe("motivo não informado")
  })

  it("vars_faltando sem lista ainda diz algo util", () => {
    expect(motivoDoEnvio("vars_faltando:")).toContain("variável")
  })

  it("cobre TODOS os reason que o servico sabe devolver", () => {
    // O servico e a fonte: motivo novo la sem entrada aqui sai como "não
    // reconhecido" na tela do operador. O teste le o codigo em vez de repetir
    // a lista, que divergiria em silencio.
    const fonte = readFileSync(
      new URL("../services/onboarding-whatsapp.service.ts", import.meta.url),
      "utf-8",
    )
    const reasons = new Set(
      [...fonte.matchAll(/reason:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    )
    expect(reasons.size).toBeGreaterThan(4)
    for (const r of reasons) {
      expect(motivoDoEnvio(r), `reason "${r}" sem tradução`).not.toContain(
        "não reconhecido",
      )
    }
  })
})
