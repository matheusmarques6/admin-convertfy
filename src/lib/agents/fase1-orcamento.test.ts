import { describe, it, expect } from "vitest"

import {
  TAXA_TOKENS_POR_S,
  PISO_DE_RELOGIO_MS,
  msParaGerar,
  relogioDaChamada,
  cabeNaJanela,
  comOrcamentoDeFase1,
  restanteDoOrcamento,
  relogioParaTeto,
  LATENCIA_BASE_MS,
  RESERVA_POS_ESTRUTURADOR_MS,
} from "./fase1-orcamento"

describe("msParaGerar", () => {
  // A 90 tok/s medidos, o teto de 48.000 do Estruturador pede 533s numa
  // chamada — muito além dos 240s do ARCHITECT_INVOKE_TIMEOUT_MS. É esta
  // conta que mostra que subir o teto sem mexer no relógio troca
  // truncamento por timeout.
  it("traduz teto de tokens em tempo pela taxa medida", () => {
    expect(msParaGerar(48_000)).toBe(Math.ceil((48_000 / TAXA_TOKENS_POR_S) * 1000))
    expect(msParaGerar(48_000)).toBeGreaterThan(500_000)
    expect(msParaGerar(24_000)).toBeGreaterThan(260_000)
  })

  it("entrada sem sentido vale zero, nunca NaN", () => {
    expect(msParaGerar(0)).toBe(0)
    expect(msParaGerar(-1)).toBe(0)
    expect(msParaGerar(Number.NaN)).toBe(0)
  })
})

describe("relogioDaChamada", () => {
  // Sem janela aberta o comportamento é o de ANTES deste módulo: o teto
  // absoluto sozinho. É o que garante que nada fora da fase 1 muda.
  it("sem orçamento aberto devolve o teto", () => {
    expect(relogioDaChamada({ tetoMs: 240_000, restanteMs: null })).toEqual({
      ms: 240_000,
      origem: "teto",
    })
  })

  it("a janela vence o teto quando é ela que aperta", () => {
    expect(relogioDaChamada({ tetoMs: 240_000, restanteMs: 90_000 })).toEqual({
      ms: 90_000,
      origem: "janela",
    })
  })

  it("o teto vence quando a janela é folgada", () => {
    expect(relogioDaChamada({ tetoMs: 240_000, restanteMs: 700_000 })).toEqual({
      ms: 240_000,
      origem: "teto",
    })
  })

  // Uma chamada iniciada com 10s de janela não termina; começar só queima
  // dinheiro e devolve timeout. Zero é o sinal de "não comece".
  it("abaixo do piso manda não começar", () => {
    const r = relogioDaChamada({ tetoMs: 240_000, restanteMs: PISO_DE_RELOGIO_MS - 1 })
    expect(r).toEqual({ ms: 0, origem: "sem_orcamento" })
  })

  it("janela já estourada (restante negativo) também manda não começar", () => {
    expect(relogioDaChamada({ tetoMs: 240_000, restanteMs: -5_000 }).ms).toBe(0)
  })
})

describe("cabeNaJanela", () => {
  it("sem orçamento aberto tudo cabe", () => {
    expect(cabeNaJanela({ custoMs: 999_999, restanteMs: null }).cabe).toBe(true)
  })

  // A reserva existe para o Curador, que NÃO é pulável: sem ela o Seletor
  // e o Estruturador comem a janela e a montagem fica sem variante nenhuma.
  it("a reserva das etapas seguintes é descontada antes da conta", () => {
    expect(cabeNaJanela({ custoMs: 300_000, restanteMs: 400_000 }).cabe).toBe(true)
    expect(
      cabeNaJanela({ custoMs: 300_000, restanteMs: 400_000, reservaMs: 200_000 }).cabe,
    ).toBe(false)
  })

  it("o motivo é texto de gente, com os dois números", () => {
    const r = cabeNaJanela({ custoMs: 300_000, restanteMs: 400_000, reservaMs: 200_000 })
    expect(r.motivo).toContain("300s")
    expect(r.motivo).toContain("400s")
    expect(r.motivo).toContain("200s")
  })

  it("empate exato cabe", () => {
    expect(cabeNaJanela({ custoMs: 100_000, restanteMs: 100_000 }).cabe).toBe(true)
  })
})

