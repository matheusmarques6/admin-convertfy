/**
 * curador-vault-tools — a nota de cada variante finalista, servida na cauda
 * do prompt do Curador.
 *
 * **As FERRAMENTAS de consulta sob demanda foram removidas em 16/09.**
 * `VAULT_TOOLS`, `executarFerramentaDoVault`, `executorRestritoAFinalistas`,
 * `listar_pasta`, `ler_nota` e `buscar_doutrina` existiram de 02/09 a 16/09
 * e **nunca tiveram um importador de produção**: só testes. O caminho vivo
 * sempre foi `invokeAgent` (não `invokeAgentWithTools`), e por isso
 * `consultas: []` era literal no `curador-shadow` — `consultou_vault`,
 * `consultas_ao_vault` e `fallback_sem_ferramentas` eram constantes
 * gravadas como se fossem medição, em 8 de 8 runs.
 *
 * O `<indice_do_vault>` do prompt **continua** (decisão do dono, 14/09):
 * o que saiu é o código morto, não o conteúdo servido ao modelo.
 *
 * O que sobra aqui é o caminho por CÓDIGO: `loadFinalistNotes` lê as notas
 * das finalistas numa consulta só, em `email_vault_docs` (`file_path`
 * relativo à base do vault), já filtrando `is_active` da própria variante.
 * Nunca lança: erro vira status na linha.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CuradorVaultTools")

/** A única tabela com nota de variante — as outras não têm `variant_id`. */
const TABELA_COMPONENTES = "email_vault_docs"
/**
 * Teto por nota de finalista. Era 12.000 e virou 3.000 em 15/09, junto com
 * o extrato: a nota inteira tem 6.524 chars em média e o que serve à
 * ESCOLHA cabe em ~2.100.
 */
const NOTA_MAX_CHARS = 3_000

/**
 * Teto do conjunto de notas servido em UMA chamada.
 *
 * A cauda fica DEPOIS do último marcador de cache e paga preço cheio em
 * toda geração — e abaixo do limiar de shortlist TODAS as elegíveis viram
 * finalistas (`planejarShortlist`), então um grupo de 5 servia 32.620 chars
 * por posição. Sem teto, cadastrar variante encarece toda geração daquela
 * posição; com ele, o custo marginal é o da LINHA do catálogo, que é
 * cacheada. É esta a propriedade "adicionar mais custa pouco".
 *
 * Quem não couber fica com a linha do catálogo, que desde 15/09 carrega a
 * forma derivada do schema — não é ausência, é menos detalhe.
 *
 * **"Uma chamada" é o eixo, e ele muda de significado com o leque.** No
 * caminho de hoje a chamada é o E-MAIL INTEIRO, e aí o teto reparte 18.000
 * chars entre todas as posições, **na ordem** — as primeiras levam tudo e
 * as últimas ficam sem nota. Medido nas 11 runs com telemetria de notas
 * (11–15/09): 10 a 15 finalistas por e-mail, **59.794 a 84.908 chars** de
 * nota pedidos, maior nota 9.036. O teto e o `NOTA_MAX_CHARS` entraram em
 * 15/09 19:02 e a última run do banco é de 15/09 15:49, então **nenhuma
 * run mediu o corte ainda** (`sem_orcamento` = 0 em 11 de 11 porque o teto
 * não existia). Com eles, as 13 notas de um e-mail típico caem para
 * 13×3.000 = 39.000 pedidos contra 18.000 disponíveis: ~metade rebaixada,
 * e a metade das ÚLTIMAS posições.
 *
 * No leque a chamada é UMA POSIÇÃO, e o mesmo número deixa de repartir: as
 * 2–5 finalistas daquela posição cabem folgadas, e o teto volta a ser o que
 * ele existe para ser — rede contra cadastro que cresce, não corte. É por
 * isso que a consulta e o orçamento estão separados abaixo
 * (`carregarNotasDasFinalistas` + `aplicarOrcamentoDaCauda`): o leque lê o
 * banco UMA vez e aplica o orçamento por posição.
 */
export const CAUDA_MAX_CHARS = 18_000


/**
 * Seções da nota que servem à ESCOLHA. As outras quatro
 * (design system, direção fotográfica, orientações de copy, e o que mais o
 * time escrever) servem a OUTROS agentes e já estão no banco, nas colunas
 * `design_system`, `photo_direction` e `copy_guidance`.
 *
 * Medido nas 40 notas ativas (15/09): design system 2.218 chars em média,
 * direção fotográfica 1.349, orientações de copy 796 — **67% da nota é
 * material que o Curador não usa**, servido cru, sem `semMomento` nem
 * `semExige`, contrariando o próprio system que manda ignorar esses campos.
 */
const SECOES_DE_DECISAO = [
  "descrição curta",
  "descricao curta",
  "descrição detalhada",
  "descricao detalhada",
  "quando usar",
  "quando não usar",
  "quando nao usar",
]

/**
 * A nota reduzida ao que decide: frontmatter + as seções de decisão.
 *
 * **Fail-open**: nota sem NENHUMA seção conhecida volta inteira (truncada),
 * como antes — formato novo no vault não pode virar finalista sem nota.
 * Puro.
 */
