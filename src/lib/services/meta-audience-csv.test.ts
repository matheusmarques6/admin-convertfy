import { describe, expect, it } from "vitest"
import {
  buildFullClientsCsv,
  buildMetaAudienceCsv,
  META_HEADERS,
  normEmail,
  normPhone,
  normState,
  normZip,
  splitName,
  type ExportClient,
} from "./meta-audience-csv"

const client = (over: Partial<ExportClient> = {}): ExportClient => ({
  id: "c1",
  name: "Maria Silva",
  email: "maria@example.com",
  phone: "41996465011",
  company: null,
  ...over,
})

describe("normEmail", () => {
  it("baixa a caixa e tira espaços (o hash é feito sobre o texto)", () => {
    expect(normEmail("  Maria@Example.COM ")).toBe("maria@example.com")
  })

  it("descarta o que não é e-mail", () => {
    expect(normEmail("não tenho")).toBe("")
    expect(normEmail(null)).toBe("")
  })
})

describe("normPhone", () => {
  it("acrescenta o código do país em número brasileiro sem ele", () => {
    expect(normPhone("41996465011")).toBe("5541996465011")
    expect(normPhone("(41) 99646-5011")).toBe("5541996465011")
  })

  it("mantém quem já tem o 55", () => {
    expect(normPhone("5541996465011")).toBe("5541996465011")
  })

  it("aceita fixo de 10 dígitos", () => {
    expect(normPhone("4133334444")).toBe("554133334444")
  })

  it("remove zeros de discagem", () => {
    expect(normPhone("041996465011")).toBe("5541996465011")
  })

  it("descarta o que não tem tamanho de telefone", () => {
    expect(normPhone("123")).toBe("")
    expect(normPhone("")).toBe("")
    expect(normPhone(null)).toBe("")
  })
})

describe("splitName", () => {
  it("separa primeiro e último nome em minúsculas", () => {
    expect(splitName("Maria Silva")).toEqual({ fn: "maria", ln: "silva" })
  })

  it("ignora conectivo como sobrenome", () => {
    expect(splitName("Lucas de Souza")).toEqual({ fn: "lucas", ln: "souza" })
  })

  it("nome único fica sem sobrenome", () => {
    expect(splitName("Gustavo")).toEqual({ fn: "gustavo", ln: "" })
  })

  it("usa o último nome de um nome comprido", () => {
    expect(splitName("Lucas Moretson Pereira Vasconcelos")).toEqual({
      fn: "lucas",
      ln: "vasconcelos",
    })
  })

  it("vazio devolve vazio", () => {
    expect(splitName(null)).toEqual({ fn: "", ln: "" })
  })

  it("razão social não vira nome de pessoa", () => {
    expect(splitName("JMJC NEGOCIOS DIGITAIS LTDA")).toEqual({ fn: "", ln: "" })
    expect(splitName("Padaria do Ze ME")).toEqual({ fn: "", ln: "" })
  })
})

describe("normZip / normState", () => {
  it("CEP fica só com dígitos", () => {
    expect(normZip("80520-000")).toBe("80520000")
  })

  it("estado vira sigla minúscula", () => {
    expect(normState("SP")).toBe("sp")
    expect(normState(" pr ")).toBe("pr")
  })
})

describe("buildMetaAudienceCsv", () => {
  it("usa exatamente os cabeçalhos que a Meta reconhece", () => {
    const { csv } = buildMetaAudienceCsv([client()])
    expect(csv.split("\r\n")[0]).toBe(META_HEADERS.join(","))
  })

  it("NÃO escreve BOM — ele grudaria no cabeçalho e quebraria a coluna de e-mail", () => {
    const { csv } = buildMetaAudienceCsv([client()])
    expect(csv.startsWith("﻿")).toBe(false)
    expect(csv.startsWith("email,")).toBe(true)
  })

  it("normaliza os valores na linha", () => {
    const { csv } = buildMetaAudienceCsv([
      client({ name: "Maria Silva", email: " MARIA@Example.com ", phone: "(41) 99646-5011" }),
    ])
    const row = csv.split("\r\n")[1]
    expect(row).toBe("maria@example.com,5541996465011,maria,silva,,,,br,c1")
  })

  it("preenche cidade, estado e CEP quando existem", () => {
    const { csv } = buildMetaAudienceCsv([
      client({ address: { city: "Curitiba", state: "PR", postal_code: "80520-000" } }),
    ])
    const row = csv.split("\r\n")[1]
    expect(row).toContain("curitiba,pr,80520000,br")
  })

  it("deixa de fora quem não tem e-mail nem telefone", () => {
    const res = buildMetaAudienceCsv([
      client({ id: "ok" }),
      client({ id: "vazio", email: null, phone: null }),
    ])
    expect(res.rows).toBe(1)
    expect(res.skipped).toBe(1)
    expect(res.csv).not.toContain("vazio")
  })

  it("mantém quem tem só telefone", () => {
    const res = buildMetaAudienceCsv([client({ email: null })])
    expect(res.rows).toBe(1)
    expect(res.withPhone).toBe(1)
    expect(res.withEmail).toBe(0)
  })

  it("cidade sai sem acento, espaço ou pontuação (regra a-z da Meta)", () => {
    const { csv } = buildMetaAudienceCsv([
      client({ address: { city: "São Paulo", state: "SP" } }),
    ])
    expect(csv).toContain("saopaulo,sp")
  })

  it("estado por extenso também é normalizado", () => {
    const { csv } = buildMetaAudienceCsv([
      client({ address: { city: "Curitiba", state: "Paraná" } }),
    ])
    expect(csv).toContain("curitiba,parana")
  })

  it("lista vazia devolve só o cabeçalho", () => {
    const res = buildMetaAudienceCsv([])
    expect(res.rows).toBe(0)
    expect(res.csv).toBe(META_HEADERS.join(","))
  })

  it("empresa entra pelo e-mail, mas sem virar nome de pessoa", () => {
    const res = buildMetaAudienceCsv([
      client({ id: "e1", name: "JMJC NEGOCIOS DIGITAIS LTDA", email: "contato@bratishop.com.br" }),
    ])
    expect(res.rows).toBe(1)
    expect(res.csv).toContain("contato@bratishop.com.br")
    // fn e ln vazios: razão social não é nome de pessoa e só
    // enfraqueceria a correspondência.
    expect(res.csv).toContain("5541996465011,,,")
  })
})

describe("buildFullClientsCsv", () => {
  it("usa BOM e ponto e vírgula (Excel em português)", () => {
    const csv = buildFullClientsCsv([client()])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toContain("Nome;Email")
  })

  it("traz os dados sem normalizar (é planilha de conferência)", () => {
    const csv = buildFullClientsCsv([client({ email: "Maria@Example.com" })])
    expect(csv).toContain("Maria@Example.com")
  })

  it("neutraliza fórmula", () => {
    const csv = buildFullClientsCsv([client({ name: "=SOMA(A1:A9)" })])
    expect(csv).toContain("'=SOMA(A1:A9)")
  })

  it("traduz o status", () => {
    const csv = buildFullClientsCsv([client({ status: "active" })])
    expect(csv).toContain("Ativo")
  })
})
