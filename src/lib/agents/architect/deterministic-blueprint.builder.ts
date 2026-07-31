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
  BlueprintBlockField,
  ComponentOutputField,
  CopySpecField,
  EmailOutlineTemplate,
} from "@/types/email-generation"
import { lookupTag } from "@/lib/email-workspace/tag-registry"
import { blockTypeToCategory } from "../shared/component-categories"
import {
  deriveFieldNature,
  effectiveVariantHtml,
  placeholderForKey,
} from "../shared/component-dimensions"
import { extractImageSlotNotes } from "../image/extract-image-slot-notes"
import type { ExtractedStructure, SchemaTagKind } from "./reference-structure"
import type { AssemblySlot } from "./component-assembler.service"
import type {
  GeneratedBlock,
  GeneratedBlueprint,
} from "./blueprint-generator.service"

// ── Contrato v2 de fields (o que o n8n vê — IGUAL em todas as rotas) ──
// Definição canônica em types/email-generation.ts (BlueprintBlockField);
// alias local mantido pelos consumidores do builder.
export type BlueprintFieldV2 = BlueprintBlockField

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

/**
 * Vocabulário schema-backed do email (épico Taguedor): {{UPPER(key)}} dos
 * output_schemas das variantes escolhidas → kind (copy | image), para a
 * extração do skeleton reconhecê-los como tags legítimas (não drift).
 * asset_fixo fica de fora — a arte não vira placeholder.
 */
export function schemaTagsFromSlots(
  slots: AssemblySlot[],
): Map<string, SchemaTagKind> {
  const map = new Map<string, SchemaTagKind>()
  for (const s of slots) {
    if (s.kind !== "variant") continue
    for (const f of s.variant.output_schema ?? []) {
      const nature = deriveFieldNature(f)
      if (nature === "asset_fixo") continue
      const ph = placeholderForKey(f.key)
      if (!ph || map.has(ph)) continue
      map.set(ph, nature === "imagem_gerada" ? "image" : "copy")
    }
  }
  return map
}

// ── fields v2 — as 3 origens ─────────────────────────────────────────

/**
 * Origem "schema": os campos definidos na variante (aba Componentes).
 *
 * O SCHEMA É A BASE. O endereço de um campo no template é `{{UPPER(key)}}`,
 * e só isso: `hero_headline` → `{{HERO_HEADLINE}}`. Os três caminhos antigos
 * (copyKey do tag-registry, nome normalizado da tag, placeholder literal)
 * FORAM REMOVIDOS. Eles davam a ilusão de que a variante estava correta:
 * quando o HTML carregava `{{HERO_EYEBROW}}` e o schema pedia
 * `hero_headline`, algum dos aliases casava por acaso — ou nenhum casava, e
 * o campo virava `tag: null` em silêncio, sem copy e sem aviso.
 *
 * Campo sem `{{UPPER(key)}}` no HTML da variante continua saindo com a tag
 * PREENCHIDA (o contrato é o schema, não o HTML) e é REGISTRADO como erro de
 * cadastro por `schemaAnchorIssues` — quem conserta é o retagueamento da
 * variante, não o resolvedor em tempo de geração.
 */
/** Endereço canônico de um key de schema. Regra única, sem alias. */
function resolveTagForKey(key: string): string | null {
  return placeholderForKey(key) || null
}

