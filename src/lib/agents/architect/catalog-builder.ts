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

/**
 * Palavras que não carregam a identidade da peça. Ficam de fora da medida
 * de semelhança porque "bloco de", "com", "para" aparecem em toda descrição
 * e empurrariam qualquer par para cima.
 */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos",
  "das", "e", "ou", "em", "no", "na", "nos", "nas", "com", "sem", "por",
  "para", "que", "se", "ao", "aos", "à", "às", "the", "of", "and",
  "bloco", "seção", "secao", "quando", "usar", "uso", "momento", "peça",
  "peca", "cliente", "marca", "loja", "produto", "produtos", "email",
  "e-mail", "lado", "cada", "mais", "não", "nao", "está", "esta", "ser",
])

function conteudo(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !VAZIAS.has(w)),
  )
}

/**
 * Quanto as duas descrições falam da MESMA peça, de 0 a 1 (Dice sobre as
 * palavras de conteúdo).
 *
 * O número é uma DICA, não um veredicto — e isso é medido, não suposto. Na
 * biblioteca real (01/09), `body-3` — que é a MESMA peça descrita com outro
 * vocabulário ("gift card" no vault, "vale-presente" no banco) — deu 0,286;
 * `body-4`, que é peça DIFERENTE (o vault descreve um tutorial em passos
 * numerados e o `variant_id` aponta para um comparativo contra a
 * concorrência), deu 0,205. Oito centésimos separam "outro vocabulário" de
 * "outra peça": nenhum corte confiável passa entre os dois. Por isso o
 * código NÃO julga — ele serve as DUAS descrições ao Curador e mostra o par
 * para uma pessoa decidir.
 */
export function similaridadeDeDescricao(a: string, b: string): number {
  const sa = conteudo(a)
  const sb = conteudo(b)
  if (sa.size === 0 || sb.size === 0) return 1
  let comuns = 0
  for (const w of sa) if (sb.has(w)) comuns++
  return (2 * comuns) / (sa.size + sb.size)
}

/**
 * Acima disto as duas descrições são a mesma coisa dita de dois jeitos e
 * mostrar as duas só polui o catálogo. Abaixo, as duas viajam juntas.
 * Generoso de propósito: servir a descrição do banco a mais nunca corrompe
 * a escolha — esconder a contradição, sim.
 */
export const LIMIAR_DE_DIVERGENCIA = 0.5

/** Uma variante cuja prosa do vault contradiz o cadastro do banco. */
export interface DivergenciaDeCatalogo {
  variant_id: string
  /** Slug da nota no vault. */
  slug: string
  /** Nome da variante NO BANCO — é a peça que será montada. */
  name: string
  vault: string
  banco: string
  /** 0 a 1. Serve para ordenar (mais divergente primeiro), não para julgar. */
  similaridade: number
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
  /**
   * A descrição do BANCO, servida junto quando ela contradiz a do vault. O
   * HTML que será montado é o da linha do banco: com as duas à vista, o
   * Curador não decide sobre uma peça e recebe outra.
   */
  description_no_banco?: string
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
  /**
   * Variantes em que a prosa do vault e o cadastro do banco descrevem
   * coisas diferentes. Mais divergente primeiro.
   *
   * Isto existe porque a substituição era SILENCIOSA: `toEntry` sobrepõe a
   * descrição do vault à do banco e o prompt declara que "onde o vault
   * contradisser os metadados do banco, O VAULT VENCE". O Curador então
   * raciocina sobre a prosa do vault, escolhe o `variant_id`, e o que é
   * montado é o HTML da linha do banco — que pode ser outra peça
   * (`body-4-tutorial-de-uso`, 01/09: o vault descreve um tutorial em
   * passos, o id aponta para um comparativo contra a concorrência). Nada
   * em lugar nenhum registrava a contradição.
   */
  divergentes: DivergenciaDeCatalogo[]
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
  const divergentes: DivergenciaDeCatalogo[] = []
  const sections: CatalogSection[] = types.map((section) => ({
    section,
    variantes: [...(byType.get(section) ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((v) => toEntry(v, vaultExtras?.get(v.id), divergentes)),
  }))
  divergentes.sort((a, b) => a.similaridade - b.similaridade)

  return {
    json: JSON.stringify(sections, null, 1),
    sections,
    total: variants.length,
    types,
    divergentes,
  }
}

function toEntry(
  v: EmailComponentVariant,
  extra?: CatalogVaultExtra,
  divergentes?: DivergenciaDeCatalogo[],
): CatalogEntry {
  const descVault = (extra?.descricao_curta ?? "").trim()
  const descBanco = (v.description ?? "").trim()
  // Só há contradição quando os DOIS lados falam. Vault sem descrição cai
  // no cadastro (é o caso da maioria) e banco vazio não contradiz ninguém.
  const divergente =
    descVault.length > 0 &&
    descBanco.length > 0 &&
    similaridadeDeDescricao(descVault, descBanco) < LIMIAR_DE_DIVERGENCIA
  if (divergente && extra && divergentes) {
    divergentes.push({
      variant_id: v.id,
      slug: extra.slug,
      name: v.name,
      vault: descVault,
      banco: descBanco,
      similaridade: Number(similaridadeDeDescricao(descVault, descBanco).toFixed(3)),
    })
  }
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
    ...(divergente ? { description_no_banco: descBanco } : {}),
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
