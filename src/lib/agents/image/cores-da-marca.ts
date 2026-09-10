/**
 * O hex da PEÇA DE REFERÊNCIA não pode se chamar "cor primária" — módulo
 * puro, sem I/O.
 *
 * ── O defeito (09/09) ─────────────────────────────────────────────────
 *
 * O cadastro das variantes descreve a arte com os hex da peça original e
 * os NOMEIA com o papel da paleta:
 *
 *     seal_1_image: "círculo chapado em #D88B71 (cor secundária)…"
 *     seal_2_image: "…círculo chapado em #2A4439 (cor primária)…"
 *     seal_3_image: "…círculo chapado em #B0C4AB (cor terciária)…"
 *
 * Desde a migration 20261108 a direção da variante é a FONTE PRINCIPAL do
 * prompt de imagem (`CFY_PRIMARY_BRIEF`), com precedência declarada sobre
 * as vars de paleta. O modelo obedece ao brief: os três selos saíram
 * salmão / verde escuro / verde claro **iguais nas duas lojas geradas no
 * dia**, nenhuma das quais tem essas cores. O mesmo vale para o
 * `#C7D6EB` do card de cupom da `offer 3` — o azul do fundo do bloco.
 *
 * É o irmão do defeito das MEDIDAS (`photo-directions.ts`): o gerador
 * reproduz o material que recebe, e nenhuma regra em prosa vence um valor
 * concreto escrito no brief. Lá a resposta foi apagar a medida, porque
 * medida não tem substituto. Aqui a cor TEM substituto — então não se
 * apaga, se TRADUZ.
 *
 * ── Por que a tradução não é sempre possível ──────────────────────────
 *
 * Medido em 09/09, nas 20 lojas com identidade cadastrada:
 *
 *   14  sem NENHUMA cor primária
 *    6  com cor, TODAS com o nome default da UI ("Nova cor")
 *    1  com cor secundária
 *    1  com três ou mais cores
 *
 * Traduzir às cegas trocaria, em 19 de 20 lojas, uma paleta harmônica por
 * preto e branco — ou por nada. Por isso são dois regimes:
 *
 *   **tem cor para o papel** → troca o hex (o certo, hoje raro);
 *   **não tem**             → o hex FICA, mas deixa de ser apresentado
 *                             como cor da marca; vira o que é, cor da peça
 *                             de referência, e o operador vê a lacuna na
 *                             telemetria em vez de recebê-la como pixel.
 *
 * Mentir sobre a procedência é o que este módulo desfaz; inventar paleta
 * seria o mesmo erro com outro sinal.
 */

/** Papel na paleta, na ordem em que a biblioteca os nomeia. */
export type PapelDeCor = "primaria" | "secundaria" | "terciaria"

/** Cor da loja por papel. `null` = a loja não tem essa cor cadastrada. */
export interface PaletaDaMarca {
  primaria: string | null
  secundaria: string | null
  terciaria: string | null
}

export const PALETA_VAZIA: PaletaDaMarca = {
  primaria: null,
  secundaria: null,
  terciaria: null,
}

/**
 * Monta a paleta por papel a partir das listas do `store_brand_identity`.
 *
 * A cascata (secundária ← 2ª primária, terciária ← 3ª primária) é a mesma
 * que `PALETA_2` já usava no builder: uma loja que cadastrou três cores
 * primárias e nenhuma secundária tem, sim, três cores utilizáveis.
 * `NEUTRO` fica FORA — ele é derivado do posicionamento, não escolhido
 * pela marca, e promovê-lo a "cor terciária da marca" seria a mesma
 * invenção que este módulo existe para impedir.
 *
 * As primárias restantes são uma FILA, e não índices fixos: com duas
 * primárias e uma secundária cadastrada, a secundária ocupa o seu papel e
 * a 2ª primária escorrega para terciária. Ler `p[2]` ali deixaria a loja
 * com três cores usando só duas.
 */
export function paletaPorPapel(
  primarias: Array<{ hex?: string | null }> | null | undefined,
  secundarias: Array<{ hex?: string | null }> | null | undefined,
): PaletaDaMarca {
  const p = (primarias ?? [])
    .map((c) => hexValido(c?.hex))
    .filter((h): h is string => h !== null)
  const s = (secundarias ?? [])
    .map((c) => hexValido(c?.hex))
    .filter((h): h is string => h !== null)
  const sobra = p.slice(1)
  return {
    primaria: p[0] ?? null,
    // `??` curto-circuita: com secundária cadastrada, a fila não é consumida.
    secundaria: s[0] ?? sobra.shift() ?? null,
    terciaria: s[1] ?? sobra.shift() ?? null,
  }
}

function hexValido(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim()
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : null
}

/**
 * Rótulos de papel como a biblioteca os escreve, ao lado do hex.
 *
 * "painel A"/"painel B" ficam de FORA de propósito: no comparativo da
 * `body 4` o painel B é o genérico do concorrente, cinza por decisão de
 * desenho — pintá-lo com a cor da marca inverteria o argumento do bloco.
 */
