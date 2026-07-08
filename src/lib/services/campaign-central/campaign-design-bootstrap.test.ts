import { describe, it, expect } from "vitest"
import { CAMPAIGN_DESIGN_COLUMNS } from "./campaign-design-bootstrap.service"
import { CAMPAIGN_DESIGN_STAGE_ROLE } from "@/lib/permissions/campaign-stage-access"

describe("CAMPAIGN_DESIGN_COLUMNS — seed das 5 etapas", () => {
  it("tem exatamente 5 etapas na ordem certa", () => {
    expect(CAMPAIGN_DESIGN_COLUMNS.map((c) => c.slug)).toEqual([
      "estrutura",
      "aprovacao",
      "producao",
      "finalizacao",
      "implementacao",
    ])
    expect(CAMPAIGN_DESIGN_COLUMNS.map((c) => c.position)).toEqual([1, 2, 3, 4, 5])
  })

  it("estrutura e inicial; implementacao e final", () => {
    const estrutura = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "estrutura")!
    const finalizacao = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "finalizacao")!
    const implementacao = CAMPAIGN_DESIGN_COLUMNS.find(
      (c) => c.slug === "implementacao",
    )!
    expect(estrutura.is_initial).toBe(true)
    expect(finalizacao.is_final ?? false).toBe(false)
    expect(implementacao.is_final).toBe(true)
  })

  it("roles do seed batem com a matriz CAMPAIGN_DESIGN_STAGE_ROLE", () => {
    for (const col of CAMPAIGN_DESIGN_COLUMNS) {
      expect(col.default_assignee_role).toBe(
        CAMPAIGN_DESIGN_STAGE_ROLE[col.slug],
      )
    }
  })

  it("estrutura: entregavel obrigatorio = link do Figma (type url)", () => {
    const estrutura = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "estrutura")!
    expect(estrutura.deliverables_template).toHaveLength(1)
    const figma = estrutura.deliverables_template[0]
    expect(figma.slug).toBe("figma_structure_link")
    expect(figma.type).toBe("url")
    expect(figma.required).toBe(true)
  })

  it("estrutura e feita para UMA loja piloto (1 task de checklist)", () => {
    const estrutura = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "estrutura")!
    expect(estrutura.checklist_template).toHaveLength(1)
  })

  it("producao: 3 tasks irmas (imagens, textos, identidade)", () => {
    const producao = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "producao")!
    expect(producao.checklist_template).toHaveLength(3)
    expect(producao.checklist_template.map((c) => c.slug)).toEqual([
      "producao_imagens",
      "producao_textos",
      "producao_identidade",
    ])
  })

  it("finalizacao nao tem template (tasks instanciadas por loja em runtime)", () => {
    const fin = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "finalizacao")!
    expect(fin.checklist_template).toHaveLength(0)
    expect(fin.deliverables_template).toHaveLength(0)
  })

  it("implementacao: corte modelo + subir e-mails, role implementacao", () => {
    const impl = CAMPAIGN_DESIGN_COLUMNS.find((c) => c.slug === "implementacao")!
    expect(impl.default_assignee_role).toBe("implementacao")
    expect(impl.checklist_template.map((c) => c.slug)).toEqual([
      "impl_corte_modelo",
      "impl_subir_ptbr",
      "impl_subir_en",
      "impl_subir_outras",
    ])
  })
})
