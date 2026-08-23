/**
 * Aspect ratio resolution + dimensoes para o image agent (story AE-12).
 *
 * Define os aspect ratios suportados pelo pipeline e a matriz por
 * (flow_type, email_number) usada quando o blueprint nao define override.
 *
 * Resolucao em ordem de prioridade:
 *   1. `blueprint.image_aspect` (override explicito)
 *   2. Matriz `WELCOME_ASPECT_BY_EMAIL` (por flow_type + email_number)
 *   3. Default `"4:5"`
 *
 * @see docs/stories/AE-12.image-aspect-ratio-resize.md
 */

import type { OverlaySpec } from "./overlay-luminance"

export type AspectKey =
  | "4:5"
  | "3:5"
  | "4:3"
  | "1:1"
  | "3:4"
  | "16:9"
  | "2:1"
  | "9:16"

const DIMENSIONS: Record<AspectKey, { width: number; height: number }> = {
  "4:5": { width: 1200, height: 1500 },
  "3:5": { width: 720, height: 1200 },
  "4:3": { width: 1200, height: 900 },
  "1:1": { width: 1200, height: 1200 },
  "3:4": { width: 900, height: 1200 },
  "16:9": { width: 1600, height: 900 },
  "2:1": { width: 1600, height: 800 },
  "9:16": { width: 900, height: 1600 },
}

// Matriz por (flow_type, email_number). Para flows nao mapeados, usa default.
const WELCOME_ASPECT_BY_EMAIL: Record<number, AspectKey> = {
  1: "4:5",
  2: "4:5",
  3: "3:5",
  4: "4:5",
  5: "4:3",
  6: "4:5",
}

export function getAspectDimensions(aspect: AspectKey): {
  width: number
  height: number
} {
  return DIMENSIONS[aspect]
}

export function isAspectKey(s: unknown): s is AspectKey {
  return (
    s === "4:5" ||
    s === "3:5" ||
    s === "4:3" ||
    s === "1:1" ||
    s === "3:4" ||
    s === "16:9" ||
    s === "2:1" ||
    s === "9:16"
  )
}

/**
 * Aspect POR BLOCO a partir dos blocks do blueprint: casa o email_block
 * (position 1-based) com blueprint.blocks[position-1], guardado por type
 * (mesma convenção do dispatch de copy — fallback pro próprio índice para
 * rows legadas 0-based). null se não casar ou o bloco não tiver aspect.
 */
export function blockAspectFromBlueprint(
  blueprintBlocks: Array<{ type?: string; image_aspect?: string | null }> | null | undefined,
  position: number | null | undefined,
  blockType: string | null | undefined,
): string | null {
  if (!Array.isArray(blueprintBlocks) || position == null || !blockType) {
    return null
  }
  const byIndex = (i: number) => {
    const cand = blueprintBlocks[i]
    return cand && cand.type === blockType ? cand : null
  }
  const matched = byIndex(position - 1) ?? byIndex(position)
  return matched?.image_aspect ?? null
}

/**
 * Dimensões EXATAS declaradas no campo de imagem do bloco (image_width ×
 * image_height do output_schema, persistidas em blocks[].fields). Casa o
 * email_block (position 1-based) com blueprint.blocks[position-1] por type
 * (mesma convenção do dispatch/aspect).
 *
 * `fieldKey` escolhe DE QUAL slot vêm as dims — obrigatório desde que a
 * geração passou a ser por campo: num bloco de produtos a foto grande é
 * 314×733 e as miniaturas 160×182, e gerar as quatro no tamanho da primeira
 * entrega três imagens com o enquadramento errado. Sem `fieldKey` (ou com
 * key que não existe) mantém o comportamento antigo — o PRIMEIRO field
 * type=image com largura E altura > 0 —, que é o certo para bloco de
 * imagem única e para snapshots legados.
 *
 * null quando nada declarado: o caller cai no aspect tipado.
 */
export function imageDimsFromBlueprint(
  blueprintBlocks:
    | Array<{
        type?: string
        fields?: Array<{
          key?: string
          type?: string
          image_width?: number | null
          image_height?: number | null
        }>
      }>
    | null
    | undefined,
  position: number | null | undefined,
  blockType: string | null | undefined,
  fieldKey?: string | null,
): { width: number; height: number } | null {
  if (!Array.isArray(blueprintBlocks) || position == null || !blockType) {
    return null
  }
  const byIndex = (i: number) => {
    const cand = blueprintBlocks[i]
    return cand && cand.type === blockType ? cand : null
  }
  const matched = byIndex(position - 1) ?? byIndex(position)
  const fields = Array.isArray(matched?.fields) ? matched.fields : []
  const dimsOf = (f: {
    image_width?: number | null
    image_height?: number | null
  }): { width: number; height: number } | null => {
    const w = f.image_width ?? 0
    const h = f.image_height ?? 0
    return w > 0 && h > 0 ? { width: w, height: h } : null
  }
  if (fieldKey) {
    const exact = fields.find((f) => f.type === "image" && f.key === fieldKey)
    if (exact) return dimsOf(exact)
  }
  for (const f of fields) {
    if (f.type !== "image") continue
    const d = dimsOf(f)
    if (d) return d
  }
  return null
}

