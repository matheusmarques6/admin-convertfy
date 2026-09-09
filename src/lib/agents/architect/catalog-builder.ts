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
import { resumirContrato, type ContratoResumo } from "../shared/field-roles"

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
  objecao?: string[]
  registro?: string[]
  registro_vetado?: string[]
  paleta?: string[]
  papel_na_peca?: string[]
  /** "medio · 949px" (classe · altura). */
  peso?: string | null
  convivencia?: string[]
  itens?: string | null
  /**
   * Objeções (set/2026): aliviador(es) que a anatomia realiza e a
   * profundidade de prova — frontmatter da nota quando existe (`fonte:
   * 'vault'`), senão derivados de block_type + objecao + exige
   * (`aliviador-bridge.ts`). É o eixo que cruza com o alvo do Seletor.
   */
  aliviador?: string[]
  profundidade?: string | null
  aliviador_fonte?: "vault" | "derivado"
  /**
   * `exige:` da nota, SÓ para o medidor de proibições e a derivação do
   * aliviador — nunca entra no JSON servido ao Curador (01/09: eliminar
   * candidata por `exige` reprovava sobre requisito que o próprio vault
   * declara não verificável).
   */
  exige_medicao?: string[]
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
   * O que a ANATOMIA obriga (09/09): slot de cupom, CTA, preço, avaliação,
   * tamanho da grade. É o que faltava ao Curador para eliminar a hero de
   * cupom numa loja sem incentivo — ver `field-roles.ts`.
   */
  contrato: ContratoResumo
  /** Presente quando a variante tem nota no vault de componentes. */
  vault?: {
    slug: string
    objecao: string[]
    registro: string[]
    registro_vetado: string[]
    paleta: string[]
    papel_na_peca: string[]
    peso: string | null
    convivencia: string[]
    itens: string | null
    aliviador: string[]
    profundidade: string | null
    aliviador_fonte: "vault" | "derivado" | null
  }
}

export interface CatalogSection {
  section: string
  variantes: CatalogEntry[]
}

export interface BuildCatalogResult {
  /** JSON que entra no `{{catalogo}}` do system prompt. */
  json: string
  /**
   * Catálogo ENXUTO (09/09): uma linha por variante, ≤ 15k chars, com os
   * MESMOS dados do `json` — ids, eixos do vault e contrato da anatomia.
   * É o índice de títulos do Curador: rankeia por aqui e abre a finalista
   * por `ler_nota` antes de decidir. O `json` completo tinha 128k dos 190k
   * chars da chamada (67k tokens) e o modelo lia tudo de todas para
   * decidir sobre poucas. Quem escolhe qual dos dois entra no prompt é o
   * outro lado (kill-switch `curador_catalogo_mode`, item 2.3 do plano).
   */
  enxuto: string
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
 * O `output_schema` INTEIRO fica fora (dobraria o prefixo); o que entra é o
 * `contrato` — resumo de ~150 chars do que a anatomia obriga. Até 09/09 nem
 * isso entrava ("insumo exclusivo do Montador"), mas o Montador está
 * desligado e a viabilidade de dados tinha saído do pipeline junto com ele:
 * o Curador escolheu hero com `coupon_line` para loja sem incentivo, com o
 * motivo "sem depender de cupom".
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
    enxuto: buildCatalogoEnxuto(sections),
    sections,
    total: variants.length,
    types,
    divergentes,
  }
}

/** Corte da descrição na linha enxuta — a primeira frase, até este tamanho. */
const ENXUTO_DESC_MAX = 110

/** Primeira frase de um texto de cadastro, cortada em fronteira de palavra. */
function primeiraFraseDaDescricao(texto: string): string {
  const limpa = texto.replace(/\s+/g, " ").trim()
  if (!limpa) return "(sem descrição)"
  const fim = limpa.search(/[.!?](\s|$)/)
  const frase = fim > 20 ? limpa.slice(0, fim + 1) : limpa
  if (frase.length <= ENXUTO_DESC_MAX) return frase
  const corte = frase.lastIndexOf(" ", ENXUTO_DESC_MAX)
  return `${frase.slice(0, corte > 60 ? corte : ENXUTO_DESC_MAX).trimEnd()}…`
}

