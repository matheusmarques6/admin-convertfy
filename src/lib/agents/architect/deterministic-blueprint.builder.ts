/**
 * Builder determinístico do blueprint (substitui o LLM Blueprint na rota A).
 *
 * Recebe os SLOTS do Curador (variantes escolhidas, na ordem da estrutura
 * do outline — que é a ordem do documento montado) e monta o blueprint SEM
 * LLM: um bloco por slot de variante, purpose ← copy_guidance, image_brief
 * ← campos de imagem do output_schema, fields (contrato v2 do n8n) ←
 * output_schema. Sem schema (rota LLM) → conversão do copy_spec.
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
import {
  auditImageAnchors,
  auditSchemaAnchors,
} from "@/lib/email-workspace/schema-example-coherence"
import {
  deriveFieldNature,
  placeholderForKey,
} from "../shared/component-dimensions"
import { extractImageSlotNotes } from "../image/extract-image-slot-notes"
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
 * Rota A NOVA (endereçamento sem placeholder): o match não depende mais do
 * skeleton por tags — os SLOTS do Curador SÃO a estrutura do documento (o
 * assembleDocument monta uma seção por slot de variante, na ordem). Um
 * bloco por slot, coverage sempre 1 (o gate da rota é "todo slot tem
 * schema", checado pelo roteador).
 */
export function matchFromSlots(slots: AssemblySlot[]): MatchResult {
  const matches = new Map<number, VariantMatch>()
  let copyBlocks = 0
  const variantSlots = slots.filter(
    (s): s is Extract<AssemblySlot, { kind: "variant" }> => s.kind === "variant",
  )
  variantSlots.forEach((s, i) => {
    matches.set(i, { variant: s.variant, slotLabel: s.label })
    const hasCopy = (s.variant.output_schema ?? []).some(
      (f) => deriveFieldNature(f) === "copy",
    )
    if (hasCopy) copyBlocks++
  })
  return {
    matches,
    coverage: 1,
    copyBlocks,
    coveredCopyBlocks: copyBlocks,
    unusedVariantIds: [],
    unmatchedBlockIndexes: [],
  }
}

// ── fields v2 — as 3 origens ─────────────────────────────────────────

/**
 * Origem "schema": os campos definidos na variante (aba Componentes).
 *
 * O EXAMPLE É A BASE (20/08): o endereço de um campo no HTML é a própria
 * frase do `example` (texto) ou o token de atributo (imagem) — não existe
 * mais `tag` no snapshot. A coerência example×HTML é auditada pela régua
 * única (schema-example-coherence) e vai para a telemetria do blueprint;
 * quem conserta é o cadastro da variante, não o resolvedor em geração.
 */
export function fieldsFromSchema(
  schema: ComponentOutputField[],
  // HTML da variante — quando presente, extrai o comentário do <td>/<tr> de
  // cada slot de imagem legado {{TAG}} (slot_note). Ausente → sem slot_note.
  variantHtml?: string,
): BlueprintFieldV2[] {
  // slot_note LEGADO: só variantes antigas com {{UPPER(key)}} de imagem no
  // HTML carregam comentário de direção de arte colado no slot. A biblioteca
  // por token não usa placeholder — o lookup simplesmente não acha nada.
  const imageTags = schema
    .filter((f) => f.type === "image")
    .map((f) => placeholderForKey(f.key.trim()))
    .filter((t): t is string => !!t)
  const slotNotes =
    variantHtml && imageTags.length > 0
      ? extractImageSlotNotes(variantHtml, imageTags)
      : {}

  return schema.map((f) => {
    const key = f.key.trim()
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
      source: "schema",
    }
    if (f.type === "image") {
      const legacyTag = placeholderForKey(key)
      base.image_spec = f.image_spec ?? null
      base.image_aspect = f.image_aspect ?? null
      base.image_width = f.image_width ?? null
      base.image_height = f.image_height ?? null
      base.slot_note = (legacyTag && slotNotes[legacyTag]) || null
    }
    return base
  })
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

// ── Rota A — blueprint 100% determinístico (por SLOTS, sem skeleton) ──

export function buildDeterministicBlueprint(input: {
  slots: AssemblySlot[]
  match: MatchResult
  outline: EmailOutlineTemplate | null
}): GeneratedBlueprint {
  const { slots, match, outline } = input
  const variantSlots = slots.filter(
    (s): s is Extract<AssemblySlot, { kind: "variant" }> => s.kind === "variant",
  )

  const blocks: GeneratedBlock[] = variantSlots.map((slot, i) => {
    const m = match.matches.get(i)
    const variant = m?.variant ?? slot.variant
    const schema = variant.output_schema ?? []
    const purpose =
      (variant.copy_guidance ?? "").trim() || (variant.description ?? "").trim()
    const needsImage = schemaHasGeneratedImage(schema)
    return {
      type: variant.block_type,
      label: (m?.slotLabel ?? slot.label)?.trim() || variant.name,
      purpose,
      needs_image: needsImage,
      image_brief:
        needsImage && schema.length > 0 ? imageBriefFromSchema(schema) : null,
      image_aspect: null,
      copy_spec: [],
      tags: [],
      variant_id: variant.id,
      variant_name: variant.name,
      fields: fieldsFromSchema(schema, variant.html),
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
    const curatedPurpose = (m?.variant.copy_guidance ?? "").trim()
    // T8: campo imagem_gerada no schema da variante casada liga needs_image
    // (o slot é o {{UPPER(key)}} do HTML tagueado, não uma tag canônica).
    const needsImage = b.needs_image || schemaHasGeneratedImage(schema)
    const curatedBrief =
      needsImage && schema.length > 0 ? imageBriefFromSchema(schema) : null

    const fields: BlueprintFieldV2[] =
      schema.length > 0
        ? fieldsFromSchema(schema, m?.variant.html)
        : fieldsFromCopySpec(b.copy_spec ?? [])

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

export interface BlockAnchorIssue {
  key: string
  /** Motivo do merge (nao_encontrado, frase_curta, ambiguo, token...). */
  motivo: string
  block_index: number
  variant_id: string
  variant_name: string
}

/**
 * Varre as variantes casadas e junta todo campo cujo EXAMPLE (texto) ou
 * TOKEN (imagem) não é encontrável no HTML — a régua única
 * (schema-example-coherence, D7). Roda nas DUAS rotas e vai inteiro para a
 * telemetria do blueprint: lista vazia = biblioteca alinhada.
 */
export function collectSchemaAnchorIssues(
  match: MatchResult | null,
): BlockAnchorIssue[] {
  if (!match) return []
  const out: BlockAnchorIssue[] = []
  for (const [blockIndex, m] of match.matches) {
    const schema = m.variant.output_schema ?? []
    if (schema.length === 0) continue
    const html = m.variant.html ?? ""
    const text = auditSchemaAnchors(html, schema)
    const image = auditImageAnchors(html, schema)
    for (const issue of [...text.missing, ...image.missing]) {
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

/** O schema declara ao menos um campo de imagem GERADA (T8). */
function schemaHasGeneratedImage(schema: ComponentOutputField[]): boolean {
  return schema.some((f) => deriveFieldNature(f) === "imagem_gerada")
}
