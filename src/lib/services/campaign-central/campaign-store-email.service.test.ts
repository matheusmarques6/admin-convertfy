/**
 * Testes da parte PURA do campaign-store-email.service: validação do
 * ajuste fino de cortes por loja (assertValidOverride).
 */

import { describe, it, expect, vi } from "vitest"

// Deps pesadas mockadas só pra permitir importar o módulo.
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: vi.fn() }))
vi.mock("sharp", () => ({ default: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))
vi.mock("./campaign-handoff.service", () => ({ getCampaignHandoff: vi.fn() }))
vi.mock("@/lib/integrations/figma/client", () => ({ isFigmaConfigured: vi.fn() }))

import { assertValidOverride } from "./campaign-store-email.service"
import type { CutPort } from "@/types/campaign-cuts"

const mapPorts: CutPort[] = [
  { id: "a", label: "Header", type: "header", y0: 0, y1: 0.1 },
  { id: "b", label: "Hero", type: "hero", y0: 0.1, y1: 0.6 },
  { id: "c", label: "Rodapé", type: "rodape", y0: 0.6, y1: 1 },
]

describe("assertValidOverride", () => {
  it("aceita override com os mesmos ids e frações contíguas diferentes", () => {
    const override: CutPort[] = [
      { id: "a", label: "Header", type: "header", y0: 0, y1: 0.22 },
      { id: "b", label: "Hero", type: "hero", y0: 0.22, y1: 0.55 },
      { id: "c", label: "Rodapé", type: "rodape", y0: 0.55, y1: 1 },
    ]
    expect(() => assertValidOverride(mapPorts, override)).not.toThrow()
  })

  it("rejeita override com ids fora de sincronia com o mapa", () => {
    const override: CutPort[] = [
      { id: "a", label: "Header", type: "header", y0: 0, y1: 0.5 },
      { id: "OUTRO", label: "Hero", type: "hero", y0: 0.5, y1: 1 },
    ]
    expect(() => assertValidOverride(mapPorts, override)).toThrow(/não corresponde/)
  })

  it("rejeita override com buraco entre portas (validateCutMap)", () => {
    const override: CutPort[] = [
      { id: "a", label: "Header", type: "header", y0: 0, y1: 0.2 },
      { id: "b", label: "Hero", type: "hero", y0: 0.4, y1: 0.6 },
      { id: "c", label: "Rodapé", type: "rodape", y0: 0.6, y1: 1 },
    ]
    expect(() => assertValidOverride(mapPorts, override)).toThrow(/Buraco/)
  })

  it("rejeita override que não termina no fim do email", () => {
    const override: CutPort[] = [
      { id: "a", label: "Header", type: "header", y0: 0, y1: 0.3 },
      { id: "b", label: "Hero", type: "hero", y0: 0.3, y1: 0.6 },
      { id: "c", label: "Rodapé", type: "rodape", y0: 0.6, y1: 0.9 },
    ]
    expect(() => assertValidOverride(mapPorts, override)).toThrow(/última porta/)
  })
})
