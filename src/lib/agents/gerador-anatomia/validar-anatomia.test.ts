import { describe, expect, it } from "vitest"

import { DISPOSITIVOS } from "../shared/dispositivos"
import { REQUISITOS_DO_DISPOSITIVO, montarVars, parseSaida } from "./prompt"
import { contratoDoDispositivo, validarAnatomia } from "./validar-anatomia"

const DOC = (miolo: string) => `<!DOCTYPE html>
<html lang="pt-BR" xmlns:v="urn:schemas-microsoft-com:vml">
<head><meta charset="UTF-8"><title>x</title>
<style>@media only screen and (max-width:620px){.stack{width:100%!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:{{COR_FUNDO}};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;min-width:600px;max-width:600px;background-color:{{COR_FUNDO}};" bgcolor="{{COR_FUNDO}}">
${miolo}
</table>
</td></tr></table>
</body></html>`

const TESE = DOC(`
<tr><td style="padding:40px 48px 0;font-family:{{FONTE_TITULO}};font-weight:{{PESO_TITULO}};font-size:32px;line-height:38px;color:{{COR_TEXTO}};">Feito para durar mais de uma estação</td></tr>
<tr><td style="padding:16px 48px 0;font-family:{{FONTE_CORPO}};font-weight:{{PESO_CORPO}};font-size:18px;line-height:26px;color:{{COR_TEXTO}};">Cada peça passa por três provas de resistência antes de sair da fábrica.</td></tr>
<tr><td align="center" style="padding:28px 0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td bgcolor="{{COR_PRINCIPAL}}" style="background-color:{{COR_PRINCIPAL}};border-radius:{{RAIO_BOTAO}};">
<a href="{{CTA_URL}}" style="display:inline-block;padding:16px 36px;font-family:{{FONTE_TITULO}};font-weight:{{PESO_TITULO}};font-size:16px;line-height:20px;color:{{COR_TEXTO_SOBRE_PRINCIPAL}};text-decoration:none;">Ver a coleção</a>
</td></tr></table>
</td></tr>`)

const SCHEMA_TESE = [
  { key: "headline", label: "Headline", type: "text_short", max_len: 60, required: true, example: "Feito para durar mais de uma estação", guidance: "" },
  { key: "paragraph_1", label: "Parágrafo", type: "text_long", max_len: 200, required: true, example: "Cada peça passa por três provas de resistência antes de sair da fábrica.", guidance: "" },
  { key: "cta_label", label: "CTA", type: "text_short", max_len: 24, required: true, example: "Ver a coleção", guidance: "" },
  { key: "cta_url", label: "URL do CTA", type: "url", max_len: 0, required: true, example: "", guidance: "" },
]

describe("validarAnatomia", () => {
  it("anatomia tese_declarada correta passa, com contrato e cobertura medidos", () => {
    const r = validarAnatomia({ html: TESE, output_schema: SCHEMA_TESE, dispositivo: "tese_declarada" })
    expect(r.erros).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.contrato.tem_cta).toBe(true)
    expect(r.cobertura).toEqual({ campos_copy: 3, ancorados: 3, orfaos_suspeitos: 0 })
    expect(r.tokens).toContain("COR_PRINCIPAL")
  })

  it("reprova hex literal, font-family literal, url sem {{TAG}}, example que não está no HTML e dispositivo errado", () => {
    const html = TESE.replace("background-color:{{COR_PRINCIPAL}}", "background-color:#111111").replace("font-family:{{FONTE_CORPO}}", "font-family:Arial,sans-serif")
    const schema = [...SCHEMA_TESE.slice(0, 2), { ...SCHEMA_TESE[2], example: "Comprar agora" }, { ...SCHEMA_TESE[3], key: "shop_url" }]
    const r = validarAnatomia({ html, output_schema: schema, dispositivo: "vitrine_paralela" })
    expect(r.ok).toBe(false)
    const texto = r.erros.join("\n")
    expect(texto).toContain("#111111")
    expect(texto).toContain("font-family literal")
    expect(texto).toContain('"shop_url" precisa aparecer no HTML como {{SHOP_URL}}')
    expect(texto).toContain('campo "cta_label" não ancora')
    expect(texto).toContain("contrato vitrine_paralela")
  })

  it("lorem ipsum e src vazio são bloqueantes do lint; o pós-processador entra no html devolvido", () => {
    const html = TESE.replace("Cada peça passa por três provas de resistência antes de sair da fábrica.", "Lorem ipsum dolor sit amet consectetur").replace('<tr><td align="center" style="padding:28px 0 40px;">', '<tr><td><img src="" alt=""></td></tr><tr><td align="center" style="padding:28px 0 40px;">')
    const r = validarAnatomia({ html, output_schema: SCHEMA_TESE, dispositivo: "tese_declarada" })
    expect(r.ok).toBe(false)
    expect(r.lint.bloqueantes).toContain("texto_de_example")
    // <img src=""> some no pós-processador (auto-fix) e o html devolvido é o processado.
    expect(r.html).not.toContain('<img src=""')
  })

  it("todo dispositivo tem contrato e texto de requisito", () => {
    for (const d of DISPOSITIVOS) {
      expect(contratoDoDispositivo(d)).toBeTruthy()
      expect(REQUISITOS_DO_DISPOSITIVO[d].length).toBeGreaterThan(20)
    }
  })
})

describe("prompt do gerador", () => {
  it("montarVars serve contrato, convenções e referências; parseSaida separa os dois blocos", () => {
    const vars = montarVars({ dispositivo: "antes_e_depois", variante: "a", densidade: "balanced", idioma: "pt-BR", referencias: [], correcoes: ["lint x"] })
    expect(vars.requisitos).toContain("before_image")
    expect(vars.descricao_do_dispositivo).toContain("duas fotos")
    expect(vars.convencoes).toContain("{{COR_PRINCIPAL}}")
    expect(vars.referencias).toContain("nenhuma anatomia")
    expect(vars.correcoes).toContain("- lint x")
    const raw = "texto\n```json\n{\"name\":\"n\",\"output_schema\":[{\"key\":\"a\"}],\"density\":\"rich\",\"product_slots\":\"3\"}\n```\n```html\n<!DOCTYPE html><html><body>x</body></html>\n```"
    const s = parseSaida(raw)
    expect(s.name).toBe("n")
    expect(s.density).toBe("rich")
    expect(s.product_slots).toBe(3)
    expect(s.html.startsWith("<!DOCTYPE html>")).toBe(true)
    expect(() => parseSaida("```json\n{}\n```")).toThrow(/faltou o bloco ```html/)
    expect(() => parseSaida("```json\n{\"name\":\"n\",\"output_schema\":[{}]}\n```\n```html\n<div>x</div>\n```")).toThrow(/documento completo/)
  })
})
