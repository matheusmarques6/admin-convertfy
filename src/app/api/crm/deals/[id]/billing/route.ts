/**
 * POST /api/crm/deals/[id]/billing — fechamento financeiro da venda ganha.
 *
 * Num único gesto: garante o cliente (lead → cliente via
 * ensureClientForDeal), atualiza os dados confirmados no dialog e gera
 * a cobrança no financeiro do cliente:
 *   - subscription: cria `client_subscriptions` (ciclo mensal) + a 1ª
 *     mensalidade em `client_charges` (vinculada por subscription_id)
 *   - charge: cobrança única (setup/entrada) em `client_charges`
 *
 * Tudo desagua em `unified_invoices` — a MESMA fonte do financeiro do
 * cliente, do payment status do onboarding e do cash collect do funil.
 * É o que mantém venda, cobrança e operação sincronizadas.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { uuid } from "@/lib/validations/uuid"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { logger } from "@/lib/logger"
import { ensureClientForDeal } from "@/lib/services/crm-client-link.service"
import { createFromDeal } from "@/lib/services/onboarding-pipeline.service"
import { linkSubscriptionStores } from "@/lib/services/subscription-stores"
import {
  isMissingClassificationColumn,
  stripClassification,
} from "@/lib/services/charge-classification"

const log = logger.child("CrmDealBilling")

/**
 * Insere em client_charges com tipo/meses; se a migration 20261113 não
 * rodou, grava sem eles (a venda fecha do mesmo jeito).
 */
async function insertCharge(
  admin: ReturnType<typeof createAdminClient>,
  row: Record<string, unknown>,
) {
  let res = await admin.from("client_charges").insert(row).select("id").single()
  if (res.error && isMissingClassificationColumn(res.error)) {
    res = await admin.from("client_charges").insert(stripClassification(row)).select("id").single()
  }
  return res
}

export const dynamic = "force-dynamic"

const PAYMENT_METHODS = ["pix_direto", "asaas", "boleto", "cartao", "wise"] as const

