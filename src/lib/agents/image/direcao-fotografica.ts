/**
 * Leitura da direção fotográfica cadastrada na variante — o que ela DIZ
 * sobre a cena, sem I/O.
 *
 * Três perguntas que o pipeline precisava responder e respondia errado
 * (15/09, Innova Bay · Welcome 1, batch b6c478d3):
 *
 * 1. **É rascunho?** A `body 8 - cards vidro` tem como direção o texto
 *    "Pendente da referência… aguardando o PNG". Isso foi ao modelo de
 *    imagem como "YOUR MAIN SOURCE" e o agente compôs sobre uma nota de
 *    quem ainda não escreveu a direção. Rascunho conta como AUSENTE: o
 *    template já tem o bloco "no direction was written", que manda compor
 *    só pelo slot e não inventar cena.
 * 2. **Proíbe pessoa/mão?** A `hero section 3` diz "Nenhuma mão, nenhuma
 *    pessoa" e o Estruturador pediu "mão adulta encaixando o plug". As duas
 *    foram ao MESMO prompt e o modelo fez o híbrido. O conflito tem de ser
 *    decidido antes — no Curador, que ainda pode trocar a variante.
 * 3. **A cena exige pessoa?** É o outro lado da pergunta 2.
 *
 * Régua estreita de propósito: casar "sem" com qualquer substantivo faria
 * "sem sombra dura" virar proibição de pessoa. Só os termos de gente.
 */

/** Frases de quem ainda não escreveu a direção. */
const RASCUNHO: RegExp[] = [
  /^\s*(?:pendente|aguardando|a\s+definir|a\s+escrever|tbd|todo|wip|rascunho|draft)\b/i,
  /\bpendente\s+d[aeo]\s+(?:refer[êe]ncia|arte|png|mockup|layout)\b/i,
  /\baguardando\s+(?:o|a|os|as)?\s*(?:png|jpg|arte|refer[êe]ncia|mockup|layout|arquivo)\b/i,
]

/** Termos de GENTE — mão, pessoa, corpo — nos idiomas em que a biblioteca escreve. */
const GENTE =
  "m[ãa]os?|hands?|pessoas?|persons?|people|gente|modelos?|models?|corpo|body|rosto|face|dedos?|fingers?|bra[çc]os?|arms?|humana?|human"

/** "Nenhuma mão, nenhuma pessoa" · "sem pessoa" · "no hands" · "pessoa ou mão" numa linha de proibições. */
const PROIBE_GENTE: RegExp[] = [
  new RegExp(`\\b(?:nenhuma?|sem|no|without|never|zero)\\s+(?:${GENTE})\\b`, "i"),
  new RegExp(`\\bproibi[çc][õo]es?\\b[^\\n]*\\b(?:${GENTE})\\b`, "i"),
]

const EXIGE_GENTE = new RegExp(`\\b(?:${GENTE})\\b`, "i")

export interface LeituraDaDirecao {
  /** Texto vazio ou nota de "ainda não escrevi". */
  rascunho: boolean
  /** A direção veta mão/pessoa na foto. */
  proibe_pessoa: boolean
}

export function ehDirecaoEmRascunho(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim()
  if (!t) return true
  return RASCUNHO.some((re) => re.test(t))
}

export function direcaoProibePessoa(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim()
  if (!t) return false
  return PROIBE_GENTE.some((re) => re.test(t))
}

/** A cena decidida pelo Estruturador pede gente no quadro. */
export function cenaExigePessoa(cena: string | null | undefined): boolean {
  const c = (cena ?? "").trim()
  if (!c) return false
  // "sem pessoa" / "no hands" DENTRO da cena é negação, não exigência.
  const semNegacao = c.replace(
    new RegExp(`\\b(?:sem|nenhuma?|no|without)\\s+(?:${GENTE})\\b`, "gi"),
    "",
  )
  return EXIGE_GENTE.test(semNegacao)
}

export function lerDirecao(texto: string | null | undefined): LeituraDaDirecao {
  const rascunho = ehDirecaoEmRascunho(texto)
  return { rascunho, proibe_pessoa: rascunho ? false : direcaoProibePessoa(texto) }
}

/**
 * Motivo do conflito entre a cena da posição e a direção da variante;
 * `null` quando convivem. Só a contradição DURA é conflito: variante sem
 * direção (ou em rascunho) nunca colide — fail-open, a lacuna é da
 * biblioteca.
 */
export function conflitoCenaDirecao(
  cena: string | null | undefined,
  direcao: LeituraDaDirecao | null | undefined,
): string | null {
  if (!cena || !direcao || direcao.rascunho) return null
  if (direcao.proibe_pessoa && cenaExigePessoa(cena)) {
    return "a direção fotográfica da variante proíbe pessoa/mão e a cena decidida para a posição exige alguém no quadro"
  }
  return null
}
