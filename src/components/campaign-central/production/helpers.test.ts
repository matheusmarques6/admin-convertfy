import { describe, it, expect } from "vitest"
import {
  bucketOf,
  bucketCounts,
  campaignProgress,
  sendLabel,
  storeBrand,
  storeInitials,
  PRODUCTION_TYPE_META,
} from "./helpers"
import type { ProductionCampaign, ProductionStore } from "@/types/campaign-production"

function mkStore(prod_stage: number, over: Partial<ProductionStore> = {}): ProductionStore {
  return {
    store_id: `s-${prod_stage}-${Math.random().toString(36).slice(2, 6)}`,
    store_name: "Loja Teste",
    country: "BR",
    lang: "pt",
    region_label: "Brasil",
    prod_stage,
    designer_id: null,
    deploy_status: "pending",
    ...over,
  }
}

function mkCampaign(stages: number[]): ProductionCampaign {
  return {
    id: "c1",
    suggestion_id: null,
    type: "data",
    title: "Campanha",
    subject: "Assunto",
    angle: "Ângulo",
    channel: "Email",
    send_date: null,
    send_in: null,
    stores: stages.map((s) => mkStore(s)),
  }
}

describe("bucketOf", () => {
  it("mapeia índice de estágio → bucket", () => {
    expect(bucketOf(0)).toBe("design")
    expect(bucketOf(1)).toBe("design")
    expect(bucketOf(2)).toBe("revisao")
    expect(bucketOf(3)).toBe("agendado")
    expect(bucketOf(4)).toBe("enviado")
    expect(bucketOf(9)).toBe("enviado")
  })
})

describe("bucketCounts", () => {
  it("conta lojas por bucket", () => {
    const stores = [mkStore(0), mkStore(1), mkStore(2), mkStore(3), mkStore(4), mkStore(4)]
    expect(bucketCounts(stores)).toEqual({ design: 2, revisao: 1, agendado: 1, enviado: 2 })
  })

  it("zera todos os buckets sem lojas", () => {
    expect(bucketCounts([])).toEqual({ design: 0, revisao: 0, agendado: 0, enviado: 0 })
  })
})

describe("campaignProgress", () => {
  it("0% sem lojas", () => {
    expect(campaignProgress(mkCampaign([]))).toBe(0)
  })

  it("100% quando todas as lojas concluíram os 4 passos", () => {
    expect(campaignProgress(mkCampaign([4, 4]))).toBe(100)
  })

  it("50% com uma loja na metade dos passos", () => {
    // 1 loja, stage 2 de 4 passos → 2/4 = 50%
    expect(campaignProgress(mkCampaign([2]))).toBe(50)
  })

  it("não passa de 100% mesmo com prod_stage > nº de passos", () => {
    expect(campaignProgress(mkCampaign([9, 9]))).toBe(100)
  })
})

describe("sendLabel", () => {
  it("sem data", () => {
    expect(sendLabel(null, null)).toBe("Sem data de envio")
  })
  it("hoje", () => {
    expect(sendLabel(0, null)).toBe("Envia hoje")
  })
  it("futuro com plural e data formatada", () => {
    expect(sendLabel(2, "2026-06-12")).toBe("Envia em 2 dias · 12/jun")
  })
  it("futuro singular", () => {
    expect(sendLabel(1, null)).toBe("Envia em 1 dia")
  })
  it("atrasada", () => {
    expect(sendLabel(-3, "2026-06-01")).toBe("Atrasada 3 dias")
  })
})

describe("storeBrand", () => {
  it("é determinística — mesmo nome, mesma paleta", () => {
    expect(storeBrand("Donaris Joias")).toEqual(storeBrand("Donaris Joias"))
  })
  it("retorna primary, accent, font e voice", () => {
    const b = storeBrand("Urban Classe")
    expect(b.primary).toMatch(/^#[0-9A-F]{6}$/i)
    expect(b.accent).toMatch(/^#[0-9A-F]{6}$/i)
    expect(b.font).toBeTruthy()
    expect(b.voice).toBeTruthy()
  })
})

describe("storeInitials", () => {
  it("pega até 2 iniciais em maiúsculas", () => {
    expect(storeInitials("Loja A")).toBe("LA")
    expect(storeInitials("Donaris Joias Premium")).toBe("DJ")
    expect(storeInitials("Solo")).toBe("S")
    expect(storeInitials("")).toBe("?")
  })
})

describe("PRODUCTION_TYPE_META", () => {
  it("cobre todos os tipos de sugestão", () => {
    for (const t of ["data", "tema", "email", "performance", "avulsa"] as const) {
      expect(PRODUCTION_TYPE_META[t]).toBeDefined()
      expect(PRODUCTION_TYPE_META[t].label).toBeTruthy()
    }
  })
})