const bodySchema = z.object({
  client: z
    .object({
      name: z.string().min(1).max(160).optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      company: z.string().max(160).nullable().optional(),
    })
    .optional(),
  subscription: z
    .object({
      value: z.number().positive().max(999_999_999),
      next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      payment_method: z.enum(PAYMENT_METHODS).optional().default("pix_direto"),
      name: z.string().max(160).optional(),
    })
    .optional(),
  charge: z
    .object({
      value: z.number().positive().max(999_999_999),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      payment_method: z.enum(PAYMENT_METHODS).optional().default("pix_direto"),
      description: z.string().max(240).optional(),
    })
    .optional(),
  /** Passo operacional: cria a loja (dados reais, não fallback) e o onboarding. */
  onboarding: z
    .object({
      store_name: z.string().max(160).optional(),
      store_url: z.string().max(300).nullable().optional(),
      platform: z.enum(["shopify", "nuvemshop", "woocommerce", "other"]).optional(),
    })
    .optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    uuid().parse(id)
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()

    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const { data: deal } = await admin
      .from("deals")
      .select("id, title, value, client_id, lead_id, owner_id")
      .eq("id", id)
      .maybeSingle()
    if (!deal) throw new AppError("Negócio não encontrado", 404, "not-found")

    // Org do operador — fallback pra resolução de org do cliente e do
    // passo operacional.
    const { data: opMember } = await admin
      .from("org_members")
      .select("org_id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
    const operatorOrgId = opMember?.org_id ?? null

    // Garante o cliente (converte o lead se ainda não converteu).
    let clientId = deal.client_id as string | null
    if (!clientId) {
      const linked = await ensureClientForDeal(admin, id, { fallbackOrgId: operatorOrgId })
      if (linked.reason === "no_org") {
        throw new AppError(
          "Não foi possível determinar a organização do negócio — verifique o responsável pela venda.",
          422,
          "validation-error",
        )
      }
      clientId = linked.client_id
    }
    if (!clientId) {
      throw new AppError(
        "Negócio sem cliente nem lead — vincule um cliente pela ficha antes de gerar a cobrança.",
        422,
        "validation-error",
      )
    }

    // Dados confirmados no dialog (preencher-vazio não: aqui o usuário
    // REVISOU os campos, então o que veio sobrescreve).
    if (parsed.client && Object.keys(parsed.client).length > 0) {
      const updates: Record<string, unknown> = {}
      if (parsed.client.name?.trim()) updates.name = parsed.client.name.trim()
      if (parsed.client.email !== undefined) updates.email = parsed.client.email?.trim() || null
      if (parsed.client.phone !== undefined) updates.phone = parsed.client.phone?.trim() || null
      if (parsed.client.company !== undefined)
        updates.company = parsed.client.company?.trim() || null
      if (Object.keys(updates).length > 0) {
        const { error } = await admin.from("clients").update(updates).eq("id", clientId)
        if (error) log.warn("[Billing] update do cliente falhou", { clientId, error: error.message })
      }
    }

    let subscriptionId: string | null = null
    const chargeIds: string[] = []
    const summary: string[] = []

    if (parsed.subscription) {
      const s = parsed.subscription
      const { data: sub, error } = await admin
        .from("client_subscriptions")
        .insert({
          client_id: clientId,
          name: s.name?.trim() || `Assinatura — ${deal.title}`.slice(0, 160),
          value: s.value,
          cycle: "MONTHLY",
          payment_method: s.payment_method,
          status: "active",
          start_date: new Date().toISOString().split("T")[0],
          next_due_date: s.next_due_date,
          notes: `Gerada no fechamento do negócio "${deal.title}"`,
        })
        .select("id")
        .single()
      if (error) throw error
      subscriptionId = sub.id

      // 1ª mensalidade já entra no contas-a-receber — sem ela a
      // assinatura existe mas nada aparece pra cobrar.
      const { data: firstCharge, error: cErr } = await insertCharge(admin, {
        client_id: clientId,
        subscription_id: sub.id,
        description: `1ª mensalidade — ${deal.title}`.slice(0, 240),
        value: s.value,
        due_date: s.next_due_date,
        payment_method: s.payment_method,
        status: "pending",
        charge_type: "subscription",
        reference_months: [s.next_due_date.slice(0, 7)],
      })
      if (cErr) {
        log.warn("[Billing] assinatura criada mas 1ª mensalidade falhou", {
          subscriptionId,
          error: cErr.message,
        })
      } else {
        chargeIds.push(firstCharge.id)
      }
      summary.push(`assinatura mensal de R$ ${s.value}`)
    }

    if (parsed.charge) {
      const c = parsed.charge
      const { data: charge, error } = await insertCharge(admin, {
        client_id: clientId,
        description: (c.description?.trim() || `Cobrança — ${deal.title}`).slice(0, 240),
        value: c.value,
        due_date: c.due_date,
        payment_method: c.payment_method,
        status: "pending",
        charge_type: "other",
      })
      if (error) throw error
      chargeIds.push(charge.id)
      summary.push(`cobrança única de R$ ${c.value}`)
    }

    // Passo operacional: loja com os dados informados + onboarding.
    // Org do passo = org do CLIENTE (é onde as telas do operacional vão
    // procurar), com fallback pra org do operador.
    let onboardingId: string | null = null
    let onboardingError: string | null = null
    // Loja do passo operacional — é a que a assinatura e as cobranças
    // desta venda cobrem (vínculo assinatura ↔ loja + store_id).
    let linkedStoreId: string | null = null
    if (parsed.onboarding) {
      const { data: clientRow } = await admin
        .from("clients")
        .select("org_id")
        .eq("id", clientId)
        .maybeSingle()
      const orgId = (clientRow?.org_id as string | null) ?? operatorOrgId
      if (!orgId) {
        onboardingError = "operador sem organização ativa"
        log.warn("[Billing] onboarding pulado — org não resolvida", { dealId: id })
      } else {
        try {
          const storeName = parsed.onboarding.store_name?.trim()
          const storeUrl = parsed.onboarding.store_url?.trim() || null
          const platform = parsed.onboarding.platform ?? "shopify"
          const fallbackSuffix = ` - ${id.slice(0, 8)}`

          // O cron process-deal-won (a cada minuto) pode ter criado o
          // onboarding com a loja FALLBACK enquanto o vendedor preenchia
          // o dialog. Checar ANTES evita loja duplicada: se a loja do
          // onboarding é a fallback deste deal, ela vira a loja real
          // (update in-place — sem fantasma pra desativar).
          const { data: existingOnb } = await admin
            .from("onboardings")
            .select("id, store_id")
            .eq("source_deal_id", id)
            .eq("status", "in_progress")
            .limit(1)
            .maybeSingle()

          if (existingOnb) {
            onboardingId = existingOnb.id
            linkedStoreId = existingOnb.store_id ?? null
            if (storeName && existingOnb.store_id) {
              const { data: currentStore } = await admin
                .from("client_stores")
                .select("id, store_name")
                .eq("id", existingOnb.store_id)
                .maybeSingle()
              if (currentStore?.store_name?.endsWith(fallbackSuffix)) {
                const { error: upErr } = await admin
                  .from("client_stores")
                  .update({ store_name: storeName, store_url: storeUrl, platform })
                  .eq("id", currentStore.id)
                if (!upErr) {
                  // A task da coluna Entrada guarda o nome denormalizado
                  // — corrige pra o card do quadro não exibir a loja
                  // fantasma pra sempre.
                  const { data: tasks } = await admin
                    .from("onboarding_tasks")
                    .select("id, source_metadata")
                    .eq("onboarding_id", existingOnb.id)
                  for (const t of tasks ?? []) {
                    const meta = (t.source_metadata ?? {}) as Record<string, unknown>
                    if (meta.store_name === currentStore.store_name) {
                      await admin
                        .from("onboarding_tasks")
                        .update({ source_metadata: { ...meta, store_name: storeName } })
                        .eq("id", t.id)
                    }
                  }
                  log.info("[Billing] loja fallback atualizada com os dados reais", {
                    onboardingId,
                    storeId: currentStore.id,
                  })
                }
              }
            }
            summary.push("onboarding vinculado")
          } else {
            let storeId: string | null = null
            if (storeName) {
              // Reusa loja do cliente com o mesmo nome; senão cria com
              // os dados informados (a UNIQUE por org+nome tornaria o
              // retry barulhento — buscar antes é mais limpo).
              const { data: existingStore } = await admin
                .from("client_stores")
                .select("id")
                .eq("client_id", clientId)
                .ilike("store_name", storeName)
                .limit(1)
                .maybeSingle()
              if (existingStore) {
                storeId = existingStore.id
              } else {
                const { data: store, error: sErr } = await admin
                  .from("client_stores")
                  .insert({
                    org_id: orgId,
                    client_id: clientId,
                    store_name: storeName,
                    store_url: storeUrl,
                    platform,
                    is_active: true,
                  })
                  .select("id")
                  .single()
                if (sErr) {
                  log.warn("[Billing] loja não criada — onboarding usa fallback", {
                    error: sErr.message,
                  })
                } else {
                  storeId = store.id
                }
              }
            }

            const result = await createFromDeal({
              id,
              org_id: orgId,
              client_id: clientId,
              store_id: storeId,
              title: deal.title,
              value: deal.value,
              owner_id: deal.owner_id ?? user.id,
              created_by: user.id,
            })
            onboardingId = result.onboarding?.id ?? null
            linkedStoreId =
              storeId ??
              ((result.onboarding as { store_id?: string | null } | null | undefined)?.store_id ?? null)
            if (onboardingId) {
              summary.push(result.created ? "onboarding criado" : "onboarding vinculado")
            } else {
              onboardingError = "criação do onboarding não concluída"
            }
          }
        } catch (err) {
          onboardingError = err instanceof Error ? err.message : "erro inesperado"
          log.error("[Billing] passo operacional falhou", { dealId: id, err })
        }
      }
    }

    // Amarra o financeiro à loja da venda: assinatura ↔ loja e store_id
    // nas cobranças. É o que faz a Gestão de Carteira mostrar a
    // mensalidade NESTA loja (e não em todas as do cliente). Fail-open:
    // a venda já está fechada.
    if (linkedStoreId) {
      if (subscriptionId) await linkSubscriptionStores(admin, subscriptionId, [linkedStoreId])
      if (chargeIds.length > 0) {
        const { error: stErr } = await admin
          .from("client_charges")
          .update({ store_id: linkedStoreId })
          .in("id", chargeIds)
        if (stErr && !isMissingClassificationColumn(stErr)) {
          log.warn("[Billing] store_id das cobranças não gravado", { error: stErr.message })
        }
      }
    }

    if (summary.length > 0) {
      await admin.from("crm_deal_activities").insert({
        deal_id: id,
        type: "system",
        content: `Fechamento: ${summary.join(" + ")}`,
        created_by: user.id,
        is_internal: true,
      })
    }

    log.info("[Billing] fechamento", {
      dealId: id,
      clientId,
      subscriptionId,
      charges: chargeIds.length,
      onboardingId,
    })
    return successResponse(request, {
      client_id: clientId,
      subscription_id: subscriptionId,
      charge_ids: chargeIds,
      onboarding_id: onboardingId,
      // Onboarding pedido mas não criado: o dialog PRECISA avisar — 200
      // silencioso aqui viraria "card sumiu do operacional".
      onboarding_error: parsed.onboarding && !onboardingId ? onboardingError ?? "não criado" : null,
    })
  } catch (error) {
    log.error("Deal billing error:", error)
    return errorResponse(request, error, "crm-deal-billing")
  }
}
