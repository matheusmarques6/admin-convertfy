/**
 * reference-structure — extração DETERMINÍSTICA da estrutura de blocos de um
 * reference HTML a partir das tags canônicas `{{TAG}}` (tag-registry).
 *
 * Substitui a parte estrutural do Blueprint agent: número/ordem/type dos
 * blocos, needs_image e copy_spec deixam de ser "adivinhados" pelo LLM e
 * passam a ser derivados das tags — o LLM fica só com os campos criativos
 * (label, purpose, image_brief, objective, messaging, subject_hint).
 *
 * Algoritmo: varre as `{{TAGS}}` na ordem do documento, ignora as de META
 * (EMAIL_TITLE, PREHEADER...), e agrupa sequências contíguas da MESMA seção
 * em um bloco. O copy_spec do bloco é o dedup dos copyKeys das tags de copy
 * (orçamento do registry, clampado pelos guarda-corpos do copy-spec).
 *
 * Retorna null para HTML legado (sem tags canônicas suficientes) — o caller
 * cai no fluxo atual (Blueprint LLM extrai tudo).
 *
 * Puro (zero deps de server/client) — testável.
 */

import {
  lookupTag,
  normalizeTagName,
  type TagSpec,
} from "@/lib/email-workspace/tag-registry"
import { clampCopySpecField } from "@/lib/email-workspace/copy-spec"
import type { CopySpecField } from "@/types/email-generation"

export interface ExtractedBlock {
  /** block_type técnico (um dos 19 — hero, text, coupon...). */
  type: string
  /** Seção da nomenclatura (HERO, BODY, OFFER...). */
  section: string
  /** Tags originais do bloco, na ordem do documento. */
  tags: string[]
  needs_image: boolean
  /**
   * Proporção de geração da imagem do bloco (AspectKey), derivada da
   * PRIMEIRA tag de imagem com aspect no registry — o slot do template
   * define o formato. null quando o bloco não tem imagem.
   */
  image_aspect: string | null
  copy_spec: CopySpecField[]
}

export interface ExtractedStructure {
  blocks: ExtractedBlock[]
  /** Tags canônicas reconhecidas (dedup, ordem de aparição). */
  knownTags: string[]
  /** Tags {{X}} fora do vocabulário — telemetria de drift do Montador. */
  unknownTags: string[]
}

// Mesmo formato de placeholder do html.chain (MAIÚSCULAS; aceita índices).
// Tolerante a espaços internos ({{ TAG }}) por robustez.
const TAG_PATTERN = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g

// Mínimo de tags reconhecidas e razão conhecidas/total para considerar o
// reference "canônico". Abaixo disso → HTML legado → null (fluxo atual).
const MIN_KNOWN_TAGS = 4
const MIN_KNOWN_RATIO = 0.7

interface FoundTag {
  raw: string
  spec: TagSpec
}

/**
 * Extrai a estrutura de blocos do reference. null se o HTML não usa o
 * vocabulário canônico (legado) — decide-se por threshold, não por erro.
 */
export function extractStructureFromReference(
  html: string,
): ExtractedStructure | null {
  if (!html || typeof html !== "string") return null

  const found: FoundTag[] = []
  const known: string[] = []
  const unknown: string[] = []
  const seenKnown = new Set<string>()
  const seenUnknown = new Set<string>()

  for (const m of html.matchAll(TAG_PATTERN)) {
    const raw = m[1]
    const spec = lookupTag(raw)
    if (spec) {
      found.push({ raw, spec })
      if (!seenKnown.has(raw)) {
        seenKnown.add(raw)
        known.push(raw)
      }
    } else if (!seenUnknown.has(raw)) {
      seenUnknown.add(raw)
      unknown.push(raw)
    }
  }

  const total = seenKnown.size + seenUnknown.size
  if (
    seenKnown.size < MIN_KNOWN_TAGS ||
    total === 0 ||
    seenKnown.size / total < MIN_KNOWN_RATIO
  ) {
    return null
  }

  // ── Segmentação: runs contíguos da mesma seção → bloco ───────────
  const blocks: ExtractedBlock[] = []
  let current: {
    section: string
    type: string
    tags: string[]
    specs: TagSpec[]
  } | null = null

  const flush = () => {
    if (!current) return
    blocks.push({
      type: current.type,
      section: current.section,
      tags: current.tags,
      needs_image: current.specs.some((s) => s.kind === "image"),
      image_aspect:
        current.specs.find((s) => s.kind === "image" && s.aspect)?.aspect ??
        null,
      copy_spec: buildCopySpec(current.specs),
    })
    current = null
  }

  for (const { raw, spec } of found) {
    // Tags de documento (META) não participam da segmentação.
    if (!spec.blockType) continue
    if (!current || current.section !== spec.section) {
      flush()
      current = {
        section: spec.section,
        type: spec.blockType,
        tags: [],
        specs: [],
      }
    }
    // Dedup por tag normalizada dentro do bloco (PRODUCT_1_NAME e
    // PRODUCT_2_NAME contam uma vez no copy_spec, mas ambas em tags[]).
    current.tags.push(raw)
    current.specs.push(spec)
  }
  flush()

  if (blocks.length === 0) return null

  return { blocks, knownTags: known, unknownTags: unknown }
}

/** copy_spec do bloco: dedup por copyKey, clampado aos guarda-corpos. */
function buildCopySpec(specs: TagSpec[]): CopySpecField[] {
  const seen = new Set<string>()
  const fields: CopySpecField[] = []
  for (const s of specs) {
    if (s.kind !== "copy" || !s.copyKey || seen.has(s.copyKey)) continue
    seen.add(s.copyKey)
    const clamped = clampCopySpecField({
      key: s.copyKey,
      min_chars: s.min,
      max_chars: s.max,
    })
    if (clamped) fields.push(clamped)
  }
  return fields
}

/**
 * Serialização compacta do esqueleto para o prompt do Blueprint (var
 * `estrutura_extraida`): só o que o LLM precisa ver para escrever
 * label/purpose/image_brief por bloco.
 */
export function skeletonToPromptJson(structure: ExtractedStructure): string {
  return JSON.stringify(
    structure.blocks.map((b, i) => ({
      index: i,
      type: b.type,
      section: b.section,
      needs_image: b.needs_image,
      tags: dedupePreservingOrder(b.tags.map(normalizeTagName)),
    })),
  )
}

function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
}
