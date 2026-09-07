import { describe, expect, it } from "vitest"
import { decodificarEntidades, extrairDescricao, extrairPagina, extrairTitulo } from "./web-extract"

const PAGINA = `<!doctype html>
<html><head>
  <title>Welcome Flow &amp; Boas-vindas | Convertfy</title>
  <meta name="description" content="Como montar o fluxo de boas-vindas">
  <style>.x{color:red}</style>
  <script>window.dataLayer=[];</script>
</head><body>
  <nav><a href="/menu">Menu</a></nav>
  <header><a href="/logo">Logo</a></header>
  <h1>Welcome flow</h1>
  <p>O primeiro email dispara <b>na hora</b>.</p>
  <ul><li>Piso de tr&ecirc;s emails</li><li>Sem atraso</li></ul>
  <a href="/flows/sunset">Ver o sunset</a>
  <footer><a href="/rodape">Rodapé</a></footer>
  <script>console.log("fim")</script>
</body></html>`

describe("decodificarEntidades", () => {
  it("resolve nomeadas, decimais e hexadecimais", () => {
    expect(decodificarEntidades("caf&eacute; &amp; a&ccedil;&uacute;car")).toBe("café & açúcar")
    expect(decodificarEntidades("&#233;poca &#x2014; fim")).toBe("época — fim")
  })

  it("entidade desconhecida fica como está, sem sumir texto", () => {
    expect(decodificarEntidades("&naoexiste; ok")).toBe("&naoexiste; ok")
  })
})

describe("extrairTitulo / extrairDescricao", () => {
  it("pega o title decodificado e a description", () => {
    expect(extrairTitulo(PAGINA)).toBe("Welcome Flow & Boas-vindas | Convertfy")
    expect(extrairDescricao(PAGINA)).toBe("Como montar o fluxo de boas-vindas")
  })

  it("sem title cai no h1", () => {
    expect(extrairTitulo("<html><body><h1>Só o H1</h1></body></html>")).toBe("Só o H1")
  })
})

describe("extrairPagina", () => {
  const p = extrairPagina(PAGINA, { baseUrl: "https://convertfy.com.br/blog" })

  it("mantém o conteúdo e joga fora script, style, nav, header e footer", () => {
    // São eles que gastam o contexto do turno e empurram o conteúdo real
    // para fora do orçamento.
    expect(p.texto).toContain("O primeiro email dispara na hora.")
    expect(p.texto).toContain("Piso de três emails")
    expect(p.texto).not.toContain("dataLayer")
    expect(p.texto).not.toContain("color:red")
    expect(p.texto).not.toContain("Menu")
    expect(p.texto).not.toContain("Rodapé")
  })

  it("vira linhas, não uma parede", () => {
    expect(p.texto).toContain("\n- Piso de três emails")
    expect(p.texto.split("\n").length).toBeGreaterThan(2)
  })

  it("coleta links do conteúdo em URL absoluta", () => {
    expect(p.links).toContainEqual({ texto: "Ver o sunset", url: "https://convertfy.com.br/flows/sunset" })
    // Link de nav/footer sai junto com o bloco.
    expect(p.links.some((l) => l.url.includes("/rodape"))).toBe(false)
  })

  it("ignora âncora, javascript: e mailto:", () => {
    const r = extrairPagina(
      `<a href="#topo">Topo</a><a href="javascript:void(0)">X</a><a href="mailto:a@b.c">Mail</a><a href="https://ok.com/a">Ok</a>`,
      { baseUrl: "https://x.com" },
    )
    expect(r.links).toHaveLength(1)
    expect(r.links[0].url).toBe("https://ok.com/a")
  })

  it("corta no orçamento e AVISA que cortou", () => {
    // Entregar o começo dizendo que cortou é melhor que estourar o
    // contexto — mas o modelo precisa saber, senão conclui a partir de
    // meia página achando que viu tudo.
    const r = extrairPagina(`<p>${"palavra ".repeat(5000)}</p>`, { maxChars: 500 })
    expect(r.truncado).toBe(true)
    expect(r.texto.length).toBeLessThanOrEqual(501)
    expect(r.texto.endsWith("…")).toBe(true)
  })

  it("comentário HTML não engana a remoção de script", () => {
    const r = extrairPagina(`<!-- <script> --><p>conteudo</p><script>segredo()</script>`)
    expect(r.texto).toContain("conteudo")
    expect(r.texto).not.toContain("segredo")
  })

  it("página vazia não explode", () => {
    const r = extrairPagina("")
    expect(r.texto).toBe("")
    expect(r.truncado).toBe(false)
    expect(r.links).toEqual([])
  })
})
