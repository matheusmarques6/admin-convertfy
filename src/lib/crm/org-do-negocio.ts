/**
 * A org de um negócio — `deals` NÃO tem `org_id`.
 *
 * Nem `deals`, nem `pipelines`, nem `pipeline_stages`, nem `crm_partners`:
 * medido no schema em 18/09. Pedir a coluna assim mesmo devolve 42703 no
 * `error`, e como o supabase-js entrega o erro em `error` (não como
 * throw), quem desestrutura só `{ data }` recebe `null` e conclui "não
 * encontrado". Foi assim que o kanban inteiro passou a responder
 * "Deal nao encontrado" em todo arrasto.
 *
 * A org vem de um VÍNCULO do negócio. Cobertura medida nos 1.248 deals
 * de produção (18/09), na ordem em que a cascata tenta:
 *
 *   cliente   272   `clients.org_id` (NOT NULL — o vínculo mais forte)
 *   loja      183   `client_stores.org_id`
 *   dono      396   `org_members` do `owner_id` (852 deals não têm dono)
 *   lead      732   `crm_leads.org_id`
 *   ─────────────
 *   resolve  1060   restam 188 sem nenhuma dessas pontas
 *
 * Os 188 são por que existe o degrau do OPERADOR: numa rota autenticada
 * sempre há alguém, e a org dele fecha a conta. Ele é o ÚLTIMO porque é
 * o único que não é propriedade do negócio — hoje só existe uma org e
 * dá no mesmo, mas amanhã o operador de outra org não pode redefinir a
 * org de um negócio só por tê-lo arrastado.
 *
 * Quem tem usuário e quer a org de uma LISTA que a tela ofereceu (motivos
 * de perda, respostas rápidas) não usa a cascata: usa `orgDoPerfil` do
 * operador, que é a mesma régua do GET que preencheu aquela lista.
 * Validar contra outra lista recusaria a opção que o vendedor acabou de
 * escolher.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("OrgDoNegocio")

type Admin = ReturnType<typeof createAdminClient>

/** De onde a org saiu — vai ao log e ao retorno das rotas. */
export type FonteDaOrg = "cliente" | "loja" | "dono" | "lead" | "operador"

export type FontesDaOrg = {
  cliente?: string | null
  loja?: string | null
  dono?: string | null
  lead?: string | null
  operador?: string | null
}

/** A ordem é a régua: primeiro vínculo, depois pessoa, operador por último. */
export const ORDEM_DA_CASCATA: FonteDaOrg[] = [
  "cliente",
  "loja",
  "dono",
  "lead",
  "operador",
]

export type OrgResolvida = { orgId: string; fonte: FonteDaOrg } | null

/**
 * A decisão, sem I/O. String vazia ou só espaço NÃO conta como org: um
 * `coalesce` cru a aceitaria e o `.eq("org_id", "")` seguinte devolveria
 * lista vazia em silêncio, que se lê como "esta org não configurou nada".
 */
export function escolherOrg(fontes: FontesDaOrg): OrgResolvida {
  for (const fonte of ORDEM_DA_CASCATA) {
    const valor = fontes[fonte]
    if (typeof valor === "string" && valor.trim().length > 0) {
      return { orgId: valor.trim(), fonte }
    }
  }
  return null
}

/** A org de um membro ativo. É a régua que as telas usam para listar. */
export async function orgDoPerfil(
  admin: Admin,
  profileId: string | null | undefined,
): Promise<string | null> {
  if (!profileId) return null
  const { data, error } = await admin
    .from("org_members")
    .select("org_id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()
  if (error) {
    log.error("org do perfil não resolveu", { profileId, error })
    return null
  }
  return data?.org_id ?? null
}

type LinhaDoNegocio = {
  id: string
  client_id: string | null
  store_id: string | null
  owner_id: string | null
  lead_id: string | null
}

/**
 * Resolve a org de VÁRIOS negócios de uma vez — quatro consultas no
 * total, não quatro por negócio. É o que o cron precisa: lá não há
 * operador, e um N+1 sobre a fila inteira estoura o orçamento da função
 * antes de escrever qualquer coisa.
 */
export async function orgsDosNegocios(
  admin: Admin,
  linhas: LinhaDoNegocio[],
): Promise<Map<string, OrgResolvida>> {
  const saida = new Map<string, OrgResolvida>()
  if (linhas.length === 0) return saida

  const unicos = (vs: Array<string | null>) =>
    [...new Set(vs.filter((v): v is string => !!v))]

  const idsCliente = unicos(linhas.map((l) => l.client_id))
  const idsLoja = unicos(linhas.map((l) => l.store_id))
  const idsDono = unicos(linhas.map((l) => l.owner_id))
  const idsLead = unicos(linhas.map((l) => l.lead_id))

  const mapa = async (
    tabela: "clients" | "client_stores" | "crm_leads",
    ids: string[],
  ): Promise<Map<string, string>> => {
    const m = new Map<string, string>()
    if (ids.length === 0) return m
    const { data, error } = await admin.from(tabela).select("id, org_id").in("id", ids)
    if (error) {
      log.error("org por vínculo não resolveu", { tabela, error })
      return m
    }
    for (const r of data ?? []) if (r.org_id) m.set(r.id, r.org_id)
    return m
  }

  const [porCliente, porLoja, porLead] = await Promise.all([
    mapa("clients", idsCliente),
    mapa("client_stores", idsLoja),
    mapa("crm_leads", idsLead),
  ])

  const porDono = new Map<string, string>()
  if (idsDono.length > 0) {
    const { data, error } = await admin
      .from("org_members")
      .select("profile_id, org_id")
      .in("profile_id", idsDono)
      .eq("is_active", true)
    if (error) log.error("org por dono não resolveu", { error })
    for (const r of data ?? []) {
      if (r.profile_id && r.org_id && !porDono.has(r.profile_id)) {
        porDono.set(r.profile_id, r.org_id)
      }
    }
  }

  for (const l of linhas) {
    saida.set(
      l.id,
      escolherOrg({
        cliente: l.client_id ? porCliente.get(l.client_id) : null,
        loja: l.store_id ? porLoja.get(l.store_id) : null,
        dono: l.owner_id ? porDono.get(l.owner_id) : null,
        lead: l.lead_id ? porLead.get(l.lead_id) : null,
      }),
    )
  }
  return saida
}

/**
 * A org de UM negócio. `operadorId` é o último degrau e só existe em
 * rota autenticada; sem ele a cascata pode devolver `null`, e quem chama
 * decide o que fazer — nunca inventar "a única org do banco", que
 * funcionaria hoje e passaria a cruzar dados no dia em que houver duas.
 */
export async function resolverOrgDoNegocio(
  admin: Admin,
  dealId: string,
  opcoes: { operadorId?: string | null } = {},
): Promise<OrgResolvida> {
  const { data, error } = await admin
    .from("deals")
    .select("id, client_id, store_id, owner_id, lead_id")
    .eq("id", dealId)
    .maybeSingle()

  if (error) {
    log.error("negócio não lido ao resolver org", { dealId, error })
    return null
  }
  if (!data) return null

  const porVinculo = await orgsDosNegocios(admin, [data as LinhaDoNegocio])
  const achado = porVinculo.get(dealId) ?? null
  if (achado) return achado

  const doOperador = await orgDoPerfil(admin, opcoes.operadorId)
  return doOperador ? { orgId: doOperador, fonte: "operador" } : null
}
