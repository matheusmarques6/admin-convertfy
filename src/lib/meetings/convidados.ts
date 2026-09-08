/**
 * Quem recebe o convite de uma reunião.
 *
 * Módulo puro: só decide a LISTA. Quem fala com o Google e com o Resend são
 * os services — aqui ficam as regras que precisam de teste porque errá-las
 * é silencioso dos dois lados: convidar quem não devia (o cliente errado
 * recebe a pauta de outro) ou não convidar quem devia (a reunião existe no
 * admin e ninguém aparece).
 *
 * Três origens compõem a lista final:
 *   - membros    → participantes internos (profiles / org_members)
 *   - contatos   → pessoas do lado do cliente (crm_contacts)
 *   - externos   → emails avulsos digitados na mão (meetings.guest_emails)
 *
 * O e-mail é a chave de identidade em todas elas, porque é assim que o
 * Google casa o attendee e é assim que o RSVP volta.
 */

/** Contato do cliente, como vem de crm_contacts. */
export interface ContatoDoCliente {
  id: string
  name: string
  email: string | null
  is_primary?: boolean | null
  /** Loja à qual o contato está amarrado; null = vale para o cliente todo. */
  store_id?: string | null
  role?: string | null
}

/** Uma pessoa já resolvida para virar attendee. */
export interface Convidado {
  email: string
  displayName?: string
  origem: "membro" | "contato" | "externo"
  /** id do profile / org_member / crm_contacts, quando houver. */
  refId?: string
}

/**
 * Normaliza um email para COMPARAÇÃO (dedupe, casamento de RSVP).
 *
 * Só apara e baixa a caixa. Não mexe em ponto nem em "+tag": para o Gmail
 * `joao.silva@` e `joaosilva@` são a mesma caixa, mas para a maioria dos
 * outros provedores não são — e tratar como iguais faria a gente DEIXAR DE
 * convidar uma pessoa real. Deduplicar de menos custa um email repetido;
 * deduplicar demais custa um convidado ausente.
 */
export function chaveDeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Diz se a string tem cara de email endereçável.
 *
 * Deliberadamente frouxa: a validação de verdade é a entrega. Barrar aqui
 * um endereço válido de formato incomum tiraria a pessoa da reunião sem
 * dizer por quê. Só recusa o que o Google recusaria de cara — sem @, sem
 * ponto no domínio, com espaço no meio.
 */
export function pareceEmail(valor: string): boolean {
  const v = valor.trim()
  if (!v || /\s/.test(v)) return false
  const partes = v.split("@")
  if (partes.length !== 2) return false
  const [local, dominio] = partes
  if (!local || !dominio) return false
  if (!dominio.includes(".")) return false
  if (dominio.startsWith(".") || dominio.endsWith(".")) return false
  if (dominio.includes("..")) return false
  return true
}

/**
 * Qual contato o diálogo deve sugerir marcado.
 *
 * Ordem: o primário da loja em questão → o primário do cliente → o primeiro
 * com email. A loja vence o cliente porque uma reunião de feedback de uma
 * loja específica é com quem cuida DAQUELA loja, não com o dono do grupo.
 *
 * Contato sem email nunca é sugerido: marcá-lo daria a impressão de que o
 * convite vai sair, e não vai.
 */
export function contatoSugerido(
  contatos: ContatoDoCliente[],
  storeId?: string | null,
): ContatoDoCliente | null {
  const comEmail = contatos.filter((c) => c.email && pareceEmail(c.email))
  if (comEmail.length === 0) return null

  if (storeId) {
    const daLoja = comEmail.filter((c) => c.store_id === storeId)
    const primarioDaLoja = daLoja.find((c) => c.is_primary)
    if (primarioDaLoja) return primarioDaLoja
    if (daLoja.length > 0) return daLoja[0]
  }

  const primario = comEmail.find((c) => c.is_primary)
  return primario ?? comEmail[0]
}

/**
 * Monta a lista final de convidados, sem repetir ninguém.
 *
 * Precedência quando o MESMO email aparece em duas origens: membro vence
 * contato, que vence externo. É a ordem da informação disponível — do
 * membro sabemos o nome pelo profile, do contato pelo cadastro, do externo
 * não sabemos nada. Um consultor que é membro da org e também está em
 * crm_contacts precisa entrar UMA vez, com o nome que temos.
 */
export function montarConvidados(params: {
  membros?: Array<{ email: string; displayName?: string | null; refId?: string }>
  contatos?: ContatoDoCliente[]
  externos?: Array<string | null | undefined>
}): Convidado[] {
  const vistos = new Set<string>()
  const saida: Convidado[] = []

  const empurrar = (c: Convidado) => {
    const chave = chaveDeEmail(c.email)
    if (!chave || vistos.has(chave)) return
    vistos.add(chave)
    saida.push(c)
  }

  for (const m of params.membros ?? []) {
    if (!m.email || !pareceEmail(m.email)) continue
    empurrar({
      email: m.email.trim(),
      ...(m.displayName ? { displayName: m.displayName } : {}),
      origem: "membro",
      ...(m.refId ? { refId: m.refId } : {}),
    })
  }

  for (const c of params.contatos ?? []) {
    if (!c.email || !pareceEmail(c.email)) continue
    empurrar({
      email: c.email.trim(),
      ...(c.name ? { displayName: c.name } : {}),
      origem: "contato",
      refId: c.id,
    })
  }

  for (const e of params.externos ?? []) {
    if (!e || !pareceEmail(e)) continue
    empurrar({ email: e.trim(), origem: "externo" })
  }

  return saida
}

/**
 * Separa os externos que JÁ estão cobertos por um contato cadastrado.
 *
 * Serve ao POST da reunião: quem escolheu o contato na tela e também
 * digitou o email dele à mão não pode virar dois attendees. O que sobra
 * continua em guest_emails, que é onde convidado avulso deve morar.
 */
export function externosNaoCobertos(
  externos: Array<string | null | undefined>,
  jaConvidados: Array<{ email: string }>,
): string[] {
  const cobertos = new Set(jaConvidados.map((c) => chaveDeEmail(c.email)))
  const vistos = new Set<string>()
  const saida: string[] = []

  for (const e of externos) {
    if (!e || !pareceEmail(e)) continue
    const chave = chaveDeEmail(e)
    if (cobertos.has(chave) || vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(e.trim())
  }

  return saida
}

/**
 * Frase que a tela mostra antes de salvar.
 *
 * Existe porque convidar cliente em silêncio é o erro caro desta feature:
 * quem agenda precisa ler, em português, quem vai receber o email — antes
 * de o email sair, não depois.
 */
export function resumoDeConvidados(convidados: Convidado[]): string {
  const doCliente = convidados.filter((c) => c.origem !== "membro")
  const membros = convidados.length - doCliente.length

  const partes: string[] = []
  if (membros > 0) {
    partes.push(membros === 1 ? "1 pessoa do time" : `${membros} pessoas do time`)
  }
  if (doCliente.length > 0) {
    const nomes = doCliente
      .map((c) => c.displayName || c.email)
      .slice(0, 3)
      .join(", ")
    const resto = doCliente.length - Math.min(3, doCliente.length)
    partes.push(resto > 0 ? `${nomes} e mais ${resto}` : nomes)
  }

  if (partes.length === 0) return "Ninguém será convidado."
  return `Receberão o convite: ${partes.join(" · ")}.`
}
