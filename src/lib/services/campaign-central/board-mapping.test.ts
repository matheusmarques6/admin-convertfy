import { describe, it, expect } from "vitest"
import {
  deriveBoardColumn,
  resolveProdStages,
  stageToProdIndex,
  boardColumnIndex,
  BOARD_COLUMN_ORDER,
  type BoardDerivationInput,
} from "./board-mapping"
import type { CampaignStage } from "@/types/campaign-pipeline"

function derive(over: Partial<BoardDerivationInput>): string {
  return deriveBoardColumn({
    status: "approved",
    hasProductionCopy: false,
    prodStages: [],
    ...over,
  })
}

describe("stageToProdIndex (espelha production.service.ts)", () => {
  it("mapeia stage legado → índice 0..4", () => {
    expect(stageToProdIndex("idea" as CampaignStage)).toBe(0)
    expect(stageToProdIndex("briefing" as CampaignStage)).toBe(0)
    expect(stageToProdIndex("copy_creation" as CampaignStage)).toBe(0)
    expect(stageToProdIndex("design" as CampaignStage)).toBe(1)
    expect(stageToProdIndex("review" as CampaignStage)).toBe(2)
    expect(stageToProdIndex("ready_to_deploy" as CampaignStage)).toBe(3)
    expect(stageToProdIndex("deploying" as CampaignStage)).toBe(3)
    expect(stageToProdIndex("deployed" as CampaignStage)).toBe(4)
  })
})

describe("resolveProdStages (fallback por loja)", () => {
  it("usa prod_stage quando presente", () => {
    expect(
      resolveProdStages([{ prod_stage: 2 }, { prod_stage: 4 }], "copy_creation" as CampaignStage),
    ).toEqual([2, 4])
  })

  it("cai no fallback de stage legado quando prod_stage ausente/null", () => {
    // item legado em stage='design' sem prod_stage → todas as lojas viram 1
    expect(
      resolveProdStages([{}, { prod_stage: null }], "design" as CampaignStage),
    ).toEqual([1, 1])
  })

  it("mistura lojas com e sem prod_stage", () => {
    expect(
      resolveProdStages([{ prod_stage: 3 }, {}], "review" as CampaignStage),
    ).toEqual([3, 2])
  })
})

describe("deriveBoardColumn — checa status ANTES de prod_stage", () => {
  it("status='suggested' → sugestao, mesmo com pipeline_item legado avançado", () => {
    // rascunho com item legado: NÃO pode cair em Copy/Design
    expect(derive({ status: "suggested", prodStages: [3, 3] })).toBe("sugestao")
    expect(derive({ status: "suggested", prodStages: [], hasProductionCopy: true })).toBe("sugestao")
    expect(derive({ status: "suggested", prodStages: [4, 4] })).toBe("sugestao")
  })

  it("status=null (sem sugestão atrelada) → sugestao", () => {
    expect(derive({ status: null, prodStages: [2] })).toBe("sugestao")
  })

  it("status='dismissed' → sugestao (defensivo; não deveria chegar ao board)", () => {
    expect(derive({ status: "dismissed", prodStages: [1] })).toBe("sugestao")
  })
})

describe("deriveBoardColumn — Aprovada vs Copy (sem pipeline_item)", () => {
  it("approved sem produção e sem copy → aprovada", () => {
    expect(derive({ status: "approved", prodStages: [], hasProductionCopy: false })).toBe("aprovada")
  })

  it("approved sem produção mas com copy de produção → copy", () => {
    expect(derive({ status: "approved", prodStages: [], hasProductionCopy: true })).toBe("copy")
  })
})

describe("deriveBoardColumn — colunas intermediárias por max(prod_stage)", () => {
  it("max=0 sem copy de produção → aprovada", () => {
    expect(derive({ prodStages: [0, 0], hasProductionCopy: false })).toBe("aprovada")
  })

  it("max=0 com copy de produção → copy", () => {
    expect(derive({ prodStages: [0, 0], hasProductionCopy: true })).toBe("copy")
  })

  it("max=1 → design", () => {
    expect(derive({ prodStages: [0, 1] })).toBe("design")
    expect(derive({ prodStages: [1] })).toBe("design")
  })

  it("max=2 → revisao", () => {
    expect(derive({ prodStages: [1, 2] })).toBe("revisao")
    expect(derive({ prodStages: [2, 0] })).toBe("revisao")
  })

  it("max=3 → agendada", () => {
    expect(derive({ prodStages: [3, 1] })).toBe("agendada")
    expect(derive({ prodStages: [3] })).toBe("agendada")
  })
})

describe("deriveBoardColumn — Enviada exige min(prod_stage) >= 4", () => {
  it("todas as lojas enviadas (min>=4) → enviada", () => {
    expect(derive({ prodStages: [4, 4, 4] })).toBe("enviada")
    expect(derive({ prodStages: [4] })).toBe("enviada")
    expect(derive({ prodStages: [5, 4] })).toBe("enviada")
  })

  it("algumas enviadas, outras não (max>=4 mas min<4) → agendada, NÃO enviada", () => {
    expect(derive({ prodStages: [4, 2] })).toBe("agendada")
    expect(derive({ prodStages: [4, 0] })).toBe("agendada")
    expect(derive({ prodStages: [4, 3, 1] })).toBe("agendada")
  })
})

describe("deriveBoardColumn — varredura status × prod_stage", () => {
  // Para cada estágio único aplicado a TODAS as lojas, a coluna esperada
  // quando status='approved' e com copy de produção presente.
  const cases: Array<{ stages: number[]; hasProductionCopy: boolean; expected: string }> = [
    { stages: [0, 0], hasProductionCopy: true, expected: "copy" },
    { stages: [1, 1], hasProductionCopy: true, expected: "design" },
    { stages: [2, 2], hasProductionCopy: true, expected: "revisao" },
    { stages: [3, 3], hasProductionCopy: true, expected: "agendada" },
    { stages: [4, 4], hasProductionCopy: true, expected: "enviada" },
  ]
  for (const c of cases) {
    it(`approved + prodStages=${JSON.stringify(c.stages)} → ${c.expected}`, () => {
      expect(derive({ status: "approved", prodStages: c.stages, hasProductionCopy: c.hasProductionCopy })).toBe(
        c.expected,
      )
    })
  }
})

describe("ordem e adjacência das colunas", () => {
  it("BOARD_COLUMN_ORDER tem as 7 colunas na ordem do fluxo", () => {
    expect(BOARD_COLUMN_ORDER).toEqual([
      "sugestao",
      "aprovada",
      "copy",
      "design",
      "revisao",
      "agendada",
      "enviada",
    ])
  })

  it("boardColumnIndex devolve a posição correta", () => {
    expect(boardColumnIndex("sugestao")).toBe(0)
    expect(boardColumnIndex("copy")).toBe(2)
    expect(boardColumnIndex("enviada")).toBe(6)
  })
})
