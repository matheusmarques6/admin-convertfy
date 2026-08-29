/**
 * Ida e volta entre as três tabelas e a linha única que a tela edita.
 * Módulo PURO — sem I/O, sem React. Toda a decisão de precedência mora aqui.
 *
 * O problema que ele resolve: `email_blueprints` e `email_outline_templates`
 * descrevem o MESMO e-mail com vocabulários diferentes e podem divergir. Hoje
 * divergem de fato — `abandoned_cart` #1 tem 6 blocos no blueprint e 7
 * categorias no outline; `upsell` #1 tem 16 contra 8.
 *
 * ── Precedência (documentada porque é escolha, não acaso) ──
 *
 * Sequência de blocos: o BLUEPRINT vence. É ele que o `seedBlocksFromBlueprint`
 * transforma em linhas de `email_blocks`, e é ele que carrega label, purpose,
 * needs_image e image_brief — o outline só tem a categoria. Categorias que
 * existem apenas no outline não são inseridas às cegas (não há posição
 * confiável para elas): saem em `outline_extras` para a tela avisar e o
 * curador decidir. Blueprint vazio → o outline vira a sequência.
 *
 * Intenção: blueprint.objective, caindo para outline.objective. É a mesma
 * ordem que `email-copy-webhook.service` já usa no payload de copy
 * (`bp?.objective ?? outline?.objective`).
 *
 * "O e-mail deve": outline.guidance, caindo para blueprint.messaging. Os dois
 * são prosa hoje e viram UMA linha; quem re-curar quebra em diretrizes. O
 * split devolve o mesmo texto para os dois campos — a partir daí não divergem
 * mais.
 *
 * Tipo do bloco: a categoria da biblioteca É um `block_type` válido desde a
 * migration 20261090, então a categoria vai direto. O tipo técnico original
 * (`coupon`, `testimonials`, `text`…) fica em `legacy_type` e é preservado no
 * split enquanto o usuário não trocar a categoria — reescrever o tipo de 34
 * linhas históricas sem necessidade só criaria ruído no diff do seed.
 */

import type { BlueprintBlockDef } from "@/lib/agents/email-blueprint"
import {
  blockTypeToCategory,
  COMPONENT_CATEGORY_KEYS,
} from "@/lib/agents/shared/component-categories"
import type {
  ArchBlock,
  EmailArchitectureRow,
  FlowTemplateRow,
  RawBlueprint,
  RawOutline,
  SplitPayloads,
} from "./types"

