/**
 * Layout do mapa do Estúdio: as posições padrão dos nós e o resgate do
 * arranjo que o usuário arrastou (guardado no navegador dele).
 *
 * Puro de propósito — sem React, sem `window`. A regra que importa aqui é
 * testável e foi escrita depois de um incidente: ver `layoutSignature`.
 */

import { STUDIO_NODES } from "./studio-graph"

export type Positions = Record<string, { x: number; y: number }>

export function defaultPositions(): Positions {
  return Object.fromEntries(STUDIO_NODES.map((n) => [n.key, { x: n.x, y: n.y }]))
}

/**
 * Assinatura do CONJUNTO de nós do mapa.
 *
 * O layout arrastado pelo usuário é guardado chave a chave. Quando um
 * agente novo entra no pipeline, os nós existentes DESLOCAM para abrir
 * espaço — mas o layout salvo continua fixando cada um na coordenada
 * antiga, enquanto o nó novo, que não está lá, vai para a coordenada nova.
 * Foi o que aconteceu com o Estruturador e o Dispatch: cada um nasceu
 * exatamente EMBAIXO do vizinho que ocupava aquele ponto no mapa antigo,
 * invisível, e a impressão foi de que o deploy não tinha subido.
 *
 * Com a assinatura, o layout salvo só vale enquanto o mapa for o mesmo.
 * Mudou o conjunto de nós → volta ao padrão, que é o desenho feito COM o
 * agente novo no lugar certo. Custa o arrasto pessoal de quem tinha um,
 * uma vez — e é o que faz a próxima adição não sumir também.
 */
export function layoutSignature(): string {
  return STUDIO_NODES.map((n) => n.key)
    .sort()
    .join("|")
}

/** O que vai para o `localStorage`: posições + o mapa a que pertencem. */
export interface StoredLayout {
  sig: string
  pos: Positions
}

export function serializeLayout(pos: Positions): string {
  return JSON.stringify({ sig: layoutSignature(), pos } satisfies StoredLayout)
}

/**
 * Posições iniciais a partir do que estava salvo.
 *
 * Aproveita o arranjo salvo APENAS quando ele foi feito para este mesmo
 * mapa. Formato antigo (posições soltas, sem assinatura), JSON quebrado,
 * assinatura diferente ou nada salvo → layout padrão, inteiro.
 */
export function restoreLayout(raw: string | null | undefined): Positions {
  const base = defaultPositions()
  if (!raw) return base
  try {
    const parsed = JSON.parse(raw) as Partial<StoredLayout>
    if (parsed?.sig !== layoutSignature()) return base
    const pos = parsed.pos
    if (!pos || typeof pos !== "object") return base
    for (const k of Object.keys(base)) {
      const p = pos[k]
      if (p && typeof p.x === "number" && typeof p.y === "number") base[k] = p
    }
  } catch {
    /* layout corrompido → padrão */
  }
  return base
}
