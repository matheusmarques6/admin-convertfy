/**
 * A máquina de passos do formulário. Pura, sem I/O, sem React.
 *
 * Responde três perguntas e nada mais: **qual é o bloco agora**, **qual
 * vem depois desta resposta** e **quanto falta**. O renderizador desenha;
 * o servidor reexecuta a mesma função para saber onde a pessoa parou.
 * Uma engine só nos dois lados — duas divergiriam, e a divergência
 * apareceria como "o CRM diz que ele parou na pergunta 4 e ele jura que
 * viu a 6".
 *
 * ## O que este módulo protege
 *
 * **Laço.** Um salto pode apontar para trás; duas regras apontando uma
 * para a outra travam a aba. `LIMITE_DE_SALTOS` corta e o resultado diz
 * `motivo: 'laco'` — o editor mostra isso como erro de lógica em vez de
 * o visitante encontrar uma tela congelada.
 *
 * **Bloco oculto.** `hidden` não é exibido nunca: a navegação o pula em
 * frente e para trás. Se ele fosse só "não renderizado", o Voltar pousaria
 * numa tela vazia.
 *
 * **Progresso que anda para trás.** Com ramificação não existe total
 * exato — o caminho muda conforme a resposta. Estimamos pelo caminho
 * ATUAL (respondidos + o que falta seguindo os defaults daqui), e
 * `progressoMonotonico` garante que a barra nunca recue: barra que volta
 * é lida como perda de progresso e faz desistir.
 *
 * **Resposta órfã.** Quando a pessoa volta e troca uma resposta que muda
 * o caminho, as respostas do ramo antigo continuam em `answers`.
 * `respostasForaDoCaminho` as nomeia para que o submit possa descartá-las
 * — mandar ao CRM a resposta de uma pergunta que a pessoa deixou de ver é
 * pior que não mandar nada.
 */

import type {
  FormAnswer,
  FormAnswers,
  FormBlock,
  FormEnding,
  FormSchema,
  LogicCondition,
  LogicRule,
} from "@/types/forms-conversational"
import { TIPOS_SEM_RESPOSTA } from "@/types/forms-conversational"
import { normalizeForCompare } from "@/lib/tracking/normalizar-comparacao"
import { respostaVazia } from "./validacao"

/** Teto de saltos encadeados num único avanço. Acima disso é laço. */
export const LIMITE_DE_SALTOS = 50

const PREFIXO_ENDING = "ending:"

export interface DestinoBloco {
  tipo: "bloco"
  ref: string
}
export interface DestinoFim {
  tipo: "fim"
  /** `ref` do ending escolhido; `null` = o ending padrão. */
  ending: string | null
}
export interface DestinoErro {
  tipo: "erro"
  motivo: "laco" | "destino_inexistente"
  /** Onde a navegação parou, para a mensagem do editor. */
  ref: string
}

export type Destino = DestinoBloco | DestinoFim | DestinoErro

export interface ContextoLogica {
  answers: FormAnswers
  hidden?: Record<string, string>
  variables?: Record<string, string | number>
}

// ───────────────────────────── condições ────────────────────────────────

function valoresDaCondicao(v: LogicCondition["value"]): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (v === null || v === undefined || v === "") return []
  return [String(v)]
}

const iguais = (a: string, b: string) => normalizeForCompare(a) === normalizeForCompare(b)

/** Número a partir da resposta. `"1.200,50"` no formato BR também. */
function comoNumero(s: string): number {
  const limpo = s.trim().replace(/\s/g, "")
  // "1.200,50" → "1200.50"; "1200.50" fica como está.
  const br = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpo) || /,\d+$/.test(limpo)
  const normal = br ? limpo.replace(/\./g, "").replace(",", ".") : limpo
  return Number(normal.replace(/[^\d.-]/g, ""))
}

/**
 * Avalia UMA condição.
 *
 * Comparação de texto passa por `normalizeForCompare` — o mesmo
 * normalizador do evento qualificado. Comparação numérica NÃO passa: ali
 * a régua é aritmética.
 */