/** O `{{PLACEHOLDER}}` existe de fato no HTML da variante? */
function tagAnchoredInHtml(tag: string, variantHtml?: string): boolean {
  if (!variantHtml) return false
  const re = new RegExp(
    `\\{\\{\\s*${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
  )
  return re.test(variantHtml)
}

/** Campo do schema cujo `{{UPPER(key)}}` não existe no HTML da variante. */
export interface SchemaAnchorIssue {
  key: string
  tag: string
  nature: string
}

/**
 * Erros de cadastro do bloco: campos que o schema declara e o HTML da
 * variante não endereça. Sem `variantHtml` não há o que auditar (rota B).
 * Vai para a telemetria do blueprint — é o sinal que faz a biblioteca ser
 * consertada em vez do defeito reaparecer a cada geração.
 */
export function schemaAnchorIssues(
  schema: ComponentOutputField[],
  variantHtml?: string,
): SchemaAnchorIssue[] {
  if (!variantHtml) return []
  const out: SchemaAnchorIssue[] = []
  for (const f of schema) {
    const key = f.key?.trim()
    if (!key) continue
    const nature = deriveFieldNature(f)
    // asset_fixo é arte da biblioteca — não vira placeholder por desenho.
    if (nature === "asset_fixo") continue
    const tag = resolveTagForKey(key)
    if (!tag || tagAnchoredInHtml(tag, variantHtml)) continue
    out.push({ key, tag, nature })
  }
  return out
}

export function fieldsFromSchema(
  schema: ComponentOutputField[],
  // HTML da variante — quando presente, extrai o comentário do <td>/<tr> de
  // cada slot de imagem (slot_note). Ausente (ex.: rota B) → sem slot_note.
  variantHtml?: string,
): BlueprintFieldV2[] {
  // Slots de imagem do bloco → extrai os comentários UMA vez.
  const imageTags = schema
    .filter((f) => f.type === "image")
    .map((f) => resolveTagForKey(f.key.trim()))
    .filter((t): t is string => !!t)
  const slotNotes =
    variantHtml && imageTags.length > 0
      ? extractImageSlotNotes(variantHtml, imageTags)
      : {}

  return schema.map((f) => {
    const key = f.key.trim()
    const tag = resolveTagForKey(key)
    const base: BlueprintFieldV2 = {
      key,
      label: f.label || key,
      type: f.type,
      // Natureza explícita no snapshot (T8): consumidores (dispatch, image
      // slots, QA) filtram por ela sem re-derivar do schema da variante.
      nature: deriveFieldNature(f),
      max_len: f.max_len ?? 0,
      min_len: null,
      required: f.required === true,
      example: f.example ?? "",
      guidance: f.guidance ?? "",
      tag,
      source: "schema",
    }
    if (f.type === "image") {
      base.image_spec = f.image_spec ?? null
      base.image_aspect = f.image_aspect ?? null
      base.image_width = f.image_width ?? null
      base.image_height = f.image_height ?? null
      base.slot_note = (tag && slotNotes[tag]) || null
    }
    return base
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

/**
 * image_brief derivado dos campos type=image do output_schema da variante.
 * asset_fixo fica de fora (T8): a arte da biblioteca não é gerada — briefar
 * ela induziria o agente de imagem a recriá-la.
 */
export function imageBriefFromSchema(
  schema: ComponentOutputField[],
): string | null {
  const parts = schema
    .filter((f) => f.type === "image" && deriveFieldNature(f) !== "asset_fixo")
    .map((f) => {
      // Especificidade dedicada vence a orientação genérica.
      const base = (f.image_spec ?? "").trim() || (f.guidance ?? "").trim()
      const ex = (f.example ?? "").trim()
      const segs: string[] = []
      if (base && ex) segs.push(`${base} (ex.: ${ex})`)
      else if (base || ex) segs.push(base || ex)
      const aspect = (f.image_aspect ?? "").trim()
      if (aspect) segs.push(`proporção ${aspect}`)
      const w = f.image_width ?? null
      const h = f.image_height ?? null
      if (w && h) segs.push(`${w}x${h}px`)
      else if (w) segs.push(`largura ${w}px`)
      else if (h) segs.push(`altura ${h}px`)
      return segs.join(" · ")
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
    // T8: schema com campo imagem_gerada liga needs_image mesmo sem tag
    // canônica de imagem no skeleton — o slot vive no {{UPPER(key)}}.
    const needsImage = sb.needs_image || schemaHasGeneratedImage(schema)
    return {
      type: sb.type,
      label: m?.slotLabel?.trim() || m?.variant.name || sb.type,
      purpose,
      needs_image: needsImage,
      image_brief:
        needsImage && schema.length > 0 ? imageBriefFromSchema(schema) : null,
      image_aspect: sb.image_aspect,
      copy_spec: sb.copy_spec,
      tags,
      variant_id: m?.variant.id ?? null,
      variant_name: m?.variant.name ?? null,
      fields:
        schema.length > 0
          ? fieldsFromSchema(
              schema,
              m ? effectiveVariantHtml(m.variant) : undefined,
            )
          : fieldsFromTags(tags),
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
    // T8: campo imagem_gerada no schema da variante casada liga needs_image
    // (o slot é o {{UPPER(key)}} do HTML tagueado, não uma tag canônica).
    const needsImage = b.needs_image || schemaHasGeneratedImage(schema)
    const curatedBrief =
      needsImage && schema.length > 0 ? imageBriefFromSchema(schema) : null

    let fields: BlueprintFieldV2[]
    if (schema.length > 0) {
      fields = fieldsFromSchema(
        schema,
        m ? effectiveVariantHtml(m.variant) : undefined,
      )
    } else if (tags.length > 0) {
      fields = fieldsFromTags(tags)
    } else {
      fields = fieldsFromCopySpec(b.copy_spec ?? [])
    }

    return {
      ...b,
      purpose: curatedPurpose || b.purpose,
      needs_image: needsImage,
      image_brief: curatedBrief ?? b.image_brief ?? null,
      variant_id: m?.variant.id ?? b.variant_id ?? null,
      variant_name: m?.variant.name ?? b.variant_name ?? null,
      fields,
    }
  })
  return { ...blueprint, blocks }
}

export interface BlockAnchorIssue extends SchemaAnchorIssue {
  block_index: number
  variant_id: string
  variant_name: string
}

/**
 * Varre as variantes casadas e junta todo campo de schema sem `{{UPPER(key)}}`
 * no HTML. Roda nas DUAS rotas (o `match` é o mesmo) e vai inteiro para a
 * telemetria do blueprint: lista vazia = biblioteca alinhada com o schema.
 */
export function collectSchemaAnchorIssues(
  match: MatchResult | null,
): BlockAnchorIssue[] {
  if (!match) return []
  const out: BlockAnchorIssue[] = []
  for (const [blockIndex, m] of match.matches) {
    const schema = m.variant.output_schema ?? []
    if (schema.length === 0) continue
    for (const issue of schemaAnchorIssues(
      schema,
      effectiveVariantHtml(m.variant),
    )) {
      out.push({
        ...issue,
        block_index: blockIndex,
        variant_id: m.variant.id,
        variant_name: m.variant.name,
      })
    }
  }
  return out.sort((a, b) => a.block_index - b.block_index)
}

function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>()
  return items.filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
}

/** O schema declara ao menos um campo de imagem GERADA (T8). */
function schemaHasGeneratedImage(schema: ComponentOutputField[]): boolean {
  return schema.some((f) => deriveFieldNature(f) === "imagem_gerada")
}
