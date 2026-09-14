import { describe, expect, it } from "vitest"

import { previewEditavel, previewState } from "./preview-state"

const base = {
  html: null,
  status: "in_progress" as const,
  generation_batch_id: "879fe6e4-0000-4000-8000-000000000000",
  copy_started_at: "2026-09-14T18:54:59.000Z",
  failure_reason: null,
}

describe("previewState — sem copy do n8n não há desenho", () => {
  it("e-mail gerado à espera do n8n mostra o estado, não o renderizador legado", () => {
    // Batch 879fe6e4 (14/09): a tela desenhou "só a hero" a partir dos
    // blocos de 11/09 enquanto a copy nunca voltava.
    const e = previewState(base)
    expect(e).toEqual({ kind: "aguardando_copy", desde: "2026-09-14T18:54:59.000Z" })
    expect(previewEditavel(e)).toBe(false)
  })

  it("copy_generating e pending também são espera; copy_ready/rendering/qa são render", () => {
    expect(previewState({ ...base, status: "copy_generating" }).kind).toBe("aguardando_copy")
    expect(previewState({ ...base, status: "pending" }).kind).toBe("aguardando_copy")
    for (const status of ["copy_ready", "rendering", "image_done", "qa_running"] as const) {
      expect(previewState({ ...base, status })).toEqual({ kind: "renderizando", status })
    }
  })

  it("falha nomeada chega traduzida", () => {
    expect(previewState({ ...base, status: "failed", failure_reason: "copy_timeout" })).toEqual({
      kind: "falhou",
      motivo: "O n8n nao devolveu a copy no prazo — nada foi gerado",
      codigo: "copy_timeout",
    })
    // Motivo desconhecido volta cru: o código é o que se procura no log.
    expect(previewState({ ...base, status: "failed", failure_reason: "xyz" }).kind).toBe("falhou")
  })

  it("com HTML, o HTML vence qualquer status; sem batch, o legado vale", () => {
    expect(previewState({ ...base, html: "<html>ok</html>" })).toEqual({ kind: "html", html: "<html>ok</html>" })
    expect(previewState({ ...base, html: "   " }).kind).toBe("aguardando_copy")
    const legado = previewState({ ...base, generation_batch_id: null, status: "draft" })
    expect(legado).toEqual({ kind: "legado" })
    expect(previewEditavel(legado)).toBe(true)
  })

  it("terminal sem HTML (somente-texto pronto) não vira espera nem falha", () => {
    expect(previewState({ ...base, status: "ready" })).toEqual({ kind: "sem_html", status: "ready" })
  })
})
