/**
 * I/O dos tokens de identidade (B5): carrega o que a parte pura precisa.
 *
 * - `tokensDaLoja` deriva os papéis da paleta (`deriveColorRoles`, o MESMO
 *   helper da hero e do Cores & Botões) e resolve os 11 valores.
 * - `blocosTokenizadosDoSlotMap` diz quais posições do `slot_map` apontam
 *   para variante com `tokens_de_identidade = true` — é o que o STEP 4 lê
 *   para pular o agente (todas) ou blindar os blocos (algumas).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { ReferenceSlotMapEntry } from "@/types/email-generation"
import type { BrandColor } from "@/types/email-workspace"
import { logger } from "@/lib/logger"

import { deriveColorRoles, type ColorRoles } from "./color-roles"
import { resolverTokens, type ValoresDeTokens } from "./identity-tokens"

const log = logger.child("IdentityTokens")

export interface IdentidadeParaTokens {
  colors_primary?: BrandColor[] | null
  colors_secondary?: BrandColor[] | null
  font_heading?: string | null
  font_body?: string | null
  font_heading_weight?: string | null
  font_body_weight?: string | null
}

/**
 * Os 11 valores da loja. `roles` pré-derivados (o `FormatChainContext` já
 * os tem) evitam derivar duas vezes e — mais importante — garantem que o
 * token e o agente de cor falam da MESMA paleta.
 */
export function tokensDaLoja(
  brand: IdentidadeParaTokens | null | undefined,
  opts: { roles?: ColorRoles; raioBotaoPx?: number | null } = {},
): ValoresDeTokens {
  const roles = opts.roles ?? deriveColorRoles(brand?.colors_primary ?? [], brand?.colors_secondary ?? [])
  return resolverTokens({
    roles,
    fontHeading: brand?.font_heading ?? null,
    fontBody: brand?.font_body ?? null,
    fontHeadingWeight: brand?.font_heading_weight ?? null,
    fontBodyWeight: brand?.font_body_weight ?? null,
    raioBotaoPx: opts.raioBotaoPx ?? null,
  })
}

export interface BlocosTokenizados {
  /** `block_index` das posições cuja variante usa tokens. */
  indices: number[]
  /** Posições do slot_map que ENTRARAM no documento com variante. */
  total: number
  /** Todas as posições montadas são tokenizadas (e há ao menos uma). */
  todas: boolean
}

/**
 * Cruza o `slot_map` com `email_component_variants.tokens_de_identidade`.
 * Fail-open declarado: erro de leitura devolve zero tokenizados (o agente
 * de cor roda como sempre) e loga — nunca derruba a fase 2.
 */
export async function blocosTokenizadosDoSlotMap(
  admin: SupabaseClient,
  slotMap: ReferenceSlotMapEntry[] | null | undefined,
): Promise<BlocosTokenizados> {
  const vazio: BlocosTokenizados = { indices: [], total: 0, todas: false }
  const montadas = (slotMap ?? []).filter((s) => s.variant_id && s.assembled !== false)
  if (montadas.length === 0) return vazio
  const ids = [...new Set(montadas.map((s) => s.variant_id as string))]
  try {
    const { data, error } = await admin
      .from("email_component_variants")
      .select("id, tokens_de_identidade")
      .in("id", ids)
    if (error) throw error
    const tokenizadas = new Set(
      ((data ?? []) as Array<{ id: string; tokens_de_identidade: boolean | null }>)
        .filter((v) => v.tokens_de_identidade === true)
        .map((v) => v.id),
    )
    const indices = montadas
      .filter((s) => tokenizadas.has(s.variant_id as string))
      .map((s) => s.block_index)
      .sort((a, b) => a - b)
    return { indices, total: montadas.length, todas: indices.length > 0 && indices.length === montadas.length }
  } catch (err) {
    log.warn("tokens.slot_map_lookup_failed", {
      error: err instanceof Error ? err.message : String(err),
      variantIds: ids.length,
    })
    return vazio
  }
}
