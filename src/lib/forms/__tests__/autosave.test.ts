import { describe, expect, it } from "vitest"
import { podeSalvarSozinho, seloDeVersao, textoDoSave } from "../autosave"

describe("podeSalvarSozinho", () => {
  it("antes da hidratação nunca salva — gravaria o vazio por cima do real", () => {
    expect(podeSalvarSozinho({ hidratado: false, fluxoIndisponivel: false, emVoo: false })).toBe("nao")
  })
  it("fluxo indisponível deixa o save para a mão", () => {
    expect(podeSalvarSozinho({ hidratado: true, fluxoIndisponivel: true, emVoo: false })).toBe("nao")
  })
  it("save em voo espera em vez de empilhar", () => {
    expect(podeSalvarSozinho({ hidratado: true, fluxoIndisponivel: false, emVoo: true })).toBe("espera")
  })
  it("caso normal salva", () => {
    expect(podeSalvarSozinho({ hidratado: true, fluxoIndisponivel: false, emVoo: false })).toBe("salva")
  })
})

describe("textoDoSave", () => {
  const em = new Date("2026-09-18T12:00:00Z")
  it("recém-salvo é 'Salvo agora'", () => {
    expect(textoDoSave({ tipo: "salvo", em }, new Date("2026-09-18T12:00:05Z"))).toBe("Salvo agora")
  })
  it("passa a contar segundos e minutos", () => {
    expect(textoDoSave({ tipo: "salvo", em }, new Date("2026-09-18T12:00:40Z"))).toBe("Salvo há 40 s")
    expect(textoDoSave({ tipo: "salvo", em }, new Date("2026-09-18T12:05:00Z"))).toBe("Salvo há 5 min")
  })
  it("os outros estados", () => {
    expect(textoDoSave({ tipo: "salvando" })).toBe("Salvando…")
    expect(textoDoSave({ tipo: "pendente" })).toBe("Alterações não salvas")
    expect(textoDoSave({ tipo: "erro", mensagem: "500" })).toBe("Não salvou: 500")
  })
})

describe("seloDeVersao", () => {
  it("publicado sem pendência = no ar", () => {
    expect(seloDeVersao({ status: "published", versao: 5, rascunhoPendente: false })).toEqual({
      texto: "v5 · no ar",
      tom: "ar",
    })
  })
  it("publicado com edição = rascunho pendente", () => {
    expect(seloDeVersao({ status: "published", versao: 5, rascunhoPendente: true }).texto).toBe(
      "v5 · rascunho pendente",
    )
  })
  it("publicado sem versão (página única antiga) é rascunho, não v0", () => {
    expect(seloDeVersao({ status: "published", versao: 0, rascunhoPendente: false }).tom).toBe("rascunho")
  })
  it("arquivado", () => {
    expect(seloDeVersao({ status: "archived", versao: 3, rascunhoPendente: true }).tom).toBe("arquivado")
  })
})
