import { describe, expect, it } from "vitest"
import { lerBlocos } from "./blocos-io"

/**
 * Builder falso do supabase-js que só entende a cadeia usada por
 * `lerBlocos` e devolve, para cada `range`, a fatia correspondente — é
 * assim que o corte de 1.000 linhas do PostgREST é simulado.
 */
function fakeDb(total: number, erroNaPagina?: number) {
  const chamadas: Array<[number, number]> = []
  const linhas = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    s: i * 5,
    fim: i * 5 + 5,
    locutor: "speaker_0",
    texto: `fala ${i + 1}`,
    editado: false,
  }))

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    range: (de: number, ate: number) => {
      chamadas.push([de, ate])
      if (erroNaPagina != null && chamadas.length === erroNaPagina) {
        return Promise.resolve({ data: null, error: { message: "boom" } })
      }
      return Promise.resolve({ data: linhas.slice(de, ate + 1), error: null })
    },
  }
  return { db: { from: () => builder } as never, chamadas }
}

describe("lerBlocos", () => {
  it("devolve tudo quando cabe numa página", async () => {
    const { db, chamadas } = fakeDb(120)
    const blocos = await lerBlocos(db, "t1")
    expect(blocos).toHaveLength(120)
    // Página incompleta encerra: nada de uma segunda ida ao banco à toa.
    expect(chamadas).toHaveLength(1)
  })

  it("pagina além do corte de 1.000 linhas do PostgREST", async () => {
    // O caso que o `.limit(20000)` escondia: um vídeo longo voltava com
    // 1.000 blocos e a transcrição aparecia pela metade, sem aviso.
    const { db, chamadas } = fakeDb(2350)
    const blocos = await lerBlocos(db, "t1")
    expect(blocos).toHaveLength(2350)
    expect(chamadas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(blocos[2349].texto).toBe("fala 2350")
  })

  it("encerra sem página extra quando o total é múltiplo exato", async () => {
    const { db, chamadas } = fakeDb(2000)
    const blocos = await lerBlocos(db, "t1")
    expect(blocos).toHaveLength(2000)
    // A 3ª ida volta vazia e para — melhor que assumir o fim e perder dado.
    expect(chamadas).toHaveLength(3)
  })

  it("converte s e fim para número (NUMERIC do Postgres chega como string)", async () => {
    const { db } = fakeDb(3)
    const blocos = await lerBlocos(db, "t1")
    expect(typeof blocos[1].s).toBe("number")
    expect(blocos[1].s).toBe(5)
  })

  it("propaga erro no meio da paginação em vez de devolver texto pela metade", async () => {
    const { db } = fakeDb(2350, 2)
    await expect(lerBlocos(db, "t1")).rejects.toMatchObject({ message: "boom" })
  })
})
