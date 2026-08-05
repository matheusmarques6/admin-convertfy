import { describe, expect, it } from "vitest"
import {
  dayLabel,
  groupMessagesByDay,
  localDayKey,
  messageAuthor,
  shouldShowAuthor,
  type FormatMessage,
} from "./crm-inbox-format"

// Datas montadas com componentes LOCAIS: o módulo trabalha no fuso do
// navegador do atendente, e o runner de teste roda em UTC — fixar
// offset no literal faria o teste passar só no Brasil.
const NOW = new Date(2026, 7, 5, 15, 0, 0) // qua, 5 de agosto de 2026
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString()

function msg(over: Partial<FormatMessage> & { id: string; created_at: string }): FormatMessage {
  return { direction: "outbound", ...over }
}

describe("dayLabel", () => {
  it("chama o dia corrente de Hoje", () => {
    expect(dayLabel(at(2026, 8, 5, 9), NOW)).toBe("Hoje")
  })

  it("chama o dia anterior de Ontem", () => {
    expect(dayLabel(at(2026, 8, 4, 23), NOW)).toBe("Ontem")
  })

  it("usa o dia da semana dentro dos últimos 7 dias", () => {
    // 2026-08-01 é um sábado
    expect(dayLabel(at(2026, 8, 1), NOW)).toBe("Sábado")
  })

  it("usa data por extenso a partir de 7 dias", () => {
    expect(dayLabel(at(2026, 7, 20), NOW)).toBe("20 de julho")
  })

  it("inclui o ano quando a mensagem é de outro ano", () => {
    expect(dayLabel(at(2025, 12, 24), NOW)).toContain("2025")
  })

  it("devolve string vazia para data inválida", () => {
    expect(dayLabel("não é data", NOW)).toBe("")
  })
})

describe("localDayKey", () => {
  it("usa componentes locais — 23h30 continua no mesmo dia (UTC viraria o seguinte)", () => {
    expect(localDayKey(new Date(2026, 7, 5, 23, 30))).toBe("2026-08-05")
  })
})

describe("groupMessagesByDay", () => {
  it("agrupa mensagens do mesmo dia num bloco só", () => {
    const groups = groupMessagesByDay(
      [
        msg({ id: "a", created_at: at(2026, 8, 5, 9) }),
        msg({ id: "b", created_at: at(2026, 8, 5, 11) }),
        msg({ id: "c", created_at: at(2026, 8, 4, 18) }),
      ],
      NOW,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe("Hoje")
    expect(groups[0].messages.map((m) => m.id)).toEqual(["a", "b"])
    expect(groups[1].label).toBe("Ontem")
  })

  it("nunca descarta mensagem com data inválida", () => {
    const groups = groupMessagesByDay(
      [
        msg({ id: "a", created_at: at(2026, 8, 5, 9) }),
        msg({ id: "quebrada", created_at: "xx" }),
      ],
      NOW,
    )
    const ids = groups.flatMap((g) => g.messages.map((m) => m.id))
    expect(ids).toContain("quebrada")
  })

  it("lista vazia devolve zero grupos", () => {
    expect(groupMessagesByDay([], NOW)).toEqual([])
  })
})

describe("messageAuthor", () => {
  it("mensagem do contato não tem rótulo", () => {
    expect(messageAuthor(msg({ id: "a", created_at: "", direction: "inbound" }))).toEqual({
      label: null,
      kind: "contact",
    })
  })

  it("mostra o nome do atendente que respondeu", () => {
    const a = messageAuthor(
      msg({ id: "a", created_at: "", sent_by_kind: "agent", sender: { id: "u1", name: "Bruno" } }),
    )
    expect(a).toEqual({ label: "Bruno", kind: "agent" })
  })

  it("distingue automação de pessoa", () => {
    expect(messageAuthor(msg({ id: "a", created_at: "", sent_by_kind: "automation" })).kind).toBe(
      "automation",
    )
  })

  it("mensagem enviada do celular pareado é identificada como tal", () => {
    expect(messageAuthor(msg({ id: "a", created_at: "", sent_by_kind: "system" }))).toEqual({
      label: "Pelo celular",
      kind: "device",
    })
  })

  it("automação vence o nome do remetente (fluxo disparado por um usuário)", () => {
    const a = messageAuthor(
      msg({ id: "a", created_at: "", sent_by_kind: "automation", sender: { id: "u1", name: "Bruno" } }),
    )
    expect(a.label).toBe("Automação")
  })
})

describe("shouldShowAuthor", () => {
  const bruno = msg({ id: "1", created_at: "", sent_by_kind: "agent", sender: { id: "u1", name: "Bruno" } })
  const bruno2 = msg({ id: "2", created_at: "", sent_by_kind: "agent", sender: { id: "u1", name: "Bruno" } })
  const ana = msg({ id: "3", created_at: "", sent_by_kind: "agent", sender: { id: "u2", name: "Ana" } })
  const contato = msg({ id: "4", created_at: "", direction: "inbound" })

  it("mostra na primeira mensagem", () => {
    expect(shouldShowAuthor(bruno, undefined)).toBe(true)
  })

  it("não repete o mesmo autor em sequência", () => {
    expect(shouldShowAuthor(bruno2, bruno)).toBe(false)
  })

  it("volta a mostrar quando troca de atendente", () => {
    expect(shouldShowAuthor(ana, bruno)).toBe(true)
  })

  it("volta a mostrar depois de uma mensagem do contato", () => {
    expect(shouldShowAuthor(bruno, contato)).toBe(true)
  })

  it("mensagem do contato nunca mostra rótulo", () => {
    expect(shouldShowAuthor(contato, bruno)).toBe(false)
  })
})
