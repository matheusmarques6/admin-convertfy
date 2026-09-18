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
import type { MidiaDaTela } from "@/lib/forms/midia"
import type { Calculo } from "@/lib/forms/calculo"

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
  /**
   * Piso da faixa em REAL, quando a opção representa um valor.
   *
   * É o que a qualificação compara — o `value` é o rótulo NA MOEDA que a
   * pessoa viu, e comparar texto é o que faz renomear uma opção desligar
   * o evento em silêncio. Ausente em opção que não é faixa de valor.
   */
  piso?: number
  /** Moeda em que o rótulo foi escrito. Só em opção de faixa. */
  moeda?: "BRL" | "USD" | "EUR"
  /**
   * Tag que esta resposta põe no lead e no negócio.
   *
   * É o "quem marcar qualquer uma destas vai para o topo da fila": a
   * marca mora na OPÇÃO, onde quem escreve a pergunta a enxerga, em vez
   * de numa regra separada que ninguém relaciona com a resposta.
   * Normalizada na gravação (ver `lib/forms/desfecho`).
   */
  tag?: string
  /**
   * O número que esta opção REPRESENTA na conta — 2.000 acessos por dia,
   * ticket de 300.
   *
   * Não é o `piso`: aquele é o chão da faixa em real, e existe para a
   * qualificação comparar número em vez de texto. Este é o valor típico
   * que entra na aritmética, e os dois divergem de propósito (a faixa
   * "R$100 mil a R$200 mil" tem piso 100.000 e valor de referência
   * 150.000 — usar o piso faria toda conta sair pelo mínimo).
   */
  valor?: number
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
  /**
   * Esta pergunta divide a TELA com a anterior.
   *
   * É o que faz o primeiro passo pedir nome, telefone e email de uma vez
   * — e só depois passar a uma pergunta por vez. A grade é a mesma do
   * formato de página única; o que muda é onde ela termina.
   *
   * Duas consequências que a engine é obrigada a respeitar, senão a
   * pessoa vê meia tela: um salto que aponta para uma pergunta agrupada
   * pousa no INÍCIO da tela dela, e o Voltar também.
   *
   * O `ref` continua sendo o `crm_form_fields.id` de cada pergunta —
   * agrupar é decisão de apresentação e não pode mexer no endereço da
   * resposta, senão a regra do evento qualificado deixa de casar.
   */
  mesma_tela?: boolean
  /**
   * Título acima da tela. Só é lido no bloco que ABRE a tela.
   *
   * Com várias perguntas juntas, o rótulo de cada campo fica pequeno e
   * sobra a pergunta de por que elas estão ali — é o que este texto
   * responde ("seus dados de contato"). Numa tela de pergunta única ele
   * seria um segundo título competindo com o primeiro: ali o rótulo já
   * é a pergunta.
   */
  titulo_da_tela?: string | null
  /**
   * As opções desta pergunta são FAIXAS DE VALOR, escritas na moeda da
   * região respondida em `moeda_de`.
   *
   * O `ref` continua sendo um só — a resposta tem um endereço e um lugar
   * no funil, em qualquer moeda. O que muda é o rótulo; o que amarra é o
   * `piso` de cada opção. A alternativa (uma pergunta de faturamento por
   * moeda, escolhida por salto) espalharia a mesma resposta em quatro
   * campos, e a régua do evento qualificado teria de cobrir os quatro.
   */
  opcoes_por_moeda?: boolean
  /** `ref` da pergunta de região que decide a moeda das opções. */
  moeda_de?: string | null
  /**
   * Nome da variável que recebe o `valor` da opção escolhida aqui.
   *
   * É o que liga a resposta à conta: a pergunta de acessos declara
   * `variavel: "visitas"`, e a expressão `visitas * 0.10` passa a valer.
   * Sem isso as fórmulas teriam de citar o uuid do bloco.
   */
  variavel?: string | null
  /** Regras de salto. A primeira que casa vence; nenhuma → `proximo`. */
  logic?: LogicRule[]
  /**
   * Destino PADRÃO da tela — para onde vai quem não caiu em desvio
   * nenhum. Ausente = a próxima tela na ordem, que é o comportamento
   * histórico.
   *
   * Mesmo vocabulário do `goto` de uma regra (`ref` de bloco ou
   * `ending:<ref>`), porque são a mesma decisão: "depois daqui, ali". Um
   * segundo vocabulário para o caminho padrão divergiria do dos desvios
   * na primeira mudança.
   *
   * É da TELA, não da pergunta: quatro campos juntos são um passo só. O
   * construtor grava sempre na cabeça e limpa dos demais; a engine lê o
   * PRIMEIRO declarado entre os blocos da tela, para que reagrupar as
   * perguntas na aba Perguntas não faça o destino sumir em silêncio.
   */
  proximo?: string | null
  /**
   * Imagem ou vídeo acima do título. Ver `lib/forms/midia`.
   *
   * Mora em `crm_form_fields.media`, e não no schema do rascunho, porque
   * é CONTEÚDO da tela — como a descrição. No rascunho ela sobreviveria
   * só enquanto ninguém publicasse com a lista de campos de outro dia.
   */
  midia?: MidiaDaTela | null
  /**
   * A resposta desta pergunta vai em DESTAQUE no card.
   *
   * Uma só por formulário (a primeira marcada vence): é a frase que o
   * closer devolve na conversa, e destacar cinco é não destacar nenhuma.
   */
  destaque?: boolean
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