export function avaliarCondicao(cond: LogicCondition, ctx: ContextoLogica): boolean {
  const bruta =
    ctx.answers[cond.ref] ??
    (ctx.hidden ? ctx.hidden[cond.ref] : undefined) ??
    (ctx.variables ? ctx.variables[cond.ref] : undefined)

  const vals = valoresDaCondicao(cond.value)

  if (cond.operator === "is_set") return !respostaVazia(bruta as FormAnswer)

  if (bruta === undefined || bruta === null) return false

  // Resposta múltipla: casa quando QUALQUER item satisfaz. Exigir a lista
  // inteira faria "marque todas que se aplicam" nunca casar.
  const respostas: string[] = Array.isArray(bruta)
    ? bruta.map((x) => String(x))
    : [typeof bruta === "boolean" ? (bruta ? "true" : "false") : String(bruta)]

  switch (cond.operator) {
    case "equals":
      return vals.length > 0 && respostas.some((r) => iguais(r, vals[0]))
    case "not_equals":
      return !(vals.length > 0 && respostas.some((r) => iguais(r, vals[0])))
    case "in":
      return respostas.some((r) => vals.some((v) => iguais(r, v)))
    case "not_in":
      return !respostas.some((r) => vals.some((v) => iguais(r, v)))
    case "contains":
      return respostas.some((r) =>
        vals.some((v) => normalizeForCompare(r).includes(normalizeForCompare(v))),
      )
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const alvo = comoNumero(vals[0] ?? "")
      if (!Number.isFinite(alvo)) return false
      return respostas.some((r) => {
        const n = comoNumero(r)
        if (!Number.isFinite(n)) return false
        if (cond.operator === "gt") return n > alvo
        if (cond.operator === "gte") return n >= alvo
        if (cond.operator === "lt") return n < alvo
        return n <= alvo
      })
    }
    default:
      return false
  }
}

/** Avalia uma regra inteira (`and`/`or`). Regra sem condição nunca casa. */
export function avaliarRegra(regra: LogicRule, ctx: ContextoLogica): boolean {
  const conds = regra.conditions ?? []
  if (conds.length === 0) return false
  return regra.logic === "or"
    ? conds.some((c) => avaliarCondicao(c, ctx))
    : conds.every((c) => avaliarCondicao(c, ctx))
}

/** Aplica os `set` de uma regra que casou. Não muta o contexto original. */
export function aplicarVariaveis(
  regra: LogicRule,
  variables: Record<string, string | number>,
): Record<string, string | number> {
  if (!regra.set || regra.set.length === 0) return variables
  const out = { ...variables }
  for (const op of regra.set) {
    if (op.operacao === "add") {
      const atual = Number(out[op.nome] ?? 0)
      const soma = Number(op.valor)
      out[op.nome] = Number.isFinite(atual) && Number.isFinite(soma) ? atual + soma : atual
    } else {
      out[op.nome] = op.valor
    }
  }
  return out
}

// ───────────────────────────── navegação ────────────────────────────────

/** Blocos que o visitante pode ver: os não ocultos, na ordem do schema. */
export function blocosVisiveis(schema: FormSchema): FormBlock[] {
  return (schema.blocks ?? []).filter((b) => !b.hidden)
}

export function acharBloco(schema: FormSchema, ref: string): FormBlock | undefined {
  return (schema.blocks ?? []).find((b) => b.ref === ref)
}

export function acharEnding(schema: FormSchema, ref: string | null): FormEnding | undefined {
  const lista = schema.endings ?? []
  if (!ref) return lista[0]
  return lista.find((e) => e.ref === ref) ?? lista[0]
}

/** O primeiro bloco visível — onde o formulário começa. */
export function primeiroBloco(schema: FormSchema): Destino {
  const vis = blocosVisiveis(schema)
  return vis.length > 0 ? { tipo: "bloco", ref: vis[0].ref } : { tipo: "fim", ending: null }
}

