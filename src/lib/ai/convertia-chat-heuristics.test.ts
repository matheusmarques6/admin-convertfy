import { describe, expect, it } from "vitest"
import {
  claimsImpossible,
  defersDecision,
  describeToolArgs,
  isActionRequest,
  isAnalyticalQuestion,
} from "./convertia-chat-heuristics"

describe("isAnalyticalQuestion", () => {
  it("reconhece perguntas de métricas e performance", () => {
    expect(isAnalyticalQuestion("Como foi a performance de email nos últimos 30 dias?")).toBe(true)
    expect(isAnalyticalQuestion("qual foi a receita desse mês?")).toBe(true)
    expect(isAnalyticalQuestion("Analise as campanhas da loja")).toBe(true)
    expect(isAnalyticalQuestion("teve queda de open rate?")).toBe(true)
    expect(isAnalyticalQuestion("quantos pedidos ontem?")).toBe(true)
    expect(isAnalyticalQuestion("faça uma auditoria dos flows")).toBe(true)
    expect(isAnalyticalQuestion("me dá um relatório da loja")).toBe(true)
    expect(isAnalyticalQuestion("compare essa semana com a anterior")).toBe(true)
  })

  it("não dispara em conversa comum ou pedidos criativos", () => {
    expect(isAnalyticalQuestion("oi, tudo bem?")).toBe(false)
    expect(isAnalyticalQuestion("escreva um email de boas-vindas")).toBe(false)
    expect(isAnalyticalQuestion("gera uma imagem de um tênis vermelho")).toBe(false)
    expect(isAnalyticalQuestion("obrigado!")).toBe(false)
  })

  it("verbo criativo no início vence citação de métrica/campanha", () => {
    expect(isAnalyticalQuestion("escreva um email de lançamento da campanha de natal")).toBe(false)
    expect(isAnalyticalQuestion("crie uma copy sobre a queda de preços")).toBe(false)
    expect(isAnalyticalQuestion("melhore o assunto dessa campanha")).toBe(false)
    // análise continua análise
    expect(isAnalyticalQuestion("analise as campanhas da loja")).toBe(true)
  })

  it("mensagem curta demais nunca dispara", () => {
    expect(isAnalyticalQuestion("vendas")).toBe(false)
    expect(isAnalyticalQuestion("   ")).toBe(false)
  })
})

describe("describeToolArgs", () => {
  it("resume pares primitivos", () => {
    expect(describeToolArgs({ period: "30d", status: "paid" })).toBe(
      "period: 30d · status: paid",
    )
    expect(describeToolArgs({ limit: 50, ativo: true })).toBe("limit: 50 · ativo: true")
  })

  it("ignora objetos aninhados e strings vazias, mantém arrays curtas", () => {
    expect(
      describeToolArgs({ filtro: { a: 1 }, nome: "", tags: ["vip", "novo"] }),
    ).toBe("tags: vip, novo")
  })

  it("trunca valores longos e limita a 4 pares", () => {
    const out = describeToolArgs({
      a: "x".repeat(60),
      b: "1",
      c: "2",
      d: "3",
      e: "nunca aparece",
    })
    expect(out).toContain("a: " + "x".repeat(40) + "…")
    expect(out).not.toContain("nunca aparece")
  })

  it("devolve null sem nada útil", () => {
    expect(describeToolArgs(null)).toBeNull()
    expect(describeToolArgs("str")).toBeNull()
    expect(describeToolArgs({})).toBeNull()
    expect(describeToolArgs({ deep: { x: 1 } })).toBeNull()
  })

  it("resumo total é truncado no teto", () => {
    const out = describeToolArgs({
      campo_um: "valor bem comprido aqui dentro",
      campo_dois: "outro valor bem comprido aqui",
      campo_tres: "mais um valor comprido",
    })
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(91)
  })
})

describe("isActionRequest", () => {
  it("reconhece pedidos de execução", () => {
    expect(isActionRequest("cria um teste a/b com o popup atual")).toBe(true)
    expect(isActionRequest("configura o split 50/50 e dá o start")).toBe(true)
    expect(isActionRequest("pausa a automação de boas-vindas")).toBe(true)
    expect(isActionRequest("duplica essa campanha para setembro")).toBe(true)
    expect(isActionRequest("exclui esse segmento antigo")).toBe(true)
  })

  it("não confunde pergunta de leitura com ação", () => {
    expect(isActionRequest("como foi a performance de email?")).toBe(false)
    expect(isActionRequest("oi")).toBe(false)
    expect(isActionRequest("quantos pedidos ontem?")).toBe(false)
  })
})

describe("claimsImpossible", () => {
  it("pega a negativa que motivou o guard", () => {
    // frase real da ConvertIA, depois desmentida por ela mesma
    expect(
      claimsImpossible("A API pública do Omnisend não expõe formulários/popups."),
    ).toBe(true)
    expect(claimsImpossible("Ou seja: não consigo executar esse A/B test por aqui.")).toBe(true)
    expect(claimsImpossible("não é possível criar roleta por API")).toBe(true)
    expect(claimsImpossible("não existe template de roleta nessa conta")).toBe(true)
    expect(claimsImpossible("isso é uma limitação da plataforma")).toBe(true)
    expect(claimsImpossible("não há endpoint público para isso")).toBe(true)
  })

  it("não dispara em resposta normal", () => {
    expect(claimsImpossible("Criei o teste A/B com split 50/50 e deixei pausado.")).toBe(false)
    expect(claimsImpossible("A receita caiu 12% no período.")).toBe(false)
    expect(claimsImpossible("ok")).toBe(false)
  })
})

describe("defersDecision", () => {
  it("pega a resposta que devolve a decisão em vez de agir", () => {
    expect(defersDecision("Qual caminho você prefere?")).toBe(true)
    expect(defersDecision("Quer que eu já monte a estrutura de prêmios?")).toBe(true)
    expect(defersDecision("Me confirma o teto de desconto antes?")).toBe(true)
  })

  it("não dispara em pergunta retórica dentro de análise", () => {
    expect(defersDecision("O split ficou 50/50 e a métrica vencedora é conversão.")).toBe(false)
    expect(defersDecision("")).toBe(false)
  })
})

