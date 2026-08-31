import { describe, it, expect } from "vitest"
import { auditOrphanText, auditSchemaAnchors } from "./schema-example-coherence"
import type { ComponentOutputField } from "@/types/email-generation"

function campo(over: Partial<ComponentOutputField>): ComponentOutputField {
  return {
    key: "k",
    label: "k",
    type: "text_short",
    max_len: 40,
    required: false,
    example: "",
    guidance: "",
    ...over,
  } as ComponentOutputField
}

// Bytes REAIS da variante "produtos 5 - 3 produtos mesmo fundo" (7ef1a9f4),
// recortados do card do produto 1: o selo escrito duas vezes (VML do Outlook
// dentro de conditional comment, que o parser não indexa, + bloco dos demais
// clientes), o nome partido por `<br>` e as células de espaçamento com `+` e
// `&nbsp;` — que não podem virar "texto órfão".
const CARD_COM_SELO = `
<td align="left" style="padding:275px 0 0 0;font-size:0;line-height:0;">
  <!--[if mso]>
  <v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:109px;height:109px;" fillcolor="#D9D9D9" stroke="f">
    <v:textbox inset="6px,26px,6px,6px">
      <center style="color:#28252B;font-family:Arial,sans-serif;font-size:25px;line-height:28px;font-weight:bold;">SELO 1<br>OFF 1</center>
    </v:textbox>
  </v:oval>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:109px;">
    <tr>
      <td align="center" valign="middle" height="109" class="txt-prim"
          style="width:109px;height:109px;background:#D9D9D9;border-radius:55px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:28px;font-weight:700;text-transform:uppercase;color:#28252B;text-align:center;">
        SELO 1<br>OFF 1
      </td>
    </tr>
  </table>
  <!--<![endif]-->
</td>
<td width="261" valign="top" style="width:261px;padding:21px 0 0 0;">
  <div class="txt-prim" style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:33px;font-weight:700;text-transform:uppercase;color:#28252B;">
    Product<br>Name 1
  </div>
  <td class="txt-prim" style="font-size:20px;">+</td>
  <td width="25" style="width:25px;font-size:0;line-height:0;">&nbsp;</td>
</td>`

describe("auditOrphanText", () => {
  it("acha o selo que nenhum campo endereça e marca como suspeito", () => {
    const schema = [campo({ key: "product_1_name", example: "Product Name 1" })]
    const { trechos, ok } = auditOrphanText(CARD_COM_SELO, schema)
    const textos = trechos.map((t) => t.texto)
    expect(textos).toContain("SELO 1")
    expect(textos).toContain("OFF 1")
    expect(trechos.filter((t) => t.suspeito).length).toBeGreaterThan(0)
    expect(ok).toBe(false)
  })

  // O ponto todo: o campo cadastrado ancora e SOME da lista de órfãos.
  it("campo ancorado não aparece como órfão", () => {
    const schema = [campo({ key: "product_1_name", example: "Product Name 1" })]
    const { trechos } = auditOrphanText(CARD_COM_SELO, schema)
    expect(trechos.map((t) => t.texto)).not.toContain("Product Name 1")
  })

  // Com os 6 campos do selo cadastrados, o bloco fica limpo — é a prova de
  // que o conserto de cadastro resolve de verdade.
  it("selo cadastrado no schema deixa o bloco sem suspeito", () => {
    const schema = [
      campo({ key: "product_1_name", example: "Product Name 1" }),
      campo({ key: "product_1_badge_value", example: "SELO 1", max_len: 8 }),
      campo({ key: "product_1_badge_label", example: "OFF 1", max_len: 8 }),
    ]
    expect(auditSchemaAnchors(CARD_COM_SELO, schema).ok).toBe(true)
    const { trechos, ok } = auditOrphanText(CARD_COM_SELO, schema)
    expect(ok).toBe(true)
    expect(trechos.filter((t) => t.suspeito)).toEqual([])
  })

  // Texto fixo legítimo aparece (quem cadastra merece ver o que vai sair
  // como está), mas SEM a marca — senão o aviso vira ruído e ninguém lê.
  it("texto fixo legítimo entra na lista sem suspeito", () => {
    const html = `<td><p>Você recebe este email porque se cadastrou.</p></td>`
    const { trechos, ok } = auditOrphanText(html, [])
    expect(trechos).toHaveLength(1)
    expect(trechos[0].suspeito).toBe(false)
    expect(ok).toBe(true)
  })

  it("pontuação e estrela decorativa não contam como texto", () => {
    const html = `<td><span>&#9733;&#9733;&#9733;</span><span>—</span></td>`
    expect(auditOrphanText(html, []).trechos).toEqual([])
  })

  it("suspeitos vêm primeiro, depois a ordem do documento", () => {
    const html = `<td><p>Frete grátis para todo o Brasil</p><p>Lorem ipsum dolor</p></td>`
    const { trechos } = auditOrphanText(html, [])
    expect(trechos[0].texto).toBe("Lorem ipsum dolor")
    expect(trechos[0].suspeito).toBe(true)
  })

  // Depois do merge o example não existe mais no documento: quem ancora é o
  // valor entregue. Sem isso toda copy gerada viraria "órfã".
  it('modo "valor" ancora pela copy entregue, não pelo example', () => {
    const html = `<td><p>ENERGYSAVE PRO</p><p>SELO 1</p></td>`
    const schema = [campo({ key: "product_1_name", example: "Product Name 1" })]
    const { trechos } = auditOrphanText(html, schema, {
      por: "valor",
      valores: { product_1_name: "ENERGYSAVE PRO" },
    })
    expect(trechos.map((t) => t.texto)).toEqual(["SELO 1"])
  })

  it("schema vazio não explode e devolve o texto do documento", () => {
    expect(auditOrphanText("<td><p>oi</p></td>", []).trechos).toHaveLength(1)
  })
})

describe("auditOrphanText — token da plataforma", () => {
  // 14 das 42 variantes ativas têm o div de preheader com este token. Quem o
  // resolve é o Montador/structural fill, não o schema: listá-lo acenderia
  // um alerta sem ação em quase toda variante da biblioteca.
  it("token SCREAMING_SNAKE não vira texto órfão", () => {
    const html = `<div>TEXTO_DE_PREHEADER_AQUI</div><td>NOME_DA_MARCA</td>`
    expect(auditOrphanText(html, []).trechos).toEqual([])
  })

  it("mas texto legível com cara de exemplo continua entrando", () => {
    const html = `<div>TEXTO_DE_PREHEADER_AQUI</div><td>LOGO HERE</td>`
    const { trechos } = auditOrphanText(html, [])
    expect(trechos.map((t) => t.texto)).toEqual(["LOGO HERE"])
    expect(trechos[0].suspeito).toBe(true)
  })
})