function proximoNaOrdem(schema: FormSchema, refAtual: string): Destino {
  const vis = blocosVisiveis(schema)
  const i = vis.findIndex((b) => b.ref === refAtual)
  if (i < 0) return { tipo: "fim", ending: null }
  const prox = vis[i + 1]
  return prox ? { tipo: "bloco", ref: prox.ref } : { tipo: "fim", ending: null }
}

function destinoDoGoto(schema: FormSchema, goto: string, origem: string): Destino {
  if (goto.startsWith(PREFIXO_ENDING)) {
    const ref = goto.slice(PREFIXO_ENDING.length)
    return { tipo: "fim", ending: ref || null }
  }
  const alvo = acharBloco(schema, goto)
  if (!alvo) return { tipo: "erro", motivo: "destino_inexistente", ref: origem }
  // Saltar PARA um oculto não faz sentido (ele não é exibido); seguimos
  // para o próximo visível a partir dele, em vez de travar.
  if (alvo.hidden) return proximoNaOrdem(schema, alvo.ref)
  return { tipo: "bloco", ref: alvo.ref }
}

export interface ResultadoAvanco {
  destino: Destino
  /** Variáveis depois dos `set` das regras que casaram no caminho. */
  variables: Record<string, string | number>
}

/**
 * De onde estou, para onde vou.
 *
 * Encadeia: se o destino for um `statement` (bloco sem resposta) a
 * navegação NÃO o pula — ele é uma tela, e pulá-lo apagaria o texto que
 * alguém escreveu para ser lido. Quem encadeia é o salto: A → B por
 * lógica, e B tem lógica que manda para C sem depender de resposta nova.
 */
export function proximoPasso(
  schema: FormSchema,
  refAtual: string,
  ctx: ContextoLogica,
): ResultadoAvanco {
  let variables = { ...(ctx.variables ?? {}) }
  let atual = refAtual
  const visitados = new Set<string>([refAtual])

  for (let i = 0; i < LIMITE_DE_SALTOS; i++) {
    const bloco = acharBloco(schema, atual)
    if (!bloco) return { destino: { tipo: "fim", ending: null }, variables }

    const contexto: ContextoLogica = { ...ctx, variables }
    const regra = (bloco.logic ?? []).find((r) => avaliarRegra(r, contexto))

    if (!regra) return { destino: proximoNaOrdem(schema, atual), variables }

    variables = aplicarVariaveis(regra, variables)
    const destino = destinoDoGoto(schema, regra.goto, atual)

    if (destino.tipo !== "bloco") return { destino, variables }

    // Só continua encadeando quando o destino é um bloco que NÃO coleta
    // resposta e tem lógica própria — o caso "tela de aviso que decide
    // sozinha para onde ir". Qualquer outro destino é onde paramos.
    const alvo = acharBloco(schema, destino.ref)
    const encadeia =
      alvo !== undefined && TIPOS_SEM_RESPOSTA.has(alvo.type) && (alvo.logic ?? []).length > 0
    if (!encadeia) return { destino, variables }

    if (visitados.has(destino.ref)) {
      return { destino: { tipo: "erro", motivo: "laco", ref: destino.ref }, variables }
    }
    visitados.add(destino.ref)
    atual = destino.ref
  }

  return { destino: { tipo: "erro", motivo: "laco", ref: atual }, variables }
}

/**
 * O caminho percorrido até `refAtual`, partindo do início e reexecutando
 * a lógica com as respostas de hoje.
 *
 * É a única forma correta de responder "voltar" com ramificação: guardar
 * uma pilha de telas visitadas fica errada assim que a pessoa muda uma
 * resposta lá atrás. Reconstruir é barato (dezenas de blocos) e nunca
 * discorda do que a lógica faria agora.
 *
 * Quando `refAtual` não é alcançável com as respostas atuais — o que
 * acontece exatamente depois de trocar uma resposta que muda o rumo — o
 * caminho volta até onde dá, e é ali que a navegação deve pousar.
 */
