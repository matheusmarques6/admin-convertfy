/**
 * Builder determinístico do blueprint (substitui o LLM Blueprint na rota A).
 *
 * Recebe o esqueleto extraído das tags canônicas do reference HTML
 * (reference-structure) + os slots do Curador (variantes escolhidas, na ordem
 * da estrutura do outline) e monta o blueprint SEM LLM:
 *   - estrutura (type/ordem/needs_image/copy_spec/tags/image_aspect) ← skeleton
 *   - purpose ← copy_guidance da variante casada (→ description)
 *   - image_brief ← campos type=image do output_schema (guidance + example)
 *   - fields (contrato v2 do payload n8n) ← output_schema; sem schema →
 *     derivação do tag-registry; sem tags → conversão do copy_spec (rota LLM)
 *
 * O `packageBlueprint` é o EMPACOTADOR ÚNICO: aplica variant_id/fields (e os
 * overrides curados) a QUALQUER GeneratedBlueprint — inclusive o do LLM
 * fallback — garantindo que o output tem SEMPRE o mesmo formato,
 * independentemente da rota. O n8n nunca percebe qual rota rodou.
 *
 * Puro (zero I/O) — testável.
 */

import type {
  ComponentOutputField,
  CopySpecField,
  EmailOutlineTemplate,
} from "@/types/email-generation"
import { lookupTag, normalizeTagName } from "@/lib/email-workspace/tag-registry"
import { blockTypeToCategory } from "../shared/component-categories"
import type { ExtractedStructure } from "./reference-structure"
import type { AssemblySlot } from "./component-assembler.service"
import type {
  GeneratedBlock,
  GeneratedBlueprint,
} from "./blueprint-generator.service"

// ── Contrato v2 de fields (o que o n8n vê — IGUAL em todas as rotas) ──
export interface BlueprintFieldV2 {
  /** Chave do content que o n8n devolve no callback (content[key] = valor). */
  key: string
  label: string
  type: "text_short" | "text_long" | "number" | "url" | "image" | "boolean"
  /** Limite duro de caracteres (0 = sem limite). */
  max_len: number
  /** Mínimo sugerido (só quando derivado do tag-registry/copy_spec). */
  min_len: number | null
  required: boolean
  example: string
  guidance: string
  /** Tag {{TAG}} correspondente no template (null = sem slot casado). */
  tag: string | null
  /** Proveniência (debug do n8n): de onde veio este field. */
  source: "schema" | "tag_registry" | "llm"
}

// Variante "enxuta" que o builder precisa (AssemblySlot carrega a completa).
type SlotVariant = Extract<AssemblySlot, { kind: "variant" }>["variant"]

export interface VariantMatch {
  variant: SlotVariant
  slotLabel: string
}

export interface MatchResult {
  /** skeleton block index → variante casada. */
  matches: Map<number, VariantMatch>
  /** Cobertura sobre os blocos DE COPY (0..1). Sem blocos de copy → 1. */
  coverage: number
  copyBlocks: number
  coveredCopyBlocks: number
  unusedVariantIds: string[]
  unmatchedBlockIndexes: number[]
}

/**
 * Casa as variantes escolhidas pelo Curador com os blocos do skeleton.
 * FIFO por categoria (8 chaves da biblioteca), na ordem dos slots — tolera
 * runs fundidos (2 variantes adjacentes da mesma seção → 1 bloco: a 2ª vira
 * sobra em unusedVariantIds) e slots missing (simplesmente não entram).
 */
