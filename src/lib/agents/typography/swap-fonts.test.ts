import { describe, it, expect } from "vitest"
import { applyTypographyOps } from "./apply"
import { extractTypographyInventory } from "./inventory"
import {
  ehTitulo,
  familiaPrincipal,
  familiasDoDocumento,
  opsParaTrocarFontesDaPeca,
  remapFamilies,
} from "./swap-fonts"

// Peça no estado em que o tipógrafo a deixa: a marca em Montserrat e UM item
// já rompido para uma segunda família (o que `normalizeFonts` apagaria).
const HTML = `<!DOCTYPE html><html><head></head><body>
<table><tr><td>
  <div style="font-family:Montserrat,Arial;font-size:56px;font-weight:900;">TÍTULO</div>
  <p style="font-family:Montserrat,Arial;font-size:14px;font-weight:400;">corpo do email</p>
  <span style="font-family:'Playfair Display',Georgia;font-size:25px;font-weight:400;">BEMVINDO10</span>
</td></tr></table>
</body></html>`

const inv = extractTypographyInventory(HTML)

describe("papel da ocorrência", () => {
  it("título por tamanho, corpo por tamanho pequeno", () => {
    expect(ehTitulo(inv[0])).toBe(true)
    expect(ehTitulo(inv[1])).toBe(false)
  })
  it("familiaPrincipal tira aspas e pega só a primeira da cadeia", () => {
    expect(familiaPrincipal("'Playfair Display',Georgia,serif")).toBe("playfair display")
  })
})

describe("opsParaTrocarFontesDaPeca", () => {
  it("troca só quem está na família principal — a segunda fonte sobrevive", () => {
    const ops = opsParaTrocarFontesDaPeca(inv, {
      deTitulo: "Montserrat",
      deCorpo: "Montserrat",
      paraTitulo: "Sora",
      paraCorpo: "Sora",
    })
    expect(ops.map((o) => o.item)).toEqual([0, 1])
    const r = applyTypographyOps(HTML, ops, null)
    const depois = extractTypographyInventory(r.html)
    expect(familiaPrincipal(depois[0].family)).toBe("sora")
    expect(familiaPrincipal(depois[1].family)).toBe("sora")
    // O item do tipógrafo fica onde estava.
    expect(familiaPrincipal(depois[2].family)).toBe("playfair display")
  })

  it("título e corpo podem ir para famílias diferentes", () => {
    const ops = opsParaTrocarFontesDaPeca(inv, {
      deTitulo: "Montserrat",
      deCorpo: "Montserrat",
      paraTitulo: "Playfair Display",
      paraCorpo: "Inter",
    })
    const r = applyTypographyOps(HTML, ops, null)
    const depois = extractTypographyInventory(r.html)
    expect(familiaPrincipal(depois[0].family)).toBe("playfair display")
    expect(familiaPrincipal(depois[1].family)).toBe("inter")
  })

  it("carrega o peso da marca quando pedido, e só onde muda", () => {
    const ops = opsParaTrocarFontesDaPeca(inv, {
      deTitulo: "Montserrat",
      deCorpo: "Montserrat",
      paraTitulo: "Montserrat",
      paraCorpo: "Montserrat",
      pesoTitulo: 900,
      pesoCorpo: 500,
    })
    // O título já está em 900: nada a fazer nele.
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ item: 1, peso: 500 })
    expect(ops[0].familia).toBeUndefined()
  })

  it("sem nada para mudar, devolve lista vazia", () => {
    expect(
      opsParaTrocarFontesDaPeca(inv, {
        deTitulo: "Montserrat",
        deCorpo: "Montserrat",
        paraTitulo: "Montserrat",
        paraCorpo: "Montserrat",
      }),
    ).toEqual([])
  })

  it("sem a família de origem declarada, troca todo mundo do papel", () => {
    const ops = opsParaTrocarFontesDaPeca(inv, { paraTitulo: "Sora" })
    // Os dois itens de "título" (56px e o de 25px) entram; o corpo não.
    expect(ops.map((o) => o.item)).toEqual([0, 2])
  })
})

// O head declara família também — é o Gmail webmail que honra `<style>`.
const COM_HEAD = `<!DOCTYPE html><html><head><style>
  body { font-family: 'Inter', Arial, sans-serif; }
</style></head><body>
  <div style="font-family:Inter,Arial;font-size:40px;">TÍTULO</div>
  <p style="font-family:'Playfair Display',Georgia;font-size:14px;">corpo</p>
</body></html>`

describe("remapFamilies", () => {
  it("troca no head E no corpo — o inventário sozinho não alcança o head", () => {
    const r = remapFamilies(COM_HEAD, { Inter: "Sora" })
    expect(r.trocadas).toBe(2)
    expect(r.html).toContain("font-family:Sora,Arial,Helvetica,sans-serif;")
    expect(r.html).not.toContain("'Inter'")
  })

  it("não toca em família fora do mapa", () => {
    const r = remapFamilies(COM_HEAD, { Inter: "Sora" })
    expect(r.html).toContain("'Playfair Display'")
  })

  it("não muda a contagem de declarações — o invariante segue valendo", () => {
    const antes = extractTypographyInventory(COM_HEAD).length
    const r = remapFamilies(COM_HEAD, { Inter: "Sora", "playfair display": "Lora" })
    expect(extractTypographyInventory(r.html)).toHaveLength(antes)
  })

  it("nome de destino que não passa no saneamento é ignorado", () => {
    const r = remapFamilies(COM_HEAD, { Inter: 'Sora";x="' })
    expect(r.trocadas).toBe(0)
    expect(r.html).toBe(COM_HEAD)
  })

  it("mapa vazio devolve o documento intacto", () => {
    expect(remapFamilies(COM_HEAD, {}).html).toBe(COM_HEAD)
  })
})

describe("familiasDoDocumento", () => {
  it("lista as famílias com contagem, da mais usada para a menos", () => {
    const lista = familiasDoDocumento(extractTypographyInventory(HTML))
    expect(lista[0]).toMatchObject({ familia: "Montserrat", ocorrencias: 2, maiorTamanho: 56 })
    expect(lista[1]).toMatchObject({ familia: "Playfair Display", ocorrencias: 1 })
  })
})