/** `chave: a, b` quando há valor; vazio quando não há — linha sem ruído. */
function campo(chave: string, valores: ReadonlyArray<string> | string | number | null | undefined): string {
  if (valores == null || valores === "") return ""
  if (Array.isArray(valores)) return valores.length ? `${chave}: ${valores.join(", ")}` : ""
  return `${chave}: ${String(valores)}`
}

/**
 * Uma linha por variante, agrupada por seção, montada das MESMAS entradas
 * que o `json` — nunca do `_catalogo.md` do vault, que pode dizer "ativa"
 * enquanto o banco diz "inativa" (incidente 07/09). O `variant_id` vem
 * primeiro porque é o que o parser aceita sem passar pelo índice de
 * apelidos. Puro; a ordem é a das `sections` (estável, cacheável).
 */
export function buildCatalogoEnxuto(sections: ReadonlyArray<CatalogSection>): string {
  const blocos: string[] = []
  for (const sec of sections) {
    const linhas = sec.variantes.map((e) => {
      const c = e.contrato
      const anatomia = [
        c.tem_cupom ? "cupom" : "",
        c.tem_cta ? "cta" : "",
        c.tem_preco ? "preço" : "",
        c.tem_avaliacao ? "avaliação" : "",
        c.tem_credencial ? "credencial" : "",
      ].filter(Boolean)
      const partes = [
        `${e.variant_id} · ${e.name}${e.vault ? ` [${e.vault.slug}]` : ""} — ${primeiraFraseDaDescricao(e.description)}`,
        campo("objeção", e.vault?.objecao),
        campo("aliviador", e.vault?.aliviador),
        campo("profundidade", e.vault?.profundidade),
        campo("registro", e.vault?.registro),
        campo("registro vetado", e.vault?.registro_vetado),
        campo("paleta", e.vault?.paleta),
        campo("papel", e.vault?.papel_na_peca),
        campo("anatomia", anatomia),
        campo("slots", e.product_slots > 0 ? e.product_slots : null),
        campo("itens", e.vault?.itens),
        campo("peso", e.vault?.peso),
        campo("convivência", e.vault?.convivencia),
      ].filter(Boolean)
      return `- ${partes.join(" | ")}`
    })
    blocos.push(`## ${sec.section} (${sec.variantes.length})\n${linhas.join("\n")}`)
  }
  return blocos.join("\n\n")
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
    contrato: resumirContrato(v.output_schema),
  }
  if (extra) {
    entry.vault = {
      slug: extra.slug,
      objecao: extra.objecao ?? [],
      registro: extra.registro ?? [],
      registro_vetado: extra.registro_vetado ?? [],
      paleta: extra.paleta ?? [],
      papel_na_peca: extra.papel_na_peca ?? [],
      peso: extra.peso ?? null,
      convivencia: extra.convivencia ?? [],
      itens: extra.itens ?? null,
      aliviador: extra.aliviador ?? [],
      profundidade: extra.profundidade ?? null,
      aliviador_fonte: extra.aliviador_fonte ?? null,
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
/**
 * Apelido → `variant_id`. O Curador VÊ o `vault.slug` e o `name` de cada
 * entrada do catálogo, e às vezes devolve um deles no lugar do UUID: em
 * 07/09 ele escolheu `offer-4-manifesto-antes-do-cupom` com justificativa
 * correta e o parser jogou a escolha fora por não ser id conhecido — a
 * posição ficou vazia e o email perdeu um bloco válido.
 *
 * Chave normalizada (minúscula, não-alfanumérico vira hífen) para "footer 1"
 * e "footer-1" caírem no mesmo lugar. Apelido AMBÍGUO — duas variantes com a
 * mesma chave — é REMOVIDO: resolver para a errada é pior que não resolver.
 */
export function buildAliasIndex(
  variants: EmailComponentVariant[],
  extras?: Map<string, CatalogVaultExtra>,
): Map<string, string> {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")

  const out = new Map<string, string>()
  const ambiguas = new Set<string>()
  const registrar = (chave: string, id: string) => {
    if (!chave || ambiguas.has(chave)) return
    const atual = out.get(chave)
    if (atual && atual !== id) {
      out.delete(chave)
      ambiguas.add(chave)
      return
    }
    out.set(chave, id)
  }

  for (const v of variants) {
    registrar(norm(v.name ?? ""), v.id)
    const slug = extras?.get(v.id)?.slug
    if (slug) registrar(norm(slug), v.id)
  }
  return out
}

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
