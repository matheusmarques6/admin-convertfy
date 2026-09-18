/**
 * A conta que o formulário faz na cara de quem responde.
 *
 * "Com os seus 2.000 acessos, são 90 carrinhos abandonados por dia —
 * R$81 mil por mês que você está deixando passar." Esse parágrafo é o
 * que transforma um questionário em argumento, e ele precisa de
 * aritmética: as variáveis da lógica de salto fazem `set` e `add`, e com
 * isso dá para somar um score, não para multiplicar acesso por ticket.
 *
 * ## Por que uma expressão, e não `set`/`add` no JSON
 *
 * A conta tem 13 passos encadeados. Expressá-la como 13 regras de salto
 * com operação aritmética deixaria a fórmula ilegível, espalhada por
 * blocos diferentes, e sem um lugar onde alguém possa CONFERIR a conta.
 * Aqui ela é uma lista de linhas nomeadas, na ordem em que se lê.
 *
 * ## Três decisões que o texto final depende
 *
 * 1. **Resultado não finito não vira variável.** Ticket zero faria
 *    `faturamento / ticket` virar `Infinity`, e o recall imprimiria
 *    "Infinity pedidos por mês" para o visitante. Sem a variável, o
 *    recall cai no fallback declarado no texto.
 * 2. **Número arredondado PARA BAIXO.** "R$18.437,50" parece planilha;
 *    "R$20 mil" parece invenção. O meio-termo é arredondar para baixo e
 *    dizer que a conta está sendo conservadora — o que também protege
 *    quem lê: a conta real nunca é menor que a mostrada.
 * 3. **Nada de `eval`.** A expressão vem de um schema que um operador
 *    edita e roda no NAVEGADOR de quem responde. O avaliador entende
 *    número, nome, `+ - * /` e parênteses, e mais nada.
 */

import { moedaDaRegiao, opcoesDeFaturamento, TAXA_PARA_BRL, type Moeda } from "./moeda"

export interface Calculo {
  /** Nome da variável, como aparece no texto: `{{receita_mes}}`. */
  nome: string
  /** `visitas * 0.10`, `carrinhos - vendas`, `(a + b) * 30`. */
  expressao: string
  /**
   * Como o número vira texto. `dinheiro` usa a moeda da trilha;
   * `numero` é contagem (pedidos, carrinhos) e nunca leva símbolo.
   */
  formato?: "numero" | "dinheiro"
}

export type Numeros = Record<string, number>

export interface ResultadoDoCalculo {
  /** Os números, para as expressões seguintes e para quem quiser medir. */
  numeros: Numeros
  /** O texto já formatado, que é o que o recall imprime. */
  textos: Record<string, string>
}

// ─────────────────────────── avaliador ──────────────────────────────

type Token = { t: "num"; v: number } | { t: "nome"; v: string } | { t: "op"; v: string }

const SIMBOLOS = new Set(["+", "-", "*", "/", "(", ")"])

function tokenizar(expr: string): Token[] | null {
  const out: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (SIMBOLOS.has(c)) {
      out.push({ t: "op", v: c })
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      const n = Number(expr.slice(i, j))
      if (!Number.isFinite(n)) return null
      out.push({ t: "num", v: n })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++
      out.push({ t: "nome", v: expr.slice(i, j) })
      i = j
      continue
    }
    // Qualquer outro caractere é recusa: é o que mantém `eval` fora.
    return null
  }
  return out
}

/**
 * Avalia a expressão. Devolve `null` quando ela não é avaliável — nome
 * que não existe, sintaxe quebrada, divisão por zero. `null` é o certo:
 * o texto cai no fallback em vez de imprimir uma conta inventada.
 */
export function avaliarExpressao(expr: string, vars: Numeros): number | null {
  const tokens = tokenizar(expr)
  if (!tokens || tokens.length === 0) return null

  let pos = 0
  const olhar = () => tokens[pos]
  const consumir = () => tokens[pos++]

  // soma := produto (('+' | '-') produto)*
  const soma = (): number | null => {
    let esq = produto()
    if (esq === null) return null
    for (;;) {
      const t = olhar()
      if (!t || t.t !== "op" || (t.v !== "+" && t.v !== "-")) return esq
      consumir()
      const dir = produto()
      if (dir === null) return null
      esq = t.v === "+" ? esq + dir : esq - dir
    }
  }

  // produto := unario (('*' | '/') unario)*
  const produto = (): number | null => {
    let esq = unario()
    if (esq === null) return null
    for (;;) {
      const t = olhar()
      if (!t || t.t !== "op" || (t.v !== "*" && t.v !== "/")) return esq
      consumir()
      const dir = unario()
      if (dir === null) return null
      if (t.v === "/" && dir === 0) return null
      esq = t.v === "*" ? esq * dir : esq / dir
    }
  }

  const unario = (): number | null => {
    const t = olhar()
    if (t && t.t === "op" && t.v === "-") {
      consumir()
      const v = unario()
      return v === null ? null : -v
    }
    return primario()
  }

  const primario = (): number | null => {
    const t = consumir()
    if (!t) return null
    if (t.t === "num") return t.v
    if (t.t === "nome") {
      const v = vars[t.v]
      return typeof v === "number" && Number.isFinite(v) ? v : null
    }
    if (t.t === "op" && t.v === "(") {
      const dentro = soma()
      const fecha = consumir()
      if (dentro === null || !fecha || fecha.t !== "op" || fecha.v !== ")") return null
      return dentro
    }
    return null
  }

  const r = soma()
  if (r === null || pos !== tokens.length) return null
  return Number.isFinite(r) ? r : null
}

