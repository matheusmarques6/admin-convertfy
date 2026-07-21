import { describe, expect, it } from "vitest"
import {
  clampCopySpecField,
  defaultCopySpec,
  findCopyDeviations,
  findFieldDeviations,
  normalizeCopySpec,
} from "./copy-spec"
import type { BlueprintBlockField } from "@/types/email-generation"

describe("copy-spec", () => {
  describe("defaultCopySpec", () => {
    it("hero tem headline/body/cta com budgets validados em render", () => {
      const spec = defaultCopySpec("hero")
      const headline = spec.find((f) => f.key === "headline")
      expect(headline).toEqual({ key: "headline", min_chars: 18, max_chars: 40 })
      expect(spec.find((f) => f.key === "cta")).toEqual({
        key: "cta",
        min_chars: 8,
        max_chars: 16,
      })
    })

    it("blocos visuais/estruturais têm spec vazio", () => {
      for (const type of ["image", "divider", "spacer", "footer", "social"]) {
        expect(defaultCopySpec(type)).toEqual([])
      }
    })

    it("tipo desconhecido → spec vazio (não explode)", () => {
      expect(defaultCopySpec("banana")).toEqual([])
    })
  })

  describe("clampCopySpecField", () => {
    it("aceita campo válido como está", () => {
      expect(
        clampCopySpecField({ key: "headline", min_chars: 20, max_chars: 40 }),
      ).toEqual({ key: "headline", min_chars: 20, max_chars: 40 })
    })

    it("clampa aos guarda-corpos absolutos da chave", () => {
      // headline: absoluto 12-60 — LLM alucinou 900
      expect(
        clampCopySpecField({ key: "headline", min_chars: 5, max_chars: 900 }),
      ).toEqual({ key: "headline", min_chars: 12, max_chars: 60 })
    })

    it("corrige min > max invertendo", () => {
      expect(
        clampCopySpecField({ key: "body", min_chars: 300, max_chars: 100 }),
      ).toEqual({ key: "body", min_chars: 100, max_chars: 300 })
    })

    it("rejeita shapes irrecuperáveis", () => {
      expect(clampCopySpecField(null)).toBeNull()
      expect(clampCopySpecField({ key: "", min_chars: 1, max_chars: 2 })).toBeNull()
      expect(clampCopySpecField({ key: "x!", min_chars: 1, max_chars: 2 })).toBeNull()
      expect(clampCopySpecField({ key: "cta", min_chars: "a", max_chars: "b" })).toBeNull()
    })
  })

  describe("normalizeCopySpec", () => {
    it("usa o spec do LLM quando válido, deduplicando por key", () => {
      const spec = normalizeCopySpec(
        [
          { key: "headline", min_chars: 18, max_chars: 38 },
          { key: "headline", min_chars: 1, max_chars: 999 }, // dup: ignorada
          { key: "cta", min_chars: 8, max_chars: 14 },
        ],
        "hero",
      )
      expect(spec).toEqual([
        { key: "headline", min_chars: 18, max_chars: 38 },
        { key: "cta", min_chars: 8, max_chars: 14 },
      ])
    })

    it("ausente/inválido → default canônico do tipo", () => {
      expect(normalizeCopySpec(null, "features")).toEqual(defaultCopySpec("features"))
      expect(normalizeCopySpec("not-an-array", "hero")).toEqual(defaultCopySpec("hero"))
      expect(normalizeCopySpec([{ bad: true }], "text")).toEqual(defaultCopySpec("text"))
    })
  })

  describe("findCopyDeviations", () => {
    const spec = [
      { key: "headline", min_chars: 18, max_chars: 40 },
      { key: "body", min_chars: 120, max_chars: 210 },
    ]

    it("copy dentro do budget → sem desvios", () => {
      expect(
        findCopyDeviations(
          { headline: "Lorem ipsum dolor sit", body: "x".repeat(150) },
          spec,
        ),
      ).toEqual([])
    })

    it("headline estourada (o caso real de producao) é reportada", () => {
      const headline =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore"
      expect(findCopyDeviations({ headline }, spec)).toEqual([
        { key: "headline", length: headline.length, min_chars: 18, max_chars: 40 },
      ])
    })

    it("campo não preenchido pelo gerador não conta como desvio", () => {
      expect(findCopyDeviations({ headline: "Lorem ipsum dolor sit" }, spec)).toEqual([])
      expect(findCopyDeviations({}, spec)).toEqual([])
      expect(findCopyDeviations(null, spec)).toEqual([])
    })
  })

  describe("findFieldDeviations (contrato v2 — auditoria do callback)", () => {
    const field = (p: Partial<BlueprintBlockField>): BlueprintBlockField => ({
      key: "headline",
      label: "Headline",
      type: "text_short",
      max_len: 40,
      min_len: null,
      required: true,
      example: "",
      guidance: "",
      tag: null,
      source: "schema",
      ...p,
    })

    it("copy dentro do contrato → sem desvios", () => {
      expect(
        findFieldDeviations({ headline: "Bem-vindo à loja" }, [field({})]),
      ).toEqual([])
    })

    it("required vazio → required_empty; opcional vazio → nada", () => {
      const fields = [
        field({}),
        field({ key: "hint", required: false, max_len: 90 }),
      ]
      expect(findFieldDeviations({}, fields)).toEqual([
        { key: "headline", kind: "required_empty", length: 0, max_len: 40 },
      ])
    })

    it("max_len estourado → max_len (com o tamanho real)", () => {
      const long = "x".repeat(60)
      expect(findFieldDeviations({ headline: long }, [field({})])).toEqual([
        { key: "headline", kind: "max_len", length: 60, max_len: 40 },
      ])
    })

    it("type=image fica fora (preenchido pela fase 2, não pelo n8n)", () => {
      const fields = [
        field({ key: "hero_image", type: "image", required: true, max_len: 0 }),
      ]
      expect(findFieldDeviations({}, fields)).toEqual([])
    })

    it("max_len 0 = sem teto; number vira string e conta", () => {
      expect(
        findFieldDeviations({ headline: "x".repeat(500) }, [
          field({ max_len: 0 }),
        ]),
      ).toEqual([])
      expect(
        findFieldDeviations({ headline: 12345 }, [field({ max_len: 3 })]),
      ).toEqual([{ key: "headline", kind: "max_len", length: 5, max_len: 3 }])
    })
  })
})