export function matchVariantsToSkeleton(
  skeleton: ExtractedStructure,
  slots: AssemblySlot[],
): MatchResult {
  // Filas FIFO por categoria, na ordem dos slots do outline.
  const queues = new Map<string, Array<{ variant: SlotVariant; label: string }>>()
  for (const s of slots) {
    if (s.kind !== "variant") continue
    const cat =
      blockTypeToCategory(s.variant.block_type) ?? s.section.toLowerCase()
    const q = queues.get(cat) ?? []
    q.push({ variant: s.variant, label: s.label })
    queues.set(cat, q)
  }

  const matches = new Map<number, VariantMatch>()
  const unmatchedBlockIndexes: number[] = []
  let copyBlocks = 0
  let coveredCopyBlocks = 0

  skeleton.blocks.forEach((sb, i) => {
    const cat = blockTypeToCategory(sb.type)
    const isCopyBlock = sb.copy_spec.length > 0
    if (isCopyBlock) copyBlocks++

    const entry = cat ? queues.get(cat)?.shift() : undefined
    if (!entry) {
      unmatchedBlockIndexes.push(i)
      return
    }
    matches.set(i, { variant: entry.variant, slotLabel: entry.label })
    if (isCopyBlock && variantHasCopyContext(entry.variant)) {
      coveredCopyBlocks++
    }
  })

  const unusedVariantIds = Array.from(queues.values())
    .flat()
    .map((e) => e.variant.id)

  return {
    matches,
    coverage: copyBlocks === 0 ? 1 : coveredCopyBlocks / copyBlocks,
    copyBlocks,
    coveredCopyBlocks,
    unusedVariantIds,
    unmatchedBlockIndexes,
  }
}

/** A variante consegue dirigir a copy do bloco (guidance OU schema). */
function variantHasCopyContext(v: SlotVariant): boolean {
  return Boolean(
    (v.copy_guidance ?? "").trim() || (v.output_schema ?? []).length > 0,
  )
}

// ── fields v2 — as 3 origens ─────────────────────────────────────────

/**
 * Origem "schema": os campos definidos na variante (aba Componentes).
 * Resolve a tag do template por copyKey OU pelo nome normalizado da tag
 * (schema.key "coupon_code" ↔ tag {{COUPON_CODE}}).
 */
export function fieldsFromSchema(
  schema: ComponentOutputField[],
  blockTags: string[],
): BlueprintFieldV2[] {
  return schema.map((f) => {
    const key = f.key.trim()
    const tag =
      blockTags.find((t) => lookupTag(t)?.copyKey === key) ??
      blockTags.find(
        (t) => normalizeTagName(t).toLowerCase() === key.toLowerCase(),
      ) ??
      null
    return {
      key,
      label: f.label || key,
      type: f.type,
      max_len: f.max_len ?? 0,
      min_len: null,
      required: f.required === true,
      example: f.example ?? "",
      guidance: f.guidance ?? "",
      tag,
      source: "schema",
    }
  })
}

/**
 * Origem "tag_registry": derivação das tags canônicas do bloco (fallback de
 * blocos sem variante/schema — mesmo dado que alimentava o `fields` v1).
 * Dedup por copyKey; só tags kind='copy'.
 */
export function fieldsFromTags(blockTags: string[]): BlueprintFieldV2[] {
  const seen = new Set<string>()
  const out: BlueprintFieldV2[] = []
  for (const t of blockTags) {
    const spec = lookupTag(t)
    if (!spec || spec.kind !== "copy" || !spec.copyKey) continue
    if (seen.has(spec.copyKey)) continue
    seen.add(spec.copyKey)
    const max = spec.max ?? 0
    out.push({
      key: spec.copyKey,
      label: spec.copyKey,
      type: max > 120 ? "text_long" : "text_short",
      max_len: max,
      min_len: spec.min ?? null,
      required: true,
      example: "",
      guidance: "",
      tag: t,
      source: "tag_registry",
    })
  }
  return out
}

/**
 * Origem "llm": conversão do copy_spec do Blueprint LLM (rota B sem skeleton
 * — HTML legado sem tags canônicas; não há tag para casar).
 */
export function fieldsFromCopySpec(
  copySpec: CopySpecField[],
): BlueprintFieldV2[] {
  return copySpec.map((f) => ({
    key: f.key,
    label: f.key,
    type: (f.max_chars ?? 0) > 120 ? ("text_long" as const) : ("text_short" as const),
    max_len: f.max_chars ?? 0,
    min_len: f.min_chars ?? null,
    required: true,
    example: "",
    guidance: "",
    tag: null,
    source: "llm",
  }))
}

