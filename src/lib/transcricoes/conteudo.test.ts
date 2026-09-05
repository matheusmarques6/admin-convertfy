/**
 * Chunking, exportação, sugestão de coleção e leitura da resposta do
 * provedor. Tudo puro, tudo com uma armadilha silenciosa por trás.
 */

import { describe, expect, it } from "vitest"
import { chunksQueCobrem, montarChunks, textoParaEmbedding } from "./chunking"
import { citacaoComTimestamp, linkComTimestamp, nomeArquivo, paraMarkdown, paraSrt, paraTxt, tempoSrt } from "./export"
import { normalizar, sugerirColecao, type Regra } from "./sugestao"
import { juntarPedacos, normalizarLocutor, segmentosDaResposta } from "./transcrever"
import type { Bloco, Locutor, TopicoDetectado } from "./types"

const bloco = (id: number, s: number, fim: number, texto: string, locutor: string | null = null): Bloco => ({
  id,
  s,
  fim,
  locutor,
  texto,
  editado: false,
})

// ── Chunking ────────────────────────────────────────────────────────────

describe("montarChunks", () => {
  const topicos: TopicoDetectado[] = [
    { s: 0, titulo: "Por que o fluxo rende mais" },
    { s: 96, titulo: "Cupom no primeiro e-mail" },
  ]

  it("corta nos tópicos, não em número fixo de tokens", () => {
    const blocos = [
      bloco(1, 0, 30, "A".repeat(200)),
      bloco(2, 34, 90, "B".repeat(200)),
      bloco(3, 96, 140, "C".repeat(200)),
    ]
    const chunks = montarChunks(blocos, topicos)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ s: 0, topico: "Por que o fluxo rende mais" })
    expect(chunks[1]).toMatchObject({ s: 96, topico: "Cupom no primeiro e-mail" })
  })

  it("subdivide tópico longo na fronteira de bloco, nunca no meio da fala", () => {
    const blocos = Array.from({ length: 12 }, (_, i) => bloco(i, i * 30, i * 30 + 29, "palavra ".repeat(60)))
    const chunks = montarChunks(blocos, [{ s: 0, titulo: "Único" }])
    expect(chunks.length).toBeGreaterThan(1)
    // Nenhum chunk começa no meio de uma fala: todo início é o `s` de um bloco.
    const inicios = new Set(blocos.map((b) => b.s))
    for (const c of chunks) expect(inicios.has(c.s)).toBe(true)
  })

  it("funde chunk curto demais com o vizinho", () => {
    // "Boa pergunta." isolado vira ruído no vetor e rouba a vaga de um
    // trecho útil.
    const blocos = [bloco(1, 0, 3, "Boa pergunta."), bloco(2, 4, 60, "texto ".repeat(80))]
    const chunks = montarChunks(blocos, [])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].texto).toContain("Boa pergunta.")
  })

  it("guarda os locutores do trecho na ordem de aparição", () => {
    const blocos = [
      bloco(1, 0, 10, "x".repeat(300), "speaker_0"),
      bloco(2, 11, 20, "y".repeat(300), "speaker_1"),
      bloco(3, 21, 30, "z".repeat(300), "speaker_0"),
    ]
    expect(montarChunks(blocos, [])[0].locutores).toEqual(["speaker_0", "speaker_1"])
  })

  it("lista vazia não explode", () => {
    expect(montarChunks([], topicos)).toEqual([])
  })
})

describe("textoParaEmbedding", () => {
  it("o vetor é feito sobre contexto + texto", () => {
    // "e aí você aumenta pra 3 dias" é inútil sem saber que o assunto era
    // carrinho abandonado — é esse passo que salva a recuperação.
    const t = textoParaEmbedding({ contexto: "Aula sobre carrinho abandonado", texto: "aumenta pra 3 dias" })
    expect(t).toBe("Aula sobre carrinho abandonado\n\naumenta pra 3 dias")
  })

  it("sem contexto cai no texto puro", () => {
    expect(textoParaEmbedding({ contexto: null, texto: "abc" })).toBe("abc")
  })
})

describe("chunksQueCobrem", () => {
  it("acha os chunks que cruzam o intervalo do bloco editado", () => {
    const chunks = [
      { id: 1, s: 0, fim: 90 },
      { id: 2, s: 90, fim: 200 },
      { id: 3, s: 200, fim: 300 },
    ]
    expect(chunksQueCobrem(chunks, { s: 95, fim: 120 }).map((c) => c.id)).toEqual([2])
    // Fala que cruza a fronteira marca os DOIS: senão metade da base fica
    // divergente do texto na tela, em silêncio.
    expect(chunksQueCobrem(chunks, { s: 85, fim: 95 }).map((c) => c.id)).toEqual([1, 2])
  })
})

