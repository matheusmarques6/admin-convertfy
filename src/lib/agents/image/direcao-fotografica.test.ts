import { describe, it, expect } from "vitest"
import {
  cenaExigePessoa,
  conflitoCenaDirecao,
  direcaoProibePessoa,
  ehDirecaoEmRascunho,
  lerDirecao,
} from "./direcao-fotografica"

/** A direção REAL da `body 8 - cards vidro` em 15/09. */
const BODY8 =
  "Pendente da referência. O que dá para fixar pelo código:\n\n" +
  "A faixa inferior da composição (y 731–850 em 1x) fica atrás de um botão preto.\n" +
  "Número de fotos, enquadramento, luz e posição dos cards: aguardando o PNG."

/** Trecho da `welcome - hero section 3`. */
const HERO3 =
  "Composição. Flat-lay em ângulo alto com o kit de produtos espalhado na metade inferior.\n" +
  "Produto. Kit completo, não produto único. Rótulos legíveis. Nenhuma mão, nenhuma pessoa.\n" +
  "Proibições: topo nítido · fundo branco de estúdio · pessoa ou mão · sombra dura · vinheta."

const CENA_INNOVA =
  "produto real (EnergySave Pro) plugado numa tomada de parede em ambiente doméstico comum, luz natural, mão adulta encaixando o plug — sem render, sem estúdio"

describe("ehDirecaoEmRascunho — o caso da body 8 (15/09)", () => {
  it("'Pendente da referência… aguardando o PNG' é rascunho", () => {
    expect(ehDirecaoEmRascunho(BODY8)).toBe(true)
  })
  it("vazio e nulo contam como rascunho (ausência)", () => {
    expect(ehDirecaoEmRascunho("")).toBe(true)
    expect(ehDirecaoEmRascunho(null)).toBe(true)
    expect(ehDirecaoEmRascunho("   ")).toBe(true)
  })
  it("direção escrita não é rascunho — 'pendente' no meio de uma frase de foto não conta", () => {
    expect(ehDirecaoEmRascunho(HERO3)).toBe(false)
    expect(ehDirecaoEmRascunho("Luz pendente do teto, quente, sobre a mesa.")).toBe(false)
  })
})

describe("direcaoProibePessoa × cenaExigePessoa", () => {
  it("hero-3 proíbe gente; a cena da Innova exige mão → conflito", () => {
    expect(direcaoProibePessoa(HERO3)).toBe(true)
    expect(cenaExigePessoa(CENA_INNOVA)).toBe(true)
    expect(conflitoCenaDirecao(CENA_INNOVA, lerDirecao(HERO3))).toMatch(/proíbe pessoa\/mão/)
  })
  it("'sem sombra dura' não é proibição de pessoa; cena 'sem pessoa' não exige gente", () => {
    expect(direcaoProibePessoa("Proibições: sombra dura · vinheta · texto queimado.")).toBe(false)
    expect(cenaExigePessoa("produto na tomada, sem pessoa, luz natural")).toBe(false)
  })
  it("inglês: 'no hands' proíbe; 'a hand plugging it in' exige", () => {
    expect(direcaoProibePessoa("Still life. No hands, no people.")).toBe(true)
    expect(cenaExigePessoa("a hand plugging the device into a wall socket")).toBe(true)
  })
  it("rascunho ou direção ausente NUNCA conflita (fail-open)", () => {
    expect(conflitoCenaDirecao(CENA_INNOVA, lerDirecao(BODY8))).toBeNull()
    expect(conflitoCenaDirecao(CENA_INNOVA, lerDirecao(null))).toBeNull()
    expect(conflitoCenaDirecao(null, lerDirecao(HERO3))).toBeNull()
  })
  it("cena sem gente convive com direção que proíbe gente", () => {
    expect(conflitoCenaDirecao("produto plugado na tomada, luz natural", lerDirecao(HERO3))).toBeNull()
  })
})
