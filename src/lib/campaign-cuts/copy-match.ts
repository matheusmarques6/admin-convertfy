/**
 * Associação copy↔porta para a Tela 2 "Subir Campanha por Loja".
 *
 * Os blocos de copy da loja (EmailDraftBlock, em ordem do documento) são
 * distribuídos nas portas do mapa de cortes (top→bottom) por VARREDURA
 * MONOTÔNICA com cursor: cada bloco vai para a primeira porta compatível
 * a partir do cursor e o cursor nunca volta — o layout do email segue a
 * mesma ordem vertical da copy.
 *
 * Prioridade de compatibilidade:
 *  1. `section` do bloco (HERO/PRODUCTS/OFFER… — vindo da normalização do
 *     callback n8n) casando com o TYPE da porta;
 *  2. type-compat do tipo do bloco (products→produtos, offer→cupom,
 *     button→cta, heading/image→hero|texto, text→texto|hero).
 *
 * divider é ignorado; footer vai para leftovers SEM marcar ambíguo
 * (rodapé nunca tem copy). Qualquer outro bloco sem porta é conteúdo
 * perdido → `ambiguous` (a UI abre a "copy completa" com aviso).
 */

import { PORT_TYPES, type CutPort, type CutPortType } from "@/types/campaign-cuts"
import type { EmailDraftBlock } from "@/types/campaign-central"
import { normalizeText } from "./detect"

export interface CopyMatchResult {
  /** port.id → blocos atribuídos (só portas com hasCopy). */
  byPort: Record<string, EmailDraftBlock[]>
  /** Blocos sem porta (footer sempre cai aqui; o resto marca ambiguous). */
  leftovers: EmailDraftBlock[]
  /** Conteúdo real ficou sem porta — a UI deve expor a copy completa. */
  ambiguous: boolean
}

/** section normalizada → type de porta. Desconhecida → null (usa type-compat). */
function sectionToPortType(section: string | undefined): CutPortType | null {
  if (!section) return null
  const s = normalizeText(section)
  if (s.includes("hero")) return "hero"
  if (s.includes("product") || s.includes("produto")) return "produtos"
  if (s.includes("offer") || s.includes("oferta") || s.includes("cupom")) return "cupom"
  if (s.includes("cta") || s.includes("button")) return "cta"
  if (s.includes("footer") || s.includes("rodape")) return "rodape"
  if (s.includes("header") || s.includes("cabecalho")) return "header"
  return null
}

/** Tipos de porta compatíveis com o TIPO do bloco, em ordem de preferência. */
function blockCompat(type: EmailDraftBlock["type"]): CutPortType[] {
  switch (type) {
    case "products":
      return ["produtos"]
    case "offer":
      return ["cupom"]
    case "button":
      return ["cta"]
    case "heading":
      return ["hero", "texto"]
    case "image":
      return ["hero"]
    case "text":
      return ["texto", "hero"]
    default:
      return []
  }
}

export function assignBlocksToPorts(
  ports: CutPort[],
  blocks: EmailDraftBlock[],
): CopyMatchResult {
  // Só portas que recebem copy, mantendo a ordem vertical.
  const copyPorts = ports.filter((p) => PORT_TYPES[p.type]?.hasCopy)

  const byPort: Record<string, EmailDraftBlock[]> = {}
  for (const p of copyPorts) byPort[p.id] = []
  const leftovers: EmailDraftBlock[] = []
  let ambiguous = false

  let cursor = 0

  for (const block of blocks) {
    if (block.type === "divider") continue
    if (block.type === "footer") {
      leftovers.push(block)
      continue
    }

    // 1. section explícita casa com type de porta a partir do cursor.
    const sectionType = sectionToPortType(block.section)
    let targetIdx = -1
    if (sectionType && PORT_TYPES[sectionType]?.hasCopy) {
      targetIdx = copyPorts.findIndex(
        (p, i) => i >= cursor && p.type === sectionType,
      )
    }

    // 2. type-compat: primeira porta compatível a partir do cursor.
    if (targetIdx < 0) {
      const compat = blockCompat(block.type)
      targetIdx = copyPorts.findIndex(
        (p, i) => i >= cursor && compat.includes(p.type),
      )
    }

    if (targetIdx >= 0) {
      byPort[copyPorts[targetIdx].id].push(block)
      cursor = targetIdx
    } else {
      leftovers.push(block)
      ambiguous = true
    }
  }

  return { byPort, leftovers, ambiguous }
}
