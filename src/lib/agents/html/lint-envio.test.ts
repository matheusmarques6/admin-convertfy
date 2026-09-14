/**
 * A fixture é o HTML REAL entregue no batch 6249aef2 (Hero Boxers · Welcome
 * 1, 11/09, e-mail bb2ef22d) — lido do banco e gravado em `fixtures/`. O
 * teste fixa o que a régua ENCONTRA nele, id a id, para que uma mudança de
 * regra apareça como diferença e não como silêncio.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { REGRAS, lintEnvio, paresMsoAnchor, resumoDoLint } from "./lint-envio"

const FIXTURE = readFileSync(join(__dirname, "fixtures", "batch-6249aef2-welcome-1.html"), "utf8")
const CTX = { ano: 2026, fontesDaLoja: ["Poppins"] }

describe("lintEnvio — batch 6249aef2", () => {
  const r = lintEnvio(FIXTURE, CTX)
  const porId = Object.fromEntries(r.itens.map((i) => [i.id, i]))

  it("encontra os 11 defeitos da peça entregue, com as contagens medidas", () => {
    expect(r.itens.map((i) => [i.id, i.n])).toEqual([
      ["css_var_em_uso", 3],
      ["style_blocks_multiplos", 6],
      ["comentario_dev", 85],
      ["mso_diverge_do_anchor", 1],
      ["img_sem_src", 6],
      ["anchor_sem_href", 4],
      // 12 até 14/09: "Verified Buyer" ×2 era copy do n8n no campo
      // `review_N_credential`, não o example "Verified Buyer 1".
      ["texto_de_example", 10],
      ["line_height_menor_que_fonte", 3],
      ["alt_ausente_ou_generico", 9],
      ["ano_copyright_desatualizado", 1],
      ["largura_container", 1],
    ])
  })

  it("bloqueia, e o primeiro bloqueante é o var(--x)", () => {
    expect(r.bloqueia).toBe(true)
    expect(r.bloqueantes).toEqual([
      "css_var_em_uso",
      "img_sem_src",
      "anchor_sem_href",
      "texto_de_example",
      "largura_container",
    ])
  })

  it("a evidência diz O QUE foi visto", () => {
    expect(porId.css_var_em_uso.evidencia).toBe("var() em uso: --bg")
    expect(porId.mso_diverge_do_anchor.evidencia).toBe('Outlook "DIGITAL GIFT CARD" ≠ "BAMBOO BOXERS"')
    expect(porId.ano_copyright_desatualizado.evidencia).toBe("© 2025 (ano corrente 2026)")
    expect(porId.largura_container.evidencia).toBe("container em 598px em vez de 600")
    expect(porId.texto_de_example.evidencia).toContain("dolor sit amet")
  })

  it("severidade e auto_fix vêm da tabela REGRAS", () => {
    for (const i of r.itens) {
      expect(i.severidade).toBe(REGRAS[i.id].severidade)
      expect(i.auto_fix).toBe(REGRAS[i.id].auto_fix)
    }
  })

  it("resumo em uma linha marca os bloqueantes com '!'", () => {
    expect(resumoDoLint(r)).toContain("css_var_em_uso×3!")
    expect(resumoDoLint(r)).toContain("comentario_dev×85,")
  })
})

describe("lintEnvio — regras isoladas", () => {
  it("documento limpo não acusa nada", () => {
    const doc = `<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body>
      <table width="100%"><tr><td><table width="600"><tr><td style="font-size:16px;line-height:24px;font-family:Arial,sans-serif">
      <a href="https://loja.com">Comprar</a> <img src="https://x/a.png" width="100" alt="Cueca preta" />
      © 2026 Loja</td></tr></table></td></tr></table></body></html>`
    const r = lintEnvio(doc, { ano: 2026 })
    expect(r.itens).toEqual([])
    expect(r.bloqueia).toBe(false)
  })

  it("MSO: botão que existe SÓ no Outlook (ramo não-Outlook sem <a> com texto)", () => {
    const doc = `<table width="600"><tr><td>
      <!--[if mso]><v:roundrect href="https://x"><center>GIFT CARD</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-- --><table><tr><td><a href="https://x"></a></td></tr></table><!--<![endif]-->
      </td></tr><tr><td><a href="https://y">Produto</a></td></tr></table>`
    const pares = paresMsoAnchor(doc)
    expect(pares).toHaveLength(1)
    expect(pares[0].anchorTexto).toBeNull()
    const r = lintEnvio(doc, { ano: 2026 })
    expect(r.itens.find((i) => i.id === "mso_diverge_do_anchor")?.evidencia).toContain("existe SÓ no ramo do Outlook")
  })

  it("merge tags em qualquer dialeto NÃO são âncora sem destino", () => {
    const doc = `<table width="600"><tr><td><a href="{{unsubscribe}}">a</a><a href="*|ARCHIVE|*">b</a><a href="[unsubscribe_link]">c</a><a href="mailto:x@y.z">d</a></td></tr></table>`
    expect(lintEnvio(doc, { ano: 2026 }).itens.map((i) => i.id)).not.toContain("anchor_sem_href")
  })

  it("href de exemplo da biblioteca É âncora sem destino", () => {
    const doc = `<table width="600"><tr><td><a href="URL_CTA_PRIMARIO">a</a></td></tr></table>`
    const r = lintEnvio(doc, { ano: 2026 })
    expect(r.itens.find((i) => i.id === "anchor_sem_href")?.evidencia).toContain("URL_CTA_PRIMARIO")
  })

  it("label ilegível sobre o fundo do botão preenchido bloqueia", () => {
    const doc = `<table width="600"><tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF">
      <table><tr><td bgcolor="#EEEEEE" style="background-color:#EEEEEE;border-radius:4px"><a href="https://x" style="display:inline-block;color:#FFFFFF;padding:12px 24px;font-size:16px">Comprar</a></td></tr></table>
      </td></tr></table>`
    const r = lintEnvio(doc, { ano: 2026 })
    const c = r.itens.find((i) => i.id === "contraste_botao_container")
    expect(c?.severidade).toBe("bloqueia")
    expect(c?.evidencia).toContain("#FFFFFF sobre #EEEEEE")
  })

  it("fonte da loja e fonte da whitelist passam; fonte desconhecida avisa", () => {
    const doc = `<table width="600"><tr><td style="font-family:'Playfair Display',Georgia,serif">a</td><td style="font-family:Poppins,Arial">b</td><td style="font-family:'Comic Neue',cursive">c</td></tr></table>`
    const r = lintEnvio(doc, { ano: 2026, fontesDaLoja: ["Poppins"] })
    expect(r.itens.find((i) => i.id === "fonte_fora_da_whitelist")?.evidencia).toBe("família fora da whitelist: Comic Neue")
  })

  it("largura: sem container numérico perto de 600 bloqueia; 100% de calha não", () => {
    const doc = `<table width="100%"><tr><td><table width="480"><tr><td>x</td></tr></table></td></tr></table>`
    expect(lintEnvio(doc, { ano: 2026 }).itens.find((i) => i.id === "largura_container")?.evidencia).toContain("nenhuma tabela declara o container de 600px")
    const ok = `<table width="100%"><tr><td><table width="600"><tr><td><table width="280">x</table></td></tr></table></td></tr></table>`
    expect(lintEnvio(ok, { ano: 2026 }).itens.map((i) => i.id)).not.toContain("largura_container")
  })

  it("tabela desbalanceada e imagem de 1px sem alt", () => {
    const doc = `<table width="600"><tr><td><img src="https://x/pixel.gif" width="1" height="1"><table><tr><td>a</td></tr></td></tr></table>`
    const r = lintEnvio(doc, { ano: 2026 })
    expect(r.itens.find((i) => i.id === "tabela_desbalanceada")?.evidencia).toContain("<table> 2 abre × 1 fecha")
    expect(r.itens.map((i) => i.id)).not.toContain("alt_ausente_ou_generico")
  })
})