// ── Exportação ──────────────────────────────────────────────────────────

const dados = {
  titulo: "Aula 03 — Como estruturar um fluxo",
  canal: "Convertfy Academy",
  urlOriginal: "https://youtube.com/watch?v=abc",
  publicadoEm: "2026-09-02T12:00:00Z",
  duracaoSeg: 2832,
  blocos: [
    bloco(1, 0, 34, "Essa aula é sobre o fluxo que mais dá dinheiro.", "speaker_0"),
    bloco(2, 34, 96, "Quando alguém entra na sua lista.", "speaker_0"),
    bloco(3, 96, 112, "O primeiro e-mail já deve ter cupom?", "speaker_1"),
  ],
  locutores: [
    { id: 1, rotuloOriginal: "speaker_0", nome: "Bruno Marques", cor: 0, falas: 2 },
    { id: 2, rotuloOriginal: "speaker_1", nome: "Marina Costa", cor: 1, falas: 1 },
  ] as Locutor[],
  topicos: [{ s: 96, titulo: "Cupom no primeiro e-mail" }],
}

describe("tempoSrt", () => {
  it("usa o formato exigido pelo SRT (hora, vírgula, milissegundos)", () => {
    expect(tempoSrt(0)).toBe("00:00:00,000")
    expect(tempoSrt(96.5)).toBe("00:01:36,500")
    expect(tempoSrt(4360)).toBe("01:12:40,000")
  })
})

describe("paraSrt", () => {
  it("numera, usa s e fim de cada bloco e prefixa o locutor", () => {
    const srt = paraSrt(dados)
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:34,000\nBruno Marques: Essa aula")
    expect(srt).toContain("3\n00:01:36,000 --> 00:01:52,000\nMarina Costa:")
  })

  it("bloco sem fim vira legenda de 2s em vez de duração zero", () => {
    // Duração zero nenhum player mostra.
    const srt = paraSrt({ ...dados, blocos: [bloco(1, 10, 10, "oi")] })
    expect(srt).toContain("00:00:10,000 --> 00:00:12,000")
  })
})

describe("paraTxt", () => {
  it("mostra o nome só quando o autor muda", () => {
    const txt = paraTxt(dados)
    expect(txt.match(/Bruno Marques/g)).toHaveLength(1)
    expect(txt).toContain("[1:36] Marina Costa")
  })
})

describe("paraMarkdown", () => {
  it("leva os tópicos como índice e como cabeçalhos", () => {
    const md = paraMarkdown(dados)
    expect(md).toContain("# Aula 03")
    expect(md).toContain("## Tópicos")
    expect(md).toContain("- `1:36` Cupom no primeiro e-mail")
    expect(md).toContain("## Cupom no primeiro e-mail")
  })
})

describe("nomeArquivo", () => {
  it("tira acento e pontuação do título", () => {
    expect(nomeArquivo("Aula 03 — Como estruturar", "srt")).toBe("aula-03-como-estruturar.srt")
  })

  it("título só de símbolos ainda gera nome válido", () => {
    expect(nomeArquivo("———", "txt")).toBe("transcricao.txt")
  })
})

describe("citação", () => {
  it("monta texto, timestamp e link absoluto", () => {
    const url = linkComTimestamp("https://admin.convertfy.com.br/", "abc-123", 96)
    expect(url).toBe("https://admin.convertfy.com.br/admin/transcricoes/abc-123?t=1%3A36")
    expect(citacaoComTimestamp({ texto: " oi ", s: 96, titulo: "Aula 03", url })).toContain("— Aula 03, 1:36")
  })
})

// ── Sugestão de coleção ─────────────────────────────────────────────────

