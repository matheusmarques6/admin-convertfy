/**
 * O que o handoff de set/2026 acrescentou ao schema tem de SOBREVIVER
 * às duas fronteiras que apagam em silêncio: `normalizarSchema` (roda no
 * GET público e na publicação) e `montarVersao` (o Publicar).
 *
 * A lição é a do destino do final: campo que o normalizador não conhece
 * some no primeiro clique em Publicar, sem erro nenhum.
 */

import { describe, expect, it } from "vitest"
import { normalizarFaixas, normalizarPontos, normalizarSchema } from "../schema"
import { montarVersao } from "../publicar"
import { normalizarMidia } from "../midia"
import { validarResposta } from "../validacao"
import type { FormBlock } from "@/types/forms-conversational"

const bloco = (extra: Record<string, unknown>) => ({
  ref: "q1",
  type: "radio",
  label: "Plataforma?",
  options: ["Shopify", "Nuvemshop"],
  ...extra,
})

describe("normalizarSchema — os campos do handoff", () => {
  it("outro, embaralhar, pontos e escala atravessam", () => {
    const s = normalizarSchema({
      blocks: [
        bloco({
          outro: true,
          embaralhar: true,
          pontos: { Shopify: 3, Nuvemshop: "1", "": 9, Outra: "x" },
          escala: { min_label: "Nem um pouco", max_label: " Urgente " },
        }),
      ],
    })
    const b = s.blocks[0]
    expect(b.outro).toBe(true)
    expect(b.embaralhar).toBe(true)
    // Chave vazia e número ilegível caem fora; texto numérico conta.
    expect(b.pontos).toEqual({ Shopify: 3, Nuvemshop: 1 })
    expect(b.escala).toEqual({ min_label: "Nem um pouco", max_label: "Urgente" })
  })

  it("ausentes ficam ausentes — nada de `outro: false` sujando o schema", () => {
    const b = normalizarSchema({ blocks: [bloco({})] }).blocks[0]
    expect("outro" in b).toBe(false)
    expect("pontos" in b).toBe(false)
    expect("escala" in b).toBe(false)
  })

  it("os quatro tipos novos não viram `text`", () => {
    const s = normalizarSchema({
      blocks: ["yes_no", "nps", "rating", "schedule"].map((type, i) => ({ ref: `r${i}`, type, label: type })),
    })
    expect(s.blocks.map((b) => b.type)).toEqual(["yes_no", "nps", "rating", "schedule"])
  })

  it("settings: faixas, textos, fechado, limite e duplicado", () => {
    const s = normalizarSchema({
      blocks: [],
      settings: {
        faixas: [
          { de: 0, ate: 2, tag: "Frio" },
          { de: 5, ate: 3, stage_id: "st1", tag: "  " },
          { de: "x", ate: 9 },
        ],
        textos: { "Preencha este campo": "Falta este aqui", vazio: "", "": "x" },
        fechado: true,
        mensagem_fechado: " Voltamos em breve ",
        limite_envios: 120.7,
        duplicado: "ignora",
      },
    })
    expect(s.settings?.faixas).toEqual([
      { de: 0, ate: 2, stage_id: null, tag: "Frio" },
      // invertida é trocada, não descartada
      { de: 3, ate: 5, stage_id: "st1", tag: null },
    ])
    expect(s.settings?.textos).toEqual({ "Preencha este campo": "Falta este aqui" })
    expect(s.settings?.fechado).toBe(true)
    expect(s.settings?.mensagem_fechado).toBe("Voltamos em breve")
    expect(s.settings?.limite_envios).toBe(120)
    expect(s.settings?.duplicado).toBe("ignora")
  })

  it("política de duplicado desconhecida e limite zero são ignorados", () => {
    const s = normalizarSchema({ blocks: [], settings: { duplicado: "sei-la", limite_envios: 0 } })
    expect("duplicado" in (s.settings ?? {})).toBe(false)
    expect("limite_envios" in (s.settings ?? {})).toBe(false)
  })
})

describe("montarVersao transporta o que só existe no schema", () => {
  it("outro/embaralhar/pontos/escala vêm da versão anterior, casados por ref", () => {
    const campos = [{ id: "q1", field_type: "radio", label: "Plataforma?", options: ["Shopify"], position: 0 }]
    const anterior = {
      blocks: [bloco({ outro: true, embaralhar: true, pontos: { Shopify: 2 }, escala: { min_label: "a" } })],
    }
    const r = montarVersao(campos, anterior, { display_mode: "conversational", version: 2 })
    const b = r.schema.blocks[0]
    expect(b.outro).toBe(true)
    expect(b.embaralhar).toBe(true)
    expect(b.pontos).toEqual({ Shopify: 2 })
    expect(b.escala).toEqual({ min_label: "a", max_label: null })
  })

  it("as faixas de pontuação sobrevivem ao Publicar", () => {
    const r = montarVersao([], { blocks: [], settings: { faixas: [{ de: 0, ate: 3, tag: "Frio" }] } }, {
      display_mode: "conversational",
      version: 1,
    })
    expect(r.schema.settings?.faixas).toEqual([{ de: 0, ate: 3, stage_id: null, tag: "Frio" }])
  })
})

describe("mídia: layout", () => {
  it("guarda o layout, exceto `acima`, que é o default", () => {
    expect(normalizarMidia({ url: "https://x/a.png", layout: "direita" })?.layout).toBe("direita")
    expect("layout" in (normalizarMidia({ url: "https://x/a.png", layout: "acima" }) ?? {})).toBe(false)
    expect("layout" in (normalizarMidia({ url: "https://x/a.png", layout: "diagonal" }) ?? {})).toBe(false)
  })
})

describe("normalizarPontos / normalizarFaixas", () => {
  it("nada utilizável devolve null / []", () => {
    expect(normalizarPontos({})).toBeNull()
    expect(normalizarPontos([1, 2])).toBeNull()
    expect(normalizarFaixas("x")).toEqual([])
  })
})

describe("validarResposta nos tipos novos", () => {
  const b = (type: FormBlock["type"]): FormBlock => ({ ref: "r", type, label: "?", required: true })
  it("yes_no só aceita sim/nao", () => {
    expect(validarResposta(b("yes_no"), "sim").valido).toBe(true)
    expect(validarResposta(b("yes_no"), "talvez").valido).toBe(false)
  })
  it("nps é inteiro de 0 a 10; rating de 1 a 5", () => {
    expect(validarResposta(b("nps"), "10").valido).toBe(true)
    expect(validarResposta(b("nps"), "11").valido).toBe(false)
    expect(validarResposta(b("nps"), "7.5").valido).toBe(false)
    expect(validarResposta(b("rating"), "0").valido).toBe(false)
    expect(validarResposta(b("rating"), "5").valido).toBe(true)
  })
  it("schedule exige um instante legível", () => {
    expect(validarResposta(b("schedule"), "2026-10-02T14:00:00.000Z").valido).toBe(true)
    expect(validarResposta(b("schedule"), "amanhã").valido).toBe(false)
  })
  it("obrigatório vazio pede escolha, não preenchimento", () => {
    expect(validarResposta(b("nps"), "").erro).toBe("Escolha uma opção para continuar.")
  })
})
