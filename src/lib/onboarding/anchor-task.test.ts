import { describe, expect, it } from "vitest"
import { pickAnchorTask } from "./anchor-task"

const task = (id: string, meta?: Record<string, unknown>, created_at?: string) => ({
  id,
  metadata: meta ?? null,
  created_at,
})

describe("pickAnchorTask", () => {
  it("lista vazia → null", () => {
    expect(pickAnchorTask([])).toBeNull()
  })

  it("escolhe a task marcada is_column_anchor, mesmo fora da posição 0", () => {
    const tasks = [
      task("b", { item_position: 1 }),
      task("a", { is_column_anchor: true, item_position: 0 }),
    ]
    expect(pickAnchorTask(tasks)?.id).toBe("a")
  })

  it("sem flag: menor item_position vence", () => {
    const tasks = [task("b", { item_position: 2 }), task("a", { item_position: 0 }), task("c", { item_position: 1 })]
    expect(pickAnchorTask(tasks)?.id).toBe("a")
  })

  it("sem flag e sem item_position: desempata por created_at", () => {
    const tasks = [task("b", {}, "2026-07-02T00:00:00Z"), task("a", {}, "2026-07-01T00:00:00Z")]
    expect(pickAnchorTask(tasks)?.id).toBe("a")
  })

  it("metadata ausente → não quebra, cai no fallback", () => {
    const tasks = [task("only")]
    expect(pickAnchorTask(tasks)?.id).toBe("only")
  })

  it("flag tem prioridade sobre item_position menor", () => {
    const tasks = [
      task("low", { item_position: 0 }),
      task("anchor", { is_column_anchor: true, item_position: 5 }),
    ]
    expect(pickAnchorTask(tasks)?.id).toBe("anchor")
  })
})
