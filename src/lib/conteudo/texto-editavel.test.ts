import { describe, expect, it } from "vitest"
import { textoDoEditavel, type NoEditavel } from "./texto-editavel"

/** Fábricas mínimas: o módulo é puro e não precisa de DOM. */
const t = (data: string): NoEditavel => ({ nodeType: 3, nodeName: "#text", data })
const el = (nodeName: string, ...childNodes: NoEditavel[]): NoEditavel => ({ nodeType: 1, nodeName, childNodes })
const br = (): NoEditavel => el("BR")

describe("textoDoEditavel", () => {
  it("o caso real de produção: três parágrafos do Chrome NÃO saem grudados", () => {
    // Foi assim que "FORAM CRIADAS PARAVOCÊ VENDER MAIS" nasceu no banco.
    const raiz = el("DIV", t("FORAM CRIADAS PARA"), el("DIV", t("VOCÊ VENDER MAIS")), el("DIV", t("E a Black Friday...")))
    expect(textoDoEditavel(raiz)).toBe("FORAM CRIADAS PARA\nVOCÊ VENDER MAIS\nE a Black Friday...")
  })

  it("`<br>` do Safari e do Firefox também vira quebra", () => {
    expect(textoDoEditavel(el("DIV", t("uma"), br(), t("duas")))).toBe("uma\nduas")
  })

  it("o primeiro parágrafo não nasce com linha em branco na frente", () => {
    expect(textoDoEditavel(el("DIV", el("DIV", t("a")), el("DIV", t("b"))))).toBe("a\nb")
  })

  it("bloco aninhado é UM parágrafo — não dobra a quebra", () => {
    expect(textoDoEditavel(el("DIV", el("DIV", el("DIV", t("a"))), el("DIV", t("b"))))).toBe("a\nb")
  })

  it("a linha vazia do Chrome (`<div><br></div>`) vale UMA quebra, não duas", () => {
    const raiz = el("DIV", t("a"), el("DIV", br()), el("DIV", t("b")))
    expect(textoDoEditavel(raiz)).toBe("a\n\nb")
  })

  it("elemento INLINE não quebra nada — é o `<span>`/`<b>` que a colagem traz", () => {
    expect(textoDoEditavel(el("DIV", t("Datas "), el("B", t("sazonais")), el("SPAN", t(" hoje"))))).toBe("Datas sazonais hoje")
  })

  it("`\\r\\n` colado de fora vira `\\n` — senão a escada conta um caractere invisível", () => {
    expect(textoDoEditavel(el("DIV", t("a\r\nb")))).toBe("a\nb")
  })

  it("campo vazio e raiz ausente devolvem string vazia, nunca `undefined`", () => {
    expect(textoDoEditavel(el("DIV"))).toBe("")
    expect(textoDoEditavel(null)).toBe("")
    expect(textoDoEditavel(undefined)).toBe("")
  })

  it("texto simples (o caso de 99% das edições) passa intacto", () => {
    expect(textoDoEditavel(el("DIV", t("Título da ideia")))).toBe("Título da ideia")
  })

  it("o `**realce**` sobrevive: a leitura é crua, quem formata é o renderer", () => {
    expect(textoDoEditavel(el("DIV", t("Comente **CALENDÁRIO**")))).toBe("Comente **CALENDÁRIO**")
  })
})
