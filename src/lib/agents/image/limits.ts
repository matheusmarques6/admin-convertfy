/**
 * Limites de geração de imagem — Epic AE.
 *
 * Centraliza o teto de imagens IA por email para que o caminho de produção
 * (`phase2-runner.service.ts`) e o legado (`email-generation.service.ts`) usem
 * a MESMA constante e não divirjam.
 */

/**
 * Teto de segurança: máximo de IMAGENS geradas por email.
 *
 * Contava BLOCOS até 22/08, e a diferença não era acadêmica: o Welcome 1 da
 * Luxe Lift tinha 5 blocos marcados e o teto de 4 descartou o bloco de
 * reviews INTEIRO — as 3 imagens dele nunca foram pedidas e o e-mail saiu com
 * a seção de depoimentos toda quebrada. Contar imagens também é o que faz
 * sentido agora que um bloco gera uma imagem por slot do schema (a variante
 * `produtos 7 - dois produtos` sozinha declara 8).
 *
 * É guarda anti-runaway, não limite de produto: o valor está acima do que
 * qualquer e-mail real da biblioteca pede (o mais pesado hoje soma 16).
 */
export const MAX_AI_IMAGES = 24

interface PositionedBlock {
  position?: number | null
}

/**
 * Seleciona, de forma determinística, até `max` blocos que devem gerar imagem.
 * Ordena por `position` ascendente (prioriza o topo do email — hero costuma ser
 * position 1-2) e corta no teto. Função pura — testável sem mocks.
 *
 * Mantida para o caminho LEGADO (uma imagem por bloco). O caminho de produção
 * usa `selectImageSlots`, que corta por imagem.
 */
export function selectImageBlocks<T extends PositionedBlock>(
  blocks: T[],
  max: number = MAX_AI_IMAGES,
): T[] {
  return [...blocks]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .slice(0, Math.max(0, max))
}

/** Uma unidade de trabalho da fase de imagem: um slot de um bloco. */
export interface ImageSlotWork {
  /** `position` do email_block — ordena o corte (topo do email primeiro). */
  blockPosition?: number | null
  /** Ordem do campo dentro do schema do bloco — desempate estável. */
  slotIndex: number
}

/**
 * Corta a worklist no teto contando IMAGENS. Ordena por (position do bloco,
 * ordem do campo no schema): quando o teto aperta, o que sobrevive é o topo
 * do e-mail, e dentro do bloco a ordem que o designer cadastrou — que é a
 * mesma em que as âncoras vêm antes das miniaturas.
 *
 * Estável e pura. Não reordena a saída além do critério acima, para que o
 * fan-out seja reproduzível entre execuções.
 */
export function selectImageSlots<T extends ImageSlotWork>(
  slots: T[],
  max: number = MAX_AI_IMAGES,
): T[] {
  return [...slots]
    .sort(
      (a, b) =>
        (a.blockPosition ?? 0) - (b.blockPosition ?? 0) ||
        a.slotIndex - b.slotIndex,
    )
    .slice(0, Math.max(0, max))
}
