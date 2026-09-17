import { describe, it, expect } from "vitest"
import {
  CAUDA_TELEMETRIA_MAX,
  ORCAMENTO_TEXTO_DA_RUN,
  RESTO_APOS_ORCAMENTO,
  cortarNoMeio,
  novoOrcamentoDeTexto,
  registrarTexto,
  semTexto,
  type ConsumoPorChamada,
} from "./curador-telemetria-chamada"

describe("cortarNoMeio", () => {
  it("devolve o texto intacto quando cabe", () => {
    expect(cortarNoMeio("abc", 10)).toBe("abc")
  })

  it("preserva o COMEÇO e o FIM, que é onde mora a decisão", () => {
    // A cabeça da cauda é <posicao_a_decidir> e o fim é <ja_decididas> mais
    // as instruções de saída; o miolo são as notas das finalistas.
    const texto = `<posicao_a_decidir>${"M".repeat(5_000)}</ja_decididas>`
    const cortado = cortarNoMeio(texto, 400)
    expect(cortado.startsWith("<posicao_a_decidir>")).toBe(true)
    expect(cortado.endsWith("</ja_decididas>")).toBe(true)
    expect(cortado).toContain("caracteres cortados")
    expect(cortado.length).toBeLessThan(texto.length)
  })

  it("com teto minúsculo preserva a cabeça em vez de quebrar", () => {
    const cortado = cortarNoMeio("A".repeat(100), 4)
    expect(cortado.startsWith("AAA")).toBe(true)
    expect(cortado).toContain("caracteres cortados")
  })

  it("teto zero devolve vazio", () => {
    expect(cortarNoMeio("qualquer coisa", 0)).toBe("")
  })
})

describe("registrarTexto", () => {
  it("chars é o tamanho REAL, antes do corte", () => {
    const orc = novoOrcamentoDeTexto()
    const r = registrarTexto(orc, "X".repeat(20_000), CAUDA_TELEMETRIA_MAX)
    expect(r?.chars).toBe(20_000)
    expect(r?.truncado).toBe(true)
    expect(r!.texto.length).toBeLessThanOrEqual(CAUDA_TELEMETRIA_MAX + 80)
  })

  it("texto vazio ou ausente não vira entrada", () => {
    const orc = novoOrcamentoDeTexto()
    expect(registrarTexto(orc, "", CAUDA_TELEMETRIA_MAX)).toBeNull()
    expect(registrarTexto(orc, null, CAUDA_TELEMETRIA_MAX)).toBeNull()
    expect(registrarTexto(orc, undefined, CAUDA_TELEMETRIA_MAX)).toBeNull()
  })

  it("o orçamento da run segura o parsed_output em 16 posições", () => {
    // O caso que motiva o teto: 16 posições de 6k levariam o parsed_output
    // de 41 KB (medido) para ~200 KB, e ele é lido inteiro em TODA retomada.
    const orc = novoOrcamentoDeTexto()
    const consumo: ConsumoPorChamada = {}
    let somaDeTexto = 0
    for (let i = 0; i < 16; i++) {
      const r = registrarTexto(orc, "C".repeat(30_000), CAUDA_TELEMETRIA_MAX)!
      somaDeTexto += r.texto.length
      consumo[`posicao_${i}`] = {
        tokens_input: 1,
        tokens_output: 1,
        seg: 1,
        cauda: r.texto,
        cauda_chars: r.chars,
        cauda_truncada: r.truncado,
      }
    }
    expect(somaDeTexto).toBeLessThan(ORCAMENTO_TEXTO_DA_RUN + CAUDA_TELEMETRIA_MAX)
    expect(JSON.stringify(consumo).length).toBeLessThan(ORCAMENTO_TEXTO_DA_RUN + 20_000)
  })

  it("estourado o orçamento, as chamadas seguintes ainda guardam o começo", () => {
    // Guardar NADA seria pior: a última posição é a que mais interessa
    // quando a run morre no fim.
    const orc = novoOrcamentoDeTexto(1_000)
    registrarTexto(orc, "A".repeat(5_000), CAUDA_TELEMETRIA_MAX)
    const depois = registrarTexto(orc, "B".repeat(5_000), CAUDA_TELEMETRIA_MAX)!
    expect(depois.texto.length).toBeLessThanOrEqual(RESTO_APOS_ORCAMENTO + 80)
    expect(depois.chars).toBe(5_000)
    expect(depois.truncado).toBe(true)
  })
})

describe("semTexto", () => {
  it("tira cauda e saída e MANTÉM custo, tempo e tamanhos", () => {
    const consumo: ConsumoPorChamada = {
      posicao_0: {
        tokens_input: 10,
        tokens_output: 5,
        seg: 3,
        ms: 3_400,
        custo_usd: 0.12,
        cauda: "texto grande",
        cauda_chars: 12,
        saida: "resposta",
        saida_chars: 8,
      },
    }
    const enxuto = semTexto(consumo)
    expect(enxuto.posicao_0).not.toHaveProperty("cauda")
    expect(enxuto.posicao_0).not.toHaveProperty("saida")
    expect(enxuto.posicao_0?.custo_usd).toBe(0.12)
    expect(enxuto.posicao_0?.ms).toBe(3_400)
    expect(enxuto.posicao_0?.cauda_chars).toBe(12)
    expect(enxuto.posicao_0?.saida_chars).toBe(8)
  })

  it("preserva o null da etapa PULADA", () => {
    // `shortlist: null` significa "houve uma etapa e ela foi pulada" — vira
    // folha cinza na árvore. Virar `{}` diria que a chamada aconteceu.
    expect(semTexto({ shortlist: null }).shortlist).toBeNull()
  })

  it("não muda o objeto de entrada", () => {
    const consumo: ConsumoPorChamada = {
      escolha: { tokens_input: 1, tokens_output: 1, seg: 1, cauda: "c" },
    }
    semTexto(consumo)
    expect(consumo.escolha?.cauda).toBe("c")
  })
})
