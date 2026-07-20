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
export function aspectInstructionForPrompt(
  aspect: AspectKey,
  reserveBottom: boolean,
): string {
  const dims = DIMENSIONS[aspect]
  const orientation =
    dims.width > dims.height
      ? "horizontal landscape"
      : dims.width === dims.height
        ? "square"
        : "vertical portrait"
  let txt = `Render the image with a ${aspect} aspect ratio (${orientation} composition, ~${dims.width}x${dims.height}).`
  if (reserveBottom) {
    txt +=
      " Reserve the bottom 30% as a darker/cleaner area suitable for white text overlay."
  }
  return txt
}
