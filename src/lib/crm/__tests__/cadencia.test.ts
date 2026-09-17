import { describe, it, expect } from "vitest"
import {
  atalhoDoToque,
  linkDoWhatsApp,
  montarToque,
  preencherVariaveis,
  primeiroNome,
  proximoToque,
  rotuloDoBotao,
} from "../cadencia"

describe("atalhoDoToque", () => {
  it("T1 escolhe o script pelo segmento", () => {
    expect(atalhoDoToque("T1", "A · Aluno Luan")).toBe("/t1a")
    expect(atalhoDoToque("T1", "B · Fez call, não comprou")).toBe("/t1b")
    expect(atalhoDoToque("T1", "C · Agendou, não fez call")).toBe("/t1c")
    expect(atalhoDoToque("T1", "D · MQL sem conversa")).toBe("/t1d")
  })

  it("segmento desconhecido cai no neutro, NUNCA no do aluno", () => {
    // O /t1a diz "o Luan comentou que você está na mentoria" — mandar
    // isso pra quem nunca comprou queima a abordagem e o parceiro.
    expect(atalhoDoToque("T1", null)).toBe("/t1d")
    expect(atalhoDoToque("T1", "Aguardando liberação Luan")).toBe("/t1d")
    expect(atalhoDoToque("T1", "")).toBe("/t1d")
  })

  it("T2 e T3 são iguais pra todo segmento", () => {
    expect(atalhoDoToque("T2", "A · Aluno Luan")).toBe("/t2")
    expect(atalhoDoToque("T3", "D · MQL sem conversa")).toBe("/t3")
  })
})

describe("primeiroNome", () => {
  it("usa o primeiro nome", () => {
    expect(primeiroNome("João Pedro Silva")).toBe("João")
  })

  it("caixa alta da planilha vira capitalizado — 'JOÃO' soa como grito", () => {
    expect(primeiroNome("JOÃO PEDRO")).toBe("João")
    expect(primeiroNome("MARIA")).toBe("Maria")
  })

  it("nome vazio devolve vazio, não inventa tratamento", () => {
    expect(primeiroNome("")).toBe("")
    expect(primeiroNome("   ")).toBe("")
    expect(primeiroNome(null)).toBe("")
  })
})

describe("preencherVariaveis", () => {
  const t1a =
    "Oi {nome}, tudo bem? Aqui é o Bruno, da Convertfy. Sua loja já está no ar vendendo?"

  it("substitui {nome} pelo primeiro nome", () => {
    expect(preencherVariaveis(t1a, { nome: "Carla Souza Lima" })).toContain(
      "Oi Carla, tudo bem?",
    )
  })

  it("sem nome, some junto com o espaço — nunca 'Oi , tudo bem?'", () => {
    expect(preencherVariaveis(t1a, { nome: null })).toContain("Oi, tudo bem?")
    expect(preencherVariaveis(t1a, { nome: null })).not.toContain("Oi ,")
  })

  it("{nome} no começo da frase não deixa espaço à esquerda", () => {
    expect(preencherVariaveis("{nome}, separei o calendário", { nome: "Ana" })).toBe(
      "Ana, separei o calendário",
    )
    expect(preencherVariaveis("{nome}, separei o calendário", { nome: "" })).toBe(
      ", separei o calendário",
    )
  })

  it("{hora} é substituído na confirmação", () => {
    expect(
      preencherVariaveis("{nome}, confirmando amanhã às {hora}.", {
        nome: "Léo",
        hora: "15h",
      }),
    ).toBe("Léo, confirmando amanhã às 15h.")
  })

  it("chave NÃO fornecida mantém o placeholder — o composer não sabe a hora", () => {
    // Apagar deixaria "confirmando amanhã às." em silêncio.
    expect(
      preencherVariaveis("{nome}, confirmando amanhã às {hora}.", { nome: "Léo" }),
    ).toBe("Léo, confirmando amanhã às {hora}.")
  })

  it("chave fornecida e vazia some; não fornecida fica — a diferença é o ponto", () => {
    const corpo = "Oi {nome}, às {hora}."
    expect(preencherVariaveis(corpo, { nome: null, hora: "15h" })).toBe("Oi, às 15h.")
    expect(preencherVariaveis(corpo, { nome: "Ana", hora: null })).toBe("Oi Ana, às.")
    expect(preencherVariaveis(corpo, { nome: "Ana" })).toBe("Oi Ana, às {hora}.")
  })

  it("variável desconhecida FICA — apagá-la esconderia erro de cadastro", () => {
    expect(preencherVariaveis("Oi {primeiro_nome}", { nome: "Ana" })).toBe(
      "Oi {primeiro_nome}",
    )
  })

  it("corpo sem variável nenhuma passa intacto", () => {
    expect(preencherVariaveis("Bom dia!", { nome: "Ana" })).toBe("Bom dia!")
  })
})