const ROTULO_DO_PAPEL: Array<[RegExp, PapelDeCor]> = [
  [/cor\s+prim[áa]ria/i, "primaria"],
  [/cor\s+secund[áa]ria/i, "secundaria"],
  [/cor\s+terci[áa]ria/i, "terciaria"],
]

const HEX_RE = /#[0-9a-fA-F]{6}/g

/** Uma substituição feita (ou recusada) no texto do brief. */
export interface TrocaDeCor {
  de: string
  para: string
  papel: PapelDeCor
}

export interface BriefTraduzido {
  texto: string
  /** Hex trocados pela cor da loja. */
  trocas: TrocaDeCor[]
  /** Hex com papel declarado que a loja não tem — ficaram no texto. */
  semCorDaLoja: Array<{ hex: string; papel: PapelDeCor }>
  /** Hex sem papel declarado — intocados, nem se sabe o que seriam. */
  semPapel: string[]
}

/**
 * A JANELA em que um hex e o rótulo do papel se consideram vizinhos.
 *
 * A biblioteca escreve `#2A4439 (cor primária)` — colados. Uma janela
 * larga casaria o hex de uma frase com o papel da frase seguinte, e o erro
 * seria invisível (cor plausível, papel errado). 40 caracteres cobrem a
 * forma real com folga e não atravessam período.
 */
const JANELA = 40

function papelDoHex(texto: string, at: number, len: number): PapelDeCor | null {
  const depois = texto.slice(at + len, at + len + JANELA)
  const antes = texto.slice(Math.max(0, at - JANELA), at)
  for (const [re, papel] of ROTULO_DO_PAPEL) {
    if (re.test(depois) || re.test(antes)) return papel
  }
  return null
}

/**
 * Troca no brief os hex da peça de referência pelos da marca, quando ela
 * os tem.
 *
 * **Um hex mapeado numa ocorrência é trocado em TODAS as suas**: o
 * `seal_3` da `body 3` diz "centro e arco em #2A4439" sem repetir o
 * rótulo, e é o mesmo verde que o `seal_2` declarou como primária. Trocar
 * só onde o papel aparece deixaria a peça com metade da paleta nova e
 * metade da antiga — pior que não trocar.
 *
 * Devolve o texto intacto quando não há hex, quando não há paleta, ou
 * quando nenhum hex tem papel declarado.
 */
export function traduzirCoresDoBrief(
  texto: string | null | undefined,
  paleta: PaletaDaMarca,
): BriefTraduzido {
  const original = texto ?? ""
  if (!original) {
    return { texto: original, trocas: [], semCorDaLoja: [], semPapel: [] }
  }

  // 1ª passada: descobre o papel de cada hex distinto.
  const papelPorHex = new Map<string, PapelDeCor>()
  const semPapel = new Set<string>()
  for (const m of original.matchAll(HEX_RE)) {
    const hex = m[0]
    const at = m.index ?? 0
    if (papelPorHex.has(hex)) continue
    const papel = papelDoHex(original, at, hex.length)
    if (papel) {
      papelPorHex.set(hex, papel)
      semPapel.delete(hex)
    } else if (!papelPorHex.has(hex)) {
      semPapel.add(hex)
    }
  }

  const trocas: TrocaDeCor[] = []
  const semCorDaLoja: BriefTraduzido["semCorDaLoja"] = []
  let out = original

  for (const [hex, papel] of papelPorHex) {
    const daLoja = paleta[papel]
    if (!daLoja) {
      semCorDaLoja.push({ hex, papel })
      continue
    }
    if (daLoja.toLowerCase() === hex.toLowerCase()) continue
    // Todas as ocorrências, insensível a caixa — o cadastro mistura
    // `#2A4439` e `#2a4439` na mesma variante.
    out = out.replace(new RegExp(escaparHex(hex), "gi"), daLoja)
    trocas.push({ de: hex, para: daLoja, papel })
  }

  return {
    texto: out,
    trocas,
    semCorDaLoja,
    semPapel: [...semPapel],
  }
}

function escaparHex(hex: string): string {
  return hex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * A frase que acompanha o brief quando sobrou hex de referência sem
 * tradução.
 *
 * Sem ela o modelo lê `#D88B71 (cor secundária)` como identidade da marca
 * — foi o que produziu selos salmão numa loja preta e branca. Com ela, a
 * cor vira o que é: sugestão de harmonia herdada da peça de referência.
 *
 * Devolve "" quando não há nada a declarar — bloco vazio no prompt é
 * ruído, e ruído em prompt de imagem vira pixel.
 */
export function avisoDeCorDeReferencia(r: BriefTraduzido): string {
  if (r.semCorDaLoja.length === 0) return ""
  const lista = r.semCorDaLoja.map((c) => c.hex).join(", ")
  return (
    `ATENÇÃO — cores de REFERÊNCIA: ${lista} ${r.semCorDaLoja.length === 1 ? "veio" : "vieram"} da peça` +
    " que serviu de modelo, NÃO da paleta desta marca (que não tem essa cor" +
    " cadastrada). Trate-as como sugestão de harmonia e contraste, nunca como" +
    " identidade obrigatória: se a marca aparecer com outra paleta nas" +
    " referências anexadas, ela vence."
  )
}
