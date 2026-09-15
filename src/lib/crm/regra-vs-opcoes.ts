/**
 * regra-vs-opcoes — a condição do lead qualificado aponta para valor que o
 * campo realmente oferece?
 *
 * ── O modo de falha ──────────────────────────────────────────────────
 *
 * A regra é digitada à mão e o campo é um `select` com opções próprias.
 * Renomear uma opção ("R$1 milhão - R$5 milhões" → "Acima de R$1 milhão")
 * deixa a regra apontando para um texto que **nenhum lead pode responder**:
 * o evento para de disparar e nada acusa. É a mesma família do defeito de
 * 05/08 — a condição comparava texto literal e o `LeadQualificado` nunca
 * saía —, agora pela porta do CADASTRO em vez da do código.
 *
 * O diagnóstico da tela já roda a avaliação real contra os cadastros
 * recentes, mas isso só responde depois que alguém se cadastrou, e só
 * enquanto houver cadastro na janela: um formulário novo, ou um período
 * sem lead da faixa, devolve "nenhum qualificaria" sem distinguir "a regra
 * está certa e ninguém se encaixou" de "a regra aponta para o vazio".
 *
 * Esta régua responde antes, e sem depender de tráfego.
 *
 * ── As decisões ──────────────────────────────────────────────────────
 *
 * **A comparação é a MESMA do envio** (`normalizeForCompare`: sem espaço
 * nas pontas, minúscula, sem acento). Comparar byte a byte aqui acusaria
 * divergência onde o envio casa — um aviso que manda "consertar" o que
 * está funcionando é pior que aviso nenhum.
 *
 * **Só julga campo com lista fechada.** Texto livre, número e data não têm
 * opções, e cobrar correspondência ali reprovaria toda regra legítima.
 *
 * **Só julga operador de igualdade** (`equals`, `not_equals`, `in`,
 * `not_in`). `contains` é fragmento de propósito, e `gt/gte/lt/lte`
 * comparam número.
 *
 * Puro: quem lê o formulário é a rota.
 */

import { normalizeForCompare } from "@/lib/services/conversion-dispatch.service"
import type { QualifiedLeadConfig, QualifiedRule } from "@/types/form-tracking"

/** Operadores em que o valor tem de existir entre as opções do campo. */
const OPERADORES_DE_IGUALDADE = new Set(["equals", "not_equals", "in", "not_in"])

export interface CampoComOpcoes {
  id: string
  label?: string | null
  field_type?: string | null
  /** Opções do `select`/`radio`; ausente ou vazia = lista aberta. */
  options?: unknown
}

export interface ValorSemOpcao {
  /** Índice da regra em `config.rules` — é como a tela a endereça. */
  regra: number
  campo_label: string
  /** O valor da regra que nenhuma opção do campo oferece. */
  valor: string
  /** As opções que o campo de fato tem, para o texto do aviso. */
  opcoes: string[]
}

/** As opções do campo, quando ele tem lista fechada. */
export function opcoesDoCampo(campo: CampoComOpcoes | undefined): string[] | null {
  if (!campo) return null
  const raw = campo.options
  if (!Array.isArray(raw)) return null
  const out = raw
    .map((o) => {
      if (typeof o === "string") return o
      // O editor também grava `{label, value}` em alguns campos.
      if (o && typeof o === "object") {
        const r = o as { value?: unknown; label?: unknown }
        if (typeof r.value === "string") return r.value
        if (typeof r.label === "string") return r.label
      }
      return null
    })
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
  return out.length > 0 ? out : null
}

/** Os valores que a regra compara, como lista de texto. */
export function valoresDaRegra(regra: QualifiedRule): string[] {
  const v = regra.value
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string")
  if (typeof v === "string") return [v]
  return []
}

/**
 * Resolve o campo da regra pelo `field_id` e, na falta, pelo `field_label`
 * — a MESMA cascata que a avaliação usa, senão a régua julgaria um campo e
 * o envio outro.
 */
export function campoDaRegra(
  regra: QualifiedRule,
  campos: readonly CampoComOpcoes[],
): CampoComOpcoes | undefined {
  const porId = campos.find((c) => c.id === regra.field_id)
  if (porId) return porId
  if (!regra.field_label) return undefined
  const alvo = normalizeForCompare(regra.field_label)
  return campos.find((c) => c.label && normalizeForCompare(c.label) === alvo)
}

/**
 * Valores de regra que o campo não oferece.
 *
 * Lista vazia = nada a dizer (inclusive quando não há como julgar: campo de
 * texto livre, campo não encontrado, operador numérico). Ausência de
 * veredito não é aprovação, e é por isso que quem chama mostra isto como
 * AVISO ao lado do teste contra os cadastros, não no lugar dele.
 */
export function valoresForaDasOpcoes(
  config: QualifiedLeadConfig | undefined,
  campos: readonly CampoComOpcoes[],
): ValorSemOpcao[] {
  if (!config?.enabled || !Array.isArray(config.rules)) return []
  const out: ValorSemOpcao[] = []
  config.rules.forEach((regra, i) => {
    if (!OPERADORES_DE_IGUALDADE.has(regra.operator)) return
    const campo = campoDaRegra(regra, campos)
    const opcoes = opcoesDoCampo(campo)
    if (!campo || !opcoes) return
    const disponiveis = new Set(opcoes.map(normalizeForCompare))
    for (const valor of valoresDaRegra(regra)) {
      if (disponiveis.has(normalizeForCompare(valor))) continue
      out.push({
        regra: i,
        campo_label: campo.label ?? regra.field_label ?? "(sem rótulo)",
        valor,
        opcoes,
      })
    }
  })
  return out
}

/** O aviso para a tela; `null` quando não há o que avisar. */
export function avisoDeValorSemOpcao(achados: readonly ValorSemOpcao[]): string | null {
  if (achados.length === 0) return null
  const a = achados[0]
  const resto = achados.length > 1 ? ` (e mais ${achados.length - 1})` : ""
  return (
    `A condição do lead qualificado compara "${a.campo_label}" com "${a.valor}"${resto}, ` +
    `e esse valor não está entre as opções do campo (${a.opcoes.join(" · ")}). ` +
    "Nenhum cadastro pode responder isso, então o evento nunca dispara — " +
    "provável opção renomeada depois que a regra foi montada."
  )
}
