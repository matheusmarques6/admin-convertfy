/**
 * POST /api/ai/mcp-oauth/start — inicia a conexão OAuth com um servidor
 * MCP (ex.: o oficial da Omnisend, https://mcp.omnisend.com/mcp).
 *
 * Faz discovery + registro dinâmico e devolve a authorize_url pro
 * browser redirecionar. O estado do fluxo (verifier PKCE, client_id,
 * destino) viaja AUTOCONTIDO e CRIPTOGRAFADO no param `state` — nada
 * pendente no banco; o callback valida usuário e prazo.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { AppError, errorResponse, requireAuth, successResponse } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { mcpOAuthRedirectUri } from "@/lib/api/public-origin"
import { encrypt } from "@/lib/crypto"
import {
  buildAuthorizeUrl,
  discoverAuthServer,
  makePkce,
  registerClient,
} from "@/lib/ai/connectors/mcp-oauth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const bodySchema = z.object({
  name: z.string().min(2).max(60),
  url: z.string().url().max(500),
  store_id: z.string().uuid().nullable().optional(),
  allow_write: z.boolean().default(true),
  return_to: z.string().max(300).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient()
    const user = await requireAuth(sb)
    const orgId = await resolveOrgId(user.id)
    const body = bodySchema.parse(await request.json())

    if (!body.url.startsWith("https://")) {
      throw new AppError("O endpoint MCP precisa ser HTTPS.", 422, "validation-error")
    }

    // O redirect_uri tem de ser IDÊNTICO aqui e na troca do código —
    // derivar de nextUrl.origin nas duas pontas dava valores diferentes
    // atrás do proxy (alias de preview × domínio final) e o AS recusava.
    const redirectUri = mcpOAuthRedirectUri(request)
    // Erro de discovery/registro é do SERVIDOR REMOTO, não bug nosso —
    // precisa chegar ao usuário com o detalhe. Sem o AppError, o
    // errorResponse trata Error genérico como 500 e devolve só "Erro
    // interno", que foi exatamente o que apareceu na tela.
    let as: Awaited<ReturnType<typeof discoverAuthServer>>
    try {
      as = await discoverAuthServer(body.url)
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : "Falha ao descobrir o authorization server",
        422,
        "mcp-discovery",
      )
    }
    if (!as.registration_endpoint) {
      throw new AppError(
        "O authorization server não suporta registro dinâmico de cliente — conexão manual necessária.",
        422,
        "validation-error",
      )
    }
    let clientId: string
    let clientSecret: string | undefined
    try {
      const registered = await registerClient(
        as.registration_endpoint,
        redirectUri,
        as.scopes_supported,
      )
      clientId = registered.clientId
      clientSecret = registered.clientSecret
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : "Registro de cliente recusado",
        422,
        "mcp-registration",
      )
    }
    const { verifier, challenge } = makePkce()

    // return_to só dentro do admin — nada de open redirect
    const returnTo =
      body.return_to && body.return_to.startsWith("/admin") ? body.return_to : "/admin/operacional/ia"

    const state = encrypt(
      JSON.stringify({
        v: 1,
        org_id: orgId,
        user_id: user.id,
        name: body.name,
        url: body.url,
        store_id: body.store_id ?? null,
        allow_write: body.allow_write,
        verifier,
        client_id: clientId,
        client_secret: clientSecret ?? null,
        token_endpoint: as.token_endpoint,
        return_to: returnTo,
        ts: Date.now(),
      }),
    )

    const authorizeUrl = buildAuthorizeUrl({
      authorizationEndpoint: as.authorization_endpoint,
      clientId,
      redirectUri,
      state,
      challenge,
      resource: body.url,
      scopes: as.scopes_supported,
    })

    return successResponse(request, { authorize_url: authorizeUrl })
  } catch (error) {
    return errorResponse(request, error, "mcp-oauth-start")
  }
}