describe("linkDoWhatsApp", () => {
  it("monta o link com o texto codificado", () => {
    const url = linkDoWhatsApp("+55 (11) 99999-8888", "Oi Ana, tudo bem?")
    expect(url).toBe("https://wa.me/5511999998888?text=Oi%20Ana%2C%20tudo%20bem%3F")
  })

  it("codifica & e # — crus cortariam a mensagem no meio", () => {
    const url = linkDoWhatsApp("5511999998888", "e-mail & SMS #BF")!
    expect(url).toContain("%26")
    expect(url).toContain("%23")
    expect(url).not.toMatch(/text=.*[&#]/)
  })

  it("telefone curto devolve null — o botão só saberia falhar", () => {
    expect(linkDoWhatsApp("1199", "oi")).toBeNull()
    expect(linkDoWhatsApp("", "oi")).toBeNull()
  })

  it("texto vazio abre a conversa sem mensagem", () => {
    expect(linkDoWhatsApp("5511999998888", "  ")).toBe("https://wa.me/5511999998888")
  })
})

describe("proximoToque", () => {
  it("anda T1 → T2 → T3 conforme as tentativas", () => {
    expect(proximoToque(0)).toBe("T1")
    expect(proximoToque(1)).toBe("T2")
    expect(proximoToque(2)).toBe("T3")
  })

  it("depois do T3 não existe T4 — quem decide é o job de SLA", () => {
    expect(proximoToque(3)).toBeNull()
    expect(proximoToque(9)).toBeNull()
  })

  it("contagem negativa (dado sujo) volta pro T1", () => {
    expect(proximoToque(-1)).toBe("T1")
  })
})

describe("rotuloDoBotao", () => {
  it("nomeia o toque ou declara o fim", () => {
    expect(rotuloDoBotao("T2")).toBe("Enviar T2")
    expect(rotuloDoBotao(null)).toBe("Cadência concluída")
  })
})

describe("montarToque", () => {
  const scripts = {
    "/t1a": "Oi {nome}, o Luan comentou que você está na mentoria.",
    "/t2": "{nome}, separei o calendário de Black Friday.",
    "/t3": "",
  }

  it("monta o texto do segmento certo", () => {
    const r = montarToque("T1", "A · Aluno Luan", scripts, { nome: "Ana Paula" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.atalho).toBe("/t1a")
      expect(r.texto).toBe("Oi Ana, o Luan comentou que você está na mentoria.")
    }
  })

  it("script não cadastrado recusa em vez de mandar vazio", () => {
    const r = montarToque("T1", "B · Fez call, não comprou", scripts, { nome: "Ana" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toBe("script_ausente")
      expect(r.atalho).toBe("/t1b")
    }
  })

  it("script cadastrado vazio também recusa", () => {
    const r = montarToque("T3", "A · Aluno Luan", scripts, { nome: "Ana" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe("script_vazio")
  })
})
