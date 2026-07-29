/**
 * Link do formulario de onboarding por loja.
 *
 * O link NUNCA e armazenado como URL. O que existe no banco e o
 * `onboardings.form_token`; a URL (`{base}/form/{token}`) e derivada aqui.
 * Este modulo e a fonte unica dessa derivacao — antes dele a URL era
 * remontada a mao em 5 lugares, com bases divergentes entre servidor
 * (NEXT_PUBLIC_APP_URL) e browser (window.location.origin).
 *
 * Regra de negocio: um onboarding `in_progress` por par cliente+loja
 * (UNIQUE parcial `idx_onboardings_unique_active`). O token vive nele.
 * Loja sem onboarding nao tem link — e `ensureFormLinkForStore` cria o
 * onboarding pra que exista um link enviavel.
 */

import { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { secureToken } from "@/lib/utils/secure-token"
import { buildFormUrl } from "@/lib/utils/form-url"
import { createOnboarding } from "./onboarding-pipeline.service"

// Reexporta os builders isomorficos pra quem ja consome o serviço.
export { buildFormUrl, buildBriefingUrl, resolveAppBaseUrl } from "@/lib/utils/form-url"

const log = logger.child("OnboardingFormLink")

/** Validade padrao de um token recem-gerado (espelha createOnboarding). */
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000

/**
 * `active`  — token existe e nao venceu (link enviavel)
 * `expired` — token existe mas passou de `form_token_expires_at`
 * `none`    — a loja nao tem onboarding, entao nao tem token
 */
export type FormLinkStatus = "active" | "expired" | "none"

/** Estagios em que o cliente ainda nao entregou o formulario. */
const PENDING_BRIEFING_STATUSES = new Set(["not_started", "form_partially_filled"])

export interface StoreFormLink {
  store_id: string
  onboarding_id: string | null
  token: string | null
  /** URL completa pronta pra enviar. Null quando `status === 'none'`. */
  url: string | null
  expires_at: string | null
  status: FormLinkStatus
  briefing_status: string | null
  /** true quando o cliente ainda nao respondeu (ou respondeu parcial). */
  awaiting_response: boolean
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const ts = Date.parse(expiresAt)
  return Number.isFinite(ts) && ts < Date.now()
}

interface OnboardingLinkRow {
  id: string
  form_token: string | null
  form_token_expires_at: string | null
  briefing_status: string | null
  status: string | null
  created_at: string
}

function toFormLink(storeId: string, row: OnboardingLinkRow | null): StoreFormLink {
  if (!row?.form_token) {
    return {
      store_id: storeId,
      onboarding_id: row?.id ?? null,
      token: null,
      url: null,
      expires_at: null,
      status: "none",
      briefing_status: row?.briefing_status ?? null,
      awaiting_response: true,
    }
  }

  const expired = isExpired(row.form_token_expires_at)
  return {
    store_id: storeId,
    onboarding_id: row.id,
    token: row.form_token,
    url: buildFormUrl(row.form_token),
    expires_at: row.form_token_expires_at,
    status: expired ? "expired" : "active",
    briefing_status: row.briefing_status,
    awaiting_response: PENDING_BRIEFING_STATUSES.has(row.briefing_status ?? "not_started"),
  }
}

const LINK_COLUMNS = "id, form_token, form_token_expires_at, briefing_status, status, created_at"

/**
 * Onboarding que carrega o link da loja. Prefere o `in_progress` (o unico
 * garantido unico); caindo fora dele, usa o mais recente — assim uma loja
 * ja concluida ainda devolve o link historico em vez de "sem link".
 */
async function findOnboardingForStore(
  storeId: string,
): Promise<OnboardingLinkRow | null> {
  const admin = createAdminClient()

  const { data: active } = await admin
    .from("onboardings")
    .select(LINK_COLUMNS)
    .eq("store_id", storeId)
    .eq("status", "in_progress")
    .maybeSingle()
  if (active) return active as OnboardingLinkRow

  const { data: latest } = await admin
    .from("onboardings")
    .select(LINK_COLUMNS)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return (latest as OnboardingLinkRow | null) ?? null
}

/** Link atual da loja. Nunca cria nada — use `ensureFormLinkForStore`. */
export async function getFormLinkByStore(storeId: string): Promise<StoreFormLink> {
  return toFormLink(storeId, await findOnboardingForStore(storeId))
}

/**
 * Garante um link enviavel para a loja.
 *
 * Sem onboarding, cria um (o formulario publico resolve por
 * `onboardings.form_token` — um token solto abriria 404). Com token
 * vencido, renova. Idempotente: `createOnboarding` devolve o existente
 * quando ja ha um `in_progress`.
 */
export async function ensureFormLinkForStore(
  storeId: string,
  createdBy: string | null,
): Promise<{ link: StoreFormLink; created: boolean; renewed: boolean }> {
  const current = await findOnboardingForStore(storeId)

  if (current?.form_token && !isExpired(current.form_token_expires_at)) {
    return { link: toFormLink(storeId, current), created: false, renewed: false }
  }

  // Token vencido (ou linha sem token) num onboarding que ja existe:
  // renova em vez de criar outro — o UNIQUE parcial impediria a criacao.
  if (current) {
    const link = await regenerateFormToken(storeId, createdBy)
    return { link, created: false, renewed: true }
  }

  const admin = createAdminClient()
  const { data: store, error } = await admin
    .from("client_stores")
    .select("id, org_id, client_id, store_name")
    .eq("id", storeId)
    .maybeSingle()

  if (error) throw error
  if (!store) throw new Error(`Loja ${storeId} nao encontrada`)
  if (!store.org_id || !store.client_id) {
    throw new Error(
      `Loja ${storeId} sem org_id/client_id — nao da pra criar onboarding`,
    )
  }

  const { onboarding } = await createOnboarding({
    orgId: store.org_id,
    clientId: store.client_id,
    storeId: store.id,
    createdBy,
    source: "manual",
  })

  log.info("onboarding criado pra gerar link do formulario", {
    store_id: storeId,
    onboarding_id: onboarding.id,
  })

  return {
    link: toFormLink(storeId, {
      id: onboarding.id,
      form_token: onboarding.form_token,
      form_token_expires_at: onboarding.form_token_expires_at ?? null,
      briefing_status: onboarding.briefing_status ?? null,
      status: onboarding.status ?? null,
      created_at: new Date().toISOString(),
    }),
    created: true,
    renewed: false,
  }
}

/**
 * Emite um token novo pra loja, invalidando o anterior (o antigo deixa de
 * resolver na hora — as rotas publicas filtram por `form_token`).
 */
export async function regenerateFormToken(
  storeId: string,
  actorId: string | null,
): Promise<StoreFormLink> {
  const current = await findOnboardingForStore(storeId)
  if (!current) {
    throw new Error(`Loja ${storeId} nao tem onboarding — use ensureFormLinkForStore`)
  }

  const admin = createAdminClient()
  const token = secureToken(24)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()

  const { data: updated, error } = await admin
    .from("onboardings")
    .update({ form_token: token, form_token_expires_at: expiresAt })
    .eq("id", current.id)
    .select(LINK_COLUMNS)
    .single()

  if (error) throw error

  log.info("form_token regenerado", {
    store_id: storeId,
    onboarding_id: current.id,
    actor_id: actorId,
  })

  return toFormLink(storeId, updated as OnboardingLinkRow)
}

export interface StoreFormLinkSummary extends StoreFormLink {
  store_name: string | null
  client_id: string | null
  client_name: string | null
}

/**
 * Links de todas as lojas ativas da org, em UMA passada (duas queries, sem
 * N+1). Alimenta a lista de Lojas e o aviso geral de pendencias.
 */
export async function listStoreFormLinks(
  orgId: string,
): Promise<StoreFormLinkSummary[]> {
  const admin = createAdminClient()

  const { data: stores, error: sErr } = await admin
    .from("client_stores")
    .select("id, store_name, client_id, clients(name)")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("store_name", { ascending: true })

  if (sErr) throw sErr
  if (!stores || stores.length === 0) return []

  const { data: onboardings, error: oErr } = await admin
    .from("onboardings")
    .select(`store_id, ${LINK_COLUMNS}`)
    .in("store_id", stores.map((s) => s.id))
    .order("created_at", { ascending: false })

  if (oErr) throw oErr

  // Primeiro `in_progress` por loja; senao o mais recente (a query ja vem
  // ordenada por created_at desc, entao o primeiro visto vence).
  const byStore = new Map<string, OnboardingLinkRow>()
  for (const row of (onboardings ?? []) as Array<OnboardingLinkRow & { store_id: string }>) {
    const prev = byStore.get(row.store_id)
    if (!prev || (row.status === "in_progress" && prev.status !== "in_progress")) {
      byStore.set(row.store_id, row)
    }
  }

  return stores.map((s) => {
    const client = (s.clients ?? null) as { name?: string | null } | null
    return {
      ...toFormLink(s.id, byStore.get(s.id) ?? null),
      store_name: s.store_name ?? null,
      client_id: s.client_id ?? null,
      client_name: client?.name ?? null,
    }
  })
}