export function extratoParaDecisao(body: string): string {
  const texto = (body ?? "").trim()
  if (!texto) return ""
  // O frontmatter é o bloco `---` do topo; ele carrega os eixos.
  const fm = /^---\n[\s\S]*?\n---\n/.exec(texto)
  const cabeca = fm ? fm[0] : ""
  const corpo = texto.slice(cabeca.length)
  const partes = corpo.split(/^##\s+/m)
  const mantidas: string[] = []
  for (const parte of partes.slice(1)) {
    const nl = parte.indexOf("\n")
    const titulo = (nl < 0 ? parte : parte.slice(0, nl)).trim().toLowerCase()
    if (!SECOES_DE_DECISAO.includes(titulo)) continue
    mantidas.push(`## ${parte.trimEnd()}`)
  }
  if (mantidas.length === 0) return texto
  // O que vem ANTES do primeiro `##` é o título da nota — fica.
  const preambulo = partes[0].trim()
  return [cabeca.trimEnd(), preambulo, mantidas.join("\n\n")].filter(Boolean).join("\n\n").trim()
}

export interface FinalistNoteResult {
  variant_id: string
  /**
   * `sem_orcamento` (15/09): a nota existe e não coube em
   * `CAUDA_MAX_CHARS`. É diferente de `missing` — a variante segue
   * escolhível pela linha do catálogo, que carrega eixos e forma.
   */
  status: "opened" | "missing" | "database_error" | "sem_orcamento"
  file_path: string | null
  body: string | null
  error?: string
}

/**
 * Aplica o orçamento da cauda a notas JÁ carregadas. Pura.
 *
 * Consome na ORDEM recebida, que é a do ranking, e **para na primeira que
 * não cabe**: dali para a frente todas saem `sem_orcamento`, mesmo as
 * curtas. Era o contrário até 16/09 — o laço pulava a que estourava e
 * seguia servindo as menores —, e isso fazia o orçamento premiar nota
 * CURTA em vez de nota bem colocada: a 5ª aparecia com evidência e a 4ª
 * não. Como o modelo lê "tem nota" como mais evidência, era o critério do
 * ranking sendo invertido pelo tamanho do texto, em silêncio. A propriedade
 * que fica é simples de enunciar e de conferir: a evidência degrada na
 * ordem do ranking, nunca fora dela.
 *
 * Separada de `carregarNotasDasFinalistas` porque o leque lê o banco uma
 * vez, para todas as posições, e reparte o orçamento POR posição.
 */
export function aplicarOrcamentoDaCauda(
  notas: readonly FinalistNoteResult[],
  teto: number = CAUDA_MAX_CHARS,
): FinalistNoteResult[] {
  let orcamento = teto
  let estourou = false
  return notas.map((nota) => {
    if (nota.status !== "opened" || !nota.body) return { ...nota }
    if (estourou || nota.body.length > orcamento) {
      estourou = true
      return { ...nota, status: "sem_orcamento" as const, body: null }
    }
    orcamento -= nota.body.length
    return { ...nota }
  })
}

/**
 * Carrega as notas das finalistas em UMA consulta, cortadas por
 * `NOTA_MAX_CHARS` e **sem** orçamento de cauda — quem aplica o orçamento é
 * `aplicarOrcamentoDaCauda`, porque no leque ele é por posição.
 *
 * A shortlist já foi validada contra o catálogo ativo; por isso o modelo
 * não escolhe caminhos nem ganha uma ferramenta de navegação na etapa
 * final.
 */
export async function carregarNotasDasFinalistas(
  variantIds: readonly string[],
): Promise<FinalistNoteResult[]> {
  const ids = Array.from(new Set(variantIds.filter(Boolean)))
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(TABELA_COMPONENTES)
    .select("variant_id, file_path, body_md")
    .eq("is_active", true)
    .eq("kind", "variante")
    .in("variant_id", ids)

  if (error) {
    log.warn("finalist_notes_load_failed", { ids: ids.length, error: error.message })
    return ids.map((variant_id) => ({
      variant_id,
      status: "database_error",
      file_path: null,
      body: null,
      error: error.message,
    }))
  }

  const byId = new Map(
    ((data ?? []) as Array<{ variant_id: string; file_path: string; body_md: string }>).map((row) => [row.variant_id, row]),
  )
  return ids.map((variant_id) => {
    const row = byId.get(variant_id)
    if (!row) return { variant_id, status: "missing" as const, file_path: null, body: null }
    const extrato = extratoParaDecisao(row.body_md ?? "")
    const cortada =
      extrato.length <= NOTA_MAX_CHARS ? extrato : `${extrato.slice(0, NOTA_MAX_CHARS)}\n(… nota truncada)`
    return {
      variant_id,
      status: "opened" as const,
      file_path: row.file_path,
      body: cortada,
    }
  })
}

/**
 * O caminho de hoje: carrega e aplica o orçamento do e-mail inteiro numa
 * chamada só. O leque usa as duas peças separadas.
 */
export async function loadFinalistNotes(
  variantIds: readonly string[],
): Promise<FinalistNoteResult[]> {
  return aplicarOrcamentoDaCauda(await carregarNotasDasFinalistas(variantIds))
}
