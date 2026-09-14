/**
 * 14/09 — a peça bb2ef22d (Hero Boxers · Welcome 1) reprovou no lint de
 * envio por quatro achados, e três deles eram de FRONTEIRA, não do
 * desenho: ícone social sem destino (o vocabulário de tokens deixa o href
 * vazio de propósito; o lint bloqueia link morto), `v:roundrect` órfão
 * (o merge apagou o `<a>` do CTA negado e o gêmeo do Outlook ficou),
 * variante em 598px (a montagem só neutralizava a calha; a largura era
 * normalizada só no salvar) e "Verified Buyer" lido como example quando
 * era a copy do n8n.
 */
import { describe, expect, it } from "vitest"

import { pareceExemplo } from "./anchor-match"
import { fitFragment } from "./fragment-fit"
import { lintEnvio } from "./lint-envio"
import { posProcessar } from "./pos-processador"

const ICONES = `<table><tr>
<td><a><img src="https://x/fb.png" width="42" height="42" alt="Facebook"></a></td>
<td><a href=""><img src="https://x/ig.png" width="42" height="42" alt="Instagram"></a></td>
<td><a href="URL_TIKTOK"><img src="https://x/tt.png" width="42" height="42" alt="TikTok"></a></td>
<td><a href="https://youtube.com/@loja"><img src="https://x/yt.png" width="42" height="42" alt="YouTube"></a></td>
<td><a>Fale conosco</a></td>
</tr></table>`

describe("posProcessar — ícone-âncora sem destino (passo 9)", () => {
  const r = posProcessar(ICONES, { ano: 2026 })

  it("remove âncora E ícone quando o href está ausente, vazio ou é token de exemplo", () => {
    expect(r.html).not.toContain("fb.png")
    expect(r.html).not.toContain("ig.png")
    expect(r.html).not.toContain("tt.png")
    expect(r.aplicados).toContainEqual({ id: "icones_sem_destino_removidos", n: 3 })
  })

  it("ícone com destino real e âncora COM texto ficam — o destino de um botão é conteúdo, não limpeza", () => {
    expect(r.html).toContain('<a href="https://youtube.com/@loja"><img src="https://x/yt.png"')
    expect(r.html).toContain("<a>Fale conosco</a>")
    expect(lintEnvio(r.html, { ano: 2026 }).itens.find((i) => i.id === "anchor_sem_href")?.n).toBe(1)
  })

  it("é idempotente", () => {
    const r2 = posProcessar(r.html, { ano: 2026 })
    expect(r2.html).toBe(r.html)
    expect(r2.aplicados.find((a) => a.id === "icones_sem_destino_removidos")).toBeUndefined()
  })
})

const MSO_ORFAO = `<table><tr><td align="center">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://loja.com" style="height:61px;width:354px;" arcsize="13%" stroke="f" fillcolor="#000000">
<w:anchorlock/>
<center style="color:#FFFFFF;font-size:32px;">DIGITAL GIFT CARD</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<!--<![endif]-->
</td></tr>
<tr><td align="center">
<!--[if mso]>
<v:roundrect href="https://loja.com" style="height:61px;width:354px;" arcsize="13%" stroke="f" fillcolor="#000000">
<center style="color:#FFFFFF;">SHOP NOW</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- --><a href="https://loja.com" style="display:inline-block">SHOP NOW</a><!--<![endif]-->
</td></tr></table>`

describe("posProcessar — v:roundrect órfão (passo 10)", () => {
  const r = posProcessar(MSO_ORFAO, { ano: 2026 })

  it("remove o bloco MSO que existe SÓ no Outlook e o ramo não-Outlook vazio ao lado", () => {
    expect(r.html).not.toContain("DIGITAL GIFT CARD")
    expect(r.html).not.toMatch(/<!--\[if !mso\]><!-- -->\s*<!--<!\[endif\]-->/)
    expect(r.aplicados).toContainEqual({ id: "mso_orfao_removido", n: 1 })
  })

  it("o par completo (MSO + <a>) fica intacto", () => {
    expect(r.html).toContain("<center style=\"color:#FFFFFF;\">SHOP NOW</center>")
    expect(r.html).toContain('<a href="https://loja.com" style="display:inline-block">SHOP NOW</a>')
    expect(lintEnvio(r.html, { ano: 2026 }).itens.find((i) => i.id === "mso_diverge_do_anchor")).toBeUndefined()
  })
})

describe("fitFragment — largura canônica no encaixe", () => {
  it("variante com container em 598 entra no documento em 600", () => {
    const variante = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="598" cellpadding="0" cellspacing="0" style="width:598px;"><tr><td>bloco</td></tr></table>
</td></tr></table>`
    const fit = fitFragment(variante, { wrapUnknown: true })
    expect(fit).not.toBeNull()
    expect(fit!.widthEnforced).toBe(true)
    expect(fit!.html).not.toContain('width="598"')
    expect(fit!.html).not.toContain("width:598px")
    expect(fit!.html).toContain('width="600"')
  })

  it("variante já em 600 não é marcada", () => {
    const fit = fitFragment(`<tr><td><table width="600"><tr><td>ok</td></tr></table></td></tr>`)
    expect(fit?.widthEnforced).toBeUndefined()
  })
})

describe("pareceExemplo — o example do review tem dígito; a copy não", () => {
  it("'Verified Buyer 1' e '1 Verified Buyer' são example (review 2/3/7); 'Verified Buyer' é copy", () => {
    expect(pareceExemplo("Verified Buyer 1")).toBe(true)
    expect(pareceExemplo("1 Verified Buyer")).toBe(true)
    expect(pareceExemplo("Verified Buyer")).toBe(false)
    expect(pareceExemplo("Link Here")).toBe(true)
  })
})
