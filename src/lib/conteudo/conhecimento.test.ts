import { describe, expect, it } from "vitest"
import {
  CONHECIMENTO_MAX_CHARS_NOTA,
  CONSULTA_MAX_CHARS,
  REGRAS_DO_NUMERO,
  blocoDeConhecimento,
  conferirNotasCitadas,
  consultaDaAcao,
  pareceNotaDaBase,
  procedenciaDaNota,
  ressalvaDaNota,
  selecionarNotas,
  temTabelaDeNumero,
  type NotaParaPrompt,
} from "./conhecimento"

const nota = (path: string, corpo = "corpo da nota", titulo = "Título"): NotaParaPrompt => ({ path, titulo, corpo })

describe("conhecimento da base no Estúdio", () => {
  it("separa a doutrina DA CASA da doutrina de mercado", () => {
    // Um carrossel que diz "nós fazemos assim" citando curso de terceiro é
    // apropriação; o inverso joga fora a autoridade da casa.
    expect(procedenciaDaNota("Convertfy/estruturas/welcome.md")).toBe("casa")
    expect(procedenciaDaNota("Referencias/email/prova-social.md")).toBe("casa")
    expect(procedenciaDaNota("Advisors/Max/flows/welcome.md")).toBe("advisor")
    expect(procedenciaDaNota("Pesquisas/algo.md")).toBe("outra")
    // Prefixo não pode casar por acaso: "Convertfyx" não é "Convertfy".
    expect(procedenciaDaNota("Convertfyx/nota.md")).toBe("outra")
  })

  it("o bloco avisa, em cada metade, o que pode ser afirmado como nosso", () => {
    const b = blocoDeConhecimento([
      { ...nota("Convertfy/estruturas/welcome.md", "como a casa monta", "Welcome da casa"), procedencia: "casa" },
      { ...nota("Advisors/Max/flows/x.md", "o curso ensina", "Flows"), procedencia: "advisor" },
    ])
    expect(b).toContain("Doutrina DA CASA")
    expect(b).toContain("primeira pessoa")
    expect(b).toContain("Doutrina de MERCADO")
    expect(b).toContain("nunca como o que a Convertfy faz")
    // A fonte fica visível: sem o path ninguém confere de onde saiu a frase.
    expect(b).toContain("Fonte: Convertfy/estruturas/welcome.md")
  })

  it("as três regras do número entram SÓ quando uma tabela de número entra", () => {
    const comNumero = blocoDeConhecimento([
      { ...nota("Advisors/Max/numeros-de-flows-welcome.md", "tabela", "Numeros de flows welcome"), procedencia: "advisor" },
    ])
    expect(comNumero).toContain(REGRAS_DO_NUMERO[0])
    expect(comNumero).toContain("outro-narrador")

    const semNumero = blocoDeConhecimento([{ ...nota("Advisors/Max/copy/tom.md", "prosa", "Tom"), procedencia: "advisor" }])
    expect(semNumero).not.toContain("Verbatim: o valor sai")
  })

  it("reconhece a tabela de número pelo NOME, não por conter dígito", () => {
    expect(temTabelaDeNumero({ path: "Advisors/Max/numeros-de-campanhas-segmentacao.md", titulo: "x" })).toBe(true)
    expect(temTabelaDeNumero({ path: "x/y.md", titulo: "Números de list growth" })).toBe(true)
    // Nota que só CITA a linha do bruto não arrasta as regras para toda run.
    expect(temTabelaDeNumero({ path: "Advisors/Max/copy/tom.md", titulo: "Tom e voz (L4236)" })).toBe(false)
  })

  it("o teto por nota não deixa uma nota grande bloquear duas que cabem", () => {
    const grande = nota("a/1.md", "x".repeat(50_000))
    const p1 = nota("b/2.md", "curta 1")
    const p2 = nota("b/3.md", "curta 2")
    const sel = selecionarNotas([grande, p1, p2], { maxChars: 4000, maxCharsNota: 3500 })
    expect(sel.map((n) => n.path)).toEqual(["a/1.md", "b/2.md", "b/3.md"])
    expect(sel[0].corpo.length).toBeLessThanOrEqual(CONHECIMENTO_MAX_CHARS_NOTA + 40)
  })

  it("nota cortada é DECLARADA — o modelo não pode ler metade como o todo", () => {
    const sel = selecionarNotas([nota("a/1.md", `${"y".repeat(9000)}`)], { maxCharsNota: 1000 })
    expect(sel[0].corpo).toContain("[trecho do meio omitido]")
  })

  it("o corte NUNCA come a ressalva do fim da nota", () => {
    // Caso real: `Convertfy/estruturas/estrutura-do-welcome-flow.md` fecha
    // com "não a use para afirmar que esta estrutura converte mais que
    // outra". O resumo mora no começo e a ressalva no fim — cortar só pelo
    // começo entrega a nota decapitada, e ela vira material para afirmar
    // exatamente o que proíbe.
    const corpo = [
      "Resumo no topo, que é o que orienta a leitura.",
      "x".repeat(9000),
      "# O que este material não prova",
      "Esta nota é padrão de execução, não evidência de conversão.",
    ].join("\n\n")
    const sel = selecionarNotas([nota("a/1.md", corpo)], { maxCharsNota: 1200 })
    expect(sel[0].corpo).toContain("Resumo no topo")
    expect(sel[0].corpo).toContain("não evidência de conversão")
    expect(sel[0].corpo).toContain("[trecho do meio omitido]")
  })

  it("ressalva enorme não engole a nota inteira", () => {
    // Metade do orçamento é o teto: uma seção final gigante deixaria a nota
    // sem o resumo, que é o que diz do que ela trata.
    const corpo = ["Resumo no topo.", "x".repeat(4000), "# Ressalvas", "y".repeat(4000)].join("\n\n")
    const sel = selecionarNotas([nota("a/1.md", corpo)], { maxCharsNota: 1000 })
    expect(sel[0].corpo).toContain("Resumo no topo")
    expect(sel[0].corpo).not.toContain("yyyy")
  })

  it("não entrega linha de tabela partida ao meio", () => {
    // As 16 notas de número são tabelas sem linha em branco: o corte por
    // parágrafo não acha fronteira e sai "| 7 |", que o modelo lê como dado
    // incompleto em vez de texto faltando. Apareceu na verificação com a
    // nota real de welcome.
    const tabela = ["Resumo.", ["| Medida | Valor |", "|---|---|", ...Array.from({ length: 80 }, (_, i) => `| medida ${i} | valor bem longo para empurrar o corte ${i} |`)].join("\n")].join("\n\n")
    const sel = selecionarNotas([nota("a/1.md", tabela)], { maxCharsNota: 900 })
    const linhas = sel[0].corpo.split("\n").filter((l) => l.trim().startsWith("|"))
    for (const l of linhas) expect(l.trimEnd().endsWith("|"), `linha partida: ${l}`).toBe(true)
  })

  it("acha a ÚLTIMA ressalva, e nada quando não há", () => {
    expect(ressalvaDaNota("## Ressalva de rigor\nmeio\n\n# O que este material não prova\nfim")).toContain("não prova")
    expect(ressalvaDaNota("# Introdução\nsó corpo")).toBe("")
  })

  it("nota vazia não ocupa vaga", () => {
    const sel = selecionarNotas([nota("a/1.md", "   "), nota("b/2.md", "vale")])
    expect(sel.map((n) => n.path)).toEqual(["b/2.md"])
  })

  it("sem nota o bloco é VAZIO — o comportamento anterior continua", () => {
    expect(blocoDeConhecimento([])).toBe("")
  })

  it("a busca por significado que não rodou é dita, nunca escondida", () => {
    // O corpus mistura PT e EN (medido: "carrinho abandonado" devolve zero na
    // full-text, "cart abandon" devolve três). Sem semântica o resultado é
    // pobre por motivo técnico, não por a casa não tratar o tema.
    const b = blocoDeConhecimento([{ ...nota("Convertfy/x.md"), procedencia: "casa" }], { semanticaRodou: false })
    expect(b).toContain("NÃO rodou")
    expect(b).toMatch(/fração do que a base tem/i)
    expect(blocoDeConhecimento([{ ...nota("Convertfy/x.md"), procedencia: "casa" }], { semanticaRodou: true })).not.toContain("NÃO rodou")
  })

  it("o bloco declara que doutrina NÃO é resultado do cliente", () => {
    const b = blocoDeConhecimento([{ ...nota("Convertfy/x.md"), procedencia: "casa" }])
    expect(b).toMatch(/nenhum número daqui é resultado deste cliente/i)
    expect(b).toContain("[confirmar]")
  })

  it("path de nota inventado é REMOVIDO, como link inventado", () => {
    // A régua da web só confere o que começa com http; sem esta segunda,
    // servir a base abriria a porta por um caminho pior — path interno
    // parece mais confiável que link.
    const r = conferirNotasCitadas(
      [
        { rotulo: "A", fonte: "Convertfy/estruturas/welcome.md" },
        { rotulo: "B", fonte: "Convertfy/estruturas/nao-existe.md" },
        { rotulo: "C", fonte: "Smile.io, 2024" },
        { rotulo: "D", fonte: "https://exemplo.com/x" },
        { rotulo: "E" },
      ],
      ["Convertfy/estruturas/welcome.md"],
    )
    expect(r.descartadas).toEqual(["Convertfy/estruturas/nao-existe.md"])
    expect(r.evidencias[0].fonte).toBe("Convertfy/estruturas/welcome.md")
    expect(r.evidencias[1].fonte).toBeUndefined()
    // Fonte do insumo e URL não são desta régua — a outra cuida delas.
    expect(r.evidencias[2].fonte).toBe("Smile.io, 2024")
    expect(r.evidencias[3].fonte).toBe("https://exemplo.com/x")
  })

  it("reconhece citação de nota sem confundir com fonte de texto", () => {
    expect(pareceNotaDaBase("Advisors/Max/flows/welcome.md")).toBe(true)
    expect(pareceNotaDaBase("Convertfy/x.md")).toBe(true)
    expect(pareceNotaDaBase("Smile.io, 2024")).toBe(false)
    expect(pareceNotaDaBase("https://convertfy.me/blog.md")).toBe(false)
    expect(pareceNotaDaBase("Relatório interno 2026")).toBe(false)
  })

  it("a consulta sai do pedido, em PALAVRAS com sentido", () => {
    // `buscarConhecimento` manda a mesma string para a semântica e para a
    // full-text, e a full-text do Postgres é AND: a frase inteira exige que
    // todas as palavras apareçam na nota. Medido contra a base real: três
    // pautas naturais devolveram 0/3; em palavras-chave, 1/3.
    expect(consultaDaAcao({ acao: "triagem", insumo: "carrinho abandonado" })).toBe("carrinho abandonado")
    expect(consultaDaAcao({ acao: "espinha", headline: "8% dos clientes", pilar: "Turbo" })).toBe("8% clientes turbo")
    expect(consultaDaAcao({ acao: "chat" })).toBeNull()
    expect(consultaDaAcao({ acao: "chat", insumo: "   " })).toBeNull()
    // Só ruído também é ausência de consulta — buscar por "de a o" gasta um
    // embedding para receber o centro do corpus.
    expect(consultaDaAcao({ acao: "chat", insumo: "de a o e" })).toBeNull()
  })

  it("insumo colado sem espaço não atravessa o teto — 12 palavras não limita uma palavra só", () => {
    const q = consultaDaAcao({ acao: "triagem", insumo: "a".repeat(9000) })!
    expect(q.length).toBeLessThanOrEqual(CONSULTA_MAX_CHARS)
  })
})