export function caminhoAte(
  schema: FormSchema,
  refAtual: string,
  ctx: ContextoLogica,
): { caminho: string[]; alcancou: boolean } {
  const inicio = primeiroBloco(schema)
  if (inicio.tipo !== "bloco") return { caminho: [], alcancou: false }

  const caminho: string[] = [inicio.ref]
  if (inicio.ref === refAtual) return { caminho, alcancou: true }

  let variables = { ...(ctx.variables ?? {}) }
  let atual = inicio.ref

  for (let i = 0; i < LIMITE_DE_SALTOS; i++) {
    const r = proximoPasso(schema, atual, { ...ctx, variables })
    variables = r.variables
    if (r.destino.tipo !== "bloco") return { caminho, alcancou: false }
    if (caminho.includes(r.destino.ref)) return { caminho, alcancou: false }
    caminho.push(r.destino.ref)
    if (r.destino.ref === refAtual) return { caminho, alcancou: true }
    atual = r.destino.ref
  }
  return { caminho, alcancou: false }
}

/** O bloco anterior no caminho real. `null` quando já está no primeiro. */
export function passoAnterior(
  schema: FormSchema,
  refAtual: string,
  ctx: ContextoLogica,
): string | null {
  const { caminho } = caminhoAte(schema, refAtual, ctx)
  const i = caminho.indexOf(refAtual)
  if (i > 0) return caminho[i - 1]
  // Não alcançável: o último ponto válido do caminho é para onde voltar.
  if (i < 0 && caminho.length > 0) return caminho[caminho.length - 1]
  return null
}

// ───────────────────────────── progresso ────────────────────────────────

export interface Progresso {
  /** Quantos blocos o visitante já passou, contando o atual. */
  indice: number
  /** Estimativa do total DESTE caminho. Nunca é promessa. */
  total: number
  /** 0..1. */
  fracao: number
}

/**
 * Progresso estimado pelo caminho atual.
 *
 * O total conta o percorrido mais o que falta seguindo os DEFAULTS a
 * partir daqui — a lógica pode encurtar ou alongar, e a estimativa muda
 * junto. É por isso que `progressoMonotonico` existe.
 */
export function calcularProgresso(
  schema: FormSchema,
  refAtual: string,
  ctx: ContextoLogica,
): Progresso {
  const { caminho } = caminhoAte(schema, refAtual, ctx)
  const indice = Math.max(caminho.indexOf(refAtual) + 1, caminho.length)

  let restantes = 0
  let atual = refAtual
  let variables = { ...(ctx.variables ?? {}) }
  const vistos = new Set(caminho)
  for (let i = 0; i < LIMITE_DE_SALTOS; i++) {
    const r = proximoPasso(schema, atual, { ...ctx, variables })
    variables = r.variables
    if (r.destino.tipo !== "bloco") break
    if (vistos.has(r.destino.ref)) break
    vistos.add(r.destino.ref)
    restantes += 1
    atual = r.destino.ref
  }

  const total = Math.max(indice + restantes, 1)
  return { indice, total, fracao: Math.min(indice / total, 1) }
}

/** A barra nunca recua. Guarde o retorno e passe-o na próxima chamada. */
export function progressoMonotonico(anterior: number, atual: number): number {
  return Math.max(anterior, Math.min(Math.max(atual, 0), 1))
}

// ─────────────────────── respostas fora do caminho ──────────────────────

/**
 * Refs respondidos que o caminho atual não inclui.
 *
 * Acontece quando a pessoa volta e troca uma resposta que muda o ramo.
 * Quem chama decide: o renderizador as mantém em memória (para não perder
 * o que a pessoa digitou caso ela desfaça a troca) e o submit as descarta.
 */
export function respostasForaDoCaminho(
  schema: FormSchema,
  ctx: ContextoLogica,
  refFinal: string | null,
): string[] {
  const alvo = refFinal ?? ultimoAlcancavel(schema, ctx)
  if (!alvo) return []
  const { caminho } = caminhoAte(schema, alvo, ctx)
  const noCaminho = new Set(caminho)
  return Object.keys(ctx.answers).filter((ref) => {
    if (noCaminho.has(ref)) return false
    // Oculto não está no caminho por definição e não é órfão.
    const b = acharBloco(schema, ref)
    if (!b || b.hidden) return false
    return true
  })
}

