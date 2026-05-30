/**
 * Tests for use-emails-live helpers (Epic AE - Story AE-6).
 *
 * Cobertura focada nas funcoes puras exportadas: mergeStatusChange,
 * getStatusLabel, translateFailureReason. O hook em si (useEmailsLive)
 * exige @testing-library/react que nao esta instalado — a logica de
 * SWR fallback esta encapsulada nos helpers + na ordem de chamadas
 * de useState/useSWR, verificada implicitamente em browser real.
 */
import { describe, it, expect } from "vitest"
import {
  mergeStatusChange,
  getStatusLabel,
  translateFailureReason,
  type LiveEmail,
  type EmailStatusChangePayload,
} from "./use-emails-live"

function makeEmail(overrides: Partial<LiveEmail> = {}): LiveEmail {
  return {
    id: "email-1",
    flow_id: "flow-1",
    flow_type: "welcome",
    flow_name: "Welcome",
    number: 1,
    name: "Welcome 1",
    status: "pending",
    subject: null,
    preheader: null,
    html: null,
    blocks: [],
    timing: {
      copy_started_at: null,
      copy_ready_at: null,
      rendering_started_at: null,
      qa_started_at: null,
      ready_at: null,
      failed_at: null,
    },
    failure_reason: null,
    qa_issues: [],
    total_cost_cents: 0,
    attempts: 0,
    generation_batch_id: null,
    ...overrides,
  }
}

function makeChange(
  overrides: Partial<EmailStatusChangePayload> = {},
): EmailStatusChangePayload {
  return {
    event_id: 1,
    email_id: "email-1",
    flow_id: "flow-1",
    from_status: "pending",
    status: "ready",
    batch_id: null,
    failure_reason: null,
    qa_issues_count: 0,
    ts: new Date().toISOString(),
    ...overrides,
  }
}

describe("mergeStatusChange", () => {
  it("atualiza o status do email correto", () => {
    const emails = [makeEmail({ id: "email-1", status: "pending" })]
    const change = makeChange({ email_id: "email-1", status: "copy_generating" })

    const result = mergeStatusChange(emails, change)

    expect(result).not.toBe(emails) // imutabilidade
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("copy_generating")
  })

  it("preserva os outros emails inalterados (mesma referencia)", () => {
    const e1 = makeEmail({ id: "email-1" })
    const e2 = makeEmail({ id: "email-2", flow_id: "flow-2", number: 2 })
    const emails = [e1, e2]

    const result = mergeStatusChange(
      emails,
      makeChange({ email_id: "email-1", status: "ready" }),
    )

    expect(result[1]).toBe(e2)
    expect(result[0]).not.toBe(e1)
  })

  it("retorna mesma lista (no-op) quando status nao mudou", () => {
    const emails = [makeEmail({ id: "email-1", status: "ready", failure_reason: null })]
    const change = makeChange({ email_id: "email-1", status: "ready", failure_reason: null })

    const result = mergeStatusChange(emails, change)

    expect(result).toBe(emails)
  })

  it("retorna mesma lista quando email_id nao existe", () => {
    const emails = [makeEmail({ id: "email-1" })]
    const change = makeChange({ email_id: "email-unknown" })

    const result = mergeStatusChange(emails, change)

    expect(result).toBe(emails)
  })

  it("propaga failure_reason quando status = failed", () => {
    const emails = [makeEmail({ id: "email-1", status: "qa_running" })]
    const change = makeChange({
      email_id: "email-1",
      status: "failed",
      failure_reason: "qa_failed",
    })

    const result = mergeStatusChange(emails, change)

    expect(result[0].status).toBe("failed")
    expect(result[0].failure_reason).toBe("qa_failed")
  })

  it("propaga batch_id quando vem na payload", () => {
    const emails = [makeEmail({ id: "email-1", generation_batch_id: null })]
    const change = makeChange({
      email_id: "email-1",
      status: "copy_generating",
      batch_id: "batch-123",
    })

    const result = mergeStatusChange(emails, change)

    expect(result[0].generation_batch_id).toBe("batch-123")
  })
})

describe("getStatusLabel", () => {
  it("mapeia statuses intermediarios para labels amigaveis (PT-BR)", () => {
    expect(getStatusLabel("pending").label).toBe("Aguardando")
    expect(getStatusLabel("copy_generating").label).toBe("Gerando copy")
    expect(getStatusLabel("copy_generating_recovery").label).toBe("Gerando copy")
    expect(getStatusLabel("rendering").label).toBe("Renderizando")
    expect(getStatusLabel("copy_ready").label).toBe("Renderizando")
    expect(getStatusLabel("qa_running").label).toBe("Revisando QA")
  })

  it("usa variante positive para ready, negative para failed", () => {
    expect(getStatusLabel("ready").variant).toBe("positive")
    expect(getStatusLabel("failed").variant).toBe("negative")
  })

  it("mantem labels para statuses legacy (Epic 8/9)", () => {
    expect(getStatusLabel("approved").variant).toBe("positive")
    expect(getStatusLabel("live").variant).toBe("positive")
    expect(getStatusLabel("in_progress").variant).toBe("info")
  })
})

describe("translateFailureReason", () => {
  it("traduz reasons conhecidos", () => {
    expect(translateFailureReason("superseded_by_redo")).toBe("Substituido por novo batch")
    expect(translateFailureReason("qa_failed")).toBe("QA reprovou (issues criticas)")
    expect(translateFailureReason("max_attempts_exceeded")).toBe(
      "Numero maximo de tentativas excedido",
    )
  })

  it("retorna o proprio reason se for desconhecido", () => {
    expect(translateFailureReason("custom_reason_xyz")).toBe("custom_reason_xyz")
  })

  it("retorna fallback para null/undefined", () => {
    expect(translateFailureReason(null)).toBe("Erro nao identificado")
    expect(translateFailureReason(undefined)).toBe("Erro nao identificado")
  })
})
