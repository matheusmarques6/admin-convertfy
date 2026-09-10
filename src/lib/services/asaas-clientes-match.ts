/**
 * Casar o cliente do Asaas com o cliente da nossa base.
 *
 * A resolução do dono de um pagamento (`resolveClientForPayment`) só acha
 * quem já tem o vínculo GRAVADO em `custom_fields.asaas_customer_id`.
 * Quem nunca foi vinculado nunca é achado, e o pagamento dele não entra
 * na carteira — foi assim que 167 cobranças ficaram fora numa varredura
 * só (10/09/2026).
 *
 * Este módulo fecha a lacuna com o que o Asaas sabe do pagador: documento
 * e email. Ele é PURO — quem lê o banco e quem chama a API ficam no
 * serviço; aqui só entra a decisão, que é onde o erro custa caro.
 *
 * A regra dura: **empate não casa**. Vincular a fatura ao cliente errado
 * move dinheiro para a carteira de outra pessoa, e ninguém percebe olhando
 * — o número continua plausível. Deixar na triagem é visível e reversível.
 */

/** O que o Asaas devolve sobre o pagador. */
export interface ClienteAsaas {
  id: string
  name?: string | null
  email?: string | null
  cpfCnpj?: string | null
}

/** O que a nossa base tem para comparar. */
export interface ClienteLocal {
  id: string
  email?: string | null
  cpf_cnpj?: string | null
  /** Já vinculado a este id do Asaas? Então não há o que casar. */
  asaas_customer_id?: string | null
}

export type CriterioDeMatch = "documento" | "email"

export interface Match {
  asaas_customer_id: string
  client_id: string
  criterio: CriterioDeMatch
}

export type MotivoSemMatch = "sem_identificador" | "nao_encontrado" | "ambiguo"

export interface SemMatch {
  asaas_customer_id: string
  motivo: MotivoSemMatch
  /** Quantos clientes disputaram, quando `ambiguo`. */
  candidatos?: number
}

export interface ResultadoDoMatch {
  /** Vínculos a gravar em `clients.custom_fields.asaas_customer_id`. */
  vincular: Match[]
  /** Sem dono decidível — o pagamento vai para a triagem. */
  sem: SemMatch[]
}

/** Só dígitos: a mesma régua do CSV de público da Meta. */
export function somenteDigitos(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "")
}

/**
 * Documento comparável. CPF (11) e CNPJ (14) são os únicos comprimentos
 * aceitos: um campo com 3 dígitos digitados pela metade casaria com
 * qualquer outro igualmente pela metade.
 */
export function chaveDeDocumento(raw: string | null | undefined): string | null {
  const d = somenteDigitos(raw)
  return d.length === 11 || d.length === 14 ? d : null
}

/**
 * Email comparável — minúsculas e sem espaço em volta, nada além disso.
 *
 * Ponto e `+tag` NÃO são removidos: só o Gmail os ignora, e tratar
 * `joao.silva@` e `joaosilva@` como a mesma pessoa em outro provedor
 * casaria a fatura com o cliente errado. É a mesma decisão do
 * `chaveDeEmail` das reuniões, pelo mesmo motivo, na direção contrária:
 * lá o custo era não convidar, aqui é atribuir dinheiro a quem não é.
 */
export function chaveDeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase()
  return e.includes("@") ? e : null
}

/**
 * Casa os clientes do Asaas ainda não vinculados com os nossos.
 *
 * Documento vence email: CPF/CNPJ identifica uma pessoa jurídica ou
 * física de forma única, enquanto email é reaproveitado entre empresas do
 * mesmo grupo (`financeiro@`). Só cai no email quando não há documento
 * dos dois lados.
 */
export function casarClientes(
  doAsaas: ClienteAsaas[],
  locais: ClienteLocal[],
): ResultadoDoMatch {
  // Índices dos locais AINDA disponíveis: quem já tem vínculo com outro
  // id do Asaas não pode ser reivindicado por um segundo pagador.
  const porDocumento = new Map<string, ClienteLocal[]>()
  const porEmail = new Map<string, ClienteLocal[]>()
  for (const c of locais) {
    const doc = chaveDeDocumento(c.cpf_cnpj)
    if (doc) porDocumento.set(doc, [...(porDocumento.get(doc) ?? []), c])
    const mail = chaveDeEmail(c.email)
    if (mail) porEmail.set(mail, [...(porEmail.get(mail) ?? []), c])
  }

  const vincular: Match[] = []
  const sem: SemMatch[] = []
  /** Um cliente local não pode receber dois pagadores do Asaas. */
  const jaUsado = new Set(
    locais.filter((c) => c.asaas_customer_id).map((c) => c.id),
  )

  for (const a of doAsaas) {
    const doc = chaveDeDocumento(a.cpfCnpj)
    const mail = chaveDeEmail(a.email)
    if (!doc && !mail) {
      sem.push({ asaas_customer_id: a.id, motivo: "sem_identificador" })
      continue
    }

    for (const [criterio, candidatosBrutos] of [
      ["documento", doc ? porDocumento.get(doc) : undefined],
      ["email", mail ? porEmail.get(mail) : undefined],
    ] as Array<[CriterioDeMatch, ClienteLocal[] | undefined]>) {
      const candidatos = (candidatosBrutos ?? []).filter((c) => !jaUsado.has(c.id))
      if (candidatos.length === 0) continue
      if (candidatos.length > 1) {
        sem.push({
          asaas_customer_id: a.id,
          motivo: "ambiguo",
          candidatos: candidatos.length,
        })
        break
      }
      vincular.push({
        asaas_customer_id: a.id,
        client_id: candidatos[0].id,
        criterio,
      })
      jaUsado.add(candidatos[0].id)
      break
    }

    const decidido =
      vincular.some((v) => v.asaas_customer_id === a.id) ||
      sem.some((s) => s.asaas_customer_id === a.id)
    if (!decidido) sem.push({ asaas_customer_id: a.id, motivo: "nao_encontrado" })
  }

  return { vincular, sem }
}

/**
 * Status de assinatura do Asaas → o domínio FECHADO da nossa coluna.
 *
 * O CHECK aceita `active | inactive | cancelled`. O código antigo fazia
 * `String(status).toLowerCase()`, e `EXPIRED` virava `"expired"` — que o
 * banco recusa. Minúscula não é tradução.
 *
 * Desconhecido vira `inactive`, nunca `active`: contar como ativa uma
 * assinatura que talvez não corra mais infla o MRR da carteira, e receita
 * inflada é o erro que ninguém percebe olhando.
 */
export function statusDeAssinatura(bruto: unknown): {
  status: "active" | "inactive" | "cancelled"
  reconhecido: boolean
} {
  const s = String(bruto ?? "").trim().toUpperCase()
  if (s === "ACTIVE") return { status: "active", reconhecido: true }
  if (s === "EXPIRED" || s === "INACTIVE") return { status: "inactive", reconhecido: true }
  if (s === "CANCELLED" || s === "CANCELED" || s === "DELETED") {
    return { status: "cancelled", reconhecido: true }
  }
  return { status: "inactive", reconhecido: false }
}
