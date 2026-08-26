/**
 * Normalização das seções do outline (estrutura geral) → categorias da
 * biblioteca de componentes. Puro (sem I/O), usado pelo Montador.
 *
 * O outline guarda os blocos pelos RÓTULOS humanos ("Value Proposition / Body",
 * "Produtos / Grade", "Reviews / Prova Social", "Oferta / Promo"...), não pelas
 * chaves. O matcher abaixo é TOLERANTE: tenta match exato (chave de categoria
 * ou block_type técnico) e, se falhar, mapeia por palavra-chave — senão o
 * resolveSections dropava esses blocos e o Montador recebia um email mutilado.
 */
import {
  blockTypeToCategory,
  COMPONENT_CATEGORY_KEYS,
} from "../shared/component-categories"
import type { EmailOutlineTemplate } from "@/types/email-generation"

const FALLBACK_SECTIONS = ["header", "hero", "body", "products", "footer"]

export interface OutlineSection {
  /** Categoria da biblioteca (8): header/hero/body/products/reviews/cta/offer/footer. */
  section: string
  /** Rótulo original do outline (preserva a intenção: "USP icons", "Grade"...). */
  label: string
}

/** Mapeia um rótulo humano de bloco → categoria, por palavra-chave. */
function categoryByKeyword(s: string): string | null {
  const has = (...words: string[]) => words.some((w) => s.includes(w))
  // Ordem importa: checa o específico antes de "body" (mais abrangente).
  if (has("footer", "rodap")) return "footer"
  if (has("header", "navega", "menu", "topo")) return "header"
  if (has("hero", "banner", "capa")) return "hero"
  if (has("produto", "products", "grade", "catalog", "vitrine")) return "products"
  if (
    has("review", "prova social", "depoiment", "testimonial", "social proof", "avalia")
  )
    return "reviews"
  if (has("oferta", "promo", "desconto", "cupom", "coupon", "offer", "discount"))
    return "offer"
  if (has("cta", "call to action", "botão", "botao", "button")) return "cta"
  if (
    has(
      "value proposition",
      "usp",
      "benefíc",
      "benefic",
      "feature",
      "diferenc",
      "body",
      "texto",
      "story",
      "sobre",
    )
  )
    return "body"
  return null
}

/** Resolve a categoria de UM item do outline (exato → block_type → keyword). */
export function categoryForOutlineItem(item: string): string | null {
  const key = item.trim().toLowerCase()
  if (!key) return null
  const exact = COMPONENT_CATEGORY_KEYS.includes(key)
    ? key
    : blockTypeToCategory(key)
  if (exact) return exact
  return categoryByKeyword(key)
}

/**
 * Estrutura ordenada do outline: categoria + rótulo original por bloco.
 * Preserva ordem e repetições; descarta itens que não casam com nada.
 * Se nada sobrar, retorna a estrutura mínima de fallback.
 */
export function resolveStructure(
  outline: EmailOutlineTemplate | null,
): OutlineSection[] {
  const out: OutlineSection[] = []
  for (const item of outline?.suggested_blocks ?? []) {
    const section = categoryForOutlineItem(item)
    if (section) out.push({ section, label: item.trim() })
  }
  if (out.length > 0) return out
  return FALLBACK_SECTIONS.map((s) => ({ section: s, label: s }))
}

/**
 * Normaliza as seções do outline para as 8 categorias da biblioteca,
 * preservando ordem e repetições. Mantido para compat (candidatos/fallback).
 */
export function resolveSections(
  outline: EmailOutlineTemplate | null,
): string[] {
  return resolveStructure(outline).map((s) => s.section)
}

/**
 * Limita a estrutura a no máximo `max` blocos SEM cortar as bordas: preserva
 * a abertura (header/hero...) e o footer (compliance/descadastro), aparando o
 * MIOLO. Cortar a cauda direto (slice(0,max)) removeria o footer e o CTA/oferta
 * finais — regressão legal e de conversão.
 */
export function clampStructure<T extends { section: string }>(
  structure: T[],
  max: number,
): T[] {
  if (!Number.isFinite(max) || max < 1 || structure.length <= max) {
    return structure
  }
  const last = structure[structure.length - 1]
  const footer = last?.section === "footer" ? last : null
  const head = footer ? structure.slice(0, -1) : structure
  // Reserva 1 slot para o footer quando ele existe; mantém a abertura e
  // apara o miolo pelo fim.
  const room = footer ? Math.max(1, max - 1) : max
  const trimmed = head.slice(0, room)
  return footer ? [...trimmed, footer] : trimmed
}
