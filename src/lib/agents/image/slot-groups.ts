/**
 * slot-groups — agrupa os slots de imagem de um bloco e elege a ÂNCORA de
 * cada grupo. É a peça que permite gerar N imagens por bloco (uma por campo
 * `imagem_gerada` do schema) mantendo a coerência que o cadastro exige.
 *
 * Por que existe: o motor gerava UMA imagem por bloco e a variante
 * `produtos 7 - dois produtos` declara OITO slots — sete `<img>` saíam com
 * `src=""` (ícone quebrado) no e-mail do cliente. Gerar os oito de forma
 * independente também não serve: os `image_spec` do cadastro amarram os
 * slots entre si ("o mesmo item e cor", "mesmo enquadramento e mesma luz do
 * painel 1, com modelo diferente e cor diferente", "o ângulo mais fechado
 * dos três"). Miniatura precisa nascer DA foto grande, não ao lado dela.
 *
 * Daí o desenho âncora → dependentes: a maior imagem do grupo é gerada
 * primeiro e vira referência visual (img2img) das menores do MESMO grupo.
 * Grupos diferentes não se falam e correm em paralelo.
 *
 * Puro (zero I/O) — testável.
 */

import type { BlueprintBlockField } from "@/types/email-generation"
import { deriveFieldNature } from "../shared/component-dimensions"

/**
 * Slot que NÃO é fotografia: wordmark, lockup tipográfico, ícone de
 * line-art, selo. Modelo de imagem renderiza texto e traço fino mal, e o
 * cadastro desses campos pede "PNG transparente" — outro pipeline.
 *
 * A régua é a KEY, nunca o texto do `image_spec`. Testado contra a
 * biblioteca real: por key pega exatamente os 9 campos legítimos
 * (`brand_logo` ×3, `brand_lockup`, `feature_icon`, `verified_badge`,
 * `guarantee_1|2|3_icon`); por texto do spec dá falso positivo em
 * `hero_campanha_editorial` e `hero_campanha_monocromatica`, que são FOTOS
 * (JPG q80) cujo spec só menciona tipografia de passagem — e pular a foto
 * da hero seria bem pior que gerar um lockup torto.
 */
const LOCKUP_KEY_RE = /(lockup|logo|wordmark|icone?|icon|badge|selo)/i

export function isLockupSlot(key: string): boolean {
  return LOCKUP_KEY_RE.test(key.trim())
}

/**
 * Chave do grupo: o prefixo até o primeiro `_<dígitos>`.
 *   panel_1_main_photo → panel_1      panel_1_thumb_a → panel_1
 *   review_1_scene     → review_1     product_2_photo → product_2
 * Sem ordinal, o campo é o próprio grupo (singleton, sem dependentes).
 *
 * O `groupPrefix` de build-image-slots.ts NÃO serve aqui: ele remove um
 * SUFIXO de lista fixa, então `panel_1_main_photo` viraria `panel_1_main`
 * (grupo de um só) e `panel_1_thumb_a` viraria `""` (o sufixo é `_thumb_a`,
 * não `_thumb`) — os quatro slots do painel cairiam em grupos diferentes,
 * que é exatamente o que este módulo precisa evitar.
 */
export function slotGroupKey(key: string): string {
  const k = key.trim().toLowerCase()
  return /^([a-z]+_[0-9]+)/.exec(k)?.[1] ?? k
}

export interface SlotGroup {
  groupKey: string
  /** Gerada primeiro; vira referência visual das dependentes. */
  anchor: BlueprintBlockField
  /** Geradas depois, com a âncora como referência. Pode ser vazio. */
  dependents: BlueprintBlockField[]
}

const areaOf = (f: BlueprintBlockField): number =>
  (f.image_width ?? 0) * (f.image_height ?? 0)

/**
 * Grupos de slots fotográficos do bloco, na ordem em que aparecem no
 * schema. Campos que não são `imagem_gerada` e slots de lockup ficam fora.
 *
 * Âncora = maior área declarada (`image_width × image_height`). Área é o
 * critério certo porque miniatura é, por definição, menor que a foto que
 * ela acompanha — não depende de convenção de nome.
 *
 * EMPATE no topo devolve âncoras SEPARADAS, sem dependentes: duas imagens
 * do mesmo tamanho no mesmo grupo são fotos independentes, não main+thumb.
 * É o caso de `review_1` na variante `review 8` (duas de 120.000px²);
 * tratar uma como referência da outra imporia semelhança que o cadastro não
 * pediu. Sem dimensão declarada todas empatam em zero — e o resultado, de
 * novo, é cada uma por si, que é o comportamento seguro.
 */
