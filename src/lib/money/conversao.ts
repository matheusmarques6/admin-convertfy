/**
 * Como um valor convertido é MOSTRADO — puro, sem I/O, client-safe.
 *
 * O dashboard consolida em real. Até aqui, o número em BRL aparecia
 * sozinho: quem olhava não tinha como saber que aquela loja fatura em
 * euro, qual cotação foi usada nem de que dia ela é. Um total em real de
 * uma loja europeia é uma CONTA, e conta sem as parcelas não é
 * verificável — foi assim que moeda errada (Lena Warszawa em EUR sendo
 * PLN) passou meses sem ninguém notar: o valor final parecia plausível.
 *
 * Este módulo monta as duas metades do que a tela mostra:
 *  - o rótulo em real (o que se lê de relance);
 *  - a memória de cálculo (o que aparece no hover): valor original ×
 *    cotação = real, com a data da cotação.
 */

export interface ValorConvertido {
  /** Valor já em BRL. */
  valorBRL: number
  /** Valor como a plataforma reportou. */
  valorOriginal?: number | null
  /** ISO 4217 do valor original ("EUR"). Ausente/BRL = nada a explicar. */
  moeda?: string | null
  /** REAIS por 1 unidade da moeda (EUR → 5.9589). */
  taxa?: number | null
  /** Dia da cotação (YYYY-MM-DD). */
  dataDaTaxa?: string | null
  /** A cotação não é do dia do faturamento — é a mais próxima que existe. */
  taxaAproximada?: boolean
  /**
   * O câmbio falhou e o número NÃO está em real: está na moeda original.
   * Some-lo a um total em BRL é somar euro com real — por isso a tela
   * precisa marcar, e o agregador precisa separar.
   */
  naoConvertido?: boolean
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const BRL_INTEIRO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

export function formatarBRL(v: number, opcoes?: { semCentavos?: boolean }): string {
  if (!Number.isFinite(v)) return "—"
  return opcoes?.semCentavos ? BRL_INTEIRO.format(v) : BRL.format(v)
}

/** "R$ 1,2 mi" / "R$ 348 mil" — para card e coluna estreita. */
export function formatarBRLCompacto(v: number): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`
  if (abs >= 1_000) return `R$ ${Math.round(v / 1_000).toLocaleString("pt-BR")} mil`
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`
}

/**
 * Valor na moeda de origem.
 *
 * `Intl` recusa código que não conhece (`RangeError`) — e recusar é o
 * caminho fácil para a tela inteira quebrar por causa de uma linha. Com
 * código desconhecido, o número sai com o código ao lado.
 */
/**
 * Espaço NÃO separável — é o que o `Intl` põe entre símbolo e número em
 * pt-BR. O ramo de fallback tem de usar o MESMO caractere: com espaço
 * comum, a mesma função devolveria separadores diferentes conforme a
 * moeda ser conhecida ou não, e "R$ 10" quebraria de linha entre o
 * símbolo e o valor numa coluna estreita.
 */
const NBSP = " "

