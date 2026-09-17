import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  DESCRICAO_DO_DISPOSITIVO,
  DISPOSITIVOS,
  DISPOSITIVOS_PEDIVEIS,
  DISPOSITIVO_NAO_CLASSIFICADO,
  SECOES_DO_DISPOSITIVO,
  conflitoDeDispositivo,
  dispositivoPertenceASecao,
  dispositivosDaSecao,
  ehDispositivo,
  ehDispositivoPedivel,
  secaoPrimariaDoDispositivo,
} from "./dispositivos"

const SECOES = ["hero", "body", "products", "reviews", "offer", "footer"]

describe("dispositivos — o vocabulário de 17/09", () => {
  it("são 34, todos com descrição, e só o de controle não tem seção", () => {
    expect(DISPOSITIVOS).toHaveLength(34)
    for (const d of DISPOSITIVOS) {
      expect(DESCRICAO_DO_DISPOSITIVO[d].length).toBeGreaterThan(10)
      for (const s of SECOES_DO_DISPOSITIVO[d]) expect(SECOES).toContain(s)
    }
    const semSecao = DISPOSITIVOS.filter((d) => SECOES_DO_DISPOSITIVO[d].length === 0)
    expect(semSecao).toEqual([DISPOSITIVO_NAO_CLASSIFICADO])
  })

  it("nenhum nome carrega prefixo de seção — é a regra 2 da redefinição", () => {
    for (const d of DISPOSITIVOS) {
      for (const s of SECOES) expect(d.startsWith(`${s}_`)).toBe(false)
    }
  })

  it("por seção: hero 9 · body 9 · products 8 · reviews 4 · offer 5 · footer 2", () => {
    expect(dispositivosDaSecao("hero")).toHaveLength(9)
    expect(dispositivosDaSecao("BODY ")).toHaveLength(9)
    expect(dispositivosDaSecao("products")).toHaveLength(8)
    expect(dispositivosDaSecao("reviews")).toHaveLength(4)
    expect(dispositivosDaSecao("offer")).toHaveLength(5)
    expect(dispositivosDaSecao("footer")).toHaveLength(2)
    expect(dispositivosDaSecao("header")).toEqual([])
  })

  // O mapa é explícito justamente por isto: derivar do prefixo escondia o
  // mesmo mecanismo em seções diferentes (medido no banco em 17/09).
  it("quatro dispositivos vivem em DUAS seções, e a primária é a primeira", () => {
    const cruzam = DISPOSITIVOS.filter((d) => SECOES_DO_DISPOSITIVO[d].length > 1)
    expect([...cruzam].sort()).toEqual(
      ["codigo_entregue", "lineup_de_colecao", "mecanismo_apontado", "prova_por_relato"].sort(),
    )
    expect(dispositivoPertenceASecao("codigo_entregue", "hero")).toBe(true)
    expect(dispositivoPertenceASecao("codigo_entregue", "offer")).toBe(true)
    expect(dispositivoPertenceASecao("codigo_entregue", "body")).toBe(false)
    expect(secaoPrimariaDoDispositivo("codigo_entregue")).toBe("hero")
    expect(secaoPrimariaDoDispositivo("lineup_de_colecao")).toBe("products")
  })

  it("o valor de controle é impossível de PEDIR, por construção", () => {
    expect(DISPOSITIVOS_PEDIVEIS).toHaveLength(33)
    expect(DISPOSITIVOS_PEDIVEIS).not.toContain(DISPOSITIVO_NAO_CLASSIFICADO)
    expect(ehDispositivo(DISPOSITIVO_NAO_CLASSIFICADO)).toBe(true)
    expect(ehDispositivoPedivel(DISPOSITIVO_NAO_CLASSIFICADO)).toBe(false)
    expect(secaoPrimariaDoDispositivo(DISPOSITIVO_NAO_CLASSIFICADO)).toBeNull()
    for (const s of SECOES) expect(dispositivosDaSecao(s)).not.toContain(DISPOSITIVO_NAO_CLASSIFICADO)
  })

  it("valor fora do vocabulário não é dispositivo", () => {
    expect(ehDispositivo("tese_declarada")).toBe(true)
    expect(ehDispositivo("body_tese")).toBe(false) // o nome ANTIGO morreu
    expect(ehDispositivo(null)).toBe(false)
  })

  it("conflito: só quando os dois existem e diferem — variante sem dispositivo é fail-open", () => {
    expect(conflitoDeDispositivo("comparacao_pareada", "tese_declarada")).toBe(
      "dispositivo comparacao_pareada e a decisão pede tese_declarada",
    )
    expect(conflitoDeDispositivo("tese_declarada", "tese_declarada")).toBeNull()
    expect(conflitoDeDispositivo(null, "tese_declarada")).toBeNull()
    expect(conflitoDeDispositivo("tese_declarada", null)).toBeNull()
    // E o de controle conflita como qualquer outro — é o que o bloqueia.
    expect(conflitoDeDispositivo(DISPOSITIVO_NAO_CLASSIFICADO, "tese_declarada")).toBeTruthy()
  })

  it("o CHECK da migration 20261166 é a MESMA lista", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261166_dispositivos_mecanismo.sql"), "utf8")
    const m = sql.match(/dispositivo IS NULL OR dispositivo IN \(([\s\S]*?)\)\)/)
    expect(m, "CHECK de dispositivo não encontrado na migration").toBeTruthy()
    const noCheck = Array.from(m![1].matchAll(/'([a-z0-9_]+)'/g)).map((x) => x[1]).sort()
    expect(noCheck).toEqual([...DISPOSITIVOS].sort())
  })
})

