import { describe, it, expect } from "vitest"
import {
  LIMITE_ORIENTACAO,
  SEM_ORIENTACAO,
  aplicaveis,
  montarBlocoOrientacoes,
  rotuloEscopo,
  type Orientacao,
} from "./orientacoes"

const geral: Orientacao = {
  escopo: "global",
  texto: "Depoimento nunca fecha o email.",
}
const doFlow: Orientacao = {
  escopo: "flow",
  flow_type: "welcome",
  texto: "Nunca abra com desconto.",
}
const doEmail: Orientacao = {
  escopo: "email",
  flow_type: "welcome",
  email_number: 1,
  texto: "Sempre entregue o cupom no hero.",
}

describe("montarBlocoOrientacoes", () => {
  // A mais específica por último: é onde o modelo dá mais peso quando duas
  // se contradizem, e é a que o COO escreveu sabendo mais sobre o caso.
  it("ordena da mais ampla para a mais específica", () => {
    const bloco = montarBlocoOrientacoes([doEmail, geral, doFlow])
    const posGeral = bloco.indexOf("Depoimento nunca fecha")
    const posFlow = bloco.indexOf("Nunca abra com desconto")
    const posEmail = bloco.indexOf("Sempre entregue o cupom")
    expect(posGeral).toBeGreaterThanOrEqual(0)
    expect(posGeral).toBeLessThan(posFlow)
    expect(posFlow).toBeLessThan(posEmail)
  })

  it("cada orientação vem com o alcance escrito", () => {
    const bloco = montarBlocoOrientacoes([doEmail])
    expect(bloco).toContain("[Todo welcome #1, em qualquer loja]")
  })

  // Preencher os três é opcional — era o pedido.
  it("só uma preenchida → só ela no bloco", () => {
    const bloco = montarBlocoOrientacoes([doFlow])
    expect(bloco).toContain("Nunca abra com desconto")
    expect(bloco).not.toContain("cupom no hero")
  })

  it("texto vazio ou só espaços não entra", () => {
    const bloco = montarBlocoOrientacoes([
      { escopo: "global", texto: "   " },
      doFlow,
    ])
    expect(bloco).not.toContain("[Toda geração")
    expect(bloco).toContain("Nunca abra com desconto")
  })

  it("nenhuma → texto de vazio (o prompt não muda de forma)", () => {
    expect(montarBlocoOrientacoes([])).toBe(SEM_ORIENTACAO)
    expect(montarBlocoOrientacoes([{ escopo: "flow", texto: "" }])).toBe(
      SEM_ORIENTACAO,
    )
  })

  // O bloco vive dentro de <orientacao_do_coo>: texto do COO com `<` não
  // pode fechar a tag por acidente. O conteúdo entra cru (é o que o modelo
  // deve ler), então o teste fixa que nada é reescrito às escondidas.
  it("preserva o texto do COO literalmente", () => {
    const bloco = montarBlocoOrientacoes([
      { escopo: "global", texto: "Use < 3 blocos & nada de </p> solto" },
    ])
    expect(bloco).toContain("Use < 3 blocos & nada de </p> solto")
  })

  it("escopo + kind repetido não duplica o bloco", () => {
    const bloco = montarBlocoOrientacoes([
      doFlow,
      { escopo: "flow", flow_type: "welcome", texto: "outra coisa" },
    ])
    expect(bloco.match(/\[Todo email do flow welcome\]/g)).toHaveLength(1)
  })

  // Intenção e progressão são DUAS coisas sobre o mesmo flow. Deduplicar só
  // por escopo colapsaria as duas numa entrada e perderia metade do que o
  // curador escreveu.
  it("intenção e progressão do flow convivem, com rótulos próprios", () => {
    const bloco = montarBlocoOrientacoes([
      { escopo: "flow", kind: "progressao", flow_type: "welcome", texto: "A forma muda a cada toque." },
      { escopo: "flow", kind: "intencao", flow_type: "welcome", texto: "Entregar o cupom e dizer quem é a marca." },
    ])
    expect(bloco).toContain("[Intenção do flow — todo email do flow welcome]")
    expect(bloco).toContain("[Progressão do flow — todo email do flow welcome]")
    expect(bloco).toContain("Entregar o cupom e dizer quem é a marca.")
    expect(bloco).toContain("A forma muda a cada toque.")
  })

  it("a intenção do flow vem antes da progressão", () => {
    const bloco = montarBlocoOrientacoes([
      { escopo: "flow", kind: "progressao", flow_type: "welcome", texto: "P" },
      { escopo: "flow", kind: "intencao", flow_type: "welcome", texto: "I" },
    ])
    // A intenção é o contrato; a progressão é como ele se desdobra.
    expect(bloco.indexOf("Intenção do flow")).toBeLessThan(
      bloco.indexOf("Progressão do flow"),
    )
  })

  it("os dois kinds do flow entram entre a global e a do e-mail", () => {
    const bloco = montarBlocoOrientacoes([
      doEmail,
      geral,
      { escopo: "flow", kind: "intencao", flow_type: "welcome", texto: "I" },
      { escopo: "flow", kind: "progressao", flow_type: "welcome", texto: "P" },
    ])
    const ordem = [
      bloco.indexOf("Toda geração"),
      bloco.indexOf("Intenção do flow"),
      bloco.indexOf("Progressão do flow"),
      bloco.indexOf("em qualquer loja"),
    ]
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
    expect(ordem.every((i) => i >= 0)).toBe(true)
  })

  it("orientação sem kind continua valendo como geral", () => {
    // Retrocompat: linha gravada antes da migration 20261092 não tem kind.
    const bloco = montarBlocoOrientacoes([doFlow])
    expect(bloco).toContain("[Todo email do flow welcome]")
    expect(bloco).toContain("Nunca abra com desconto.")
  })
})

