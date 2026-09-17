import { describe, it, expect } from "vitest"
import { filhosDeRuns, filhosDeChamadas, resumirFolhas, type RunFilhaRow } from "./studio-arvore"

const run = (p: Partial<RunFilhaRow>): RunFilhaRow => ({
  run_id: "r1",
  agent: "image",
  status: "success",
  model: "m",
  created_at: "2026-09-17T07:00:00Z",
  duration_ms: 1_000,
  cost_cents: 21.1,
  tokens_input: 10,
  tokens_output: 5,
  retry_count: 0,
  error_message: null,
  rotulo: "hero_image",
  sub_rotulo: "anchor",
  image_url: "https://x/y.png",
  ...p,
})

describe("filhosDeRuns", () => {
  it("rotula os TRÊS tipos de run de imagem", () => {
    // O rótulo vem derivado do banco, mas os três casos existem de verdade:
    // slot (fieldKey), avatar de depoimento (que NÃO tem fieldKey) e a
    // `skipped` única do agente desligado.
    const folhas = filhosDeRuns([
      run({ run_id: "a", rotulo: "seal_2_image", sub_rotulo: "anchor" }),
      run({ run_id: "b", rotulo: "avatar 1", sub_rotulo: null, image_url: null }),
      run({ run_id: "c", rotulo: "image", status: "skipped", sub_rotulo: "agente_desligado" }),
    ])
    expect(folhas.map((f) => f.rotulo)).toEqual(["seal_2_image", "avatar 1", "image"])
    expect(folhas[2].status).toBe("pulado")
  })

  it("rótulo vazio não vira cartão em branco", () => {
    const folhas = filhosDeRuns([run({ rotulo: "   " })])
    expect(folhas[0].rotulo).toBe("chamada 1")
  })

  it("a folha aponta para a própria run, que é o que o painel abre", () => {
    const folhas = filhosDeRuns([run({ run_id: "abc" })])
    expect(folhas[0].tipo).toBe("run")
    expect(folhas[0].runId).toBe("abc")
    expect(folhas[0].usd).toBeCloseTo(0.211, 4)
  })
})

describe("filhosDeChamadas", () => {
  it("ordena shortlist, escolha e as posições — com a retomada logo após a sua", () => {
    const folhas = filhosDeChamadas({
      posicao_1: { tokens_input: 1, tokens_output: 1, seg: 1 },
      posicao_0_retomada: { tokens_input: 1, tokens_output: 1, seg: 1 },
      escolha: { tokens_input: 1, tokens_output: 1, seg: 1 },
      posicao_0: { tokens_input: 1, tokens_output: 1, seg: 1 },
      shortlist: { tokens_input: 1, tokens_output: 1, seg: 1 },
    })
    expect(folhas.map((f) => f.etapa)).toEqual([
      "shortlist",
      "escolha",
      "posicao_0",
      "posicao_0_retomada",
      "posicao_1",
    ])
  })

  it("etapa PULADA vira folha cinza, não some", () => {
    // `shortlist: null` é "houve esta etapa e o limiar a dispensou".
    // Sumir diria que ela não existe; virar sucesso diria que houve chamada.
    const folhas = filhosDeChamadas({ shortlist: null, escolha: { tokens_input: 1, tokens_output: 1, seg: 2 } })
    expect(folhas).toHaveLength(2)
    expect(folhas[0].status).toBe("pulado")
    expect(folhas[0].usd).toBeNull()
  })

  it("a posição ganha o nome da SEÇÃO, não só o número", () => {
    const folhas = filhosDeChamadas({
      posicao_0: { tokens_input: 1, tokens_output: 1, seg: 1, chave: { block_index: 0, section: "hero" } },
    })
    expect(folhas[0].rotulo).toBe("posição 0 · hero")
  })

  it("prefere `ms` a `seg`, que é arredondado", () => {
    const folhas = filhosDeChamadas({ escolha: { tokens_input: 1, tokens_output: 1, seg: 1, ms: 1_400 } })
    expect(folhas[0].durSec).toBe(1.4)
  })

  it("a chamada que lançou vira folha de ERRO com a mensagem", () => {
    const folhas = filhosDeChamadas({
      posicao_2: { tokens_input: 0, tokens_output: 0, seg: 9, erro: "timeout" },
    })
    expect(folhas[0].status).toBe("erro")
    expect(folhas[0].err).toBe("timeout")
  })

  it("consumo ausente devolve lista vazia, não quebra", () => {
    expect(filhosDeChamadas(null)).toEqual([])
    expect(filhosDeChamadas(undefined)).toEqual([])
  })
})

describe("resumirFolhas", () => {
  it("dá a MAIOR e a SOMA — cada uma sozinha mente", () => {
    // Os slots de imagem correm em paralelo: a soma não é o tempo que
    // ninguém esperou, e a maior esconde o trabalho total.
    const r = resumirFolhas(
      filhosDeRuns([
        run({ run_id: "a", duration_ms: 137_000, cost_cents: 25.4 }),
        run({ run_id: "b", duration_ms: 288_000, cost_cents: 20 }),
      ]),
    )
    expect(r.total).toBe(2)
    expect(r.maiorSec).toBe(288)
    expect(r.somaSec).toBe(425)
    expect(r.usd).toBeCloseTo(0.454, 4)
  })

  it("conta as falhas, que é o que o nó verde escondia", () => {
    const r = resumirFolhas(filhosDeRuns([run({ run_id: "a" }), run({ run_id: "b", status: "error" })]))
    expect(r.falhas).toBe(1)
  })

  it("sem folhas não inventa duração", () => {
    const r = resumirFolhas([])
    expect(r.maiorSec).toBeNull()
    expect(r.somaSec).toBeNull()
  })
})
