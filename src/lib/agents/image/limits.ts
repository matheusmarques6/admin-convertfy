/**
 * Limites de geração de imagem — Epic AE.
 *
 * Centraliza o teto de imagens IA por email para que o caminho de produção
 * (`phase2-runner.service.ts`) e o legado (`email-generation.service.ts`) usem
 * a MESMA constante e não divirjam.
 */

/**
 * Teto de segurança: máximo de imagens IA geradas por email. Cada bloco com
 * `needs_image=true` gera uma imagem; este teto evita que marcar muitos blocos
 * exploda custo/tempo de geração. Blocos no topo do email (menor `position`)
 * têm prioridade quando o teto é atingido.
 */
export const MAX_AI_IMAGES = 4

interface PositionedBlock {
  position?: number | null
}

/**
 * Seleciona, de forma determinística, até `max` blocos que devem gerar imagem.
 * Ordena por `position` ascendente (prioriza o topo do email — hero costuma ser
 * position 1-2) e corta no teto. Função pura — testável sem mocks.
 */
export function selectImageBlocks<T extends PositionedBlock>(
  blocks: T[],
  max: number = MAX_AI_IMAGES,
): T[] {
  return [...blocks]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .slice(0, Math.max(0, max))
}
