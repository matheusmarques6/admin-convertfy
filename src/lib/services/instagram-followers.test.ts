import { describe, expect, it } from "vitest"
import {
  appendFollowerSnapshot,
  followerDelta,
  normalizeFollowerHistory,
  FOLLOWER_HISTORY_MAX,
  type FollowerSnapshot,
} from "./instagram-followers"

const snap = (day: string, followers: number): FollowerSnapshot => ({
  day,
  followers,
  follows: null,
  media: null,
})

describe("normalizeFollowerHistory", () => {
  it("descarta lixo e ordena por dia", () => {
    const out = normalizeFollowerHistory([
      { day: "2026-08-03", followers: 110 },
      null,
      "x",
      { day: "bad-day", followers: 1 },
      { day: "2026-08-01", followers: 100, follows: 50, media: 10 },
      { day: "2026-08-02", followers: "not-a-number" },
    ])
    expect(out.map((s) => s.day)).toEqual(["2026-08-01", "2026-08-03"])
    expect(out[0].follows).toBe(50)
    expect(out[1].follows).toBeNull()
  })

  it("dia duplicado: o último vence", () => {
    const out = normalizeFollowerHistory([
      { day: "2026-08-01", followers: 100 },
      { day: "2026-08-01", followers: 105 },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].followers).toBe(105)
  })

  it("não-array vira lista vazia", () => {
    expect(normalizeFollowerHistory(undefined)).toEqual([])
    expect(normalizeFollowerHistory({ day: "2026-08-01" })).toEqual([])
  })
})

describe("appendFollowerSnapshot", () => {
  it("substitui o snapshot do mesmo dia", () => {
    const out = appendFollowerSnapshot([snap("2026-08-01", 100)], snap("2026-08-01", 108))
    expect(out).toHaveLength(1)
    expect(out[0].followers).toBe(108)
  })

  it("mantém ordenação e o teto de dias", () => {
    let history: FollowerSnapshot[] = []
    for (let i = 0; i < FOLLOWER_HISTORY_MAX + 10; i++) {
      const day = `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`
      history = appendFollowerSnapshot(history, snap(day, 100 + i))
    }
    expect(history).toHaveLength(FOLLOWER_HISTORY_MAX)
    const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day))
    expect(history).toEqual(sorted)
    // Cortou os mais ANTIGOS, não os recentes.
    expect(history[history.length - 1].followers).toBe(100 + FOLLOWER_HISTORY_MAX + 9)
  })
})

describe("followerDelta", () => {
  const history = [
    snap("2026-07-05", 900),
    snap("2026-07-28", 950),
    snap("2026-08-03", 990),
    snap("2026-08-04", 1000),
  ]

  it("1d compara com ontem", () => {
    const d = followerDelta(history, 1, "2026-08-04")
    expect(d).toEqual({ delta: 10, since: "2026-08-03" })
  })

  it("7d usa o snapshot mais recente ATÉ o alvo (buracos no histórico)", () => {
    // alvo = 2026-07-28 → existe exato
    expect(followerDelta(history, 7, "2026-08-04")).toEqual({ delta: 50, since: "2026-07-28" })
    // alvo = 2026-07-25 → cai no snapshot de 05/07 (mais recente <= alvo)
    expect(followerDelta(history, 10, "2026-08-04")).toEqual({ delta: 100, since: "2026-07-05" })
  })

  it("histórico curto demais devolve null (não inventa número)", () => {
    expect(followerDelta([snap("2026-08-04", 1000)], 1, "2026-08-04")).toBeNull()
    // 2 snapshots mas nenhum antigo o suficiente pro alvo
    expect(
      followerDelta([snap("2026-08-03", 990), snap("2026-08-04", 1000)], 30, "2026-08-04"),
    ).toBeNull()
  })

  it("base igual ao último snapshot devolve null (delta de si mesmo)", () => {
    expect(followerDelta([snap("2026-08-01", 5), snap("2026-08-02", 9)], 0, "2026-08-04")).toBeNull()
  })

  it("delta negativo quando perdeu seguidores", () => {
    const d = followerDelta([snap("2026-08-03", 1000), snap("2026-08-04", 980)], 1, "2026-08-04")
    expect(d).toEqual({ delta: -20, since: "2026-08-03" })
  })
})
