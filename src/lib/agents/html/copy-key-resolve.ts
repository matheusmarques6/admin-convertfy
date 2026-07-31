/**
 * copy-key-resolve — acha o valor da copy quando o schema e o n8n falam
 * vocabulários diferentes.
 *
 * O projeto tem DOIS nomes legítimos para o mesmo campo, e os dois estão
 * documentados:
 *
 *   - `output_schema.key` da variante. Pelo épico Taguedor, a key É o nome
 *     do placeholder em minúsculas: `hero_cta_label` ↔ `{{HERO_CTA_LABEL}}`.
 *   - `copyKey` do tag-registry, que é o vocabulário do payload de copy:
 *     `HERO_CTA_LABEL` → `cta`, `HERO_HEADLINE` → `headline`.
 *
 * O n8n devolve pelo SEGUNDO. O merge lia só pelo PRIMEIRO
 * (`content[field.key]`), então num bloco com schema no estilo Taguedor
 * nenhum campo casava e TODOS os placeholders chegavam crus ao email —
 * exatamente o que aconteceu com a hero da Luxe Lift, com os dois botões
 * saindo como `{{HERO_CTA_LABEL}}` e `{{HERO_CTA_2_LABEL}}`.
 *
 * Este módulo resolve o valor tentando os dois, na ordem: a key do schema
 * primeiro (é a mais específica), o copyKey canônico depois.
 *
 * **Índices são tratados com cuidado.** `{{HERO_CTA_2_LABEL}}` normaliza
 * para `HERO_CTA_N_LABEL`, cujo copyKey é o mesmo `cta` do primeiro botão.
 * Cair no copyKey base ali colocaria o MESMO label nos dois CTAs. Então
 * campo indexado só aceita chave indexada (`cta_2`, `cta2`); sem ela, fica
 * sem valor — e um CTA sem copy é linha removida, que é o certo.
 *
 * Puro (zero I/O) — testável.
 */

import { lookupTag, normalizeTagName } from "@/lib/email-workspace/tag-registry"

/** Por onde o valor foi encontrado — telemetria do merge. */
export type CopyKeySource = "schema_key" | "canonical_copy_key" | null

export interface ResolvedCopyValue {
  value: string | null
  source: CopyKeySource
  /** A chave que de fato casou no content. */
  matchedKey: string | null
}

const scalar = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

/** Índice numérico da tag (`HERO_CTA_2_LABEL` → 2); null quando não há. */
export function tagIndex(tag: string | null | undefined): number | null {
  const m = (tag ?? "").match(/_(\d+)(?:_|$)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Candidatas de chave para um campo, em ordem de preferência.
 *
 * Exportada para o teste conseguir afirmar a ORDEM — que é o que impede o
 * segundo CTA de herdar o label do primeiro.
 */
export function copyKeyCandidates(
  key: string,
  tag: string | null | undefined,
): string[] {
  const out: string[] = []
  const push = (k: string | null | undefined) => {
    const clean = (k ?? "").trim()
    if (clean && !out.includes(clean)) out.push(clean)
  }

  push(key)

  const cleanTag = (tag ?? "").replace(/[{}\s]/g, "")
  if (!cleanTag) return out

  const canonical = lookupTag(cleanTag)?.copyKey
  if (!canonical) return out

  const idx = tagIndex(cleanTag)
  if (idx != null && idx > 1) {
    // Indexado: só chave indexada. Sem isso os dois CTAs recebem o mesmo
    // texto, que é pior do que um CTA vazio (esse vira linha removida).
    push(`${canonical}_${idx}`)
    push(`${canonical}${idx}`)
    return out
  }

  push(canonical)
  // A tag em minúsculas também é um nome plausível de chave em schemas
  // que seguem o Taguedor sem passar pelo registry.
  push(normalizeTagName(cleanTag).toLowerCase() === cleanTag.toLowerCase()
    ? cleanTag.toLowerCase()
    : null)
  return out
}

/**
 * Valor da copy para um campo, aceitando os dois vocabulários.
 * `source` diz por qual caminho veio — insumo da telemetria do merge.
 */
export function resolveCopyValue(
  content: Record<string, unknown> | null | undefined,
  field: { key: string; tag?: string | null },
): ResolvedCopyValue {
  const c = content ?? {}
  const candidates = copyKeyCandidates(field.key, field.tag)

  for (const [i, k] of candidates.entries()) {
    const v = scalar(c[k])
    if (v != null) {
      return {
        value: v,
        source: i === 0 ? "schema_key" : "canonical_copy_key",
        matchedKey: k,
      }
    }
  }
  return { value: null, source: null, matchedKey: null }
}