export function formatarMoeda(v: number, moeda: string | null | undefined): string {
  if (!Number.isFinite(v)) return "—"
  const code = (moeda || "").toUpperCase()
  if (!code) return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v)
  } catch {
    return `${code}${NBSP}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

/** "5,9589" — 4 casas, que é a precisão em que a cotação é publicada. */
export function formatarTaxa(taxa: number): string {
  return taxa.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

/** "08/09/2026" a partir de YYYY-MM-DD, sem passar por fuso. */
export function formatarDiaISO(dia: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia ?? "")
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/**
 * As linhas da memória de cálculo — a primeira é a conta, as demais são
 * as ressalvas. Lista (e não uma frase) porque a tela renderiza uma por
 * linha e o leitor precisa separar "o cálculo" de "o que não é exato".
 *
 * Devolve `[]` quando não há nada a explicar (valor já em real): tooltip
 * que só repete o que está na tela é ruído.
 */
export function explicarConversao(v: ValorConvertido): string[] {
  const moeda = (v.moeda || "").toUpperCase()

  if (v.naoConvertido) {
    return [
      `Este número está em ${moeda || "moeda estrangeira"}, NÃO em real.`,
      "A cotação não estava disponível na hora do cálculo, então o valor não foi convertido.",
    ]
  }

  if (!moeda || moeda === "BRL") return []

  const linhas: string[] = []
  const original = v.valorOriginal != null ? formatarMoeda(v.valorOriginal, moeda) : null

  if (original && v.taxa) {
    linhas.push(`${original} × ${formatarTaxa(v.taxa)} = ${formatarBRL(v.valorBRL)}`)
  } else if (original) {
    linhas.push(`Original: ${original}`)
  }

  if (v.taxa) {
    const data = formatarDiaISO(v.dataDaTaxa)
    linhas.push(
      `Cotação de ${data ?? "data desconhecida"}: 1 ${moeda} = ${formatarTaxa(v.taxa)} BRL`,
    )
  }

  if (v.taxaAproximada) {
    linhas.push(
      "Cotação aproximada: não temos a do dia deste faturamento, foi usada a mais próxima anterior.",
    )
  }

  return linhas
}

/** Uma parcela de um total — uma loja, um dia, uma campanha. */
export interface ParcelaEmMoeda {
  /** Ausente = BRL. Chave opcional porque "não informado" e "undefined"
   *  significam a mesma coisa aqui, e exigir a chave só obrigaria quem
   *  chama a escrever `moeda: undefined`. */
  moeda?: string | null
  valorOriginal: number
  valorBRL: number
  naoConvertido?: boolean
}

export interface ComposicaoPorMoeda {
  moeda: string
  valorOriginal: number
  valorBRL: number
  /** Fatia do total em BRL, 0-100. */
  percentual: number
  naoConvertido: boolean
}

export interface ResumoDaComposicao {
  totalBRL: number
  porMoeda: ComposicaoPorMoeda[]
  /** Só BRL — não há conversão nenhuma para explicar. */
  soReal: boolean
  /** Alguma parcela entrou SEM conversão (o total mistura moedas). */
  temNaoConvertido: boolean
}

/**
 * De onde vem um total em real — a resposta para "R$ 4,2 mi de quê?".
 *
 * Um card do dashboard soma dezenas de lojas em moedas diferentes; ali
 * não existe "o valor original", existe uma COMPOSIÇÃO. Ordena pela
 * fatia em BRL porque a pergunta de quem passa o mouse é "o que domina
 * este número".
 *
 * `naoConvertido` é propagado, não escondido: um total que contém parcela
 * não convertida está somando euro com real, e isso tem de aparecer.
 */
export function resumirComposicao(parcelas: ParcelaEmMoeda[]): ResumoDaComposicao {
  const mapa = new Map<string, ComposicaoPorMoeda>()
  let totalBRL = 0

  for (const p of parcelas) {
    if (!Number.isFinite(p.valorBRL) || p.valorBRL === 0) continue
    const moeda = (p.moeda || "BRL").toUpperCase()
    totalBRL += p.valorBRL
    const atual = mapa.get(moeda)
    if (atual) {
      atual.valorOriginal += p.valorOriginal
      atual.valorBRL += p.valorBRL
      atual.naoConvertido = atual.naoConvertido || !!p.naoConvertido
    } else {
      mapa.set(moeda, {
        moeda,
        valorOriginal: p.valorOriginal,
        valorBRL: p.valorBRL,
        percentual: 0,
        naoConvertido: !!p.naoConvertido,
      })
    }
  }

  const porMoeda = [...mapa.values()].sort((a, b) => b.valorBRL - a.valorBRL)
  for (const m of porMoeda) {
    m.percentual = totalBRL > 0 ? Math.round((m.valorBRL / totalBRL) * 1000) / 10 : 0
  }

  return {
    totalBRL,
    porMoeda,
    soReal: porMoeda.length === 0 || (porMoeda.length === 1 && porMoeda[0].moeda === "BRL"),
    temNaoConvertido: porMoeda.some((m) => m.naoConvertido),
  }
}

/** "€ 12.400,00 (EUR · 41,2%)" — uma linha da composição no tooltip. */
export function descreverParcela(m: ComposicaoPorMoeda): string {
  if (m.moeda === "BRL") return `${formatarBRL(m.valorBRL)} já em real (${m.percentual}%)`
  return `${formatarMoeda(m.valorOriginal, m.moeda)} → ${formatarBRL(m.valorBRL)} (${m.percentual}%)`
}