// ─────────────────────────── formatação ─────────────────────────────

/**
 * O número como ele aparece no texto.
 *
 * Abaixo de 10 mil o arredondamento é para a unidade (89 carrinhos, não
 * "90 mil"); acima, para o milhar de baixo, e o texto diz "mil" em vez
 * de escrever cinco dígitos. Sempre PARA BAIXO: a conta mostrada nunca
 * pode ser maior que a conta real.
 */
export function arredondarParaBaixo(n: number): number {
  const abs = Math.abs(n)
  if (abs < 10_000) return Math.floor(n)
  return Math.floor(n / 1000) * 1000
}

const SIMBOLO: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€" }

export function formatarNumero(
  n: number,
  formato: "numero" | "dinheiro" = "numero",
  moeda = "BRL",
): string {
  const v = arredondarParaBaixo(n)
  if (formato !== "dinheiro") return new Intl.NumberFormat("pt-BR").format(v)

  const s = SIMBOLO[moeda] ?? SIMBOLO.BRL

  // A partir de um milhão a escala vira "milhão", e não "mil": a loja
  // de 10 mil acessos com ticket acima de R$800 produzia
  // **"R$1.260 mil"** — número que ninguém escreve e que faz a conta
  // inteira parecer amadora, justamente na tela que pede R$3.500 por
  // mês. Uma casa decimal, para baixo como todo o resto do módulo.
  if (Math.abs(v) >= 1_000_000) {
    const decimos = Math.floor(Math.abs(v) / 100_000)
    const texto = (decimos / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
    // Plural pela parte INTEIRA: "1,9 milhão" e "2,1 milhões".
    const unidade = Math.floor(decimos / 10) >= 2 ? "milhões" : "milhão"
    return `${s}${v < 0 ? "-" : ""}${texto} ${unidade}`
  }

  // Acima de 10 mil o texto fala em "mil"; o número cheio ali só faz a
  // frase parecer relatório. Abaixo disso, o valor exato é o que soa
  // verdadeiro ("R$4.350", não "R$4 mil").
  if (Math.abs(v) >= 10_000) {
    const milhares = Math.floor(v / 1000)
    return `${s}${new Intl.NumberFormat("pt-BR").format(milhares)} mil`
  }
  return `${s}${new Intl.NumberFormat("pt-BR").format(v)}`
}

// ─────────────────────────── a passada ──────────────────────────────

/**
 * Roda a lista NA ORDEM: cada linha enxerga o resultado das anteriores.
 * Linha que não avalia é pulada — e as que dependem dela também caem,
 * porque o nome delas continua sem valor.
 *
 * **O que segue na cadeia é o número EXIBIDO, não o bruto.** A conta é
 * mostrada ao visitante linha a linha, e ele refaz a multiplicação de
 * cabeça: com 8,5 pedidos por dia o texto diria "8 pedidos" e
 * "R$2.550 por dia", e 8 × 300 não dá 2.550 — a conta não fecharia na
 * cara de quem está lendo, que é o único lugar onde ela precisa fechar.
 * Propagar o exibido também mantém a promessa do arredondamento: cada
 * linha é sempre <= o que a expressão dela produziu. A promessa é por
 * LINHA, não da cadeia inteira: numa subtração, arredondar o subtraendo
 * para baixo AUMENTA a diferença (105 no lugar de 104,89). O desvio é
 * menor que uma unidade por parcela e o texto diz que a conta está sendo
 * conservadora — o que não dá para afirmar é que a composição inteira
 * fica abaixo do valor com decimais.
 */
export function calcular(
  calculos: Calculo[] | undefined,
  base: Numeros,
  moeda = "BRL",
): ResultadoDoCalculo {
  const numeros: Numeros = { ...base }
  const textos: Record<string, string> = {}
  for (const c of calculos ?? []) {
    if (!c?.nome || !c?.expressao) continue
    const v = avaliarExpressao(c.expressao, numeros)
    if (v === null) continue
    const exibido = arredondarParaBaixo(v)
    numeros[c.nome] = exibido
    textos[c.nome] = formatarNumero(exibido, c.formato ?? "numero", moeda)
  }
  return { numeros, textos }
}

// ───────────────── as respostas viram números ───────────────────────

interface BlocoComVariavel {
  ref: string
  variavel?: string | null
  options?: Array<{ value: string; valor?: number }>
  opcoes_por_moeda?: boolean
  moeda_de?: string | null
}

/**
 * Traduz as respostas de escolha nos números que a conta usa.
 *
 * A ponte é o `variavel` do bloco mais o `valor` da opção: a pergunta de
 * acessos declara `variavel: "visitas"`, a opção "De 1.000 a 3.000"
 * carrega `valor: 2000`, e a expressão `visitas * 0.10` passa a valer
 * sem citar uuid nenhum.
 *
 * Opção sem `valor` não define a variável — e não define como zero: zero
 * é um número plausível que sairia impresso ("0 carrinhos por dia") e
 * contaminaria toda a cadeia. Sem a variável, o texto cai no fallback.
 */
export function variaveisDasRespostas(
  blocos: BlocoComVariavel[],
  answers: Record<string, unknown>,
): Numeros {
  const out: Numeros = {}
  for (const b of blocos) {
    const nome = (b.variavel ?? "").trim()
    if (!nome) continue
    const resposta = answers[b.ref]
    if (typeof resposta !== "string" || !resposta) continue
    const v = valorDaResposta(b, resposta, answers)
    if (typeof v === "number" && Number.isFinite(v)) out[nome] = v
  }
  return out
}

// ─────────────────── a moeda em que a conta é dita ──────────────────

/**
 * A moeda da trilha, lida da resposta de região.
 *
 * A conta é mostrada na moeda em que a pessoa RESPONDEU o faturamento —
 * dizer "R$ 81 mil" para quem acabou de marcar "US$50k – US$100k" é a
 * mesma confusão de unidade que `lib/forms/moeda` existe para fechar,
 * agora no texto em vez de na opção.
 *
 * Devolve `null` quando nenhum bloco depende de região ou quando ela
 * ainda não foi respondida; quem chama decide o padrão. Escolher o real
 * aqui dentro faria a loja americana ver a conta em real sem nada
 * dizendo por quê.
 */
export function moedaDoFormulario(
  blocos: BlocoComVariavel[],
  answers: Record<string, unknown>,
): Moeda | null {
  for (const b of blocos) {
    if (!b.opcoes_por_moeda || !b.moeda_de) continue
    const m = moedaDaRegiao(answers[b.moeda_de])
    if (m) return m
  }
  return null
}

/**
 * O número que a resposta representa, na moeda da trilha.
 *
 * Bloco com escada por moeda não tem as opções no cadastro — elas são
 * geradas por `opcoesDeFaturamento`, e o que viaja nelas é o `piso` em
 * REAL (a régua da qualificação). Para a conta, o piso volta à moeda da
 * pessoa dividindo pela mesma taxa fixa: a loja que marcou "US$50k –
 * US$100k" entra na conta como 50.000 dólares, não como 250.000 de
 * coisa nenhuma.
 *
 * É o PISO da faixa, nunca o meio nem o teto: a conta é mostrada ao
 * visitante e nunca pode superestimar o que ele perde.
 */
function valorDaResposta(
  b: BlocoComVariavel,
  resposta: string,
  answers: Record<string, unknown>,
): number | undefined {
  if (b.opcoes_por_moeda && b.moeda_de) {
    const moeda = moedaDaRegiao(answers[b.moeda_de])
    if (!moeda) return undefined
    const achou = opcoesDeFaturamento(moeda).find((o) => o.value === resposta)
    if (typeof achou?.piso !== "number") return undefined
    return achou.piso / TAXA_PARA_BRL[moeda]
  }
  return (b.options ?? []).find((o) => o.value === resposta)?.valor
}

/**
 * A moeda que a LÓGICA declarou, numa variável.
 *
 * O funil de aplicação separa faturamento em duas perguntas (a escada do
 * Brasil e a global têm degraus diferentes, e forçar a mesma criaria
 * faixa que ninguém usa), então não há bloco com `opcoes_por_moeda` de
 * onde derivar. Quem sabe a trilha é a regra de salto da pergunta de
 * mercado, e ela já grava variável — é ela que declara a moeda.
 *
 * Valor fora das três é ignorado: a conta sairia com o símbolo do real
 * sobre número em dólar, que é a confusão de unidade de sempre.
 */
export function moedaDeclarada(
  variables: Record<string, string | number> | undefined,
): Moeda | null {
  const v = variables?.moeda
  if (typeof v !== "string") return null
  const alvo = v.trim().toUpperCase()
  return alvo === "BRL" || alvo === "USD" || alvo === "EUR" ? alvo : null
}
