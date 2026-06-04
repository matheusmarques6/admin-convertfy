import { describe, expect, it } from "vitest"
import { deriveShotArchetype } from "./shot-archetype"

describe("deriveShotArchetype", () => {
  describe("welcome flow matrix", () => {
    it("E1 -> hero_contextual", () => {
      expect(
        deriveShotArchetype({ flowType: "welcome", emailNumber: 1 }),
      ).toBe("hero_contextual")
    })
    it("E2 -> packshot_hero", () => {
      expect(
        deriveShotArchetype({ flowType: "welcome", emailNumber: 2 }),
      ).toBe("packshot_hero")
    })
    it("E3 -> demonstration", () => {
      expect(
        deriveShotArchetype({ flowType: "welcome", emailNumber: 3 }),
      ).toBe("demonstration")
    })
    it("E4 -> aspirational_intimate", () => {
      expect(
        deriveShotArchetype({ flowType: "welcome", emailNumber: 4 }),
      ).toBe("aspirational_intimate")
    })
    it("E5 -> brand_establishing", () => {
      expect(
        deriveShotArchetype({ flowType: "welcome", emailNumber: 5 }),
      ).toBe("brand_establishing")
    })
    it("E6 -> hero_contextual", () => {
      expect(
        deriveShotArchetype({ flowType: "welcome", emailNumber: 6 }),
      ).toBe("hero_contextual")
    })
    it("welcome com email_number fora da matriz cai em heurística genérica", () => {
      expect(
        deriveShotArchetype({
          flowType: "welcome",
          emailNumber: 99,
          blockType: "hero",
          mode: "text2img",
        }),
      ).toBe("hero_contextual")
    })
  })

  describe("label/purpose heurística", () => {
    it("label menciona uso -> lifestyle_action", () => {
      expect(
        deriveShotArchetype({
          flowType: "abandoned_cart",
          blockLabel: "Como usar o produto",
        }),
      ).toBe("lifestyle_action")
    })
    it("blueprintPurpose menciona 'in use' -> lifestyle_action", () => {
      expect(
        deriveShotArchetype({
          flowType: "win_back",
          blueprintPurpose: "show the product in use",
        }),
      ).toBe("lifestyle_action")
    })
    it("label menciona antes/depois -> demonstration", () => {
      expect(
        deriveShotArchetype({
          flowType: "upsell",
          blockLabel: "Antes e depois",
        }),
      ).toBe("demonstration")
    })
    it("blueprintPurpose menciona benefício -> demonstration", () => {
      expect(
        deriveShotArchetype({
          flowType: "shipping_stages",
          blueprintPurpose: "demonstrate benefício principal",
        }),
      ).toBe("demonstration")
    })
    it("label de dor + mode text2img -> problem_pain", () => {
      expect(
        deriveShotArchetype({
          flowType: "browse_abandonment",
          blockLabel: "sem o produto: a frustração",
          mode: "text2img",
        }),
      ).toBe("problem_pain")
    })
    it("label de dor SEM text2img cai em fallback (não problem_pain)", () => {
      const result = deriveShotArchetype({
        flowType: "browse_abandonment",
        blockLabel: "dor da espera",
        mode: "product_ref",
        blockType: "hero",
      })
      expect(result).toBe("packshot_hero")
    })
  })

  describe("blockType + mode", () => {
    it("hero + product_ref -> packshot_hero", () => {
      expect(
        deriveShotArchetype({
          flowType: "abandoned_cart",
          blockType: "hero",
          mode: "product_ref",
        }),
      ).toBe("packshot_hero")
    })
    it("hero + text2img -> hero_contextual", () => {
      expect(
        deriveShotArchetype({
          flowType: "shipping_stages",
          blockType: "hero",
          mode: "text2img",
        }),
      ).toBe("hero_contextual")
    })
  })

  describe("flowType defaults", () => {
    it("browse_abandonment sem hints -> aspirational_intimate", () => {
      expect(
        deriveShotArchetype({ flowType: "browse_abandonment" }),
      ).toBe("aspirational_intimate")
    })
    it("win_back sem hints -> aspirational_intimate", () => {
      expect(deriveShotArchetype({ flowType: "win_back" })).toBe(
        "aspirational_intimate",
      )
    })
    it("abandoned_cart sem hints -> hero_contextual", () => {
      expect(deriveShotArchetype({ flowType: "abandoned_cart" })).toBe(
        "hero_contextual",
      )
    })
  })

  describe("fallback final", () => {
    it("inputs vazios -> hero_contextual", () => {
      expect(deriveShotArchetype({})).toBe("hero_contextual")
    })
    it("flowType desconhecido sem hints -> hero_contextual", () => {
      expect(
        deriveShotArchetype({ flowType: "novo_flow_qualquer" }),
      ).toBe("hero_contextual")
    })
  })

  describe("worn_editorial — não há heurística automática (reservado pra blueprint override)", () => {
    it("não é alcançado pela heurística determinística atual", () => {
      // Worn editorial depende de contexto fashion/jewelry — só faz sentido
      // via override explícito do blueprint. A heurística atual nunca o
      // retorna; documentar aqui pra evitar regressão silenciosa.
      const inputs = [
        { flowType: "welcome", emailNumber: 1 },
        { flowType: "browse_abandonment", blockType: "hero", mode: "product_ref" as const },
      ]
      for (const i of inputs) {
        expect(deriveShotArchetype(i)).not.toBe("worn_editorial")
      }
    })
  })
})
