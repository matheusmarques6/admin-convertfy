/**
 * O SCHEMA é a base. As {{TAGS}} do HTML seguem o schema.
 *
 * Regra única, sem exceção: o endereço de um campo no template é
 * `{{UPPER(key)}}` — `hero_headline` mora em `{{HERO_HEADLINE}}`, e em mais
 * lugar nenhum. Não existe alias, não existe tradução por copyKey do
 * tag-registry, não existe "a tag que parece servir esse campo".
 *
 * Antes daqui o resolvedor aceitava três caminhos (copyKey do registry, nome
 * normalizado, placeholder literal). O efeito era silencioso e caro: uma
 * variante podia declarar `hero_headline`/`hero_subhead` no schema e carregar
 * `{{HERO_EYEBROW}}`/`{{COUPON_CODE}}` no HTML, e nada gritava — a copy saía
 * sem endereço, os placeholders chegavam crus ao email e o defeito só
 * aparecia na peça pronta.
 *
 * Este módulo é o auditor dessa regra. Ele não conserta nada: diz o que está
 * ancorado, o que ficou sem âncora e quais tags do HTML ninguém preenche.
 * `legacyTag` é a ÚNICA sobrevivência do vocabulário antigo, e serve só para
 * PROPOR o retagueamento ("o HTML usa {{X}} onde o schema pede {{Y}}").
 *
 * Puro (zero I/O), client-safe — a aba Componentes e o builder do blueprint
 * usam a MESMA função.
 */

import { lookupTag, normalizeTagName } from "./tag-registry"
import {
  deriveFieldNature,
  placeholderForKey,
} from "@/lib/agents/shared/component-dimensions"
import type { ComponentFieldNature } from "@/lib/agents/shared/component-dimensions"
import type { ComponentOutputField } from "@/types/email-generation"

// Mesmo formato de placeholder do reference-structure (MAIÚSCULAS; tolera
// espaços internos).
const TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

/** Por que uma tag do HTML está sobrando. */
export type OrphanTagKind =
  // Tag de copy do registry sem campo no schema: ninguém escreve esse texto.
  | "copy"
  // Fora do registry e fora do schema: ninguém preenche — vira lixo no email
  // (o strip de placeholders apaga no fim da cadeia).
  | "desconhecida"

export interface AnchoredField {
  key: string
  placeholder: string
}

export interface MissingAnchor {
  key: string
  /** O endereço que o schema exige: `{{UPPER(key)}}`. */
  placeholder: string
  nature: ComponentFieldNature
  /**
   * Tag que o HTML usa hoje no papel deste campo, pelo vocabulário ANTIGO.
   * Não é fallback: é a proposta de retagueamento. null = nem proposta há.
   */
  legacyTag: string | null
}

export interface OrphanTag {
  tag: string
  kind: OrphanTagKind
}

export interface SchemaTagAudit {
  anchored: AnchoredField[]
  missing: MissingAnchor[]
  orphans: OrphanTag[]
  /** Nenhum campo sem âncora e nenhuma tag sobrando. */
  ok: boolean
}

/** Tags distintas do HTML, na ordem de aparição. */
export function extractTags(html: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of (html ?? "").matchAll(TAG_PATTERN)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    out.push(m[1])
  }
  return out
}

/**
 * A tag é preenchida pelo SISTEMA (logo, preheader, href, alt, ano), não pela
 * copy do bloco. Tag assim nunca é órfã: não é papel do schema da variante
 * declarar `LOGO` — ele vem do build-vars da loja.
 */
function isSystemTag(tag: string): boolean {
  const kind = lookupTag(tag)?.kind
  return kind === "data" || kind === "url"
}

/**
 * Tag que servia este campo no vocabulário antigo — só para propor o retag.
 * `claimed` são os placeholders canônicos já reivindicados por outros campos,
 * para não propor mover uma tag que já é a âncora legítima de alguém.
 */
function findLegacyTag(
  key: string,
  tags: string[],
  claimed: Set<string>,
): string | null {
  const lower = key.toLowerCase()
  const candidate =
    tags.find((t) => !claimed.has(t) && lookupTag(t)?.copyKey === lower) ??
    tags.find(
      (t) => !claimed.has(t) && normalizeTagName(t).toLowerCase() === lower,
    ) ??
    null
  return candidate
}

/**
 * Audita uma variante contra a regra `tag = {{UPPER(key)}}`.
 *
 * `asset_fixo` fica de fora dos campos: a arte da biblioteca continua como
 * foi desenhada e não vira placeholder (mesma regra do Taguedor).
 */
export function auditSchemaTags(
  html: string,
  schema: ComponentOutputField[],
): SchemaTagAudit {
  const tags = extractTags(html)
  const tagSet = new Set(tags)

  const fields = (schema ?? []).filter(
    (f) => f.key?.trim() && deriveFieldNature(f) !== "asset_fixo",
  )

  // Placeholders canônicos de TODOS os campos — reivindicados de saída, para
  // que a proposta de retag nunca aponte para a âncora de outro campo.
  const claimed = new Set(
    fields.map((f) => placeholderForKey(f.key.trim())).filter(Boolean),
  )

  const anchored: AnchoredField[] = []
  const missing: MissingAnchor[] = []

  for (const f of fields) {
    const key = f.key.trim()
    const placeholder = placeholderForKey(key)
    if (!placeholder) continue
    if (tagSet.has(placeholder)) {
      anchored.push({ key, placeholder })
      continue
    }
    missing.push({
      key,
      placeholder,
      nature: deriveFieldNature(f),
      legacyTag: findLegacyTag(key, tags, claimed),
    })
  }

  const orphans: OrphanTag[] = tags
    .filter((t) => !claimed.has(t) && !isSystemTag(t))
    .map((t) => ({
      tag: t,
      kind: (lookupTag(t)?.kind === "copy"
        ? "copy"
        : "desconhecida") as OrphanTagKind,
    }))

  return {
    anchored,
    missing,
    orphans,
    ok: missing.length === 0 && orphans.length === 0,
  }
}

// ── Compat: forma achatada usada pela UI e pelos testes ──────────────

export interface SchemaTagCoherence {
  /** Campos do schema sem `{{UPPER(key)}}` no HTML. */
  keysWithoutTag: string[]
  /** Tags de copy do HTML sem campo no schema. */
  copyTagsWithoutKey: string[]
  /** Tags fora do registry e fora do schema — ninguém as preenche. */
  unknownTagsWithoutKey: string[]
}

export function validateSchemaTagCoherence(
  html: string,
  schema: ComponentOutputField[],
): SchemaTagCoherence {
  const audit = auditSchemaTags(html, schema)
  return {
    keysWithoutTag: audit.missing.map((m) => m.key),
    copyTagsWithoutKey: audit.orphans
      .filter((o) => o.kind === "copy")
      .map((o) => o.tag),
    unknownTagsWithoutKey: audit.orphans
      .filter((o) => o.kind === "desconhecida")
      .map((o) => o.tag),
  }
}
