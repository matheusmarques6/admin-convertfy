import { describe, it, expect, vi } from "vitest"
import { loadPhotoDirections, sanitizePhotoDirection } from "./photo-directions"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}))

/** Cliente falso que registra os ids pedidos e devolve o que o teste mandar. */
function fakeAdmin(
  result: { data?: unknown; error?: { message: string } },
  capture?: { ids?: string[] },
): AnyClient {
  return {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => {
          if (capture) capture.ids = ids
          return Promise.resolve({ data: null, error: null, ...result })
        },
      }),
    }),
  }
}

describe("loadPhotoDirections", () => {
  it("indexa a direção por variant_id e ignora as vazias", async () => {
    const admin = fakeAdmin({
      data: [
        { id: "v-1", photo_direction: "Still em fundo neutro." },
        { id: "v-2", photo_direction: "   " },
        { id: "v-3", photo_direction: null },
      ],
    })
    const out = await loadPhotoDirections(admin, [
      { variant_id: "v-1" },
      { variant_id: "v-2" },
      { variant_id: "v-3" },
    ])
    expect(out).toEqual({ "v-1": "Still em fundo neutro." })
  })

  it("deduplica ids — dois blocos da mesma variante são uma consulta só", async () => {
    const capture: { ids?: string[] } = {}
    const admin = fakeAdmin({ data: [] }, capture)
    await loadPhotoDirections(admin, [
      { variant_id: "v-1" },
      { variant_id: " v-1 " },
      { variant_id: "v-2" },
    ])
    expect(capture.ids).toEqual(["v-1", "v-2"])
  })

  it("sem blocos, sem blueprint ou só com variant_id vazio → não consulta", async () => {
    const capture: { ids?: string[] } = {}
    const admin = fakeAdmin({ data: [] }, capture)
    expect(await loadPhotoDirections(admin, undefined)).toEqual({})
    expect(await loadPhotoDirections(admin, [{ variant_id: null }])).toEqual({})
    expect(capture.ids).toBeUndefined()
  })

  // Fail-open: sem direção o agente compõe como sempre compôs. Derrubar a
  // geração da imagem por causa disso seria desproporcional.
  it("erro do banco → mapa vazio, sem lançar", async () => {
    const admin = fakeAdmin({ error: { message: "boom" } })
    await expect(
      loadPhotoDirections(admin, [{ variant_id: "v-1" }]),
    ).resolves.toEqual({})
  })
})

// ── Cotas fora, seções dentro (02/09) ──────────────────────────────────
//
// Trecho REAL da photo_direction de `body 4 - bridge fundo cards`. O
// gerador desenhou "24px" e "Ø304px" dentro das fotos porque leu isto.
const DIRECAO_BODY4 = [
  "Dois slots com a mesma construção e conteúdo oposto.",
  "",
  "Especificação comum",
  "",
  "Item\tValor",
  "Slot\t272 × 212px",
  "Ativo final\t544 × 424px (2x)",
  "Formato\tPNG, < 110 KB",
  "Fundo do quadro\tBranco puro, igual ao container",
  "",
  "Construção do ativo. O arquivo tem duas camadas:",
  "",
  "Retângulo do painel ocupando os 544 × 424px, na cor do painel da coluna, com os dois cantos superiores arredondados em 52px (26px no slot) e os inferiores retos.",
  "Círculo da foto de Ø304px (152px no slot), centralizado horizontalmente, com o topo a 24px da borda superior do quadro. Dentro dele, a fotografia recortada em máscara circular.",
  "",
  "Foto da coluna A — o produto da marca. Peça vestida em corpo parcial, cortada pela máscara circular. Cor saturada e característica da marca.",
  "",
  "Luz. Estúdio difuso nas duas, mesma temperatura.",
  "",
  "Proibições: logo de concorrente na foto B · texto queimado · marca d'água.",
  "",
  "Prompt para IA (foto da coluna A):",
  "",
  "Studio photograph of [PRODUTO] worn on the body, tight partial-body crop, on a pure white studio background. No face, no logo, no text.",
  "",
  "Montagem final: aplicar máscara circular de Ø304px sobre a foto e colocá-lo sobre o retângulo do painel de 544 × 424px. Exportar em PNG.",
  "",
  "Checklist: círculo centralizado · foto A saturada · mesma luz nas duas.",
].join("\n")

