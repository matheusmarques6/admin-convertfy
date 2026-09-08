import { describe, expect, it } from "vitest"
import {
  ACCEPT_ANEXOS,
  cabeNoOrcamento,
  classificarArquivo,
  dimensaoReduzida,
  formatarBytes,
  limitarTexto,
  MAX_TEXTO_CHARS,
  ORCAMENTO_PAYLOAD,
  pesoDoAnexo,
  pesoTotal,
} from "./anexos"

describe("classificarArquivo", () => {
  it("a extensão decide antes do mime", () => {
    // O navegador manda .ts como `video/mp2t` (MPEG transport stream).
    // Classificar por mime recusaria todo arquivo TypeScript.
    expect(classificarArquivo("hook.ts", "video/mp2t")).toBe("texto")
    expect(classificarArquivo("dados.csv", "application/vnd.ms-excel")).toBe("texto")
  })

  it("reconhece planilha, documento e pdf", () => {
    expect(classificarArquivo("vendas.xlsx")).toBe("planilha")
    expect(classificarArquivo("contrato.docx")).toBe("documento")
    expect(classificarArquivo("relatorio.pdf")).toBe("pdf")
  })

  it("sem extensão conhecida, o mime resolve — é o caso do colar", () => {
    // A imagem da área de transferência chega como `image.png` genérico,
    // e arquivo baixado às vezes vem sem extensão nenhuma.
    expect(classificarArquivo("image.png", "image/png")).toBe("imagem")
    expect(classificarArquivo("captura", "image/webp")).toBe("imagem")
    expect(classificarArquivo("baixado", "application/pdf")).toBe("pdf")
  })

  it("formato que não sabemos ler devolve null, não um palpite", () => {
    expect(classificarArquivo("video.mp4", "video/mp4")).toBeNull()
    expect(classificarArquivo("arquivo.zip", "application/zip")).toBeNull()
  })

  it("caixa da extensão não importa", () => {
    expect(classificarArquivo("FOTO.PNG")).toBe("imagem")
    expect(classificarArquivo("Planilha.XLSX")).toBe("planilha")
  })
})

describe("ACCEPT_ANEXOS", () => {
  it("é derivado da lista, não escrito à mão", () => {
    // O `accept` do input e o que o código aceita eram duas listas; a
    // segunda esquecia formato que a primeira oferecia.
    expect(ACCEPT_ANEXOS).toContain("image/*")
    expect(ACCEPT_ANEXOS).toContain(".xlsx")
    expect(ACCEPT_ANEXOS).toContain("application/pdf")
    expect(ACCEPT_ANEXOS).toContain(".tsx")
  })
})

describe("pesoDoAnexo", () => {
  it("imagem pesa o COMPRIMENTO da data URL, não os bytes do arquivo", () => {
    // Base64 infla ~33%: medir o arquivo original subestima, e é assim
    // que o corpo estoura os 4,5 MB da Vercel sem ninguém perceber.
    const dataUrl = `data:image/webp;base64,${"A".repeat(1000)}`
    expect(pesoDoAnexo({ data_url: dataUrl })).toBe(dataUrl.length)
  })

  it("texto pesa o próprio conteúdo", () => {
    expect(pesoDoAnexo({ text: "abcde" })).toBe(5)
  })

  it("anexo vazio pesa zero em vez de quebrar", () => {
    expect(pesoDoAnexo({})).toBe(0)
  })
})

describe("cabeNoOrcamento", () => {
  it("o orçamento é do CONJUNTO", () => {
    // Dez imagens de 400 KB estouram o que uma de 3 MB não estoura — por
    // isso a conta não pode ser por arquivo.
    const grandes = Array.from({ length: 6 }, () => ({ data_url: "x".repeat(600_000) }))
    expect(pesoTotal(grandes)).toBe(3_600_000)
    expect(cabeNoOrcamento(grandes, 1)).toBe(false)
    expect(cabeNoOrcamento(grandes.slice(0, 5), 600_000)).toBe(true)
  })

  it("lista vazia aceita até o teto", () => {
    expect(cabeNoOrcamento([], ORCAMENTO_PAYLOAD)).toBe(true)
    expect(cabeNoOrcamento([], ORCAMENTO_PAYLOAD + 1)).toBe(false)
  })
})

describe("limitarTexto", () => {
  it("texto dentro do limite passa intacto", () => {
    expect(limitarTexto("oi")).toBe("oi")
  })

  it("corta E DIZ que cortou", () => {
    // Sem a marca, o modelo conclui a partir de metade da planilha
    // achando que leu tudo — mesma razão do `truncado` no web_abrir.
    const r = limitarTexto("a".repeat(MAX_TEXTO_CHARS + 10))
    expect(r.length).toBeGreaterThan(MAX_TEXTO_CHARS)
    expect(r).toContain("cortado")
    expect(r.slice(0, MAX_TEXTO_CHARS)).toBe("a".repeat(MAX_TEXTO_CHARS))
  })
})

describe("dimensaoReduzida", () => {
  it("imagem menor que o teto não é ampliada", () => {
    expect(dimensaoReduzida(800, 600)).toEqual({ largura: 800, altura: 600 })
  })

  it("reduz pelo lado MAIOR, preservando a proporção", () => {
    expect(dimensaoReduzida(3136, 1568)).toEqual({ largura: 1568, altura: 784 })
    expect(dimensaoReduzida(1568, 3136)).toEqual({ largura: 784, altura: 1568 })
  })

  it("nunca devolve lado zero", () => {
    // Print de 4000×3 (uma faixa) arredondaria a altura para 0 e o canvas
    // lançaria — o anexo sumiria sem mensagem.
    const r = dimensaoReduzida(4000, 3)
    expect(r.altura).toBeGreaterThanOrEqual(1)
  })

  it("dimensão zero (imagem que não decodificou) não divide por zero", () => {
    expect(dimensaoReduzida(0, 0)).toEqual({ largura: 0, altura: 0 })
  })
})

describe("formatarBytes", () => {
  it("usa a unidade que a pessoa lê", () => {
    expect(formatarBytes(512)).toBe("512 B")
    expect(formatarBytes(2048)).toBe("2 KB")
    expect(formatarBytes(1_500_000)).toBe("1,4 MB")
  })
})
