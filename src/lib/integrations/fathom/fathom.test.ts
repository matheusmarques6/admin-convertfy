import { describe, expect, it } from "vitest"
import { parseFathomUrl } from "./parse-url"
import {
  buildFathomDigest,
  digestToActionItemsText,
  digestToNotes,
  type FathomMeetingRaw,
} from "./meeting-digest"
import { agendaToMarkdown, buildNextMeetingAgenda } from "./next-meeting-agenda"

describe("parseFathomUrl", () => {
  it("extrai o recording_id do link da gravação", () => {
    expect(parseFathomUrl("https://fathom.video/calls/123456789")).toEqual({
      kind: "recording",
      recordingId: "123456789",
      url: "https://fathom.video/calls/123456789",
    })
    expect(parseFathomUrl("https://fathom.video/recordings/42")).toMatchObject({
      kind: "recording",
      recordingId: "42",
    })
  })

  it("extrai o slug do link de compartilhamento", () => {
    expect(parseFathomUrl("https://fathom.video/share/abc123xyz")).toMatchObject({
      kind: "share",
      slug: "abc123xyz",
    })
  })

  it("tolera link sem protocolo, com espaços e com query", () => {
    expect(parseFathomUrl("  fathom.video/calls/777?t=10 ")).toMatchObject({
      kind: "recording",
      recordingId: "777",
    })
    expect(parseFathomUrl("https://www.fathom.video/share/slug-1_2")).toMatchObject({
      kind: "share",
      slug: "slug-1_2",
    })
  })

  it("recusa link de outro domínio ou fora do formato", () => {
    expect(parseFathomUrl("https://meet.google.com/abc-defg-hij")).toBeNull()
    expect(parseFathomUrl("https://fathom.video/")).toBeNull()
    expect(parseFathomUrl("https://fathom.video/calls/abc")).toBeNull()
    expect(parseFathomUrl("")).toBeNull()
    expect(parseFathomUrl("não é link")).toBeNull()
  })
})

const MEETING: FathomMeetingRaw = {
  recording_id: 987654321,
  meeting_title: "Alinhamento mensal — Loja X",
  url: "https://fathom.video/calls/987654321",
  share_url: "https://fathom.video/share/xyz",
  recording_start_time: "2026-09-01T14:00:00Z",
  recording_end_time: "2026-09-01T14:47:00Z",
  default_summary: { markdown_formatted: "## Resumo\nCliente quer subir frequência." },
  action_items: [
    {
      description: "Subir frequência para 3 emails/semana",
      completed: false,
      assignee: { name: "Ana" },
      recording_playback_url: "https://fathom.video/calls/987654321?t=120",
      recording_timestamp: 120,
    },
    { description: "Enviar relatório de agosto", completed: true, assignee: "Bruno" },
    { description: "   ", completed: false },
  ],
  calendar_invitees: [
    { name: "Ana", email: "ana@convertfy.me", is_external: false },
    { name: "Cliente", email: "dono@lojax.com", is_external: true },
    { name: null, email: null, is_external: false },
  ],
  transcript: [
    { speaker: { display_name: "Ana" }, text: "Bom dia!" },
    { speaker: "Cliente", text: "Oi Ana." },
    { speaker: null, text: "  " },
  ],
}

describe("buildFathomDigest", () => {
  it("normaliza a reunião completa", () => {
    const d = buildFathomDigest(MEETING)!
    expect(d.recording_id).toBe("987654321")
    expect(d.title).toBe("Alinhamento mensal — Loja X")
    expect(d.duration_minutes).toBe(47)
    expect(d.summary_markdown).toContain("Cliente quer subir frequência")
    expect(d.action_items).toHaveLength(2) // o item em branco é descartado
    expect(d.action_items[0].assignee).toBe("Ana")
    expect(d.action_items[1]).toMatchObject({ completed: true, assignee: "Bruno" })
    expect(d.participants).toHaveLength(2) // participante vazio some
    expect(d.transcript).toBe("Ana: Bom dia!\nCliente: Oi Ana.")
  })

  it("aceita summary como string e transcript como texto", () => {
    const d = buildFathomDigest({
      recording_id: "1",
      default_summary: "resumo simples",
      transcript: "linha unica",
    })!
    expect(d.summary_markdown).toBe("resumo simples")
    expect(d.transcript).toBe("linha unica")
  })

  it("campos ausentes viram null, não string vazia", () => {
    const d = buildFathomDigest({ recording_id: 5 })!
    expect(d.title).toBeNull()
    expect(d.summary_markdown).toBeNull()
    expect(d.duration_minutes).toBeNull()
    expect(d.action_items).toEqual([])
    expect(d.participants).toEqual([])
    expect(d.transcript).toBeNull()
  })

  it("sem recording_id não há digest", () => {
    expect(buildFathomDigest({ title: "x" })).toBeNull()
    expect(buildFathomDigest({ recording_id: "  " })).toBeNull()
  })

  it("usa horário agendado quando não há gravação", () => {
    const d = buildFathomDigest({
      recording_id: "9",
      scheduled_start_time: "2026-09-02T10:00:00Z",
      scheduled_end_time: "2026-09-02T10:30:00Z",
    })!
    expect(d.started_at).toBe("2026-09-02T10:00:00Z")
    expect(d.duration_minutes).toBe(30)
  })
})

