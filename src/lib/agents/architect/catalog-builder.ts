/**
 * catalog-builder — o catálogo da biblioteca que vai no system do Curador
 * (story CM-3).
 *
 * Substitui o pré-filtro determinístico: em vez de cortar cada posição para
 * 8 candidatas por um score aritmético (`objectives ×3 · tones ×2 ·
 * density ×1`), o Curador recebe a biblioteca INTEIRA, agrupada por tipo de
 * seção, e é ele quem rankeia. O score decidia quem o LLM podia ver usando
 * três campos categóricos, antes de qualquer leitura de marca.
 *
 * Duas exigências que moldam o formato:
 *
 * 1. **Ordem estável** (`block_type`, depois `name`). O catálogo vai no
 *    system prompt para ser cacheado, e cache é endereçado por conteúdo:
 *    qualquer variação de ordem entre lojas mataria o cache. Por isso o
 *    embaralhamento por semente saiu junto com o pré-filtro.
 * 2. **Catálogo completo**, não filtrado pelas seções daquele email — um
 *    catálogo por email mudaria de conteúdo a cada email e nunca cachearia.
 *
 * Puro (zero I/O) — testável.
 */

import type { EmailComponentVariant } from "@/types/email-generation"

/**
 * Extras do VAULT de componentes para uma variante (curador-vault, 31/08):
 * eixos de decisão do protocolo + prosa de julgamento curada. Opcionais —
 * variante sem nota no vault sai do catálogo exatamente como antes.
 */
export interface CatalogVaultExtra {
  /** Slug da nota no vault (identificador dos wikilinks). */
  slug: string
  descricao_curta?: string
  quando_usar?: string
  quando_nao_usar?: string
  momento?: string[]
  momento_vetado?: string[]
  objecao?: string[]
  registro?: string[]
  registro_vetado?: string[]
  paleta?: string[]
  papel_na_peca?: string[]
  exige?: string[]
  /** "medio · 949px" (classe · altura). */
  peso?: string | null
  convivencia?: string[]
  itens?: string | null
}

/** Entrada do catálogo — o que o Curador vê de cada variante. */
export interface CatalogEntry {
  variant_id: string
  name: string
  description: string
  quando_usar: string
  quando_nao_usar: string
  objectives: string[]
  tones: string[]
  density: string | null
  product_slots: number
  orientacao_copy: string
  notas_implementacao: string
  /** Presente quando a variante tem nota no vault de componentes. */
  vault?: {
    slug: string
    momento: string[]
    momento_vetado: string[]
    objecao: string[]
    registro: string[]
    registro_vetado: string[]
    paleta: string[]
    papel_na_peca: string[]
    exige: string[]
    peso: string | null
    convivencia: string[]
    itens: string | null
  }
}

export interface CatalogSection {
  section: string
  variantes: CatalogEntry[]
}

export interface BuildCatalogResult {
  /** JSON que entra no `{{catalogo}}` do system prompt. */
  json: string
  sections: CatalogSection[]
  /** Total de variantes no catálogo. */
  total: number
  /** Tipos de seção presentes, na ordem. */
  types: string[]
}

/**
 * Monta o catálogo a partir das variantes ELEGÍVEIS (já filtradas por
 * `is_active` e pelo guard de placeholder — ver `variantHasPlaceholders`).
 *
 * O `output_schema` fica FORA de propósito: é insumo exclusivo do Montador
 * (CM-4), que decide viabilidade de dados. Mandá-lo aqui dobraria o prefixo
 * sem melhorar o ranking.
 */
export function buildCatalog(
  variants: EmailComponentVariant[],
  vaultExtras?: Map<string, CatalogVaultExtra>,
): BuildCatalogResult {
  const byType = new Map<string, EmailComponentVariant[]>()
  for (const v of variants) {
    const arr = byType.get(v.block_type) ?? []
    arr.push(v)
    byType.set(v.block_type, arr)
  }

  const types = Array.from(byType.keys()).sort((a, b) => a.localeCompare(b))
  const sections: CatalogSection[] = types.map((section) => ({
    section,
    variantes: [...(byType.get(section) ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((v) => toEntry(v, vaultExtras?.get(v.id))),
  }))

  return {
    json: JSON.stringify(sections, null, 1),
    sections,
    total: variants.length,
    types,
  }
}

function toEntry(v: EmailComponentVariant, extra?: CatalogVaultExtra): CatalogEntry {
  const entry: CatalogEntry = {
    variant_id: v.id,
    name: v.name,
    // A prosa do vault, quando existe, VENCE o cadastro do banco: é o
    // julgamento curado (descrição curta, quando usar/não usar) escrito
    // para o protocolo de seleção. Sem nota, o cadastro segue valendo.
    description: extra?.descricao_curta || v.description || "",
    quando_usar: extra?.quando_usar || v.when_use || "",
    quando_nao_usar: extra?.quando_nao_usar || v.when_not_use || "",
    objectives: v.objectives ?? [],
    tones: v.tones ?? [],
    density: v.density ?? null,
    product_slots: v.product_slots ?? 0,
    orientacao_copy: v.copy_guidance ?? "",
    notas_implementacao: v.long_description ?? "",
  }
  if (extra) {
    entry.vault = {
      slug: extra.slug,
      momento: extra.momento ?? [],
      momento_vetado: extra.momento_vetado ?? [],
      objecao: extra.objecao ?? [],
      registro: extra.registro ?? [],
      registro_vetado: extra.registro_vetado ?? [],
      paleta: extra.paleta ?? [],
      papel_na_peca: extra.papel_na_peca ?? [],
      exige: extra.exige ?? [],
      peso: extra.peso ?? null,
      convivencia: extra.convivencia ?? [],
      itens: extra.itens ?? null,
    }
  }
  return entry
}

/**
 * Índice `variant_id → block_type` das variantes do catálogo. O parser usa
 * para validar que a escolha do Curador é do tipo daquela posição: como o
 * catálogo agora vai inteiro, e não pré-separado por posição, nada impede o
 * modelo de pegar um id da seção errada.
 */
export function buildTypeIndex(
  variants: EmailComponentVariant[],
): Map<string, string> {
  return new Map(variants.map((v) => [v.id, v.block_type]))
}
