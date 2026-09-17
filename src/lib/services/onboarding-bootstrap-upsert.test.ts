/**
 * `ignoreDuplicates` + `maybeSingle()` não convivem num POST.
 *
 * O bootstrap do onboarding faz upsert da página de tutorial com
 * `ignoreDuplicates: true` — que devolve ZERO linhas quando ela já existe,
 * o caso normal depois da primeira vez. Com `.maybeSingle()` o postgrest-js
 * manda `Accept: application/vnd.pgrst.object+json` (só no GET ele usa
 * `application/json`), e o PostgREST responde **406** — a requisição que
 * aparecia no edge_logs de todo bootstrap.
 *
 * O erro não chega ao nosso código: o cliente o neutraliza com
 * `error.details?.includes("0 rows")`. É por isso que funcionava. O que a
 * troca compra é o log limpo e o fim da dependência de um match por
 * SUBSTRING no texto de erro de um servidor que não é nosso — e é esse
 * mecanismo, não uma opinião sobre ele, que estes testes prendem.
 *
 * Usam o postgrest-js REAL com um fetch de mentira, porque o que está sob
 * prova é o comportamento do cliente, não o nosso código em volta.
 */
import { describe, it, expect } from "vitest"
import { PostgrestClient } from "@supabase/postgrest-js"

/** Responde como o PostgREST responde a um upsert que não inseriu nada. */
function fakePostgrest() {
  const chamadas: Array<{ accept: string | null; method: string }> = []
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers as HeadersInit)
    const accept = headers.get("Accept")
    chamadas.push({ accept, method: init.method ?? "GET" })

    // Zero linhas inseridas (conflito ignorado).
    if (accept === "application/vnd.pgrst.object+json") {
      return new Response(
        JSON.stringify({
          code: "PGRST116",
          details: "Results contain 0 rows, application/vnd.pgrst.object+json requires 1 row",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
        { status: 406, headers: { "Content-Type": "application/json" } },
      )
    }
    return new Response("[]", {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })
  }) as unknown as typeof fetch

  return {
    chamadas,
    client: new PostgrestClient("http://fake.local", { fetch: fetchFalso }),
  }
}

const LINHA = { org_id: "org-1", slug: "onboarding-implementacao" }
const OPTS = { onConflict: "org_id,slug", ignoreDuplicates: true } as const

describe("upsert da página de tutorial", () => {
  it("com maybeSingle o POST pede objeto e toma 406 — absorvido por um substring", async () => {
    const { client, chamadas } = fakePostgrest()
    const { data, error } = await client
      .from("tutorial_pages")
      .upsert(LINHA, OPTS)
      .select("id")
      .maybeSingle()

    expect(chamadas[0].method).toBe("POST")
    // O POST pede UM objeto e o servidor recusa com 406 — é a requisição que
    // sujava o log.
    expect(chamadas[0].accept).toBe("application/vnd.pgrst.object+json")
    // E o cliente absorve, por causa do "0 rows" no `details`. Se um dia esse
    // texto mudar, o erro passa a chegar e o `if (tutErr) throw` do serviço
    // derruba o bootstrap inteiro. É a fragilidade que a troca elimina.
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it("mas basta o texto do erro mudar para o mesmo caso virar falha", async () => {
    const fetchFalso = (async () =>
      new Response(
        JSON.stringify({
          code: "PGRST116",
          // sem "0 rows" no details — a única coisa que segura a absorção
          details: "Results contain no rows, object+json requires 1 row",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
        { status: 406, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch
    const client = new PostgrestClient("http://fake.local", { fetch: fetchFalso })

    const { error } = await client
      .from("tutorial_pages")
      .upsert(LINHA, OPTS)
      .select("id")
      .maybeSingle()

    expect(error?.code).toBe("PGRST116")
  })

  it("sem maybeSingle o mesmo conflito volta como lista vazia, sem erro", async () => {
    const { client, chamadas } = fakePostgrest()
    const { data, error } = await client
      .from("tutorial_pages")
      .upsert(LINHA, OPTS)
      .select("id")

    expect(chamadas[0].accept).not.toBe("application/vnd.pgrst.object+json")
    expect(error).toBeNull()
    expect(data).toEqual([])
    // É assim que o serviço distingue "eu inseri" de "já existia".
    expect((data as Array<{ id: string }>)[0]?.id).toBeUndefined()
  })

  it("quando ESTE processo insere, a linha vem na lista", async () => {
    const fetchFalso = (async () =>
      new Response(JSON.stringify([{ id: "pagina-1" }]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch
    const client = new PostgrestClient("http://fake.local", { fetch: fetchFalso })

    const { data, error } = await client
      .from("tutorial_pages")
      .upsert(LINHA, OPTS)
      .select("id")

    expect(error).toBeNull()
    expect((data as Array<{ id: string }>)[0]?.id).toBe("pagina-1")
  })

  it("no GET o maybeSingle é seguro — o cliente traduz o vazio", async () => {
    const { client, chamadas } = fakePostgrest()
    const { data, error } = await client
      .from("tutorial_pages")
      .select("id")
      .eq("org_id", "org-1")
      .maybeSingle()

    expect(chamadas[0].method).toBe("GET")
    expect(chamadas[0].accept).toBe("application/json")
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})
