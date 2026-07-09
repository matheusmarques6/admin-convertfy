import { NextRequest } from "next/server"

/**
 * Invoca um route handler in-process (sem hop HTTP) e retorna o JSON da
 * resposta — ou null em qualquer falha. Usado pelos RSCs para pré-carregar
 * o MESMO payload que o client buscaria via fetch (initialData/fallbackData),
 * byte-idêntico por construção: é o próprio handler que monta a resposta.
 *
 * O handler roda no contexto do request atual (createClient() dentro dele lê
 * os cookies via next/headers), então auth/RLS se comportam exatamente como
 * no fetch do browser. Falha → null → o componente client faz o fetch
 * normal, como hoje.
 */
export async function invokeRouteJson(
  // context opcional cobre handlers embrulhados em withTiming, cuja
  // assinatura é (request, context) — rotas sem params dinâmicos o ignoram.
  handler: (request: NextRequest, context?: unknown) => Promise<Response> | Response,
  path: string,
): Promise<unknown | null> {
  try {
    const url = new URL(path, "http://internal.invoke")
    const response = await handler(new NextRequest(url))
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}
