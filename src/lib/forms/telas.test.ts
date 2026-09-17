import { describe, it, expect } from "vitest"
import { moverPergunta, telasDaSequencia, type PerguntaNaTela } from "./telas"

/** Tela 1 = [a, b] com título; tela 2 = [c]; tela 3 = [d]. */
function base(): PerguntaNaTela[] {
  return [
    { ref: "a", titulo_da_tela: "Seus dados" },
    { ref: "b", mesma_tela: true },
    { ref: "c" },
    { ref: "d" },
  ]
}

const refs = (l: PerguntaNaTela[]) => l.map((p) => p.ref)
const juntas = (l: PerguntaNaTela[]) => l.map((p) => Boolean(p.mesma_tela))

describe("arrastar para dentro de uma tela", () => {
  it("soltar sobre uma pergunta junta as duas na MESMA tela", () => {
    // O gesto que o pedido descreve: a pergunta da tela 2 vai para a 1.
    const out = moverPergunta(base(), "c", { tipo: "pergunta", ref: "b" })
    expect(refs(out)).toEqual(["a", "b", "c", "d"])
    expect(juntas(out)).toEqual([false, true, true, false])
    expect(telasDaSequencia(out).c.numero).toBe(1)
    expect(telasDaSequencia(out).a.tamanho).toBe(3)
  })

  it("entra logo DEPOIS do alvo, que é onde o dedo soltou", () => {
    const out = moverPergunta(base(), "d", { tipo: "pergunta", ref: "a" })
    expect(refs(out)).toEqual(["a", "d", "b", "c"])
    expect(telasDaSequencia(out).d.numero).toBe(1)
  })

  it("a pergunta de trás pode subir para a primeira tela", () => {
    const out = moverPergunta(base(), "d", { tipo: "pergunta", ref: "b" })
    expect(refs(out)).toEqual(["a", "b", "d", "c"])
    expect(telasDaSequencia(out).d.numero).toBe(1)
  })
})

describe("arrastar para fora", () => {
  it("soltar na faixa entre telas vira cabeça de tela nova", () => {
    const out = moverPergunta(base(), "b", { tipo: "nova_tela", antesDe: "d" })
    expect(refs(out)).toEqual(["a", "c", "b", "d"])
    expect(juntas(out)).toEqual([false, false, false, false])
    expect(telasDaSequencia(out).b.numero).toBe(3)
  })

  it("antesDe null manda para o fim", () => {
    const out = moverPergunta(base(), "a", { tipo: "nova_tela", antesDe: null })
    expect(refs(out)).toEqual(["b", "c", "d", "a"])
  })
})

describe("o que erra em silêncio", () => {
  it("o título da tela passa para a nova cabeça quando a antiga sai", () => {
    // Sem isto a tela continua existindo — com "b" — e sem nome, e nada
    // em tela diz que o arrasto apagou o título.
    const out = moverPergunta(base(), "a", { tipo: "nova_tela", antesDe: null })
    expect(out.find((p) => p.ref === "b")?.titulo_da_tela).toBe("Seus dados")
    expect(out.find((p) => p.ref === "a")?.titulo_da_tela).toBe("Seus dados")
  })

  it("título não é herdado quando quem sai não era cabeça", () => {
    const out = moverPergunta(base(), "b", { tipo: "nova_tela", antesDe: null })
    expect(out.find((p) => p.ref === "a")?.titulo_da_tela).toBe("Seus dados")
    expect(out.find((p) => p.ref === "b")?.titulo_da_tela).toBeUndefined()
  })

  it("entrar num grupo descarta o título que a pergunta carregava", () => {
    // Reaproveitá-lo nomearia a tela errada, com o texto de outra.
    const out = moverPergunta(base(), "a", { tipo: "pergunta", ref: "c" })
    expect(out.find((p) => p.ref === "a")?.titulo_da_tela).toBeUndefined()
  })

  it("a primeira pergunta NUNCA fica marcada como junta com a de cima", () => {
    // Deixar a flag gravada a faz reaparecer quando alguém puser outra
    // pergunta na frente, meses depois.
    const out = moverPergunta(base(), "b", { tipo: "nova_tela", antesDe: "a" })
    expect(refs(out)).toEqual(["b", "a", "c", "d"])
    expect(out[0].mesma_tela).toBeUndefined()
  })

  it("soltar em cima de si mesma devolve a MESMA lista", () => {
    // A tela usa a identidade para não gravar rascunho por um arrasto
    // que não moveu nada.
    const l = base()
    expect(moverPergunta(l, "b", { tipo: "pergunta", ref: "b" })).toBe(l)
    expect(moverPergunta(l, "b", { tipo: "nova_tela", antesDe: "b" })).toBe(l)
  })

  it("ref que não existe não inventa movimento", () => {
    const l = base()
    expect(moverPergunta(l, "zzz", { tipo: "pergunta", ref: "a" })).toBe(l)
    expect(moverPergunta(l, "a", { tipo: "pergunta", ref: "zzz" })).toBe(l)
  })
})

describe("leitura das telas", () => {
  it("conta tamanho e cabeça como a engine conta", () => {
    const t = telasDaSequencia(base())
    expect(t.a).toEqual({ numero: 1, tamanho: 2, cabeca: true, titulo: "Seus dados" })
    expect(t.b).toEqual({ numero: 1, tamanho: 2, cabeca: false, titulo: "Seus dados" })
    expect(t.c.numero).toBe(2)
    expect(t.d.numero).toBe(3)
  })

  it("lista que começa com a flag ainda tem tela 1", () => {
    const t = telasDaSequencia([{ ref: "x", mesma_tela: true }, { ref: "y", mesma_tela: true }])
    expect(t.x.numero).toBe(1)
    expect(t.y.numero).toBe(1)
  })
})