describe("sanitizePhotoDirection", () => {
  it("apaga as medidas; nada de px, Ø, KB ou PNG chega ao gerador", () => {
    const r = sanitizePhotoDirection(DIRECAO_BODY4)
    expect(r.texto).not.toMatch(/\d\s*px/i)
    expect(r.texto).not.toMatch(/Ø/)
    expect(r.texto).not.toMatch(/KB|PNG/i)
    expect(r.texto).not.toContain("\t")
    expect(r.medidas_removidas).toBeGreaterThan(0)
  })

  // 03/09: a linha com uma cota DENTRO de uma regra fica — sem o número.
  // Antes a linha inteira caía e a regra central do componente sumia.
  it("regra com cota dentro fica, sem a cota", () => {
    const d = [
      "Regra crítica: o terço superior (0–480px) tem que estar fora de foco e uniforme, numa cor só.",
      "Círculo da foto de Ø304px (152px no slot), centralizado horizontalmente, com o topo a 24px da borda superior do quadro.",
    ].join("\n")
    const r = sanitizePhotoDirection(d)
    expect(r.texto).toContain("Regra crítica: o terço superior tem que estar fora de foco e uniforme, numa cor só.")
    expect(r.texto).toContain("Círculo da foto de, centralizado horizontalmente, com o topo a da borda superior do quadro.".replace("de,", "de,"))
    expect(r.texto).not.toMatch(/\d/)
    expect(r.linhas_removidas).toBe(0)
    expect(r.medidas_removidas).toBe(2)
  })

  it("linha que é só ficha de arquivo cai inteira", () => {
    const d = [
      "Proporção 2:3 — slot de 598 × 949px, ativo final 1196 × 1898px (2x). JPG q80 ou WebP, < 300 KB, full-bleed.",
      "Ativo final 544 × 424px (2x)",
      "Formato\tPNG, < 110 KB",
      "Composição. Flat-lay em ângulo alto com o kit na metade inferior.",
      "Montagem final: aplicar máscara circular de Ø304px sobre a foto. Exportar em PNG.",
    ].join("\n")
    const r = sanitizePhotoDirection(d)
    expect(r.texto).toContain("Composição. Flat-lay em ângulo alto com o kit na metade inferior.")
    expect(r.texto).not.toMatch(/Ativo final|Formato|Exportar|Montagem final/)
    expect(r.texto).not.toMatch(/\d\s*px|KB|PNG|JPG|WebP/i)
    expect(r.linhas_removidas).toBe(4)
  })

  // A tabela "Adaptação por categoria" é prosa em colunas — fica, como texto.
  it("tabela de categorias vira 'coluna — coluna' em vez de sumir", () => {
    const d = [
      "Adaptação por categoria — o que compõe o flat-lay:",
      "Categoria\tItens",
      "Beleza / skincare\tSachês, frascos, pincéis, pinça, aplicadores",
      "Pet\tSachês, brinquedo, coleira, escova",
    ].join("\n")
    const r = sanitizePhotoDirection(d)
    expect(r.texto).toContain("Beleza / skincare — Sachês, frascos, pincéis, pinça, aplicadores")
    expect(r.texto).toContain("Pet — Sachês, brinquedo, coleira, escova")
    expect(r.texto).not.toContain("\t")
    expect(r.linhas_removidas).toBe(0)
  })

  it("as seções e a prosa da foto ficam intactas", () => {
    const r = sanitizePhotoDirection(DIRECAO_BODY4).texto
    expect(r).toContain("Especificação comum")
    expect(r).toContain("Construção do ativo. O arquivo tem duas camadas:")
    expect(r).toContain("Foto da coluna A — o produto da marca.")
    expect(r).toContain("Luz. Estúdio difuso nas duas, mesma temperatura.")
    expect(r).toContain("Proibições:")
    expect(r).toContain("Prompt para IA (foto da coluna A):")
    expect(r).toContain("Studio photograph of [PRODUTO]")
    expect(r).toContain("Checklist: círculo centralizado")
    // A regra da construção ficou, sem as cotas.
    expect(r).toContain("Círculo da foto de")
    expect(r).toContain("centralizado horizontalmente")
  })

  it("direção sem cota passa byte a byte", () => {
    const d = "Still em fundo neutro, luz lateral suave."
    expect(sanitizePhotoDirection(d)).toEqual({
      texto: d,
      linhas_removidas: 0,
      medidas_removidas: 0,
    })
  })

  it("se sobrar nada, devolve o original (fail-open)", () => {
    const d = "Slot\t272 × 212px"
    expect(sanitizePhotoDirection(d)).toEqual({
      texto: d,
      linhas_removidas: 0,
      medidas_removidas: 0,
    })
  })

  it("loadPhotoDirections já entrega a direção limpa", async () => {
    const admin = fakeAdmin({ data: [{ id: "v-4", photo_direction: DIRECAO_BODY4 }] })
    const out = await loadPhotoDirections(admin, [{ variant_id: "v-4" }])
    expect(out["v-4"]).not.toMatch(/Ø|\d\s*px/i)
    expect(out["v-4"]).toContain("Studio photograph")
  })
})
