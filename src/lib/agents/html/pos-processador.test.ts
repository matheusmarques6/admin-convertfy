import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { lintEnvio } from "./lint-envio"
import { posProcessar } from "./pos-processador"

const FIXTURE = readFileSync(join(__dirname, "fixtures", "batch-6249aef2-welcome-1.html"), "utf8")
const CTX = { ano: 2026, altPadrao: "Hero Boxers" }

describe("posProcessar — batch 6249aef2", () => {
  const p = posProcessar(FIXTURE, CTX)

  it("aplica as oito correções seguras, com as contagens medidas", () => {
    expect(p.aplicados.map((a) => [a.id, a.n])).toEqual([
      ["styles_fundidos", 6],
      ["css_vars_resolvidas", 3],
      ["comentarios_removidos", 85],
      ["mso_sincronizado", 1],
      ["img_vazias_removidas", 6],
      ["alt_preenchido", 9],
      ["ano_atualizado", 1],
      ["line_height_corrigido", 14],
    ])
  })

  it("aceite: 0 var(--, 1 <style>, 0 comentário dev, 0 <img src=''>, MSO = anchor, ano corrente", () => {
    expect(p.html).not.toMatch(/var\(--/)
    expect(p.html.match(/<style/gi)).toHaveLength(1)
    expect(p.html).not.toMatch(/<img[^>]*src=""/i)
    expect(p.html).not.toMatch(/:root\s*\{/)
    expect(p.html).toMatch(/<center[^>]*>BAMBOO BOXERS<\/center>/)
    expect(p.html).toContain("© 2026")
    // Os condicionais do Outlook FICAM — são o que faz o botão existir lá.
    expect(p.html.match(/<!--\[if mso\]>/g)?.length).toBeGreaterThan(0)
  })

  it("o lint depois só acusa o que NÃO é auto-corrigível", () => {
    const r = lintEnvio(p.html, { ano: 2026, fontesDaLoja: ["Poppins"] })
    expect(r.itens.map((i) => [i.id, i.n])).toEqual([
      ["anchor_sem_href", 4],
      ["texto_de_example", 12],
      ["largura_container", 1],
    ])
    expect(r.itens.every((i) => !i.auto_fix)).toBe(true)
  })

  it("é idempotente", () => {
    const p2 = posProcessar(p.html, CTX)
    expect(p2.aplicados).toEqual([])
    expect(p2.html).toBe(p.html)
  })

  it("resolve var() com fallback e mantém o :root quando sobra variável", () => {
    const doc = `<style>:root{--bg:#F2F2F2;}</style><body style="background:var(--bg)"><td style="color:var(--nada, #333)">a</td><td style="color:var(--outra)">b</td></body>`
    const r = posProcessar(doc, { ano: 2026 })
    expect(r.html).toContain('style="background:#F2F2F2"')
    expect(r.html).toContain("color:#333")
    expect(r.html).toContain("var(--outra)")
    expect(r.html).toContain(":root")
  })

  it("alt: a URL conhecida vence o padrão; imagem com alt bom fica intacta", () => {
    const doc = `<img src="https://x/a.png" width="300" alt=""><img src="https://x/b.png" width="300" alt="Cueca preta"><img src="https://x/c.png" width="300">`
    const r = posProcessar(doc, { ano: 2026, altPadrao: "Loja", altPorUrl: new Map([["https://x/a.png", "Produto · Bamboo"]]) })
    expect(r.html).toContain('alt="Produto · Bamboo"')
    expect(r.html).toContain('alt="Cueca preta"')
    expect(r.html).toContain('<img alt="Loja" src="https://x/c.png"')
  })

  it("remove a linha inteira cuja única filha é <img src=''> e o <img> solto que sobrar", () => {
    const doc = `<table><tr><td><img src="" width="10"></td></tr><tr><td>texto</td></tr></table><div><img src=""></div><p>x <img src="" /> y</p>`
    const r = posProcessar(doc, { ano: 2026 })
    expect(r.html).toBe(`<table><tr><td>texto</td></tr></table><p>x  y</p>`)
    expect(r.aplicados).toEqual([{ id: "img_vazias_removidas", n: 3 }])
  })

  it("line-height abaixo de 1,1× a fonte vira 1,1×", () => {
    const r = posProcessar(`<td style="font-size:50px;line-height:43px">a</td>`, { ano: 2026 })
    expect(r.html).toBe(`<td style="font-size:50px;line-height:55px">a</td>`)
  })
})

describe("posProcessar — line-height (Passo 14)", () => {
  it("normal e unitless abaixo de 1,1 viram px", () => {
    expect(posProcessar(`<h1 style="font-size:40px;line-height:normal">a</h1>`, { ano: 2026 }).html).toBe(`<h1 style="font-size:40px;line-height:44px">a</h1>`)
    expect(posProcessar(`<h1 style="font-size:40px;line-height:1">a</h1>`, { ano: 2026 }).html).toBe(`<h1 style="font-size:40px;line-height:44px">a</h1>`)
    expect(posProcessar(`<p style="font-size:16px;line-height:1.5">a</p>`, { ano: 2026 }).html).toContain("line-height:1.5")
  })
  it("título sem line-height ganha um; corpo pequeno sem line-height fica", () => {
    expect(posProcessar(`<h1 style="font-size:50px;">a</h1>`, { ano: 2026 }).html).toBe(`<h1 style="font-size:50px;line-height:55px">a</h1>`)
    expect(posProcessar(`<p style="font-size:16px">a</p>`, { ano: 2026 }).html).toBe(`<p style="font-size:16px">a</p>`)
  })
  it("já ≥ 1,1× não é tocado", () => {
    const h = `<td style="font-size:20px;line-height:22px">a</td>`
    expect(posProcessar(h, { ano: 2026 }).html).toBe(h)
  })
})