/** Texto multilinha → lista de diretrizes (uma por linha, sem vazias). */
export function textToGuides(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Lista de diretrizes → texto multilinha. Lista vazia vira null. */
export function guidesToText(lines: string[]): string | null {
  const clean = lines.map((l) => l.trim()).filter(Boolean)
  return clean.length > 0 ? clean.join("\n") : null
}

/**
 * Categoria de um bloco do blueprint. Um tipo que JÁ é categoria passa
 * direto; o técnico traduz por `blockTypeToCategory`; o desconhecido cai em
 * `body`, que é o genérico de texto — nunca sumir com o bloco.
 */
export function categoryOfBlockType(type: string): string {
  const t = (type ?? "").trim().toLowerCase()
  if (COMPONENT_CATEGORY_KEYS.includes(t)) return t
  return blockTypeToCategory(t) ?? "body"
}

/** Id estável dentro da linha — o mesmo bloco pode repetir na sequência. */
function blockId(flowType: string, emailNumber: number, index: number): string {
  return `${flowType}:${emailNumber}:${index}`
}

/**
 * Sequência unificada + o que o outline tinha a mais.
 *
 * Comparação por MULTICONJUNTO, não por posição: o outline não tem posição
 * confiável (é outra granularidade), então "sobrou" é o que ele lista além
 * das ocorrências que o blueprint já cobre. Sem isso, `abandoned_cart` #1
 * acusaria 7 extras em vez de 1.
 */
export function mergeBlocks(
  flowType: string,
  emailNumber: number,
  blueprintBlocks: BlueprintBlockDef[],
  suggested: string[],
): { blocks: ArchBlock[]; outlineExtras: string[] } {
  const bpBlocks = Array.isArray(blueprintBlocks) ? blueprintBlocks : []
  const sug = (Array.isArray(suggested) ? suggested : [])
    .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
    .filter(Boolean)

  // Blueprint vazio: o outline É a sequência (nada a perder, nada a comparar).
  if (bpBlocks.length === 0) {
    return {
      blocks: sug.map((cat, i) => ({
        id: blockId(flowType, emailNumber, i),
        category: categoryOfBlockType(cat),
        label: "",
        purpose: "",
        needs_image: false,
        image_brief: null,
        legacy_type: null,
      })),
      outlineExtras: [],
    }
  }

  const blocks: ArchBlock[] = bpBlocks.map((b, i) => {
    const category = categoryOfBlockType(b.type)
    return {
      id: blockId(flowType, emailNumber, i),
      category,
      label: b.label ?? "",
      purpose: b.purpose ?? "",
      needs_image: Boolean(b.needs_image),
      image_brief: b.image_brief ?? null,
      // Só é legado quando o tipo NÃO é a própria categoria.
      legacy_type: b.type && b.type !== category ? b.type : null,
    }
  })

  // Desconta uma ocorrência do outline por bloco do blueprint da mesma
  // categoria; o que restar é o que só o outline conhece.
  const remaining = new Map<string, number>()
  for (const cat of sug) {
    const key = categoryOfBlockType(cat)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }
  for (const b of blocks) {
    const n = remaining.get(b.category)
    if (n) remaining.set(b.category, n - 1)
  }
  const outlineExtras: string[] = []
  for (const [cat, n] of remaining) {
    for (let i = 0; i < n; i++) outlineExtras.push(cat)
  }

  return { blocks, outlineExtras }
}

/**
 * Junta régua + blueprint + outline nas linhas que a tela edita.
 *
 * A régua manda em quais e-mails existem. Um blueprint/outline órfão (par
 * sem linha na régua) ainda aparece — some da tela seria pior que mostrar
 * um e-mail fora da régua, que o curador remove com um clique.
 */
export function mergeRows(
  flowTemplates: FlowTemplateRow[],
  blueprints: RawBlueprint[],
  outlines: RawOutline[],
): EmailArchitectureRow[] {
  const key = (f: string, n: number) => `${f}:${n}`
  const bpBy = new Map(blueprints.map((b) => [key(b.flow_type, b.email_number), b]))
  const olBy = new Map(outlines.map((o) => [key(o.flow_type, o.email_number), o]))
  const ftBy = new Map(
    flowTemplates.map((t) => [key(t.flow_type, t.email_number), t]),
  )

  const pairs = new Set<string>([...ftBy.keys(), ...bpBy.keys(), ...olBy.keys()])

  const rows: EmailArchitectureRow[] = []
  for (const k of pairs) {
    const ft = ftBy.get(k) ?? null
    const bp = bpBy.get(k) ?? null
    const ol = olBy.get(k) ?? null
    const flowType = ft?.flow_type ?? bp?.flow_type ?? ol?.flow_type ?? ""
    const emailNumber =
      ft?.email_number ?? bp?.email_number ?? ol?.email_number ?? 0
    if (!flowType || !emailNumber) continue

    const { blocks, outlineExtras } = mergeBlocks(
      flowType,
      emailNumber,
      bp?.blocks ?? [],
      ol?.suggested_blocks ?? [],
    )

    rows.push({
      flow_type: flowType,
      email_number: emailNumber,
      name: ft?.name ?? `${flowType} ${emailNumber}`,
      delay_hours: ft?.delay_hours ?? 0,
      is_active: ft?.is_active ?? ol?.is_active ?? true,
      intent: bp?.objective?.trim() || ol?.objective?.trim() || "",
      should: textToGuides(ol?.guidance ?? bp?.messaging ?? null),
      should_not: textToGuides(ol?.restrictions ?? null),
      blocks,
      outline_extras: outlineExtras,
      subject_hint: bp?.subject_hint ?? null,
      tone: bp?.tone_override ?? ol?.tone_hint ?? null,
      coupon_code: ol?.coupon_code ?? null,
      text_only: Boolean(bp?.text_only),
      blueprint_id: bp?.id ?? null,
      outline_id: ol?.id ?? null,
      flow_template_id: ft?.id ?? null,
      updated_at: ft?.updated_at ?? bp?.updated_at ?? null,
    })
  }

  return rows.sort(
    (a, b) =>
      a.flow_type.localeCompare(b.flow_type) || a.email_number - b.email_number,
  )
}

/**
 * A linha da tela de volta nos três payloads.
 *
 * `objective` e `messaging` do blueprint recebem o MESMO texto de
 * `intent`/`should` que o outline — é a duplicação que sobra por manter as
 * duas tabelas, e é deliberada: com um único ponto de escrita elas param de
 * divergir, e os seis consumidores do pipeline seguem sem alteração.
 *
 * `messaging` é NOT NULL no banco: sem diretriz, cai na intenção, e sem
 * intenção cai numa string vazia — o INSERT nunca estoura por isso.
 */
export function splitRow(row: EmailArchitectureRow): SplitPayloads {
  const intent = row.intent.trim()
  const shouldText = guidesToText(row.should)

  const blocks: BlueprintBlockDef[] = row.blocks.map((b) => ({
    // A categoria é o tipo, exceto quando o bloco veio do vocabulário
    // antigo e o curador não mexeu nele.
    type:
      b.legacy_type && categoryOfBlockType(b.legacy_type) === b.category
        ? b.legacy_type
        : b.category,
    label: b.label.trim() || b.category,
    purpose: b.purpose.trim(),
    needs_image: Boolean(b.needs_image),
    image_brief: b.image_brief?.trim() || null,
  }))

  return {
    blueprint: {
      flow_type: row.flow_type,
      email_number: row.email_number,
      objective: intent,
      messaging: shouldText ?? intent,
      subject_hint: row.subject_hint?.trim() || null,
      tone_override: row.tone?.trim() || null,
      blocks,
      text_only: Boolean(row.text_only),
    },
    outline: {
      flow_type: row.flow_type,
      email_number: row.email_number,
      objective: intent,
      guidance: shouldText,
      restrictions: guidesToText(row.should_not),
      suggested_blocks: row.blocks.map((b) => b.category),
      tone_hint: row.tone?.trim() || null,
      coupon_code: row.coupon_code?.trim().toUpperCase() || null,
      is_active: row.is_active,
    },
    flowTemplate: {
      flow_type: row.flow_type,
      email_number: row.email_number,
      name: row.name.trim() || `${row.flow_type} ${row.email_number}`,
      delay_hours: Math.max(0, Math.trunc(row.delay_hours || 0)),
      is_active: row.is_active,
    },
  }
}

/** Rótulo curto do intervalo, como na maquete ("Imediato", "6h", "3d"). */
export function delayLabel(hours: number): string {
  const h = Math.max(0, Math.trunc(hours || 0))
  if (h === 0) return "Imediato"
  if (h < 24) return `${h}h`
  if (h % 24 === 0) return `${h / 24}d`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}