describe("dispositivo no contrato (field-roles)", () => {
  it("capacidadePorSecao conta por dispositivo e quantas estão classificadas", async () => {
    const { capacidadePorSecao, conflitoDeContrato, elegiveisPorPosicao, resumirContrato } = await import("./field-roles")
    const cap = capacidadePorSecao([
      { block_type: "body", output_schema: [], dispositivo: "tese_declarada" },
      { block_type: "body", output_schema: [], dispositivo: "tese_declarada" },
      { block_type: "body", output_schema: [], dispositivo: "comparacao_pareada" },
      { block_type: "body", output_schema: [], dispositivo: null },
      { block_type: "footer", output_schema: [] },
    ])
    expect(cap.body.por_dispositivo).toEqual({ tese_declarada: 2, comparacao_pareada: 1 })
    expect(cap.body.classificadas).toBe(3)
    expect(cap.footer.classificadas ?? 0).toBe(0)

    // O dispositivo é o PRIMEIRO conflito — antes do cupom.
    const c = { ...resumirContrato([{ key: "coupon_line", type: "text_short" }]), dispositivo: "comparacao_pareada" }
    expect(conflitoDeContrato(c, { dispositivo: "tese_declarada", cupom: false })).toBe(
      "dispositivo comparacao_pareada e a decisão pede tese_declarada",
    )
    expect(conflitoDeContrato(c, { dispositivo: "comparacao_pareada", cupom: false })).toBe(
      "tem slot de cupom e a decisão nega cupom",
    )

    // Elegíveis por posição eliminam por dispositivo; a não classificada sobrevive (fail-open).
    const catalogo = [
      {
        section: "body",
        variantes: [
          { variant_id: "tese", contrato: { ...resumirContrato([]), dispositivo: "tese_declarada" } },
          { variant_id: "comp", contrato: { ...resumirContrato([]), dispositivo: "comparacao_pareada" } },
          { variant_id: "semclass", contrato: resumirContrato([]) },
        ],
      },
    ]
    expect(elegiveisPorPosicao(["body"], [{ dispositivo: "tese_declarada" }], catalogo).get(0)).toEqual({ ids: ["tese", "semclass"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false })
  })
})
