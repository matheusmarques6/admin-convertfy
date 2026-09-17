/**
 * Auditoria da regra de "lead qualificado" contra as OPÇÕES do campo.
 *
 * O `diagnoseQualified` responde "por que este cadastro não qualificou"
 * — olhando uma resposta real. Isto responde a pergunta anterior, que é
 * a que importa antes de subir verba: **quais respostas o formulário
 * oferece, e quais delas disparam o evento?**
 *
 * Os dois modos de falha são silenciosos e caros:
 *
 * 1. **Valor órfão.** A regra lista `"R$300.000 - R$500.000"`, alguém
 *    renomeia a opção no editor e a lista continua com o texto antigo.
 *    Nada quebra: a condição simplesmente nunca casa, e a campanha passa
 *    a otimizar sem receber o sinal.
 * 2. **Opção descoberta.** O campo oferece uma faixa que nenhuma regra
 *    aceita. Quem responder aquilo nunca vira lead qualificado — e a
 *    faixa pode ser exatamente o ICP.
 *
 * Medido em 17/09 no formulário "Pagina de vendas": as opções são
 * R$0–99k, R$100–300k, R$500k–1M e R$1–5M. **A faixa R$300–500k não
 * existe** — quem fatura R$400 mil não tem o que marcar. E a regra
 * qualifica a partir de R$100 mil, enquanto o critério comercial é
 * R$200 mil.
 *
 * A comparação usa o MESMO normalizador da avaliação. Auditoria que
 * compara diferente do executor inventa erro onde não há e cala onde há
 * — seria pior que não auditar.
 */

import type { QualifiedLeadConfig, QualifiedRule } from "@/types/form-tracking"
import { normalizeForCompare } from "@/lib/tracking/normalizar-comparacao"

export interface CampoComOpcoes {
  id: string
  label?: string | null
  /** Só campos de escolha têm opções; os demais vêm com lista vazia. */
  options: string[]
  /**
   * Valores que o SERVIDOR calcula a partir da resposta deste campo —
   * hoje, o piso em real da faixa de faturamento (ver
   * `lib/forms/derivados`). `porOpcao` é indexado pelo `value` da opção.
   *
   * A auditoria precisa deles porque a régua de negócio parou de
   * comparar TEXTO: a condição é `piso >= 200000`, e sem a derivação a
   * simulação diria que nenhuma resposta dispara o evento — exatamente
   * o alarme falso que faz alguém desligar a tela que o protege.
   */
  derivados?: Array<{ ref: string; label: string; porOpcao: Record<string, number> }>
  /**
   * Este campo é ele próprio um derivado. Ele entra na lista para a
   * regra que o cita ter rótulo legível em vez de sair como campo
   * ausente — e NÃO é simulado sozinho: não existe opção para alguém
   * escolher, e mostrar "250000 dispara o evento" ensinaria a operar
   * pelo número em vez de pela faixa.
   */
  derivado?: boolean
}

/**
 * Operadores cujo valor endereça uma OPÇÃO do campo. Fora desta lista a
 * comparação é numérica (`gt`), de substring (`contains`) ou de presença
 * (`is_set`) — auditar pertencimento ali inventaria erro.
 */
const OPERADORES_DE_OPCAO = new Set(["in", "not_in", "equals", "not_equals"])

/** Operadores em que estar na lista é o que QUALIFICA. */
const OPERADORES_POSITIVOS = new Set(["in", "equals"])

/** Comparações numéricas — as que a régua por piso usa. */
const OPERADORES_NUMERICOS = new Set(["gt", "gte", "lt", "lte"])

export interface AuditoriaDaRegra {
  field_id: string
  field_label: string | null
  operator: string
  /** A regra aponta para um campo que não existe mais. */
  campo_ausente: boolean
  /** Valores da regra que não correspondem a nenhuma opção do campo. */
  valores_orfaos: string[]
  /** Opções do campo que esta regra não aceita (só em operador positivo). */
  opcoes_descobertas: string[]
}

export interface AuditoriaQualificacao {
  /** Nada a auditar: evento desligado, sem regra, ou campos sem opções. */
  auditavel: boolean
  regras: AuditoriaDaRegra[]
  /** Toda opção que, respondida sozinha, NÃO dispara o evento. */
  respostas_que_nao_disparam: Array<{ campo: string; opcao: string }>
  /** Toda opção que, respondida sozinha, dispara. */
  respostas_que_disparam: Array<{ campo: string; opcao: string }>
  /** Problemas em texto de gente, prontos para a tela. */
  avisos: string[]
}

const iguais = (a: string, b: string) => normalizeForCompare(a) === normalizeForCompare(b)

function valoresDaRegra(v: QualifiedRule["value"]): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (v === null || v === undefined || v === "") return []
  return [String(v)]
}

/**
 * Audita a config contra os campos do formulário.
 *
 * `respostas_que_disparam` é montada SIMULANDO cada opção isolada contra
 * a lógica inteira (`and`/`or`) — não basta olhar regra a regra, porque
 * com `and` uma opção que passa numa regra pode reprovar na outra.
 */