describe("sugerirColecao", () => {
  const regras: Regra[] = [
    { id: "a", termos: ["aula", "academy"], colecaoId: "academy", plataforma: null, prioridade: 10 },
    { id: "b", termos: ["fluxo"], colecaoId: "fluxos", plataforma: null, prioridade: 20 },
    { id: "c", termos: ["reel"], colecaoId: "social", plataforma: "instagram", prioridade: 15 },
  ]

  it("casa sem acento e sem caixa", () => {
    expect(sugerirColecao({ titulo: "AULA 03 — AUTOMAÇÃO", canal: null, url: null, plataforma: "youtube" }, regras)).toBe("academy")
  })

  it("prioridade maior vence a genérica", () => {
    const alvo = { titulo: "Aula 03 sobre fluxo de boas-vindas", canal: null, url: null, plataforma: "youtube" as const }
    expect(sugerirColecao(alvo, regras)).toBe("fluxos")
  })

  it("regra com plataforma só vale naquela plataforma", () => {
    const alvo = { titulo: "reel novo", canal: null, url: null, plataforma: "youtube" as const }
    expect(sugerirColecao(alvo, regras)).toBeNull()
    expect(sugerirColecao({ ...alvo, plataforma: "instagram" }, regras)).toBe("social")
  })

  it("empate de prioridade escolhe o termo mais específico", () => {
    const r: Regra[] = [
      { id: "x", termos: ["treino"], colecaoId: "generico", plataforma: null, prioridade: 5 },
      { id: "y", termos: ["treino comercial"], colecaoId: "especifico", plataforma: null, prioridade: 5 },
    ]
    expect(sugerirColecao({ titulo: "Treino comercial de objeção", canal: null, url: null, plataforma: null }, r)).toBe(
      "especifico",
    )
  })

  it("sem casamento devolve null (o chamador cai na coleção reservada)", () => {
    expect(sugerirColecao({ titulo: "assunto qualquer", canal: null, url: null, plataforma: null }, regras)).toBeNull()
    expect(sugerirColecao({ titulo: null, canal: null, url: null, plataforma: null }, regras)).toBeNull()
  })

  it("normalizar tira acento e caixa", () => {
    expect(normalizar("Automação")).toBe("automacao")
  })
})

// ── Leitura da resposta do provedor ─────────────────────────────────────

describe("normalizarLocutor", () => {
  it("aceita as formas que os provedores usam para o mesmo conceito", () => {
    expect(normalizarLocutor(0)).toBe("speaker_0")
    expect(normalizarLocutor("SPEAKER_1")).toBe("speaker_1")
    expect(normalizarLocutor("Speaker 2")).toBe("speaker_2")
    expect(normalizarLocutor("spk-3")).toBe("speaker_3")
  })

  it("nome humano vira rótulo estável", () => {
    expect(normalizarLocutor("Bruno Marques")).toBe("bruno_marques")
  })

  it("vazio e nulo não viram rótulo", () => {
    expect(normalizarLocutor(null)).toBeNull()
    expect(normalizarLocutor("  ")).toBeNull()
  })
})

describe("segmentosDaResposta", () => {
  it("lê o locutor sob qualquer um dos nomes de campo", () => {
    // O nome do campo varia entre provedores; um nome diferente não pode
    // custar a diarização inteira.
    const json = {
      segments: [
        { start: 0, end: 5, text: "a", speaker: "SPEAKER_00" },
        { start: 5, end: 9, text: "b", speaker_id: 1 },
        { start: 9, end: 12, text: "c", speaker_label: "Speaker 2" },
      ],
    }
    expect(segmentosDaResposta(json).map((s) => s.locutor)).toEqual(["speaker_0", "speaker_1", "speaker_2"])
  })

  it("aplica o offset do pedaço — errar isso invalida tudo do 2º em diante", () => {
    const json = { segments: [{ start: 12, end: 20, text: "x" }] }
    expect(segmentosDaResposta(json, 600)[0]).toMatchObject({ s: 612, fim: 620 })
  })

  it("resposta sem segmentos mas com texto ainda guarda a transcrição", () => {
    // Perder a transcrição inteira por causa do formato seria pior que
    // perder os timestamps.
    const r = segmentosDaResposta({ text: "só o texto" })
    expect(r).toHaveLength(1)
    expect(r[0].texto).toBe("só o texto")
  })

  it("descarta segmento vazio e sem início", () => {
    const json = { segments: [{ start: 0, end: 1, text: "   " }, { text: "sem start" }] }
    expect(segmentosDaResposta(json)).toEqual([])
  })
})

describe("juntarPedacos", () => {
  it("ordena por tempo e soma os custos", () => {
    const r = juntarPedacos([
      { texto: "b", segmentos: [{ s: 600, fim: 610, texto: "b", locutor: null }], modelo: "m", custoUsd: 0.02, idiomaDetectado: "pt" },
      { texto: "a", segmentos: [{ s: 0, fim: 10, texto: "a", locutor: null }], modelo: "m", custoUsd: 0.03, idiomaDetectado: "pt" },
    ])
    expect(r.segmentos.map((s) => s.s)).toEqual([0, 600])
    expect(r.custoUsd).toBeCloseTo(0.05, 5)
  })

  it("sem custo reportado o campo fica null, não zero", () => {
    // Zero passaria como "custou nada", que é uma afirmação diferente de
    // "o provedor não informou".
    const r = juntarPedacos([{ texto: "a", segmentos: [], modelo: "m", custoUsd: null, idiomaDetectado: null }])
    expect(r.custoUsd).toBeNull()
  })
})
