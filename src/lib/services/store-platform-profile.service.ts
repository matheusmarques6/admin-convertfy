/**
 * Sincroniza moeda e fuso da loja a partir da plataforma de e-mail.
 *
 * Hoje só o Omnisend (`GET /v5/brands/current`), que é com quem a casa
 * integra sempre. O formato do retorno já vem normalizado do cliente, e a
 * DECISÃO do que gravar mora no módulo puro `lib/stores/platform-profile`
 * — aqui é só I/O: ler a loja, chamar a API, aplicar o patch.
 *
 * Por que isso existe: `client_stores.currency` nasceu com default 'BRL'
 * e ninguém preenchia; o relatório então convertia câmbio com a moeda
 * errada e o número saía do dashboard como se estivesse certo. O fuso
 * nem existia — o offset da janela era ADIVINHADO pela moeda.
 *
 * O que este serviço nunca faz: gravar moeda fora da lista fechada,
 * gravar fuso que o runtime não reconhece, e apagar um valor porque a
 * plataforma respondeu vazio. Falha de API vira `erro` no relatório da
 * loja e o laço continua nas outras — uma chave revogada não pode
 * derrubar o backfill inteiro.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { getStoreCredentials } from "@/lib/services/credentials.service"
import { getOmnisendBrand } from "@/lib/integrations/omnisend/client"
import {
  decidirPerfilDaLoja,
  resumoDaDecisao,
  type DecisaoDePerfil,
  type FontePerfil,
  type PerfilAtualDaLoja,
} from "@/lib/stores/platform-profile"
import { logger } from "@/lib/logger"

const log = logger.child("StorePlatformProfile")

export interface RelatorioDaLoja {
  storeId: string
  storeName: string
  /** `null` quando a loja não tem plataforma de onde puxar. */
  fonte: Exclude<FontePerfil, "manual"> | null
  decisao: DecisaoDePerfil | null
  /** Gravou de fato no banco. */
  gravado: boolean
  /** Motivo de não ter dado para trabalhar (sem chave, API recusou, …). */
  erro?: string
  resumo: string
}

interface LinhaDaLoja extends PerfilAtualDaLoja {
  id: string
  store_name: string
  email_platform: string | null
  omnisend_api_key: string | null
}

const COLUNAS =
  "id, store_name, currency, currency_source, timezone, timezone_source, email_platform, omnisend_api_key"

/**
 * Sincroniza UMA loja.
 *
 * `forcar` passa por cima de valor marcado como manual — é o que a tela
 * manda quando o operador clica "usar o da plataforma".
 */
export async function syncStorePlatformProfile(
  storeId: string,
  options?: { forcar?: boolean; orgId?: string },
): Promise<RelatorioDaLoja> {
  const admin = createAdminClient()
  let query = admin.from("client_stores").select(COLUNAS).eq("id", storeId)
  if (options?.orgId) query = query.eq("org_id", options.orgId)
  const { data, error } = await query.maybeSingle<LinhaDaLoja>()

  if (error || !data) {
    return {
      storeId,
      storeName: storeId,
      fonte: null,
      decisao: null,
      gravado: false,
      erro: error?.message ?? "Loja não encontrada",
      resumo: `${storeId} · loja não encontrada`,
    }
  }
  return syncLinha(data, options?.forcar ?? false)
}

/**
 * Sincroniza VÁRIAS lojas, em série.
 *
 * Em série de propósito: o cliente do Omnisend tem rate limit por chave,
 * e disparar 63 chamadas em paralelo faria metade voltar 429 — o backfill
 * "terminaria" reportando falha em lojas que estão perfeitas.
 */
export async function syncAllStoresPlatformProfile(options?: {
  forcar?: boolean
  orgId?: string
  storeIds?: string[]
  /** Só as lojas ativas (padrão). */
  somenteAtivas?: boolean
}): Promise<{ lojas: RelatorioDaLoja[]; alteradas: number; comErro: number }> {
  const admin = createAdminClient()
  let query = admin.from("client_stores").select(COLUNAS).order("store_name")
  if (options?.orgId) query = query.eq("org_id", options.orgId)
  if (options?.storeIds?.length) query = query.in("id", options.storeIds)
  if (options?.somenteAtivas !== false) query = query.eq("is_active", true)

  const { data, error } = await query.returns<LinhaDaLoja[]>()
  if (error) throw new Error(`Não consegui listar as lojas: ${error.message}`)

  const lojas: RelatorioDaLoja[] = []
  for (const linha of data ?? []) {
    lojas.push(await syncLinha(linha, options?.forcar ?? false))
  }
  return {
    lojas,
    alteradas: lojas.filter((l) => l.gravado && l.decisao?.mudou).length,
    comErro: lojas.filter((l) => l.erro).length,
  }
}

async function syncLinha(linha: LinhaDaLoja, forcar: boolean): Promise<RelatorioDaLoja> {
  const base = { storeId: linha.id, storeName: linha.store_name }

  if (!linha.omnisend_api_key) {
    // Sem chave não há o que puxar. Não é erro: a loja pode ser Klaviyo,
    // ou ainda não ter integração. Dizer isso é melhor que contar como falha.
    return {
      ...base,
      fonte: null,
      decisao: null,
      gravado: false,
      resumo: `${linha.store_name} · sem chave do Omnisend — nada a puxar`,
    }
  }

  let apiKey: string
  try {
    const cred = await getStoreCredentials(linha.id)
    if (!cred.omnisend_api_key) throw new Error("chave não pôde ser descriptografada")
    apiKey = cred.omnisend_api_key
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...base,
      fonte: "omnisend",
      decisao: null,
      gravado: false,
      erro: msg,
      resumo: `${linha.store_name} · credencial indisponível: ${msg}`,
    }
  }

  let brand
  try {
    brand = await getOmnisendBrand(apiKey, { logTag: "StorePlatformProfile", throwOnError: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn("Omnisend recusou /brands/current", { storeId: linha.id, erro: msg })
    return {
      ...base,
      fonte: "omnisend",
      decisao: null,
      gravado: false,
      erro: msg,
      resumo: `${linha.store_name} · Omnisend recusou: ${msg}`,
    }
  }

  if (!brand) {
    return {
      ...base,
      fonte: "omnisend",
      decisao: null,
      gravado: false,
      erro: "A Omnisend não devolveu a marca conectada.",
      resumo: `${linha.store_name} · Omnisend não devolveu a marca`,
    }
  }

  const decisao = decidirPerfilDaLoja(
    {
      currency: linha.currency,
      currency_source: linha.currency_source,
      timezone: linha.timezone,
      timezone_source: linha.timezone_source,
    },
    { currency: brand.currency, timezone: brand.timezone, fonte: "omnisend" },
    { forcar },
  )

  const resumo = resumoDaDecisao(linha.store_name, decisao)
  if (Object.keys(decisao.patch).length === 0) {
    return { ...base, fonte: "omnisend", decisao, gravado: false, resumo }
  }

  const admin = createAdminClient()
  const { error } = await admin.from("client_stores").update(decisao.patch).eq("id", linha.id)
  if (error) {
    return {
      ...base,
      fonte: "omnisend",
      decisao,
      gravado: false,
      erro: error.message,
      resumo: `${resumo} · falhou ao gravar: ${error.message}`,
    }
  }

  if (decisao.mudou) log.info("perfil da loja corrigido pela plataforma", { storeId: linha.id, resumo })
  return { ...base, fonte: "omnisend", decisao, gravado: true, resumo }
}
