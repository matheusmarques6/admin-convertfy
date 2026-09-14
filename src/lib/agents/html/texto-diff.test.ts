import { describe, expect, it } from "vitest"

import { diffTextoVisivel, linhasVisiveis } from "./texto-diff"

describe("diffTextoVisivel", () => {
  it("linha que sumiu é removida; linha nova é inserida; igual é mantida", () => {
    const antes = `<table><tr><td><h1>Welcome to Hero</h1><p>Made for you.</p><a>Shop now</a></td></tr></table>`
    const depois = `<table><tr><td><h1>WELCOME TO HERO</h1><p>Here's 10% OFF</p><a>Shop now</a></td></tr></table>`
    const d = diffTextoVisivel(antes, depois)
    expect(d.removidas).toEqual(["Made for you."])
    expect(d.inseridas).toEqual(["Here's 10% OFF"])
    expect(d.mantidas).toBe(2)
  })

  it("style, script e comentário não são texto visível", () => {
    expect(linhasVisiveis(`<style>.a{}</style><!-- oi --><p>ok</p>`)).toEqual(["ok"])
  })

  it("re-espaçar e mudar caixa não é diferença", () => {
    const d = diffTextoVisivel(`<p>Olá   mundo</p>`, `<p>OLÁ MUNDO</p>`)
    expect(d.removidas).toEqual([])
    expect(d.inseridas).toEqual([])
  })
})
