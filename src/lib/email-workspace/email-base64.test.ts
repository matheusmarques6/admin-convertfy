import { describe, expect, it } from "vitest"

import {
  auditarBase64,
  bytesDeBase64,
  encontrarDataUris,
  extensaoDoMime,
  extraiveis,
  PISO_PARA_EXTRAIR_CHARS,
  trocarDataUris,
} from "./email-base64"

/** Payload base64 sintético do tamanho pedido (múltiplo de 4, sem padding). */
const b64 = (chars: number) => "A".repeat(Math.ceil(chars / 4) * 4)

const img = (mime: string, payload: string) =>
  `<img src="data:${mime};base64,${payload}" width="120">`

describe("encontrarDataUris", () => {
  it("acha os data URIs de imagem do documento", () => {
    const html = `${img("image/png", b64(600))}<p>x</p>${img("image/jpeg", b64(800))}`
    const achados = encontrarDataUris(html)
    expect(achados).toHaveLength(2)
    expect(achados.map((a) => a.mime)).toEqual(["image/png", "image/jpeg"])
  })

  it("DEDUPLICA pelo conteúdo — o mesmo logo em quatro células é um arquivo", () => {
    // É o caso real: o rodapé repete o mesmo ícone nas colunas de redes
    // sociais. Sem dedupe, quatro uploads idênticos e quatro URLs.
    const mesmo = b64(700)
    const html = [img("image/png", mesmo), img("image/png", mesmo), img("image/png", mesmo)].join("")
    expect(encontrarDataUris(html)).toHaveLength(1)
  })

  it("ignora data URI que não é imagem", () => {
    const html = `<a href="data:text/html;base64,${b64(900)}">x</a>`
    expect(encontrarDataUris(html)).toHaveLength(0)
  })

  it("documento sem imagem embutida devolve lista vazia", () => {
    expect(encontrarDataUris('<img src="https://cdn/x.png">')).toEqual([])
  })
})

describe("o piso de extração", () => {
  it("extrai o que é grande o bastante para importar", () => {
    const html = img("image/png", b64(PISO_PARA_EXTRAIR_CHARS + 100))
    expect(extraiveis(encontrarDataUris(html))).toHaveLength(1)
  })

  it("DEIXA o miúdo embutido — trocar por URL ali só custa uma requisição", () => {
    // Espaçador de 1px inline é padrão antigo e deliberado em e-mail, e o
    // corte de 102 KB do Gmail não se decide nessa faixa.
    const html = img("image/gif", b64(80))
    expect(encontrarDataUris(html)).toHaveLength(1)
    expect(extraiveis(encontrarDataUris(html))).toHaveLength(0)
  })
})

describe("trocarDataUris", () => {
  it("troca todas as ocorrências do mesmo payload, não só a primeira", () => {
    const mesmo = b64(700)
    const html = [img("image/png", mesmo), img("image/png", mesmo)].join("")
    const r = trocarDataUris(html, new Map([[mesmo, "https://cdn/logo.png"]]))
    expect(r.trocados).toBe(2)
    expect(r.html).not.toContain("base64")
    expect(r.html.match(/https:\/\/cdn\/logo\.png/g)).toHaveLength(2)
  })

  it("payload SEM url no mapa fica INTACTO — nunca vira src vazio", () => {
    // Upload que falhou não pode apagar a imagem: o base64 ao menos
    // renderiza fora do Outlook, e `src=""` não renderiza em lugar nenhum.
    const a = b64(700)
    const b = b64(800)
    const html = img("image/png", a) + img("image/png", b)
    const r = trocarDataUris(html, new Map([[a, "https://cdn/a.png"]]))
    expect(r.trocados).toBe(1)
    expect(r.html).toContain("https://cdn/a.png")
    expect(r.html).toContain(`base64,${b}`)
  })

  it("é idempotente — rodar de novo num html já limpo não muda nada", () => {
    const limpo = '<img src="https://cdn/a.png">'
    expect(trocarDataUris(limpo, new Map([["x", "y"]]))).toEqual({
      html: limpo,
      trocados: 0,
    })
  })
})

describe("auditarBase64", () => {
  it("conta o que sai e estima o que o documento economiza", () => {
    const html = img("image/png", b64(4000)) + img("image/gif", b64(80))
    const a = auditarBase64(html)
    expect(a.total).toBe(2)
    expect(a.extraiveis).toBe(1) // o gif miúdo fica
    expect(a.charsEconomizados).toBeGreaterThan(3800)
    expect(a.ok).toBe(false)
  })

  it("documento limpo passa", () => {
    expect(auditarBase64('<img src="https://cdn/a.png">').ok).toBe(true)
  })
})

describe("mime e bytes", () => {
  it("mapeia o mime para uma extensão utilizável", () => {
    expect(extensaoDoMime("image/png")).toBe("png")
    expect(extensaoDoMime("image/jpeg")).toBe("jpg")
    expect(extensaoDoMime("image/svg+xml")).toBe("svg")
    expect(extensaoDoMime("image/webp")).toBe("webp")
    // Mime esquisito não pode gerar nome de arquivo inválido no Storage.
    expect(extensaoDoMime("image/vnd.microsoft.icon")).toMatch(/^[a-z0-9]+$/)
  })

  it("conta os bytes do arquivo, descontando o padding", () => {
    expect(bytesDeBase64("QUJD")).toBe(3) // "ABC"
    expect(bytesDeBase64("QUI=")).toBe(2) // "AB"
    expect(bytesDeBase64("QQ==")).toBe(1) // "A"
  })
})
