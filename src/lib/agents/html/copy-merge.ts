/**
 * copy-merge — estágio 0 da Fase A (arquitetura por slots): merge
 * DETERMINÍSTICO da copy no documento, por código, sem LLM.
 *
 * Para cada bloco: campo de natureza `copy` com `fields.tag` resolvido e
 * valor presente no content do n8n → op set_text ({{TAG}} → valor). URLs
 * (type=url) entram igual — são troca de texto no href. A aplicação usa o
 * Integrador (applyOps) com posse restrita às tags que o próprio merge
 * resolveu e hero SEMPRE protegida (posse do agente de hero).
 *
 * O relatório sai perfeitamente metrificado (contrato com a telemetria):
 * quantos slots existiam, quantos resolveram por código, o que sobrou
 * pro agente de exceção (Ajuste de Texto) e o que foi pulado por quê.
 *
 * Puro (zero I/O) — testável.
 */

import { deriveFieldNature } from "../shared/component-dimensions"
import { applyOps, type FormatOp, type SkippedOp } from "./apply-patches"
import { extractHeroBySentinels } from "./hero-locator"

/** Campo mínimo do snapshot fields v2 que o merge precisa. */
export interface MergeField {
  key: string
  tag: string | null
  type: string
  nature?: string | null
}

/** Bloco de entrada: fields do blueprint casado + content do n8n. */
export interface MergeBlock {
  fields: MergeField[]
  content: Record<string, unknown>
}

export interface CopyMergeReport {
  /** Tags de texto (não-imagem) presentes no doc FORA da hero, antes. */
  slots_total: number
  /** Ops montadas (campo com tag + valor no content). */
  ops_built: number
  /** Aplicadas com sucesso pelo Integrador. */
  merged: number
  /** Puladas pelo Integrador, com razão (telemetria). */
  skipped: SkippedOp[]
  /** Tags de texto que SOBRARAM fora da hero — a fila do agente de exceção. */
  left_for_llm: string[]
  /** Keys de content com valor mas sem tag resolvida (copy sem âncora). */
  unanchored_keys: string[]
}

export interface CopyMergeResult {
  html: string
  report: CopyMergeReport
}

// Tag de imagem canônica/schema-backed — fora do universo de texto.
const IMAGE_TAG = /(?:IMAGE|THUMB|_IMG)(?:_\d+)?$/
const TAG_TOKEN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

function isTextTag(tag: string): boolean {
  return !IMAGE_TAG.test(tag)
}

/** Valor de copy utilizável (string não-vazia ou número). */
function copyValue(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

/** Tags de texto presentes no doc FORA da região sentinelada da hero. */
export function textTagsOutsideHero(html: string): string[] {
  const hero = extractHeroBySentinels(html)
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(TAG_TOKEN)) {
    const start = m.index ?? 0
    if (hero && start >= hero.start && start < hero.end) continue
    const tag = m[1]
    if (!isTextTag(tag) || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

/**
 * Monta e aplica o merge. As ops seguem o protocolo padrão do Integrador
 * (envelope {"ops":[...]}, ação set_text) — mesmo vocabulário que o
 * agente de exceção emite; a diferença é que aqui quem escreve é código.
 */
export function copyMerge(
  html: string,
  blocks: MergeBlock[],
): CopyMergeResult {
  const before = textTagsOutsideHero(html)

  const ops: FormatOp[] = []
  const opTags = new Set<string>()
  const unanchored: string[] = []

  for (const b of blocks) {
    for (const f of b.fields) {
      const nature = deriveFieldNature(f)
      // Copy e URL são trocas de texto; imagem é do agente de imagem e
      // asset_fixo é intocável — fora do merge.
      if (nature !== "copy") continue
      const value = copyValue(b.content?.[f.key])
      if (value == null) continue
      if (!f.tag) {
        unanchored.push(f.key)
        continue
      }
      const tag = f.tag.replace(/[{}\s]/g, "")
      if (!isTextTag(tag) || opTags.has(tag)) continue
      opTags.add(tag)
      ops.push({ action: "set_text", tag, value })
    }
  }

  const res = applyOps(html, ops, {
    // Hero é posse do agente de hero — o merge nunca entra lá.
    allowHero: false,
    allowedTags: opTags,
  })

  return {
    html: res.html,
    report: {
      slots_total: before.length,
      ops_built: ops.length,
      merged: res.applied,
      skipped: res.skipped,
      left_for_llm: textTagsOutsideHero(res.html),
      unanchored_keys: Array.from(new Set(unanchored)),
    },
  }
}