/** image_brief derivado dos campos type=image do output_schema da variante. */
export function imageBriefFromSchema(
  schema: ComponentOutputField[],
): string | null {
  const parts = schema
    .filter((f) => f.type === "image")
    .map((f) => {
      const g = (f.guidance ?? "").trim()
      const ex = (f.example ?? "").trim()
      if (g && ex) return `${g} (ex.: ${ex})`
      return g || ex
    })
    .filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

// ── Rota A — blueprint 100% determinístico ───────────────────────────

export function buildDeterministicBlueprint(input: {
  skeleton: ExtractedStructure
  match: MatchResult
  outline: EmailOutlineTemplate | null
}): GeneratedBlueprint {
  const { skeleton, match, outline } = input

  const blocks: GeneratedBlock[] = skeleton.blocks.map((sb, i) => {
    const m = match.matches.get(i)
    const schema = m?.variant.output_schema ?? []
    const tags = dedupePreservingOrder(sb.tags)
    const purpose =
      (m?.variant.copy_guidance ?? "").trim() ||
      (m?.variant.description ?? "").trim()
    return {
      type: sb.type,
      label: m?.slotLabel?.trim() || m?.variant.name || sb.type,
      purpose,
      needs_image: sb.needs_image,
      image_brief:
        sb.needs_image && schema.length > 0
          ? imageBriefFromSchema(schema)
          : null,
      image_aspect: sb.image_aspect,
      copy_spec: sb.copy_spec,
      tags,
      variant_id: m?.variant.id ?? null,
      variant_name: m?.variant.name ?? null,
      fields:
        schema.length > 0 ? fieldsFromSchema(schema, tags) : fieldsFromTags(tags),
    }
  })

  return {
    objective: outline?.objective ?? "",
    // messaging determinístico = diretriz do outline; o mini-LLM de subject
    // pode sobrescrever com uma versão adaptada à loja (caller decide).
    messaging: outline?.guidance ?? "",
    subject_hint: null,
    blocks,
  }
}

// ── Empacotador ÚNICO (rotas A e B terminam aqui) ────────────────────

/**
 * Normaliza QUALQUER GeneratedBlueprint (inclusive o do LLM fallback) para o
 * formato final: todo bloco sai com `fields` v2 e, onde o Curador casou uma
 * variante, com `variant_id/variant_name` — e o dado CURADO vence o LLM
 * (purpose ← copy_guidance; image_brief ← schema type=image; fields ← schema).
 *
 * `match` null = rota sem skeleton (LLM cru): fields vêm do copy_spec do LLM.
 */
export function packageBlueprint(
  blueprint: GeneratedBlueprint,
  match: MatchResult | null,
): GeneratedBlueprint {
  const blocks: GeneratedBlock[] = blueprint.blocks.map((b, i) => {
    const m = match?.matches.get(i)
    const schema = m?.variant.output_schema ?? []
    const tags = b.tags ?? []
    const curatedPurpose = (m?.variant.copy_guidance ?? "").trim()
    const curatedBrief =
      b.needs_image && schema.length > 0 ? imageBriefFromSchema(schema) : null

    let fields: BlueprintFieldV2[]
    if (schema.length > 0) {
      fields = fieldsFromSchema(schema, tags)
    } else if (tags.length > 0) {
      fields = fieldsFromTags(tags)
    } else {
      fields = fieldsFromCopySpec(b.copy_spec ?? [])
    }

    return {
      ...b,
      purpose: curatedPurpose || b.purpose,
      image_brief: curatedBrief ?? b.image_brief ?? null,
      variant_id: m?.variant.id ?? b.variant_id ?? null,
      variant_name: m?.variant.name ?? b.variant_name ?? null,
      fields,
    }
  })
  return { ...blueprint, blocks }
}

function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
}
