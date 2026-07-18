import { afterEach, describe, expect, it, vi } from "vitest"
import { buildPushoverParams, channelAlertPriority } from "./pushover.service"

const base = { token: "t".repeat(30), user: "u".repeat(30) }

describe("buildPushoverParams", () => {
  it("params obrigatórios + title", () => {
    const p = buildPushoverParams({ ...base, title: "Oi", message: "corpo" })
    expect(p.get("token")).toBe(base.token)
    expect(p.get("user")).toBe(base.user)
    expect(p.get("message")).toBe("corpo")
    expect(p.get("title")).toBe("Oi")
    expect(p.get("priority")).toBeNull()
  })

  it("trunca message em 1024 e title em 250 (limites da API)", () => {
    const p = buildPushoverParams({ ...base, title: "T".repeat(300), message: "M".repeat(2000) })
    expect(p.get("message")!.length).toBe(1024)
    expect(p.get("title")!.length).toBe(250)
  })

  it("url relativa vira absoluta com appBaseUrl; url_title acompanha", () => {
    const p = buildPushoverParams({
      ...base,
      title: "t",
      message: "m",
      url: "/admin/inbox?thread=abc",
      urlTitle: "Abrir conversa",
      appBaseUrl: "https://app.convertfy.me",
    })
    expect(p.get("url")).toBe("https://app.convertfy.me/admin/inbox?thread=abc")
    expect(p.get("url_title")).toBe("Abrir conversa")
  })

  it("url relativa SEM appBaseUrl é descartada (Pushover exige absoluta)", () => {
    const p = buildPushoverParams({ ...base, title: "t", message: "m", url: "/admin/inbox" })
    expect(p.get("url")).toBeNull()
    expect(p.get("url_title")).toBeNull()
  })

  it("url absoluta passa direto", () => {
    const p = buildPushoverParams({ ...base, title: "t", message: "m", url: "https://x.com/y" })
    expect(p.get("url")).toBe("https://x.com/y")
  })

  it("priority 0 é omitida; !=0 é enviada; ttl/sound quando presentes", () => {
    expect(buildPushoverParams({ ...base, title: "t", message: "m", priority: 0 }).get("priority")).toBeNull()
    const p = buildPushoverParams({ ...base, title: "t", message: "m", priority: 1, ttl: 3600, sound: "siren" })
    expect(p.get("priority")).toBe("1")
    expect(p.get("ttl")).toBe("3600")
    expect(p.get("sound")).toBe("siren")
  })
})

describe("channelAlertPriority", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("default 1 sem env", () => {
    vi.stubEnv("PUSHOVER_ALERT_PRIORITY", "")
    expect(channelAlertPriority()).toBe(1)
  })

  it("respeita env válida (0 e -1)", () => {
    vi.stubEnv("PUSHOVER_ALERT_PRIORITY", "0")
    expect(channelAlertPriority()).toBe(0)
    vi.stubEnv("PUSHOVER_ALERT_PRIORITY", "-1")
    expect(channelAlertPriority()).toBe(-1)
  })

  it("valor inválido ou 2 (emergency exige retry/expire) cai no default 1", () => {
    vi.stubEnv("PUSHOVER_ALERT_PRIORITY", "abc")
    expect(channelAlertPriority()).toBe(1)
    vi.stubEnv("PUSHOVER_ALERT_PRIORITY", "2")
    expect(channelAlertPriority()).toBe(1)
  })
})