/**
 * Aspect do SLOT, com fallback na cascata do bloco. O `image_aspect` vive no
 * campo desde o épico Taguedor (62 dos 76 campos da biblioteca o declaram),
 * mas até a geração virar por campo ninguém o lia — todo slot herdava o
 * aspect do bloco. Numa variante que mistura 9:16 (foto grande) com 4:5
 * (miniaturas), herdar é gerar errado.
 */
export function resolveAspectForField(input: {
  fieldAspect?: string | null
  blockAspect?: AspectKey | string | null
  blueprintAspect?: AspectKey | string | null
  flowType?: string | null
  emailNumber?: number | null
}): AspectKey {
  if (input.fieldAspect && isAspectKey(input.fieldAspect)) {
    return input.fieldAspect
  }
  return resolveAspectForBlock(input)
}

export function resolveAspectForBlock(input: {
  /**
   * Aspect POR BLOCO (blocks[].image_aspect) — derivado das tags de imagem
   * do reference via tag-registry (esqueleto determinístico). Prioridade
   * máxima: o template sabe a geometria do próprio slot.
   */
  blockAspect?: AspectKey | string | null
  blueprintAspect?: AspectKey | string | null
  flowType?: string | null
  emailNumber?: number | null
}): AspectKey {
  // 0. Aspect do BLOCO (tags do template) vence tudo
  if (input.blockAspect && isAspectKey(input.blockAspect)) {
    return input.blockAspect
  }
  // 1. Override do blueprint (nível email) vence matriz/default
  if (input.blueprintAspect && isAspectKey(input.blueprintAspect)) {
    return input.blueprintAspect
  }
  // 2. Matriz por flow_type + email_number
  if (input.flowType === "welcome" && input.emailNumber != null) {
    const fromMatrix = WELCOME_ASPECT_BY_EMAIL[input.emailNumber]
    if (fromMatrix) return fromMatrix
  }
  // 3. Default
  return "4:5"
}

/**
 * Frase a injetar no prompt master pra orientar o modelo a compor com o
 * aspect ratio alvo. O resize pos-geracao via `sharp` garante a dimensao
 * final, mas a instrucao influencia composicao (modelo centraliza
 * produto, deixa area pra overlay etc.).
 */
/** gcd para reduzir W:H a uma proporção legível (600x700 → 6:7). */
function reduceRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(w, h) || 1
  return `${w / g}:${h / g}`
}

/**
 * Instrução de proporção quando o slot declara dimensões EXATAS
 * (image_width × image_height do schema). Espelha aspectInstructionForPrompt,
 * mas com o frame exato do designer. SYNC CONTRACT com o phase2-runner e o
 * resolve-block-prompt.
 */
/**
 * Frase da reserva de overlay.
 *
 * Era um booleano que só sabia dizer "bottom 30%" — e a biblioteca pede o
 * contrário: `welcome - hero section 4` põe a foto como fundo de TUDO e
 * quer os **43% de cima** limpos ("parede lisa em tom neutro quente
 * ocupando os 43% superiores, para receber todo o overlay"). Um booleano
 * não carrega lado nem fração, então a instrução saía errada mesmo ligada.
 * Agora vem do cadastro, via `overlaySpec`.
 */
function overlaySentence(overlay: OverlaySpec | null | undefined): string {
  if (!overlay) return ""
  const pct = Math.round(overlay.fraction * 100)
  return (
    ` Reserve the ${overlay.side} ${pct}% of the frame as a clean, unobstructed band` +
    " for text overlay — no subject, no hard shadow, no busy detail there;" +
    " the rest of the composition must sit outside that band."
  )
}

export function dimsInstructionForPrompt(
  width: number,
  height: number,
  overlay?: OverlaySpec | null,
): string {
  const orientation =
    width > height
      ? "horizontal landscape"
      : width === height
        ? "square"
        : "vertical portrait"
  return (
    `Render the image at exactly ${width}x${height} pixels (${orientation} composition, proportion ${reduceRatio(width, height)}) — compose for this exact frame.` +
    overlaySentence(overlay)
  )
}

export function aspectInstructionForPrompt(
  aspect: AspectKey,
  overlay?: OverlaySpec | null,
): string {
  const dims = DIMENSIONS[aspect]
  const orientation =
    dims.width > dims.height
      ? "horizontal landscape"
      : dims.width === dims.height
        ? "square"
        : "vertical portrait"
  return (
    `Render the image with a ${aspect} aspect ratio (${orientation} composition, ~${dims.width}x${dims.height}).` +
    overlaySentence(overlay)
  )
}
