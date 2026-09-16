import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  DESCRICAO_DO_DISPOSITIVO,
  DISPOSITIVOS,
  conflitoDeDispositivo,
  dispositivoPertenceASecao,
  dispositivosDaSecao,
  ehDispositivo,
  secaoDoDispositivo,
} from "./dispositivos"

describe("dispositivos", () => {
  it("são 22, todos com descrição e com seção reconhecida", () => {
    expect(DISPOSITIVOS).toHaveLength(22)
    for (const d of DISPOSITIVOS) {
      expect(DESCRICAO_DO_DISPOSITIVO[d].length).toBeGreaterThan(10)
      expect(["hero", "body", "products", "reviews", "offer", "footer"]).toContain(secaoDoDispositivo(d))
    }
  })

  it("por seção: hero 4 · body 6 · products 4 · reviews 3 · offer 3 · footer 2", () => {
    expect(dispositivosDaSecao("hero")).toHaveLength(4)
    expect(dispositivosDaSecao("BODY ")).toHaveLength(6)
    expect(dispositivosDaSecao("products")).toHaveLength(4)
    expect(dispositivosDaSecao("reviews")).toHaveLength(3)
    expect(dispositivosDaSecao("offer")).toHaveLength(3)
    expect(dispositivosDaSecao("footer")).toHaveLength(2)
    expect(dispositivosDaSecao("header")).toEqual([])
  })

  it("pertence à seção pelo prefixo; valor fora do vocabulário não é dispositivo", () => {
    expect(dispositivoPertenceASecao("hero_pergunta", "hero")).toBe(true)
    expect(dispositivoPertenceASecao("hero_pergunta", "body")).toBe(false)
    expect(ehDispositivo("body_tese")).toBe(true)
    expect(ehDispositivo("body_varredura")).toBe(false)
    expect(ehDispositivo(null)).toBe(false)
  })

  it("conflito: só quando os dois existem e diferem — variante sem dispositivo é fail-open", () => {
    expect(conflitoDeDispositivo("body_comparacao", "body_tese")).toBe("dispositivo body_comparacao e a decisão pede body_tese")
    expect(conflitoDeDispositivo("body_tese", "body_tese")).toBeNull()
    expect(conflitoDeDispositivo(null, "body_tese")).toBeNull()
    expect(conflitoDeDispositivo("body_tese", null)).toBeNull()
  })

  it("o CHECK da migration 20261149 é a MESMA lista", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "20261149_variantes_dispositivo.sql"), "utf8")
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
      { block_type: "body", output_schema: [], dispositivo: "body_tese" },
      { block_type: "body", output_schema: [], dispositivo: "body_tese" },
      { block_type: "body", output_schema: [], dispositivo: "body_comparacao" },
      { block_type: "body", output_schema: [], dispositivo: null },
      { block_type: "footer", output_schema: [] },
    ])
    expect(cap.body.por_dispositivo).toEqual({ body_tese: 2, body_comparacao: 1 })
    expect(cap.body.classificadas).toBe(3)
    expect(cap.footer.classificadas ?? 0).toBe(0)

    // O dispositivo é o PRIMEIRO conflito — antes do cupom.
    const c = { ...resumirContrato([{ key: "coupon_line", type: "text_short" }]), dispositivo: "body_comparacao" }
    expect(conflitoDeContrato(c, { dispositivo: "body_tese", cupom: false })).toBe("dispositivo body_comparacao e a decisão pede body_tese")
    expect(conflitoDeContrato(c, { dispositivo: "body_comparacao", cupom: false })).toBe("tem slot de cupom e a decisão nega cupom")

    // Elegíveis por posição eliminam por dispositivo; a não classificada sobrevive (fail-open).
    const catalogo = [
      {
        section: "body",
        variantes: [
          { variant_id: "tese", contrato: { ...resumirContrato([]), dispositivo: "body_tese" } },
          { variant_id: "comp", contrato: { ...resumirContrato([]), dispositivo: "body_comparacao" } },
          { variant_id: "semclass", contrato: resumirContrato([]) },
        ],
      },
    ]
    expect(elegiveisPorPosicao(["body"], [{ dispositivo: "body_tese" }], catalogo).get(0)).toEqual({ ids: ["tese", "semclass"], zerou: false, bloqueadasPelaJanela: [], janelaAfrouxada: false })
  })
})
