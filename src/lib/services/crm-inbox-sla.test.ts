import { describe, it, expect } from "vitest"
import {
  waitingInfo,
  formatWait,
  sortThreadsAsQueue,
  type SlaThread,
} from "./crm-inbox-sla"

const NOW = Date.parse("2026-07-31T12:00:00.000Z")

const t = (
  minutesAgo: number,
  direction: string | null = "inbound",
  status = "open",
): SlaThread => ({
  status,
  last_message_direction: direction,
  last_message_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
})

describe("waitingInfo", () => {
  it("aguardando = ultima mensagem do contato em conversa aberta", () => {
    const w = waitingInfo(t(30), NOW)
    expect(w.waiting).toBe(true)
    expect(w.minutes).toBe(30)
    expect(w.level).toBe("warn")
  })

  it("ultima mensagem nossa = bola com o contato, sem SLA", () => {
    expect(waitingInfo(t(120, "outbound"), NOW).waiting).toBe(false)
  })

  it("resolvida nao conta mesmo com inbound por ultimo", () => {
    expect(waitingInfo(t(120, "inbound", "resolved"), NOW).waiting).toBe(false)
  })

  it("faixas: <15 ok, 15-59 warn, >=60 critical", () => {
    expect(waitingInfo(t(5), NOW).level).toBe("ok")
    expect(waitingInfo(t(15), NOW).level).toBe("warn")
    expect(waitingInfo(t(59), NOW).level).toBe("warn")
    expect(waitingInfo(t(60), NOW).level).toBe("critical")
  })

  it("pendente tambem entra na fila", () => {
    expect(waitingInfo(t(10, "inbound", "pending"), NOW).waiting).toBe(true)
  })

  it("relogio adiantado nao gera minutos negativos", () => {
    expect(waitingInfo(t(-5), NOW).minutes).toBe(0)
  })
})

describe("formatWait", () => {
  it("formata minutos, horas e dias", () => {
    expect(formatWait(8)).toBe("8m")
    expect(formatWait(65)).toBe("1h05")
    expect(formatWait(120)).toBe("2h")
    expect(formatWait(720)).toBe("12h")
    expect(formatWait(3000)).toBe("2d")
  })
})

describe("sortThreadsAsQueue", () => {
  it("quem espera ha mais tempo vem primeiro", () => {
    const list = [t(5), t(90), t(30)]
    const sorted = sortThreadsAsQueue(list, NOW)
    expect(sorted.map((x) => waitingInfo(x, NOW).minutes)).toEqual([90, 30, 5])
  })

  it("aguardando vem antes de respondida, mesmo mais antiga", () => {
    const respondida = t(2, "outbound")
    const aguardando = t(200, "inbound")
    const sorted = sortThreadsAsQueue([respondida, aguardando], NOW)
    expect(sorted[0]).toBe(aguardando)
  })

  it("respondidas mantem ordem por atividade recente", () => {
    const a = t(10, "outbound")
    const b = t(3, "outbound")
    const sorted = sortThreadsAsQueue([a, b], NOW)
    expect(sorted[0]).toBe(b)
  })

  it("nao muta a lista original", () => {
    const list = [t(5), t(90)]
    const copy = [...list]
    sortThreadsAsQueue(list, NOW)
    expect(list).toEqual(copy)
  })
})
