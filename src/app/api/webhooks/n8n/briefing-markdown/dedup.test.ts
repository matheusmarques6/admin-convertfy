import { describe, it, expect } from "vitest"
import { resolveMarkdownWrite, type BriefingMarkdownRow } from "./dedup"

describe("resolveMarkdownWrite", () => {
  it("dedup quando o markdown é idêntico ao current do n8n", () => {
    const rows: BriefingMarkdownRow[] = [
      {
        version: 2,
        status: "current",
        generated_by: "n8n:briefing-markdown",
        briefing_data: { markdown: "# Pesquisa\nMarca X" },
      },
    ]
    expect(resolveMarkdownWrite(rows, "# Pesquisa\nMarca X")).toEqual({
      deduped: true,
      nextVersion: 3,
    })
  })

  it("não dedup quando o markdown mudou; version = max+1", () => {
    const rows: BriefingMarkdownRow[] = [
      {
        version: 2,
        status: "current",
        generated_by: "n8n:briefing-markdown",
        briefing_data: { markdown: "antigo" },
      },
    ]
    expect(resolveMarkdownWrite(rows, "novo")).toEqual({
      deduped: false,
      nextVersion: 3,
    })
  })

  it("só compara o CURRENT do n8n (ignora archived e outras fontes)", () => {
    const rows: BriefingMarkdownRow[] = [
      {
        version: 5,
        status: "archived",
        generated_by: "n8n:briefing-markdown",
        briefing_data: { markdown: "igual" },
      },
      {
        version: 6,
        status: "current",
        generated_by: "ai_treatment",
        briefing_data: null,
      },
    ]
    // sem current do n8n → não dedup; nextVersion = max(5,6)+1
    expect(resolveMarkdownWrite(rows, "igual")).toEqual({
      deduped: false,
      nextVersion: 7,
    })
  })

  it("nextVersion = 1 quando não há linhas", () => {
    expect(resolveMarkdownWrite([], "x")).toEqual({
      deduped: false,
      nextVersion: 1,
    })
  })
})
