/**
 * Revisão humana da estrutura do email (migration 20261088) — módulo PURO,
 * client-safe.
 *
 * Quando o operador reordena ou remove blocos na tela do email, ele escreve
 * POR QUÊ. Este módulo transforma esse diff em bloco de prompt: é o review
 * humano entrando no input dos agentes, em vez de virar uma correção manual
 * que a próxima geração desfaz.
 *
 * Camada SEPARADA das outras três que já existem, de propósito:
 *   - `<aprendizados>` (vault)      = corpus curado, aprovado no Obsidian
 *   - `<orientacao_do_coo>`         = diretriz viva do método, entre lojas
 *   - `<revisao_humana>` (esta)     = correção de UM email, com o diff
 *
 * Misturá-las apagaria a diferença entre "material aprovado", "o COO pediu"
 * e "alguém corrigiu esta geração e explicou".
 */

export type AlcanceRevisao = "este_email" | "todo_email_do_flow"

export interface RevisaoHumana {
  alcance: AlcanceRevisao
  flow_type: string
  email_number: number
  /** Sections na ordem de antes. */
  ordem_anterior: string[]
  /** Sections na ordem de depois. */
  ordem_nova: string[]
  /** Sections removidas do email. */
  blocos_removidos: string[]
  justificativa: string
  created_at?: string | null
  para_estruturador?: boolean
  para_curador?: boolean
  para_montador?: boolean
}

/** Texto do bloco quando não há revisão — o prompt não muda de forma. */
export const SEM_REVISAO = "(nenhuma revisão humana registrada)"

/** Agente que pode receber a revisão. */
export type LeitorRevisao = "estruturador" | "curador" | "montador"

function leParaMim(r: RevisaoHumana, leitor: LeitorRevisao): boolean {
  if (leitor === "curador") return r.para_curador === true
  if (leitor === "montador") return r.para_montador === true
  // Estruturador é o dono da ORDEM: default true quando a coluna não veio.
  return r.para_estruturador !== false
}

function rotuloAlcance(r: RevisaoHumana): string {
  return r.alcance === "este_email"
    ? `${r.flow_type} #${r.email_number} desta loja`
    : `todo ${r.flow_type} #${r.email_number}, em qualquer loja`
}

function dataCurta(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return ` · ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Monta o conteúdo de `<revisao_humana>` para um agente.
 *
 * A mais específica por ÚLTIMA (global → deste email): é onde o modelo dá
 * mais peso quando duas se contradizem, e é a que foi escrita sabendo mais
 * sobre o caso. Mesma ordenação do bloco de orientações do COO.
 *
 * Mostra o DIFF, não só o resultado: "estava assim → ficou assim" é o que
 * deixa a justificativa acionável. Só a ordem final faria o agente ler uma
 * preferência estética em vez de uma correção.
 */
export function montarBlocoRevisao(
  revisoes: ReadonlyArray<RevisaoHumana>,
  leitor: LeitorRevisao,
): string {
  const minhas = revisoes
    .filter((r) => leParaMim(r, leitor))
    .filter((r) => (r.justificativa ?? "").trim().length > 0)
    // global primeiro, específica depois
    .sort((a, b) =>
      a.alcance === b.alcance ? 0 : a.alcance === "todo_email_do_flow" ? -1 : 1,
    )

  if (minhas.length === 0) return SEM_REVISAO

  return minhas
    .map((r) => {
      const linhas = [`[${rotuloAlcance(r)}${dataCurta(r.created_at)}]`]
      if (r.ordem_anterior.length > 0 || r.ordem_nova.length > 0) {
        linhas.push(`Ordem: [${r.ordem_anterior.join(", ")}]`)
        linhas.push(`     → [${r.ordem_nova.join(", ")}]`)
      }
      if (r.blocos_removidos.length > 0) {
        linhas.push(`Removido: ${r.blocos_removidos.join(", ")}`)
      }
      linhas.push(`Porquê: ${r.justificativa.trim()}`)
      return linhas.join("\n")
    })
    .join("\n\n")
}

/**
 * As revisões que se aplicam a um email, a partir de uma lista solta (o que
 * a query devolve). Puro para o teste não precisar de banco.
 *
 * `este_email` casa loja + flow + número; `todo_email_do_flow` ignora a loja.
 */
export function aplicaveis(
  todas: ReadonlyArray<RevisaoHumana & { store_id?: string | null }>,
  storeId: string,
  flowType: string,
  emailNumber: number,
): RevisaoHumana[] {
  return todas.filter((r) => {
    if (r.flow_type !== flowType || r.email_number !== emailNumber) return false
    if (r.alcance === "todo_email_do_flow") return true
    return r.store_id === storeId
  })
}
