import { describe, it, expect } from "vitest"

import { derivarStatusDoBatch } from "./generation-status-derive"

// Timestamps da run real medida em produção (08/09, batch 255db479).
const PRIMEIRA_RUN = "2026-09-08T14:26:08.717Z"
const ULTIMA_RUN = "2026-09-08T14:34:38.648Z"
const EMAIL_PRONTO = "2026-09-08T14:34:38.725Z"
const CLAIM = "2026-09-08T14:26:07.900Z"

describe("derivarStatusDoBatch", () => {
  it("batch sem run é pending, mesmo com o email em ready", () => {
    expect(
      derivarStatusDoBatch({
        runs: [],
        emailOwnsBatch: true,
        emailStatus: "ready",
        emailUpdatedAt: CLAIM,
      }),
    ).toBe("pending")
  })

  // O incidente: o claim grava o batch novo e deixa o `ready` da geração
  // ANTERIOR. Sem a régua temporal a resposta saía "done" aos 2 segundos.
  it("ready da geração anterior não conclui a geração nova", () => {
    expect(
      derivarStatusDoBatch({
        runs: [{ status: "success", created_at: PRIMEIRA_RUN }],
        emailOwnsBatch: true,
        emailStatus: "ready",
        emailUpdatedAt: CLAIM,
      }),
    ).toBe("running")
  })

  it("ready que assentou depois da última run conclui", () => {
    expect(
      derivarStatusDoBatch({
        runs: [
          { status: "success", created_at: PRIMEIRA_RUN },
          { status: "success", created_at: ULTIMA_RUN },
        ],
        emailOwnsBatch: true,
        emailStatus: "ready",
        emailUpdatedAt: EMAIL_PRONTO,
      }),
    ).toBe("done")
  })

  it("failed assentado é erro; failed velho ainda é geração em voo", () => {
    const runs = [{ status: "success", created_at: ULTIMA_RUN }]
    expect(
      derivarStatusDoBatch({
        runs,
        emailOwnsBatch: true,
        emailStatus: "failed",
        emailUpdatedAt: EMAIL_PRONTO,
      }),
    ).toBe("error")
    expect(
      derivarStatusDoBatch({
        runs,
        emailOwnsBatch: true,
        emailStatus: "failed",
        emailUpdatedAt: CLAIM,
      }),
    ).toBe("running")
  })

  it("status intermediário do email segue em voo", () => {
    for (const s of ["copy_ready", "rendering", "qa_running", "in_progress"]) {
      expect(
        derivarStatusDoBatch({
          runs: [{ status: "success", created_at: PRIMEIRA_RUN }],
          emailOwnsBatch: true,
          emailStatus: s,
          emailUpdatedAt: EMAIL_PRONTO,
        }),
      ).toBe("running")
    }
  })

  it("run em andamento sempre é running", () => {
    expect(
      derivarStatusDoBatch({
        runs: [
          { status: "success", created_at: PRIMEIRA_RUN },
          { status: "running", created_at: ULTIMA_RUN },
        ],
        emailOwnsBatch: true,
        emailStatus: "ready",
        emailUpdatedAt: CLAIM,
      }),
    ).toBe("running")
  })

  // Batch superado por outra geração: o email não responde mais por ele.
  it("batch superado decide pelas próprias runs", () => {
    expect(
      derivarStatusDoBatch({
        runs: [{ status: "success", created_at: PRIMEIRA_RUN }],
        emailOwnsBatch: false,
        emailStatus: "rendering",
        emailUpdatedAt: EMAIL_PRONTO,
      }),
    ).toBe("done")
    expect(
      derivarStatusDoBatch({
        runs: [
          { status: "success", created_at: PRIMEIRA_RUN },
          { status: "error", created_at: ULTIMA_RUN },
        ],
        emailOwnsBatch: false,
        emailStatus: "rendering",
        emailUpdatedAt: EMAIL_PRONTO,
      }),
    ).toBe("error")
    expect(
      derivarStatusDoBatch({
        runs: [{ status: "running", created_at: PRIMEIRA_RUN }],
        emailOwnsBatch: false,
        emailStatus: null,
        emailUpdatedAt: null,
      }),
    ).toBe("running")
  })

  it("sem status no email, o batch responde por si (legado)", () => {
    expect(
      derivarStatusDoBatch({
        runs: [{ status: "success", created_at: PRIMEIRA_RUN }],
        emailOwnsBatch: true,
        emailStatus: null,
        emailUpdatedAt: null,
      }),
    ).toBe("done")
  })

  it("run sem created_at não impede a conclusão", () => {
    expect(
      derivarStatusDoBatch({
        runs: [{ status: "success", created_at: null }],
        emailOwnsBatch: true,
        emailStatus: "ready",
        emailUpdatedAt: EMAIL_PRONTO,
      }),
    ).toBe("done")
  })
})
