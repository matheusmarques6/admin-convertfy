import { describe, expect, it } from "vitest"
import {
  buildOnboardingStateByStore,
  isHandoffColumn,
  isOnboardingStageName,
  resolveStoreOnboarding,
  type OnboardingRow,
} from "./carteira-onboarding"

const row = (over: Partial<OnboardingRow> = {}): OnboardingRow => ({
  id: "onb-1",
  store_id: "store-1",
  status: "in_progress",
  column_slug: "preview_producao",
  column_name: "Preview - Designer cria pilotos",
  column_is_final: false,
  entered_at: "2026-08-01T12:00:00Z",
  last_column_change_at: "2026-08-20T12:00:00Z",
  created_at: "2026-08-01T12:00:00Z",
  ...over,
})

describe("isHandoffColumn", () => {
  it("reconhece o slug canônico", () => {
    expect(
      isHandoffColumn({
        column_slug: "cliente_ativo",
        column_name: "Cliente ativo - Handoff pro time de Acompanhamento",
        column_is_final: true,
      }),
    ).toBe(true)
  })

  it("aceita coluna final mesmo renomeada", () => {
    expect(
      isHandoffColumn({ column_slug: "outro", column_name: "Entregue", column_is_final: true }),
    ).toBe(true)
  })

  it("aceita nome com 'ativo' quando o slug mudou", () => {
    expect(
      isHandoffColumn({ column_slug: "x", column_name: "Clientes ativos", column_is_final: false }),
    ).toBe(true)
  })

  it("não confunde coluna intermediária", () => {
    expect(
      isHandoffColumn({
        column_slug: "preview_producao",
        column_name: "Preview - Designer cria pilotos",
        column_is_final: false,
      }),
    ).toBe(false)
  })
})

describe("resolveStoreOnboarding", () => {
  it("loja em fase intermediária fica EM onboarding", () => {
    const s = resolveStoreOnboarding([row()])
    expect(s?.in_onboarding).toBe(true)
    expect(s?.phase).toBe("Preview - Designer cria pilotos")
    expect(s?.since).toBe("2026-08-20T12:00:00Z")
  })

  it("coluna de handoff libera o acompanhamento mesmo com status in_progress", () => {
    // O caso real: 24 onboardings parados em in_progress na coluna de
    // handoff. Usar o status prenderia todos na coluna de onboarding.
    const s = resolveStoreOnboarding([
      row({ status: "in_progress", column_slug: "cliente_ativo", column_is_final: true }),
    ])
    expect(s?.in_onboarding).toBe(false)
  })

  it("status completed libera mesmo fora da coluna de handoff", () => {
    const s = resolveStoreOnboarding([row({ status: "completed" })])
    expect(s?.in_onboarding).toBe(false)
  })

  it("onboarding entregue vence um pendente (duplicado do cron)", () => {
    const s = resolveStoreOnboarding([
      row({ id: "novo", last_column_change_at: "2026-09-01T12:00:00Z" }),
      row({ id: "antigo", column_slug: "cliente_ativo", column_is_final: true }),
    ])
    expect(s?.in_onboarding).toBe(false)
    expect(s?.onboarding_id).toBe("antigo")
  })

  it("cancelado não segura a loja fora do acompanhamento", () => {
    expect(resolveStoreOnboarding([row({ status: "cancelled" })])).toBeNull()
  })

  it("entre dois pendentes, o mais recente manda", () => {
    const s = resolveStoreOnboarding([
      row({ id: "velho", last_column_change_at: "2026-07-01T12:00:00Z" }),
      row({
        id: "novo",
        last_column_change_at: "2026-09-01T12:00:00Z",
        column_name: "Entrada",
        column_slug: "entrada",
      }),
    ])
    expect(s?.onboarding_id).toBe("novo")
    expect(s?.phase).toBe("Entrada")
  })

  it("pausado continua em onboarding (ainda não chegou nos ativos)", () => {
    expect(resolveStoreOnboarding([row({ status: "paused" })])?.in_onboarding).toBe(true)
  })

  it("sem onboarding, sem estado", () => {
    expect(resolveStoreOnboarding([])).toBeNull()
  })
})

describe("buildOnboardingStateByStore", () => {
  it("agrupa por loja e ignora linha sem store_id", () => {
    const map = buildOnboardingStateByStore([
      row({ id: "a", store_id: "s1" }),
      row({ id: "b", store_id: "s2", column_slug: "cliente_ativo", column_is_final: true }),
      row({ id: "c", store_id: "" }),
    ])
    expect(map.get("s1")?.in_onboarding).toBe(true)
    expect(map.get("s2")?.in_onboarding).toBe(false)
    expect(map.size).toBe(2)
  })
})

describe("isOnboardingStageName", () => {
  it("casa só o nome exato", () => {
    expect(isOnboardingStageName("Onboarding")).toBe(true)
    expect(isOnboardingStageName(" onboarding ")).toBe(true)
    expect(isOnboardingStageName("Pós-onboarding")).toBe(false)
    expect(isOnboardingStageName(null)).toBe(false)
  })
})