/**
 * `agenda` é o único que NÃO leva para fora: ele mostra a nossa agenda
 * (sincronizada com o Google) dentro da própria tela final. Mandar quem
 * acabou de ser aprovado para outro domínio custa o instante em que ele
 * está com a mão no teclado — e um serviço de fora não sabe que aquela
 * pessoa é um lead nosso, com negócio e histórico.
 */
export const TIPOS_DE_DESTINO = ["whatsapp", "calendly", "url", "agenda"] as const
export type TipoDeDestino = (typeof TIPOS_DE_DESTINO)[number]

/**
 * Para onde o lead vai quando termina. A régua que monta o endereço a
 * partir disto é pura e vive em `lib/forms/destino`.
 */
export interface DestinoDoFinal {
  tipo: TipoDeDestino
  /**
   * WhatsApp: **o NOSSO número**, o que vai RECEBER a mensagem — não o
   * telefone que o lead acabou de digitar. A confusão é fácil e o
   * estrago é a pessoa abrir uma conversa consigo mesma.
   */
  numero?: string | null
  /** WhatsApp: o texto que já vai escrito. Aceita `{{pergunta}}`. */
  mensagem?: string | null
  /** Calendly ou endereço livre. Aceita `{{pergunta}}`. */
  url?: string | null
  /** Leva sozinho, sem esperar clique. O botão continua na tela. */
  automatico?: boolean
  /** Texto do botão. Vazio usa o padrão do tipo. */
  rotulo?: string | null
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
   * Para onde o lead vai daqui — WhatsApp com o texto pronto, o horário
   * no Calendly, ou um endereço livre. Ver `lib/forms/destino`.
   *
   * Vive no FINAL, e não no formulário, porque só um dos quatro finais
   * do diagnóstico aprova: um destino no nível do formulário mandaria
   * para o agendamento quem acabou de ler que a conta não fecha.
   *
   * Vence o `redirect_url` quando os dois existem: ele carrega o dado de
   * quem respondeu, o outro é um endereço fixo para todo mundo.
   */
  destino?: DestinoDoFinal | null
  /**
   * Marca o desfecho como desqualificado. Muda a `status` da sessão para
   * `disqualified` — o que NÃO é abandono e não pode ser cobrado como tal.
   */
  disqualified?: boolean
  /** Tags que este desfecho põe no lead e no negócio. */
  tags?: string[]
  /**
   * `false` = o cadastro vira lead e NÃO entra na pipeline.
   *
   * Num funil que recusa mais do que aprova, criar card para todo
   * desfecho enche o Inbound de gente que acabou de ler "a conta não
   * fecha para você". Ausente = cria, que é o comportamento de todo
   * formulário no ar hoje.
   */
  cria_negocio?: boolean
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
    /**
     * A conta que o formulário faz com as respostas. Roda na ordem, e o
     * resultado entra no texto por recall. Ver `lib/forms/calculo`.
     */
    calculos?: Calculo[]
    /** Texto da tela de abertura; ausente = começa na 1ª pergunta. */
    welcome?: {
      title: string
      description?: string | null
      button_label?: string
      /** O vídeo de quem assina o formulário. Ver `lib/forms/midia`. */
      midia?: MidiaDaTela | null
    }
  }
}

/** Uma resposta. `string[]` só em `multi_select`; `boolean` em `checkbox`. */
export type FormAnswer = string | string[] | boolean | number | null

export type FormAnswers = Record<string, FormAnswer>
