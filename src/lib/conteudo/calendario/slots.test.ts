import { describe, expect, it } from "vitest"
import { cadenciaEfetiva, diaDaSemanaISO, diasSugeridos, slotsNaJanela, slotsVazios, type CadenciaDoPerfil } from "./slots"

describe("slots vazios do calendário", () => {
  it("a meta vira dias espalhados pela semana, não três seguidas", () => {
    expect(diasSugeridos(1)).toEqual([1])
    expect(diasSugeridos(2)).toEqual([1, 4])
    expect(diasSugeridos(3)).toEqual([1, 3, 5])
    expect(diasSugeridos(0)).toEqual([])
    expect(diasSugeridos(9)).toHaveLength(7)
  })

  it("cadência DEFINIDA pelo humano vence a derivada, e a origem é declarada", () => {
    const definida = cadenciaEfetiva({ perfil: "p1", metaSemanal: 3, dias: [2, 5], hora: "19:00" })
    expect(definida).toMatchObject({ dias: [2, 5], hora: "19:00", origem: "definida" })

    const sugerida = cadenciaEfetiva({ perfil: "p1", metaSemanal: 2, dias: [], hora: null })
    expect(sugerida).toMatchObject({ dias: [1, 4], hora: "11:30", origem: "sugerida" })
  })

  it("dia inválido na config é descartado sem derrubar a cadência", () => {
    expect(cadenciaEfetiva({ perfil: "p", metaSemanal: 1, dias: [1, 9, -2, 1] }).dias).toEqual([1])
  })

  it("dia da semana do ISO não passa por fuso", () => {
    expect(diaDaSemanaISO("2026-09-07")).toBe(1) // segunda
    expect(diaDaSemanaISO("2026-09-13")).toBe(0) // domingo
  })

  const cadencias: CadenciaDoPerfil[] = [
    { perfil: "bruno", dias: [2], hora: "11:30", metaSemanal: 1, origem: "definida" },
    { perfil: "convertfy", dias: [1, 3], hora: "19:00", metaSemanal: 2, origem: "sugerida" },
  ]
  const dias = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"] // seg..qui

  it("passado não gera slot; hoje ainda gera", () => {
    const s = slotsVazios({ dias, cadencias, ocupacao: {}, hoje: "2026-09-09" })
    expect(s.map((x) => `${x.dia}:${x.perfil}`)).toEqual(["2026-09-09:convertfy"])
  })

  it("dia que já tem post DAQUELE perfil não pede outro", () => {
    const s = slotsVazios({ dias, cadencias, ocupacao: { "2026-09-08": ["bruno"] }, hoje: "2026-09-07" })
    expect(s.map((x) => `${x.dia}:${x.perfil}`)).toEqual(["2026-09-07:convertfy", "2026-09-09:convertfy"])
  })

  it("ocupação de OUTRO perfil não tapa o buraco deste", () => {
    const s = slotsVazios({ dias, cadencias, ocupacao: { "2026-09-08": ["convertfy"] }, hoje: "2026-09-07" })
    expect(s.some((x) => x.dia === "2026-09-08" && x.perfil === "bruno")).toBe(true)
  })

  it("o KPI conta a janela de 7 dias a partir de hoje", () => {
    const s = slotsVazios({
      dias: ["2026-09-09", "2026-09-14", "2026-09-16", "2026-09-23"],
      cadencias: [{ perfil: "p", dias: [0, 1, 2, 3, 4, 5, 6], hora: "10:00", metaSemanal: 7, origem: "definida" }],
      ocupacao: {},
      hoje: "2026-09-09",
    })
    expect(s).toHaveLength(4)
    // Janela = hoje + 6 dias (09 a 15). O 16 é o 8º dia e fica de fora.
    expect(slotsNaJanela(s, "2026-09-09", 7)).toBe(2)
  })

  it("perfil sem meta nenhuma não inventa slot", () => {
    const c = cadenciaEfetiva({ perfil: "p", metaSemanal: 0 })
    expect(slotsVazios({ dias, cadencias: [c], ocupacao: {}, hoje: "2026-09-07" })).toEqual([])
  })
})