/** O último bloco que a lógica alcança com as respostas de hoje. */
export function ultimoAlcancavel(schema: FormSchema, ctx: ContextoLogica): string | null {
  const inicio = primeiroBloco(schema)
  if (inicio.tipo !== "bloco") return null
  let atual = inicio.ref
  let variables = { ...(ctx.variables ?? {}) }
  const vistos = new Set([atual])
  for (let i = 0; i < LIMITE_DE_SALTOS; i++) {
    const r = proximoPasso(schema, atual, { ...ctx, variables })
    variables = r.variables
    if (r.destino.tipo !== "bloco") return atual
    if (vistos.has(r.destino.ref)) return atual
    vistos.add(r.destino.ref)
    atual = r.destino.ref
  }
  return atual
}

/**
 * A primeira pergunta do caminho que está SEM resposta.
 *
 * Diferente de `ultimoAlcancavel`, que responde "até onde a lógica chega
 * seguindo os defaults". Sem resposta na pergunta 2, a lógica segue pelo
 * default e alcança a última — mas a pessoa está na 2. Confundir as duas
 * faria o CRM afirmar que ela abandonou no fim do formulário, que é a
 * informação mais errada possível para quem vai ligar.
 *
 * `statement` não conta: ele não coleta resposta.
 */
export function primeiroSemResposta(schema: FormSchema, ctx: ContextoLogica): string | null {
  const alvo = ultimoAlcancavel(schema, ctx)
  if (!alvo) return null
  const { caminho } = caminhoAte(schema, alvo, ctx)
  for (const ref of caminho) {
    const b = acharBloco(schema, ref)
    if (!b || TIPOS_SEM_RESPOSTA.has(b.type)) continue
    if (!respondido(ctx, ref)) return ref
  }
  return caminho.length > 0 ? caminho[caminho.length - 1] : null
}

/**
 * Onde a pessoa parou, do ponto de vista do CRM.
 *
 * Não é "a última que ela respondeu": o que interessa ao vendedor é a
 * PERGUNTA QUE ELA VIU E NÃO RESPONDEU — é ali que a objeção está.
 *
 * `currentRef` (a tela que o autosave gravou) VENCE, porque é medição
 * direta; a derivação é o palpite de quando esse dado não chegou — aba
 * fechada antes do primeiro autosave, rede caída. Bloco que sumiu do
 * schema (o formulário foi editado depois) também cai na derivação, em
 * vez de devolver nada.
 */
export function blocoDoAbandono(
  schema: FormSchema,
  ctx: ContextoLogica,
  currentRef: string | null,
): FormBlock | null {
  if (currentRef) {
    const b = acharBloco(schema, currentRef)
    if (b && !b.hidden) return b
  }
  const alvo = primeiroSemResposta(schema, ctx)
  return alvo ? (acharBloco(schema, alvo) ?? null) : null
}

/** Um bloco tem resposta preenchida? Usado pelo autosave e pelo abandono. */
export function respondido(ctx: ContextoLogica, ref: string): boolean {
  return !respostaVazia(ctx.answers[ref])
}

/** Quantos blocos do caminho já têm resposta. */
export function totalRespondido(schema: FormSchema, ctx: ContextoLogica): number {
  const alvo = ultimoAlcancavel(schema, ctx)
  if (!alvo) return 0
  const { caminho } = caminhoAte(schema, alvo, ctx)
  return caminho.filter((ref) => {
    const b = acharBloco(schema, ref)
    if (!b || TIPOS_SEM_RESPOSTA.has(b.type)) return false
    return respondido(ctx, ref)
  }).length
}

/** Atalho A, B, C… declarado ou derivado da posição. */
export function atalhoDaOpcao(indice: number, declarado?: string): string {
  if (declarado) return declarado.toUpperCase()
  return indice < 26 ? String.fromCharCode(65 + indice) : ""
}

export type { FormAnswer, FormAnswers, FormBlock, FormSchema }