describe("digestToNotes", () => {
  it("junta nota manual, resumo e itens de ação", () => {
    const d = buildFathomDigest(MEETING)!
    const notes = digestToNotes(d, "Cliente estava otimista")
    expect(notes.startsWith("Cliente estava otimista")).toBe(true)
    expect(notes).toContain("## Resumo")
    expect(notes).toContain("- Subir frequência para 3 emails/semana")
    expect(digestToActionItemsText(d)).toBe(
      "- Subir frequência para 3 emails/semana\n- Enviar relatório de agosto",
    )
  })

  it("sem nada retorna string vazia (não 'undefined')", () => {
    const d = buildFathomDigest({ recording_id: "1" })!
    expect(digestToNotes(d, null)).toBe("")
    expect(digestToActionItemsText(d)).toBeNull()
  })
})

describe("buildNextMeetingAgenda", () => {
  const now = new Date("2026-09-10T12:00:00Z")

  it("acumula pendências e marca há quanto tempo estão abertas", () => {
    const agenda = buildNextMeetingAgenda(
      [
        {
          conducted_at: "2026-08-01T12:00:00Z",
          action_items_json: [
            { description: "Revisar segmentação", completed: false, assignee: null, playback_url: null, timestamp: null },
          ],
        },
        {
          conducted_at: "2026-09-01T12:00:00Z",
          action_items_json: [
            { description: "Subir frequência", completed: false, assignee: "Ana", playback_url: null, timestamp: null },
          ],
        },
      ],
      now,
    )
    expect(agenda.pending.map((p) => p.description)).toEqual([
      "Revisar segmentação",
      "Subir frequência",
    ])
    expect(agenda.pending[0].days_open).toBe(40) // arrastando desde agosto
    expect(agenda.pending[1].assignee).toBe("Ana")
    expect(agenda.last_call_at).toBe("2026-09-01T12:00:00Z")
    expect(agenda.calls_considered).toBe(2)
  })

  it("item repetido conta uma vez, com a data da primeira aparição", () => {
    const agenda = buildNextMeetingAgenda(
      [
        {
          conducted_at: "2026-08-01T12:00:00Z",
          action_items_json: [
            { description: "Revisar segmentação.", completed: false, assignee: null, playback_url: null, timestamp: null },
          ],
        },
        {
          conducted_at: "2026-09-01T12:00:00Z",
          action_items_json: [
            { description: "  revisar SEGMENTAÇÃO  ", completed: false, assignee: "Bruno", playback_url: null, timestamp: null },
          ],
        },
      ],
      now,
    )
    expect(agenda.pending).toHaveLength(1)
    expect(agenda.pending[0].days_open).toBe(40)
    expect(agenda.pending[0].assignee).toBe("Bruno")
  })

  it("item concluído sai da pauta e entra em entregues", () => {
    const agenda = buildNextMeetingAgenda(
      [
        {
          conducted_at: "2026-08-01T12:00:00Z",
          action_items_json: [
            { description: "Enviar relatório", completed: false, assignee: null, playback_url: null, timestamp: null },
          ],
        },
        {
          conducted_at: "2026-09-01T12:00:00Z",
          action_items_json: [
            { description: "Enviar relatório", completed: true, assignee: null, playback_url: null, timestamp: null },
          ],
        },
      ],
      now,
    )
    expect(agenda.pending).toHaveLength(0)
    expect(agenda.completed_since_last).toEqual(["Enviar relatório"])
  })

  it("lê o texto livre das calls antigas", () => {
    const agenda = buildNextMeetingAgenda(
      [{ conducted_at: "2026-09-01T12:00:00Z", action_items: "- Item A\n• Item B\n\n" }],
      now,
    )
    expect(agenda.pending.map((p) => p.description)).toEqual(["Item A", "Item B"])
  })

  it("markdown legível, e mensagem clara quando não há nada", () => {
    const vazia = buildNextMeetingAgenda([], now)
    expect(agendaToMarkdown(vazia)).toContain("Sem pendências")
    const cheia = buildNextMeetingAgenda(
      [
        {
          conducted_at: "2026-09-01T12:00:00Z",
          action_items_json: [
            { description: "Subir frequência", completed: false, assignee: "Ana", playback_url: null, timestamp: null },
          ],
        },
      ],
      now,
    )
    const md = agendaToMarkdown(cheia)
    expect(md).toContain("Pendências para a próxima call")
    expect(md).toContain("Subir frequência (Ana) — aberto há 9d")
  })
})