describe("a janela propagada", () => {
  it("fora do escopo não há janela", () => {
    expect(restanteDoOrcamento()).toBeNull()
  })

  it("dentro do escopo o restante encolhe com o tempo", async () => {
    await comOrcamentoDeFase1(750_000, async () => {
      const inicio = restanteDoOrcamento()
      expect(inicio).not.toBeNull()
      expect(inicio!).toBeGreaterThan(740_000)
      expect(inicio!).toBeLessThanOrEqual(750_000)
      // 10s depois, sobra 10s a menos — sem esperar de verdade.
      const depois = restanteDoOrcamento(Date.now() + 10_000)!
      expect(inicio! - depois).toBeGreaterThanOrEqual(9_000)
    })
  })

  it("atravessa await e chamada aninhada sem passar parâmetro", async () => {
    async function laNoFundo() {
      await Promise.resolve()
      return restanteDoOrcamento()
    }
    await comOrcamentoDeFase1(600_000, async () => {
      expect(await laNoFundo()).not.toBeNull()
    })
    expect(await laNoFundo()).toBeNull()
  })

  // Um escopo aninhado que pedisse mais tempo daria a uma etapa interna
  // mais janela do que a request inteira tem — o gateway não negocia.
  it("escopo aninhado nunca estende a janela de fora", async () => {
    await comOrcamentoDeFase1(100_000, async () => {
      await comOrcamentoDeFase1(900_000, async () => {
        expect(restanteDoOrcamento()!).toBeLessThanOrEqual(100_000)
      })
    })
  })

  it("escopo aninhado mais curto vale dentro dele", async () => {
    await comOrcamentoDeFase1(900_000, async () => {
      await comOrcamentoDeFase1(50_000, async () => {
        expect(restanteDoOrcamento()!).toBeLessThanOrEqual(50_000)
      })
      expect(restanteDoOrcamento()!).toBeGreaterThan(500_000)
    })
  })
})

describe("relogioParaTeto", () => {
  // O caso que motivou a função: o `max_tokens` do Catalogador foi de 8.192
  // para 12.288 por uma troca no banco, e o relógio (240s fixo) não soube.
  // Derivado, ele acompanha.
  it("acompanha o teto de tokens quando ele muda no banco", () => {
    const antes = relogioParaTeto(8_192)
    const depois = relogioParaTeto(12_288)
    expect(depois).toBeGreaterThan(antes)
    expect(depois).toBe(msParaGerar(12_288) + LATENCIA_BASE_MS)
  })

  // A conta de `msParaGerar` mede só a saída. Uma chamada cujo relógio fosse
  // exatamente ela seria cortada antes da última linha, porque handshake,
  // fila do provedor e tempo até o primeiro token não geram token nenhum.
  it("soma a latência que não é geração", () => {
    expect(relogioParaTeto(12_288)).toBeGreaterThan(msParaGerar(12_288))
  })

  // Teto ausente ou absurdo não pode virar relógio zero: `relogioDesteInvoke`
  // trata zero como "não comece" e o agente nunca rodaria.
  it("nunca desce abaixo do piso", () => {
    expect(relogioParaTeto(0)).toBe(PISO_DE_RELOGIO_MS)
    expect(relogioParaTeto(Number.NaN)).toBe(PISO_DE_RELOGIO_MS)
    expect(relogioParaTeto(100)).toBe(PISO_DE_RELOGIO_MS)
  })

  // É só o TETO: quem corta de verdade continua sendo a janela.
  it("continua subordinado ao que resta da janela", () => {
    const teto = relogioParaTeto(12_288)
    expect(relogioDaChamada({ tetoMs: teto, restanteMs: 60_000 })).toEqual({
      ms: 60_000,
      origem: "janela",
    })
  })
})

describe("a fase 1 cabe nos três agentes", () => {
  // A janela real (FASE1_BUDGET_MS, 770s) menos o que o Seletor já gastou
  // quando o Estruturador é consultado. Número tirado da run de 11/09
  // 06:21, que dizia "restam 742s".
  const JANELA_NO_ESTRUTURADOR_MS = 742_000
  // `relogioParaTeto(32_000)` — o teto do Estruturador em produção.
  const ESTRUTURADOR_PEDE_MS = 371_000

  // O defeito de 11/09: 742 − 490 = 252 disponíveis contra 371 pedidos. Não
  // era "cede quando aperta", era nunca caber. O Estruturador parou de rodar
  // e a tela só dizia "pulado".
  it("o Estruturador cabe na janela depois da reserva", () => {
    const r = cabeNaJanela({
      custoMs: ESTRUTURADOR_PEDE_MS,
      restanteMs: JANELA_NO_ESTRUTURADOR_MS,
      reservaMs: RESERVA_POS_ESTRUTURADOR_MS,
    })
    expect(r.cabe).toBe(true)
  })

  // A reserva existe para o Curador, que não tem substituto. Ela precisa
  // cobrir o pior caso MEDIDO no modelo vigente (97s no sonnet-4.6) mais
  // Blueprint e Subject — uma reserva menor que isso o cortaria.
  it("a reserva cobre o Curador medido, com folga", () => {
    const CURADOR_PIOR_CASO_MS = 97_000
    const BLUEPRINT_E_SUBJECT_MS = 26_000
    expect(RESERVA_POS_ESTRUTURADOR_MS).toBeGreaterThan(
      CURADOR_PIOR_CASO_MS + BLUEPRINT_E_SUBJECT_MS,
    )
  })
})
