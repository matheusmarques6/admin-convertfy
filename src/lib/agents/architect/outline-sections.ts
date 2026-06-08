/**
 * Normalização das seções do outline (estrutura geral) → categorias da
 * biblioteca de componentes. Puro (sem I/O), usado pelo Montador.
 */
import {
  blockTypeToCategory,
  COMPONENT_CATEGORY_KEYS,
} from "../shared/component-categories"
import type { EmailOutlineTemplate } from "@/types/email-generation"

const FALLBACK_SECTIONS = ["header", "hero", "body", "products", "footer"]

/**
 * Normaliza as seções do outline para as 8 categorias da biblioteca,
 * preservando ordem e repetições. Aceita tanto seções (8) quanto tipos
 * técnicos (19, mapeados via blockTypeToCategory). Itens não reconhecidos
 * são ignorados; se nada sobrar, retorna a estrutura mínima de fallback.
 */
export function resolveSections(
  outline: EmailOutlineTemplate | null,
): string[] {
  const out: string[] = []
  for (const item of outline?.suggested_blocks ?? []) {
    const key = item.trim().toLowerCase()
    const section = COMPONENT_CATEGORY_KEYS.includes(key)
      ? key
      : blockTypeToCategory(key)
    if (section) out.push(section)
  }
  return out.length > 0 ? out : [...FALLBACK_SECTIONS]
}
