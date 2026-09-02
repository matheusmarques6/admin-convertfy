import { describe, it, expect } from "vitest"
import {
  findBackgroundBoxes,
  photoSide,
  replaceUrlEverywhere,
} from "./background-fit"

const URL_A =
  "https://x.supabase.co/storage/v1/object/sign/onboarding-visual-assets/stores/s/email-assets/07c36729.png?token=abc.def"

// Trecho REAL da variante `welcome - hero section 5` (8858709f), já com a
// URL escrita pelo merge e a cor que o Cores & Botões deixou no td.
const HERO5 = `
    <tr>
      <td background="${URL_A}"
          valign="top"
          style="background-color:#034326;background-image:url('${URL_A}');background-position:center top;background-repeat:no-repeat;background-size:598px 1217px;">

        <!--[if gte mso 9]>
        <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:598px;height:1217px;">
          <v:fill type="frame" src="${URL_A}" color="#FFFFFF" />
          <v:textbox inset="0,0,0,0"><![endif]-->
        <table role="presentation" width="598"><tr><td>Welcome</td></tr></table>
        <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
      </td>
    </tr>`

describe("findBackgroundBoxes", () => {
  it("hero 5: um box 598×1217 com a cor do td e a URL do background", () => {
    const boxes = findBackgroundBoxes(HERO5)
    expect(boxes).toEqual([
      {
        url: URL_A,
        width: 598,
        height: 1217,
        color: "#034326",
        size_source: "background-size",
      },
    ])
  })

  it("sem background-size cai no v:rect que carrega a mesma URL", () => {
    const html = `
      <td background="${URL_A}" bgcolor="#111" style="padding:0;">
      <!--[if gte mso 9]><v:rect style="width:600px;height:900px;"><v:fill type="frame" src="${URL_A}" /><v:textbox><![endif]-->
      x
      <!--[if gte mso 9]></v:textbox></v:rect><![endif]--></td>`
    expect(findBackgroundBoxes(html)).toEqual([
      { url: URL_A, width: 600, height: 900, color: "#111111", size_source: "vml" },
    ])
  })

  it("token cru (merge não preencheu) e URL sem tamanho ficam de fora", () => {
    expect(
      findBackgroundBoxes(
        `<td background="URL_DA_IMAGEM_DE_FUNDO" style="background-size:598px 1217px;">a</td>`,
      ),
    ).toEqual([])
    expect(
      findBackgroundBoxes(`<td background="${URL_A}" style="padding:0;">a</td>`),
    ).toEqual([])
  })

  it("mesma URL em dois elementos conta uma vez; cor ausente vira null", () => {
    const html = `
      <td background="${URL_A}" style="background-size:100px 200px;">a</td>
      <td background="${URL_A}" style="background-size:100px 200px;">b</td>`
    const boxes = findBackgroundBoxes(html)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].color).toBeNull()
  })
})

describe("photoSide", () => {
  it("cadastro real do hero_lifestyle_consumo → base", () => {
    expect(
      photoSide(
        "Onde fica: base do ativo de fundo, abaixo da faixa chapada; não recebe nenhum texto sobreposto.",
      ),
    ).toBe("bottom")
  })
  it("topo quando o cadastro diz topo; sem pista → base", () => {
    expect(photoSide("foto ocupa o topo do fundo; faixa embaixo")).toBe("bottom")
    expect(photoSide("foto no topo do ativo")).toBe("top")
    expect(photoSide("")).toBe("bottom")
    expect(photoSide(null)).toBe("bottom")
  })
})

describe("replaceUrlEverywhere", () => {
  it("troca as 3 ocorrências da hero 5 (atributo, url(), v:fill)", () => {
    const r = replaceUrlEverywhere(HERO5, URL_A, "https://x/novo.png")
    expect(r.replaced).toBe(3)
    expect(r.html).not.toContain(URL_A)
    expect(r.html.match(/https:\/\/x\/novo\.png/g)).toHaveLength(3)
  })
  it("URL com caracteres de regex é tratada literalmente; igual → 0", () => {
    const u = "https://x/a.png?token=a+b(c).d"
    const r = replaceUrlEverywhere(`<td background="${u}">`, u, "https://y")
    expect(r.replaced).toBe(1)
    expect(replaceUrlEverywhere("<td>", u, u).replaced).toBe(0)
  })
})
