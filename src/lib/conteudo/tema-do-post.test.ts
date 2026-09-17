import { describe, expect, it } from "vitest"
import { TEMAS_DO_X, aplicarTemaDoPost, coresDoPost, ehTemaDoPost } from "./formato-post"

/** O mínimo que `aplicarTemaDoPost` toca, no tema do print (o padrão). */
function peca(over: Partial<Parameters<typeof aplicarTemaDoPost>[0]> = {}) {
  const t = TEMAS_DO_X.print
  return {
    cores: { hook: t.texto, metadado: t.handle, destaque: t.selo },
    fundoPorFrame: { f1: t.fundo, f2: t.fundo },
    gradiente: { de: "#1A1A1A", meio: "#131313", ate: t.fundo, angulo: 160 },
    cta: { mostrar: true, texto: "Seguir", fundo: t.texto, cor: t.fundo },
    ...over,
  }
}

describe("tema do print de tweet", () => {
  it("as cores do X vêm da especificação, não do olho", () => {
    // Lidas de `react-tweet/twitter-theme/theme.css` — o componente que o
    // Spell UI usa por baixo. O handle é cinza AZULADO, não neutro.
    expect(TEMAS_DO_X.claro.texto).toBe("#0F1419")
    expect(TEMAS_DO_X.claro.handle).toBe("#536471")
    expect(TEMAS_DO_X.dim.fundo).toBe("#15202B")
    expect(TEMAS_DO_X.escuro.fundo).toBe("#000000")
    // O selo que já estava aqui bate com a especificação exatamente.
    for (const t of Object.values(TEMAS_DO_X)) expect(t.selo).toBe("#1D9BF0")
  })

  it("tema ausente ou desconhecido cai no do print — zero regressão", () => {
    expect(coresDoPost(undefined)).toBe(TEMAS_DO_X.print)
    expect(coresDoPost("lights-out-2")).toBe(TEMAS_DO_X.print)
    expect(ehTemaDoPost("claro")).toBe(true)
    expect(ehTemaDoPost("azul")).toBe(false)
  })

  it("trocar o tema leva o FUNDO de cada slide junto", () => {
    // Sem isso o texto claro do tema escuro ficaria sobre o branco do
    // claro — invisível, sem erro nenhum.
    const r = aplicarTemaDoPost(peca(), "claro")
    expect(r.fundoPorFrame).toEqual({ f1: "#FFFFFF", f2: "#FFFFFF" })
    expect(r.cores.hook).toBe("#0F1419")
    expect(r.cores.metadado).toBe("#536471")
  })

  it("o que foi pintado à mão sobrevive", () => {
    const p = peca({ fundoPorFrame: { f1: TEMAS_DO_X.print.fundo, f2: "#123456" }, cores: { hook: "#FF0000", metadado: TEMAS_DO_X.print.handle } })
    const r = aplicarTemaDoPost(p, "dim")
    expect(r.fundoPorFrame.f2).toBe("#123456")
    expect(r.cores.hook).toBe("#FF0000")
    // O que ainda era padrão, esse sim troca.
    expect(r.fundoPorFrame.f1).toBe("#15202B")
    expect(r.cores.metadado).toBe("#8B98A5")
  })

  it("ir e voltar devolve a peça ao estado original", () => {
    const p = peca()
    const volta = aplicarTemaDoPost(aplicarTemaDoPost(p, "claro"), "print")
    expect(volta.cores).toEqual(p.cores)
    expect(volta.fundoPorFrame).toEqual(p.fundoPorFrame)
    expect(volta.gradiente).toEqual(p.gradiente)
    expect(volta.cta).toEqual(p.cta)
  })

  it("aplicar o mesmo tema não mexe em nada", () => {
    const p = { ...peca(), temaPost: "dim" as const }
    expect(aplicarTemaDoPost(p, "dim")).toEqual(p)
  })

  it("o CTA inverte junto, e só quando é o par padrão", () => {
    const r = aplicarTemaDoPost(peca(), "claro")
    expect(r.cta.fundo).toBe("#0F1419")
    expect(r.cta.cor).toBe("#FFFFFF")
    const custom = aplicarTemaDoPost(peca({ cta: { mostrar: true, texto: "x", fundo: "#00FF00", cor: "#000" } }), "claro")
    expect(custom.cta.fundo).toBe("#00FF00")
  })

  it("todo tema declara as seis cores", () => {
    for (const [nome, t] of Object.entries(TEMAS_DO_X)) {
      for (const chave of ["fundo", "texto", "handle", "selo", "link", "avatarVazio"] as const) {
        expect(t[chave], `${nome}.${chave}`).toMatch(/^#[0-9A-F]{6}$/i)
      }
    }
  })
})
