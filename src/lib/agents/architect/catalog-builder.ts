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
   * Variantes em que a nota do vault descreve outra peça que não a do
   * cadastro. Mais divergente primeiro.
   *
   * NÃO entra no prompt: desde 03/09 o catálogo serve a descrição do
   * SISTEMA e ponto — o modelo não arbitra entre duas versões da mesma
   * variante, porque isso nunca foi decisão dele e não conserta o dado.
   * Esta lista é higiene: é a nota do Obsidian que está errada, e é lá que
   * se corrige (o admin só LÊ o vault). Vai para a telemetria da run e
   * para a aba Conhecimento.
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
    // O SISTEMA prevalece: o cadastro do banco é a descrição da peça que
    // será montada — é o HTML DESTA linha que vai para o email. O vault é
    // apoio: entra só onde o sistema não tem nada. Até 03/09 era o
    // contrário (o vault sobrepunha o cadastro), e o Curador decidia sobre
    // uma peça enquanto o email recebia outra.
    description: v.description || extra?.descricao_curta || "",
    quando_usar: v.when_use || extra?.quando_usar || "",
    quando_nao_usar: v.when_not_use || extra?.quando_nao_usar || "",
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

// ── Higiene do vault ───────────────────────────────────────────────────
//
// A divergência saiu do prompt (o sistema prevalece), mas o dado errado
// continua lá — e até 03/09 ele só aparecia dentro de uma run do Curador,
// onde ninguém que fosse corrigir o Obsidian ia olhar. Estas três listas
// são o que se conserta na nota.

/** Nota do vault cujo `variant_id` não aponta para variante ativa. */
export interface NotaOrfa {
  slug: string
  variant_id: string | null
  /** `nome_no_banco` declarado no frontmatter. */
  nome_no_banco: string | null
}

/** Variante ativa sem nota no vault — o Curador decide sem os eixos dela. */
export interface VarianteSemNota {
  variant_id: string
  name: string
  block_type: string
}

export interface HigieneDoVault {
  /** Nota e cadastro descrevem peças diferentes. Mais divergente primeiro. */
  divergentes: DivergenciaDeCatalogo[]
  notas_orfas: NotaOrfa[]
  variantes_sem_nota: VarianteSemNota[]
}

/** Uma nota de variante do vault, do ponto de vista da higiene. */
export interface NotaDeVariante {
  slug: string
  variant_id: string | null
  nome_no_banco: string | null
}

/**
 * Cruza as notas do vault com as variantes ATIVAS e devolve o que está
 * descasado. Puro — quem lê banco e vault é o chamador.
 *
 * `divergentes` vem de `buildCatalog`: a mesma medida, sem recalcular.
 */
export function levantarHigieneDoVault(
  notas: NotaDeVariante[],
  variantesAtivas: { id: string; name: string; block_type: string }[],
  divergentes: DivergenciaDeCatalogo[],
): HigieneDoVault {
  const ativas = new Map(variantesAtivas.map((v) => [v.id, v]))
  const comNota = new Set<string>()
  const notas_orfas: NotaOrfa[] = []

  for (const n of notas) {
    if (n.variant_id && ativas.has(n.variant_id)) {
      comNota.add(n.variant_id)
      continue
    }
    notas_orfas.push({
      slug: n.slug,
      variant_id: n.variant_id ?? null,
      nome_no_banco: n.nome_no_banco ?? null,
    })
  }

  const variantes_sem_nota: VarianteSemNota[] = variantesAtivas
    .filter((v) => !comNota.has(v.id))
    .map((v) => ({ variant_id: v.id, name: v.name, block_type: v.block_type }))

  return { divergentes, notas_orfas, variantes_sem_nota }
}
