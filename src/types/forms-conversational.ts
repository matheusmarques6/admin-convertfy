/**
 * Schema do formulário — a forma publicada, imutável, que vive em
 * `form_versions.schema`.
 *
 * Um schema serve os DOIS modos. `display_mode: 'classic'` renderiza
 * tudo numa página (o comportamento histórico, byte a byte);
 * `'conversational'` renderiza um bloco por vez. A diferença é de
 * apresentação: a lógica de salto, a validação e o mapeamento para o
 * lead são os mesmos, porque um formulário não muda de significado ao
 * mudar de layout.
 *
 * ## `ref` é o endereço, e ele NÃO pode ser inventado
 *
 * Todo bloco tem um `ref` estável. Para os campos que já existem, o
 * `ref` é o `crm_form_fields.id` — e isso não é conveniência, é
 * obrigação: `tracking_config.rules[].field_id` aponta para aquele id,
 * `form_submissions.data` é chaveada por ele, e `answers` idem. Gerar um
 * `ref` novo faria a regra do evento "lead qualificado" deixar de casar
 * **em silêncio**, que é exatamente o modo de falha que o repo já pagou
 * duas vezes (o 42P10 da fila e o `===` cru da condição).
 *
 * ## Por que os operadores são os do evento qualificado
 *
 * `QualifiedOperator` já é o vocabulário de condição deste produto. A
 * lógica de salto usa o MESMO enum e o MESMO normalizador de comparação
 * (`normalizeForCompare`). Dois vocabulários no mesmo formulário — um
 * para "pular para" e outro para "qualificar" — divergiriam na primeira
 * mudança, e quem monta a regra não tem como saber qual está olhando.
 */

import type { QualifiedOperator } from "@/types/form-tracking"

/** Os 13 tipos do editor clássico, mais os blocos que só o conversacional tem. */
export type FormBlockType =
  // campos (idênticos ao editor clássico — `FIELD_TYPES`)
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "url"
  | "cpf"
  | "cnpj"
  | "cep"
  // só conversacional
  | "statement"
  | "multi_select"

/** Tipos que não coletam resposta — avançam sozinhos. */
export const TIPOS_SEM_RESPOSTA: ReadonlySet<FormBlockType> = new Set(["statement"])

/** Tipos cuja resposta é uma das `options`. */
export const TIPOS_DE_ESCOLHA: ReadonlySet<FormBlockType> = new Set([
  "select",
  "radio",
  "multi_select",
])

export interface FormOption {
  label: string
  value: string
  /** Letra do atalho de teclado (A, B, C…). Derivada quando ausente. */
  atalho?: string
}

export interface FormBlock {
  /** Endereço estável. Em campos migrados, é o `crm_form_fields.id`. */
  ref: string
  /**
   * Nome curto para o recall: `{{nome}}` em vez de `{{<uuid>}}`.
   *
   * O `ref` é obrigado a ser o id do campo (a regra do evento
   * qualificado aponta para ele), e id não se digita num texto de
   * pergunta. O alias é o apelido de leitura — só isso; ele não endereça
   * resposta, não entra em lógica e não vai ao banco como chave.
   */
  alias?: string
  type: FormBlockType
  label: string
  /** Texto de apoio abaixo da pergunta. Aceita recall. */
  description?: string | null
  placeholder?: string | null
  required?: boolean
  options?: FormOption[]
  validation?: {
    min?: number
    max?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    /** Telefone com seletor de país (o default do editor clássico). */
    countryCode?: boolean
    /** Em `multi_select`: quantas opções no mínimo/máximo. */
    minEscolhas?: number
    maxEscolhas?: number
  }
  /** Campo do lead que esta resposta preenche (name, email, phone…). */
  map_to_lead_field?: string | null
  /** Regras de salto. A primeira que casa vence; nenhuma → próximo na ordem. */
  logic?: LogicRule[]
  /** Oculto: não é exibido; o valor vem da URL ou do embed. */
  hidden?: boolean
}

export interface LogicCondition {
  /** `ref` do bloco cuja resposta é testada. */
  ref: string
  operator: QualifiedOperator
  value?: string | string[] | number | null
}

export interface LogicRule {
  conditions: LogicCondition[]
  logic: "and" | "or"
  /** Destino: `ref` de um bloco, ou `ending:<ref>` para terminar. */
  goto: string
  /** Variáveis a definir quando a regra casa (score, faixa, etc.). */
  set?: Array<{ nome: string; operacao: "set" | "add"; valor: string | number }>
}

export interface FormEnding {
  ref: string
  /** Título da tela final. Aceita recall. */
  title: string
  description?: string | null
  /** Redireciona em vez de mostrar a tela. */
  redirect_url?: string | null
  /** Rótulo de um botão opcional (ex.: "Agendar diagnóstico"). */
  button_label?: string | null
  button_url?: string | null
  /**
   * Marca o desfecho como desqualificado. Muda a `status` da sessão para
   * `disqualified` — o que NÃO é abandono e não pode ser cobrado como tal.
   */
  disqualified?: boolean
}

export interface FormSchema {
  version: number
  display_mode: "classic" | "conversational"
  locale: string
  blocks: FormBlock[]
  endings?: FormEnding[]
  /** Campos ocultos aceitos pela URL (`?utm_source=…&plano=x`). */
  hidden_fields?: string[]
  settings?: {
    /** Barra de progresso no conversacional. */
    mostrar_progresso?: boolean
    /** Enter avança (padrão) ou exige clique. */
    enter_avanca?: boolean
    /** Rótulo do botão de avançar. */
    rotulo_avancar?: string
    /** Texto da tela de abertura; ausente = começa na 1ª pergunta. */
    welcome?: { title: string; description?: string | null; button_label?: string }
  }
}

/** Uma resposta. `string[]` só em `multi_select`; `boolean` em `checkbox`. */
export type FormAnswer = string | string[] | boolean | number | null

export type FormAnswers = Record<string, FormAnswer>
