/**
 * O cupom da peça EXISTE na plataforma da loja? (Passo 16, 14/09)
 *
 * Traduzido não é cadastrado: o código sai do outline por idioma
 * (`coupon_codes`), e um e-mail com WELCOME10 numa loja sem esse desconto é
 * pior que em português. Com `shopify_access_token`, consulta
 * `discountNodes(query: "code:<codigo>")` no GraphQL Admin; sem token, diz
 * que NÃO conferiu — e a diferença entre "não existe" e "não conferi" é a
 * diferença entre issue e nota.
 *
 * Hoje ZERO lojas ativas têm token (medido em 14/09): o check nasce inerte
 * e não pode ser contado como proteção. Fail-open com teto de 8s.
 */

import { getStoreCredentials } from "@/lib/services/credentials.service"
import { logger } from "@/lib/logger"

import { ShopifyService } from "../shopify"

const log = logger.child("DiscountLookup")
const TIMEOUT_MS = 8_000

export type ConferenciaDeCupom =
  | { conferido: true; existe: boolean; codigo: string; titulo?: string | null }
  | { conferido: false; motivo: "sem_token" | "sem_dominio" | "erro" | "timeout"; codigo: string; detalhe?: string }

interface DiscountNodesResp {
  discountNodes: {
    edges: Array<{
      node: {
        id: string
        discount?: { title?: string | null; codes?: { nodes?: Array<{ code?: string | null }> } | null } | null
      }
    }>
  }
}

const QUERY = `query CupomExiste($q: String!) {
  discountNodes(first: 5, query: $q) {
    edges { node { id discount { ... on DiscountCodeBasic { title codes(first: 5) { nodes { code } } } ... on DiscountCodeBxgy { title codes(first: 5) { nodes { code } } } ... on DiscountCodeFreeShipping { title codes(first: 5) { nodes { code } } } } } }
  }
}`

export interface LookupDeps {
  /** Injetável nos testes. */
  credenciais?: (storeId: string) => Promise<{ shopify_access_token?: string | null; shopify_store_domain?: string | null; store_url?: string | null }>
  consultar?: (dominio: string, token: string, codigo: string) => Promise<DiscountNodesResp>
}

async function consultarPadrao(dominio: string, token: string, codigo: string): Promise<DiscountNodesResp> {
  const svc = new ShopifyService({ storeUrl: dominio, accessToken: token })
  return svc.graphql<DiscountNodesResp>(QUERY, { q: `code:${codigo}` })
}

export async function cupomExisteNaPlataforma(storeId: string, codigo: string, deps: LookupDeps = {}): Promise<ConferenciaDeCupom> {
  const cod = codigo.trim()
  const credenciais = deps.credenciais ?? (async (id: string) => {
    const c = await getStoreCredentials(id)
    return { shopify_access_token: c.shopify_access_token ?? null, shopify_store_domain: c.shopify_store_domain ?? null, store_url: null }
  })
  const consultar = deps.consultar ?? consultarPadrao
  try {
    const cred = await credenciais(storeId)
    const token = cred.shopify_access_token?.trim()
    if (!token) return { conferido: false, motivo: "sem_token", codigo: cod }
    const dominio = (cred.shopify_store_domain ?? cred.store_url ?? "").trim()
    if (!dominio) return { conferido: false, motivo: "sem_dominio", codigo: cod }
    const resposta = await Promise.race([
      consultar(dominio, token, cod),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), TIMEOUT_MS)),
    ])
    const alvo = cod.toUpperCase()
    for (const e of resposta.discountNodes?.edges ?? []) {
      const codes = e.node.discount?.codes?.nodes ?? []
      if (codes.some((c) => (c.code ?? "").trim().toUpperCase() === alvo)) {
        return { conferido: true, existe: true, codigo: cod, titulo: e.node.discount?.title ?? null }
      }
    }
    return { conferido: true, existe: false, codigo: cod }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("lookup_failed", { storeId, codigo: cod, error: msg })
    return { conferido: false, motivo: msg === "timeout" ? "timeout" : "erro", codigo: cod, detalhe: msg.slice(0, 200) }
  }
}