export function auditarQualificacao(
  config: QualifiedLeadConfig | undefined,
  campos: CampoComOpcoes[],
): AuditoriaQualificacao {
  const vazio: AuditoriaQualificacao = {
    auditavel: false,
    regras: [],
    respostas_que_nao_disparam: [],
    respostas_que_disparam: [],
    avisos: [],
  }
  if (!config?.enabled) return vazio
  const regras = config.rules ?? []
  if (regras.length === 0) return vazio

  const porId = new Map(campos.map((c) => [c.id, c]))
  const avisos: string[] = []

  const auditadas: AuditoriaDaRegra[] = regras.map((r) => {
    const campo =
      porId.get(r.field_id) ??
      (r.field_label ? campos.find((c) => (c.label ?? "") === r.field_label) : undefined)

    if (!campo) {
      return {
        field_id: r.field_id,
        field_label: r.field_label ?? null,
        operator: r.operator,
        campo_ausente: true,
        valores_orfaos: [],
        opcoes_descobertas: [],
      }
    }

    const olhaOpcoes = OPERADORES_DE_OPCAO.has(r.operator) && campo.options.length > 0
    const vals = valoresDaRegra(r.value)

    const orfaos = olhaOpcoes ? vals.filter((v) => !campo.options.some((o) => iguais(o, v))) : []
    const descobertas =
      olhaOpcoes && OPERADORES_POSITIVOS.has(r.operator)
        ? campo.options.filter((o) => !vals.some((v) => iguais(o, v)))
        : []

    return {
      field_id: campo.id,
      field_label: campo.label ?? r.field_label ?? null,
      operator: r.operator,
      campo_ausente: false,
      valores_orfaos: orfaos,
      opcoes_descobertas: descobertas,
    }
  })

  for (const a of auditadas) {
    if (a.campo_ausente) {
      avisos.push(
        `A condição aponta para um campo que não existe mais (${a.field_label ?? a.field_id}). Enquanto isso, nenhum cadastro qualifica por ela.`,
      )
      continue
    }
    if (a.valores_orfaos.length > 0) {
      avisos.push(
        `Em "${a.field_label ?? "campo"}", a condição espera ${a.valores_orfaos
          .map((v) => `"${v}"`)
          .join(", ")} — valor que não existe entre as opções do campo. Ninguém pode responder isso.`,
      )
    }
  }

  return {
    auditavel: true,
    regras: auditadas,
    avisos,
    ...simular(config, campos),
  }
}

/**
 * Simula cada opção de cada campo citado pelas regras, uma de cada vez,
 * e diz se ela sozinha dispara o evento.
 *
 * Com `and` de duas regras em campos diferentes, NADA dispara sozinho —
 * e isso é informação, não defeito: a tela mostra a lista vazia e o
 * operador vê que precisa de duas respostas.
 */
function simular(
  config: QualifiedLeadConfig,
  campos: CampoComOpcoes[],
): Pick<AuditoriaQualificacao, "respostas_que_disparam" | "respostas_que_nao_disparam"> {
  const disparam: Array<{ campo: string; opcao: string }> = []
  const naoDisparam: Array<{ campo: string; opcao: string }> = []

  const citados = new Set((config.rules ?? []).map((r) => r.field_id))
  for (const campo of campos) {
    if (campo.derivado || campo.options.length === 0) continue
    // Um campo cujo DERIVADO é citado está sendo auditado também: a
    // regra fala do piso, mas quem escolhe é quem responde a faixa.
    const relevante =
      citados.has(campo.id) || (campo.derivados ?? []).some((d) => citados.has(d.ref))
    if (!relevante) continue
    for (const opcao of campo.options) {
      const answers: Record<string, string> = { [campo.id]: opcao }
      for (const d of campo.derivados ?? []) {
        const v = d.porOpcao[opcao]
        // Opção sem derivado não vira zero: sem a chave, a comparação
        // numérica dá NaN e não dispara — que é o mesmo desfecho do
        // submit e o que a tela precisa mostrar como lacuna.
        if (typeof v === "number") answers[d.ref] = String(v)
      }
      const passa = avaliarLocal(config, answers, campos)
      const linha = { campo: campo.label ?? campo.id, opcao }
      ;(passa ? disparam : naoDisparam).push(linha)
    }
  }
  return { respostas_que_disparam: disparam, respostas_que_nao_disparam: naoDisparam }
}

/**
 * Avaliação local, restrita aos operadores de opção.
 *
 * NÃO importa `evaluateQualified` de propósito: aquele módulo é
 * server-side (a avaliação é a fonte da verdade e não pode viajar para o
 * browser), e este roda no editor. Os operadores cobertos aqui são
 * exatamente os que dependem de opção — o resto devolve `false`, que na
 * simulação significa "não dá para prever por uma opção só".
 */
function avaliarLocal(
  config: QualifiedLeadConfig,
  answers: Record<string, string>,
  campos: CampoComOpcoes[],
): boolean {
  const resultados = (config.rules ?? []).map((r) => {
    const campo =
      campos.find((c) => c.id === r.field_id) ??
      (r.field_label ? campos.find((c) => (c.label ?? "") === r.field_label) : undefined)
    const resposta = campo ? answers[campo.id] : answers[r.field_id]
    if (resposta === undefined) return false
    const vals = valoresDaRegra(r.value)
    if (OPERADORES_NUMERICOS.has(r.operator)) {
      // Mesma aritmética do executor (`evaluateRule`): valor ilegível
      // vira NaN e NENHUMA comparação passa. Tratar como zero
      // desqualificaria por causa de um rótulo que mudou, que é a falha
      // oposta e mais cara.
      const a = Number(resposta)
      const b = Number(vals[0])
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      if (r.operator === "gt") return a > b
      if (r.operator === "gte") return a >= b
      if (r.operator === "lt") return a < b
      return a <= b
    }
    switch (r.operator) {
      case "in":
        return vals.some((v) => iguais(resposta, v))
      case "not_in":
        return !vals.some((v) => iguais(resposta, v))
      case "equals":
        return vals[0] !== undefined && iguais(resposta, vals[0])
      case "not_equals":
        return !(vals[0] !== undefined && iguais(resposta, vals[0]))
      case "is_set":
        return resposta.trim() !== ""
      default:
        return false
    }
  })
  if (resultados.length === 0) return false
  return config.logic === "or" ? resultados.some(Boolean) : resultados.every(Boolean)
}
