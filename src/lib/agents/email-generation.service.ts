/**
 * Email Generation Service — REDUZIDO ao re-export de buildImagePromptVars.
 *
 * O executor síncrono legado (`generateEmail`, rota generate-flow) foi
 * REMOVIDO no corte seco do split do agente HTML (migration 20261039): ele
 * invocava o html.chain monolítico, que deixou de existir — o caminho real
 * de produção é o phase2-runner (imagem → hero → texto → imagem → cores →
 * QA), disparado pelo callback de copy/watchdog.
 *
 * buildImagePromptVars vive em image/prompt-vars-builder.ts (reuso pelo
 * pipeline de imagens de campanha); o re-export preserva os importadores
 * históricos deste módulo (phase2-runner, resolve-block-prompt).
 */

import {
  buildImagePromptVars,
  type ImagePromptVarsInput,
} from "./image/prompt-vars-builder"

export { buildImagePromptVars }
export type { ImagePromptVarsInput }