export function imageSlotGroups(
  fields: readonly BlueprintBlockField[] | null | undefined,
): SlotGroup[] {
  const eligible = (fields ?? []).filter(
    (f) =>
      f?.key &&
      deriveFieldNature(f) === "imagem_gerada" &&
      !isLockupSlot(f.key),
  )

  const byGroup = new Map<string, BlueprintBlockField[]>()
  for (const f of eligible) {
    const g = slotGroupKey(f.key)
    const arr = byGroup.get(g)
    if (arr) arr.push(f)
    else byGroup.set(g, [f])
  }

  const out: SlotGroup[] = []
  for (const [groupKey, members] of byGroup) {
    const maxArea = Math.max(...members.map(areaOf))
    const tops = members.filter((f) => areaOf(f) === maxArea)
    if (tops.length > 1) {
      // Empate: cada uma é âncora de si mesma.
      for (const f of members) {
        out.push({ groupKey, anchor: f, dependents: [] })
      }
      continue
    }
    out.push({
      groupKey,
      anchor: tops[0],
      dependents: members.filter((f) => f !== tops[0]),
    })
  }
  return out
}

/** Todos os slots fotográficos, achatados na ordem de geração (âncoras primeiro). */
export function flattenGroups(
  groups: SlotGroup[],
): Array<{ field: BlueprintBlockField; groupKey: string; role: "anchor" | "dependent" }> {
  const anchors = groups.map((g) => ({
    field: g.anchor,
    groupKey: g.groupKey,
    role: "anchor" as const,
  }))
  const dependents = groups.flatMap((g) =>
    g.dependents.map((field) => ({
      field,
      groupKey: g.groupKey,
      role: "dependent" as const,
    })),
  )
  return [...anchors, ...dependents]
}

/** Um item de trabalho da fase de imagem: o slot de um bloco. */
export interface ImageWorkItem<B> {
  blk: B
  /** null = bloco sem schema de imagem (caminho legado, 1 imagem). */
  slot: { field: BlueprintBlockField; groupKey: string; role: "anchor" | "dependent" } | null
  blockPosition: number | null
  slotIndex: number
}

export interface ImageWorklist<B> {
  /** Onda 1: âncoras e singletons (e os blocos legados). */
  anchors: Array<ImageWorkItem<B>>
  /** Onda 2: dependentes, geradas com a âncora como referência visual. */
  dependents: Array<ImageWorkItem<B>>
  /** Slots de lockup/ícone pulados de propósito. */
  lockupSkipped: number
  /** Slots que o teto cortou (0 quando nada foi cortado). */
  droppedByCap: number
}

/**
 * Monta a worklist da fase de imagem a partir dos blocos e do teto.
 *
 * `fieldsOf` isola a leitura do schema (o bloco carrega `fields` desde a
 * migration 20261065; o blueprint é fallback), para que esta função continue
 * pura e testável sem banco.
 *
 * O teto conta IMAGENS. Um dependente cuja âncora foi cortada cai junto: ele
 * existe para casar com ela, e sozinho geraria uma miniatura de uma foto que
 * o e-mail não tem.
 */
export function buildImageWorklist<
  B extends { id: unknown; position?: number | null },
>(
  blocks: readonly B[],
  fieldsOf: (blk: B) => BlueprintBlockField[],
  cap: number,
  selectSlots: <T extends { blockPosition?: number | null; slotIndex: number }>(
    slots: T[],
    max: number,
  ) => T[],
): ImageWorklist<B> {
  const all: Array<ImageWorkItem<B>> = []
  let lockupSkipped = 0

  for (const blk of blocks) {
    const fields = fieldsOf(blk)
    lockupSkipped += fields.filter(
      (f) =>
        f?.key &&
        deriveFieldNature(f) === "imagem_gerada" &&
        isLockupSlot(f.key),
    ).length

    const groups = imageSlotGroups(fields)
    if (groups.length === 0) {
      all.push({
        blk,
        slot: null,
        blockPosition: blk.position ?? null,
        slotIndex: 0,
      })
      continue
    }
    const order = new Map(fields.map((f, i) => [f.key, i]))
    for (const item of flattenGroups(groups)) {
      all.push({
        blk,
        slot: item,
        blockPosition: blk.position ?? null,
        slotIndex: order.get(item.field.key) ?? 0,
      })
    }
  }

  const capped = selectSlots(all, cap)
  const survivingAnchors = new Set(
    capped
      .filter((w) => w.slot?.role !== "dependent")
      .map((w) => `${String(w.blk.id)}:${w.slot?.groupKey ?? ""}`),
  )
  const selected = capped.filter(
    (w) =>
      w.slot?.role !== "dependent" ||
      survivingAnchors.has(`${String(w.blk.id)}:${w.slot.groupKey}`),
  )

  return {
    anchors: selected.filter((w) => w.slot?.role !== "dependent"),
    dependents: selected.filter((w) => w.slot?.role === "dependent"),
    lockupSkipped,
    droppedByCap: all.length - selected.length,
  }
}