describe("aplicaveis", () => {
  const todas = [
    geral,
    doFlow,
    doEmail,
    { escopo: "flow", flow_type: "winback", texto: "x" } as Orientacao,
    {
      escopo: "email",
      flow_type: "welcome",
      email_number: 3,
      texto: "y",
    } as Orientacao,
  ]

  it("global sempre entra; flow e email só quando batem", () => {
    const r = aplicaveis(todas, "welcome", 1)
    expect(r).toEqual([geral, doFlow, doEmail])
  })

  it("email de outro número não traz a orientação do #1", () => {
    const r = aplicaveis(todas, "welcome", 2)
    expect(r).toEqual([geral, doFlow])
  })

  it("flow sem orientação própria fica só com a global", () => {
    const r = aplicaveis(todas, "upsell", 1)
    expect(r).toEqual([geral])
  })
})

describe("rotuloEscopo", () => {
  it("distingue intenção de progressão no rótulo do flow", () => {
    expect(rotuloEscopo("flow", "welcome", null, "intencao")).toBe(
      "Intenção do flow — todo email do flow welcome",
    )
    expect(rotuloEscopo("flow", "welcome", null, "progressao")).toBe(
      "Progressão do flow — todo email do flow welcome",
    )
    // Sem kind, o rótulo de antes — é o que o Estúdio ainda usa.
    expect(rotuloEscopo("flow", "welcome")).toBe("Todo email do flow welcome")
  })

  it("descreve o alcance de cada escopo", () => {
    expect(rotuloEscopo("global")).toBe("Toda geração, qualquer flow")
    expect(rotuloEscopo("flow", "welcome")).toBe("Todo email do flow welcome")
    expect(rotuloEscopo("email", "welcome", 1)).toBe(
      "Todo welcome #1, em qualquer loja",
    )
  })
})

describe("LIMITE_ORIENTACAO", () => {
  it("cabe o documento inteiro de uma régua", () => {
    // O teto anterior (4000) era o limite de MENSAGEM do WhatsApp, copiado
    // de outra tela; cortava uma especificação de fluxo no meio da frase.
    expect(LIMITE_ORIENTACAO).toBeGreaterThanOrEqual(50_000)
  })

  it("o bloco entrega o texto longo inteiro, sem truncar", () => {
    // Se algum dia alguém puser um `slice` aqui "para caber no prompt", o
    // fim da orientação sumiria calado — que é exatamente o defeito que a
    // UI acabou de perder.
    const longo = "L".repeat(LIMITE_ORIENTACAO)
    const bloco = montarBlocoOrientacoes([
      { escopo: "flow", kind: "intencao", flow_type: "welcome", texto: longo },
    ])
    expect(bloco).toContain(longo)
  })
})
