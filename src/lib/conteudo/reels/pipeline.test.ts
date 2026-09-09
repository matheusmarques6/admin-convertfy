import { describe, expect, it } from "vitest"
import { duracaoLabel, ETAPAS, inicioDaSemana, posicaoEntre, progressoDaSemana, statusNoCalendario, type ReelParaProgresso } from "./pipeline"

const quarta = new Date("2026-09-09T15:00:00")
const seg = "2026-09-07T10:00:00"
const sex = "2026-09-11T10:00:00"
const semanaPassada = "2026-09-03T10:00:00"

describe("pipeline de Reels", () => {
  it("a ordem das etapas é o fluxo de trabalho", () => {
    expect(ETAPAS).toEqual(["ideias", "roteiro", "gravar", "editar", "agendado", "publicado"])
  })

  it("a semana começa na segunda, inclusive quando hoje É segunda", () => {
    expect(inicioDaSemana(quarta).toISOString().slice(0, 10)).toBe("2026-09-07")
    expect(inicioDaSemana(new Date("2026-09-07T23:59:00")).toISOString().slice(0, 10)).toBe("2026-09-07")
    // Domingo pertence à semana que começou na segunda anterior.
    expect(inicioDaSemana(new Date("2026-09-13T08:00:00")).toISOString().slice(0, 10)).toBe("2026-09-07")
  })

  it("agendado da semana conta como feito — já saiu das mãos de quem produz", () => {
    const reels: ReelParaProgresso[] = [
      { funil: "topo", etapa: "publicado", publicadoEm: seg },
      { funil: "topo", etapa: "agendado", agendadoPara: sex },
      { funil: "meio", etapa: "gravar" },
    ]
    const p = progressoDaSemana(reels, quarta)
    expect(p.find((x) => x.funil === "topo")).toMatchObject({ feitos: 2, meta: 2, emProducao: 0 })
    expect(p.find((x) => x.funil === "meio")).toMatchObject({ feitos: 0, emProducao: 1 })
  })

  it("backlog NUNCA conta como progresso, e semana passada também não", () => {
    const reels: ReelParaProgresso[] = [
      { funil: "fundo", etapa: "publicado", publicadoEm: semanaPassada },
      { funil: "fundo", etapa: "editar" },
      { funil: "fundo", etapa: "roteiro" },
    ]
    const fundo = progressoDaSemana(reels, quarta).find((x) => x.funil === "fundo")
    expect(fundo).toMatchObject({ feitos: 0, meta: 1, emProducao: 2 })
  })

  it("etapa publicado sem data não vira feito — data ausente não é publicação", () => {
    const p = progressoDaSemana([{ funil: "topo", etapa: "publicado", publicadoEm: null }], quarta)
    expect(p.find((x) => x.funil === "topo")?.feitos).toBe(0)
  })

  it("os três funis aparecem sempre, mesmo sem nenhum reel", () => {
    expect(progressoDaSemana([], quarta).map((p) => p.funil)).toEqual(["topo", "meio", "fundo"])
  })

  it("posição entre dois cards é fracionária — arrastar não reescreve a coluna", () => {
    expect(posicaoEntre(1, 2)).toBe(1.5)
    expect(posicaoEntre(null, 1)).toBe(0)
    expect(posicaoEntre(3, null)).toBe(4)
    expect(posicaoEntre(null, null)).toBe(0)
  })

  it("duração legível", () => {
    expect(duracaoLabel(45)).toBe("45s")
    expect(duracaoLabel(60)).toBe("1min")
    expect(duracaoLabel(90)).toBe("1min30")
    expect(duracaoLabel(null)).toBe("")
    expect(duracaoLabel(0)).toBe("")
  })

  it("statusNoCalendario: só agendado e publicado viram promessa; o resto é produção", () => {
    expect(statusNoCalendario("publicado")).toBe("publicado")
    expect(statusNoCalendario("agendado")).toBe("agendado")
    expect(statusNoCalendario("ideias")).toBe("ideia")
    // Gravar e editar NÃO são "pronto": chamar de pronto o que está sendo
    // gravado faria o calendário prometer peça que não existe.
    expect(statusNoCalendario("roteiro")).toBe("producao")
    expect(statusNoCalendario("gravar")).toBe("producao")
    expect(statusNoCalendario("editar")).toBe("producao")
  })
})
