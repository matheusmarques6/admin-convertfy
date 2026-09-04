/**
 * Guias por operação da API do Omnisend — o que o MCP oficial entrega
 * em `omnisend_tool_schema` (fluxo recomendado, campos obrigatórios,
 * receitas de payload, erros com significado), embutido no admin para
 * a ConvertIA consultar ANTES de montar um body.
 *
 * Motivo: sem isto ela montou `POST /api/forms` no chute, tomou 400 e
 * concluiu que "a plataforma não deixa criar formulário por API" — e
 * disse que "não existe bloco de roleta" quando o schema tem
 * `wheelOfFortune`. O guia é a diferença entre chutar e executar.
 *
 * Fonte: docs/*.md → operation-docs.generated.ts (scripts/omnisend-docs-gen.mjs).
 */

import { OMNISEND_DOCS } from "./operation-docs.generated"
import { findOmnisendOperation, OMNISEND_OPERATIONS } from "./operation-catalog"

/** Teto do que uma tool devolve ao modelo — o maior guia (post_forms) tem ~17k. */
export const OMNISEND_DOC_MAX_CHARS = 20_000

export interface OmnisendDocHit {
  key: string
  /** Nome canônico da operação quando o guia é de operação (não de tópico). */
  operation: string | null
  markdown: string
}

const TOPIC_PREFIX = "topic_"

export function listOmnisendDocKeys(): string[] {
  return Object.keys(OMNISEND_DOCS).sort()
}

/** Guias que são operações (não tópicos). */
export function operationsWithDoc(): Set<string> {
  return new Set(listOmnisendDocKeys().filter((k) => !k.startsWith(TOPIC_PREFIX)))
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

/**
 * Resolve um guia por: nome canônico (`post_forms`), tópico
 * (`automation_content` ou `topic_automation_content`), ou method+path
 * (`POST /api/forms`, ou `/api/forms` + method). Path preenchido
 * (`/api/forms/64e8…`) também resolve.
 */
export function getOmnisendDoc(keyOrPath: string, method?: string): OmnisendDocHit | null {
  const raw = keyOrPath.trim()
  if (!raw) return null

  const direct = normalize(raw)
  if (OMNISEND_DOCS[direct]) {
    return {
      key: direct,
      operation: direct.startsWith(TOPIC_PREFIX) ? null : direct,
      markdown: OMNISEND_DOCS[direct],
    }
  }
  const asTopic = `${TOPIC_PREFIX}${direct}`
  if (OMNISEND_DOCS[asTopic]) {
    return { key: asTopic, operation: null, markdown: OMNISEND_DOCS[asTopic] }
  }

  const op = findOmnisendOperation(raw, method)
  if (op && OMNISEND_DOCS[op.n]) {
    return { key: op.n, operation: op.n, markdown: OMNISEND_DOCS[op.n] }
  }
  return null
}

/**
 * Sugestões quando não há guia: operações do catálogo cujo nome/path/
 * descrição compartilham tokens com a busca, marcando as que TÊM guia.
 * Nunca lança — a entrada vem do modelo.
 */
export function suggestOmnisendDocs(query: string, limit = 6): Array<{
  operation: string
  path: string
  method: string
  has_doc: boolean
}> {
  const tokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
  if (tokens.length === 0) return []
  const withDoc = operationsWithDoc()
  const scored = OMNISEND_OPERATIONS.map((op) => {
    const hay = `${op.n} ${op.p} ${op.s}`.toLowerCase()
    const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
    return { op, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(withDoc.has(b.op.n)) - Number(withDoc.has(a.op.n)))
    .slice(0, limit)
  return scored.map(({ op }) => ({
    operation: op.n,
    path: op.p,
    method: op.m,
    has_doc: withDoc.has(op.n),
  }))
}
