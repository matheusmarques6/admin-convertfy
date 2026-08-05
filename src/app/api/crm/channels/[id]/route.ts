/**
 * DELETE /api/crm/channels/[id] — exclui o canal DE VERDADE.
 *
 * O botão "Remover" (evolution/logout DELETE) só apaga a instância no
 * servidor Evolution e marca is_active=false: a linha em crm_channels
 * fica para sempre, o card continua na tela como "Desativado" e as
 * conversas seguem no inbox. Esta rota apaga a linha — e, por CASCADE,
 * as conversas (crm_threads), as mensagens (crm_messages, cascata da
 * thread) e os templates (crm_whatsapp_templates) do canal.
 *
 * Exige o canal já desativado: excluir um canal em uso derrubaria o
 * atendimento em curso, então a ordem é sempre Remover → Excluir.
 *
 * Antes do delete, tenta remover a instância órfã na Evolution (best
 * effort — loadChannelClient só enxerga canal ativo, então monta o
 * client direto do config) e limpa as notificações in-app das threads,
 * que se ligam por metadata->>thread_id sem FK e sobreviveriam ao
 * CASCADE apontando para conversa inexistente.
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse, requireAuth, successResponse, AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"
import { logger } from "@/lib/logger"
import { createEvolutionClient } from "@/lib/whatsapp/evolution-api"
import { getEvolutionRuntimeConfig } from "@/lib/whatsapp/evolution-settings"
import { resolveInstagramAccount } from "@/lib/services/instagram-activity.service"

const log = logger.child("CrmChannelDelete")

export const dynamic = "force-dynamic"
export const maxDuration = 120

type ChannelRow = {
  id: string
  org_id: string
  provider: string
  display_name: string
  external_id: string
  is_active: boolean
}

// ─── PATCH: editar canal (nome, ativo/inativo, credenciais do IG) ──
//
// O card de Canais precisava de um caminho de EDIÇÃO: trocar o token
// quando expira, corrigir o ID, renomear, desativar (pré-requisito do
// Excluir) e reativar. Token/ID novos são REVALIDADOS na Graph API
// antes de gravar — mesma régua da conexão.

const patchSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
  instagram: z
    .object({
      /** Vazio/ausente mantém o token atual. */
      access_token: z.string().min(10).optional(),
      instagram_business_account_id: z.string().min(3).optional(),
    })
    .optional(),
})

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const raw = await request.json().catch(() => ({}))
    const body = patchSchema.parse(raw)

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, type, provider, display_name, external_id, is_active, config")
      .eq("id", channelId)
      .maybeSingle<ChannelRow & { type: string; config: Record<string, unknown> | null }>()

    if (!channel || channel.org_id !== orgId) {
      throw new AppError("Canal não encontrado", 404, "not-found")
    }
    if (body.instagram && channel.type !== "instagram") {
      throw new AppError("Credenciais de Instagram só se aplicam a canais Instagram", 422, "validation-error")
    }

    const update: Record<string, unknown> = {}
    if (body.display_name !== undefined) update.display_name = body.display_name.trim()
    if (body.is_active !== undefined) update.is_active = body.is_active

    let nextExternalId = channel.external_id
    if (body.instagram) {
      const rawConfig = channel.config ?? {}
      const candidateToken =
        body.instagram.access_token ??
        (typeof rawConfig.access_token === "string" ? rawConfig.access_token : "")
      const candidateId =
        body.instagram.instagram_business_account_id ??
        ((typeof rawConfig.instagram_business_account_id === "string"
          ? rawConfig.instagram_business_account_id
          : null) ||
          channel.external_id)

      // Revalida na Meta (e corrige ID de Página → IG ID sozinho).
      const resolution = await resolveInstagramAccount({
        instagram_business_account_id: candidateId,
        access_token: candidateToken,
      })
      if (!resolution.ok) {
        throw new AppError(
          resolution.error?.message ?? "Não foi possível validar as credenciais na Graph API.",
          422,
          "instagram-validation",
        )
      }
      nextExternalId = resolution.resolved_id
      update.external_id = nextExternalId
      update.config = {
        ...rawConfig,
        instagram_business_account_id: nextExternalId,
        access_token: candidateToken,
        ...(resolution.page_id ? { facebook_page_id: resolution.page_id } : {}),
      }
    }

    // Guard de roteamento do webhook: nunca deixar DOIS canais ativos
    // com o mesmo external_id (na troca de conta E na reativação).
    const willBeActive = body.is_active ?? channel.is_active
    const idChanged = nextExternalId !== channel.external_id
    if (channel.type === "instagram" && willBeActive && (idChanged || body.is_active === true)) {
      const { data: clash } = await admin
        .from("crm_channels")
        .select("id, display_name")
        .eq("org_id", orgId)
        .eq("type", "instagram")
        .eq("external_id", nextExternalId)
        .eq("is_active", true)
        .neq("id", channelId)
        .limit(1)
        .maybeSingle()
      if (clash) {
        throw new AppError(
          `Esta conta de Instagram já está ativa no canal "${clash.display_name}" — desative-o primeiro.`,
          409,
          "conflict",
        )
      }
    }

    if (Object.keys(update).length === 0) {
      throw new AppError("Nada para atualizar", 422, "validation-error")
    }

    const { error } = await admin.from("crm_channels").update(update).eq("id", channelId)
    if (error) throw error

    log.info("canal editado", {
      channelId,
      fields: Object.keys(update).filter((k) => k !== "config"),
      credenciais: Boolean(body.instagram),
    })
    return successResponse(request, {
      id: channelId,
      external_id: nextExternalId,
      is_active: willBeActive,
    })
  } catch (error) {
    log.error("channel patch error:", error)
    return errorResponse(request, error, "crm-channel-patch")
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await context.params
    const sb = await createClient()
    const user = await requireAuth(sb)
    const admin = createAdminClient()
    const orgId = await resolveOrgId(user.id)

    const { data: channel } = await admin
      .from("crm_channels")
      .select("id, org_id, provider, display_name, external_id, is_active")
      .eq("id", channelId)
      .maybeSingle<ChannelRow>()

    if (!channel || channel.org_id !== orgId) {
      throw new AppError("Canal não encontrado", 404, "not-found")
    }
    if (channel.is_active) {
      throw new AppError(
        "Desative o canal antes de excluir (use Remover/Desconectar)",
        422,
        "channel-still-active",
      )
    }

    const { data: threads } = await admin
      .from("crm_threads")
      .select("id")
      .eq("channel_id", channelId)
      .returns<{ id: string }[]>()

    const threadIds = (threads ?? []).map((t) => t.id)

    let messages = 0
    for (let i = 0; i < threadIds.length; i += 200) {
      const { count } = await admin
        .from("crm_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", threadIds.slice(i, i + 200))
      messages += count ?? 0
    }

    // Instância órfã na Evolution: o canal pode ter sido desativado sem
    // passar pelo Remover. Falha aqui não impede a exclusão local.
    let evolutionOk = true
    let evolutionError: string | null = null
    if (channel.provider === "evolution") {
      try {
        const cfg = await getEvolutionRuntimeConfig(admin)
        if (!cfg) throw new Error("Evolution não configurada nesta instalação")
        const client = createEvolutionClient({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          instanceName: channel.external_id,
        })
        await client.logout().catch(() => {})
        await client.deleteInstance()
      } catch (err) {
        evolutionOk = false
        evolutionError = err instanceof Error ? err.message : String(err)
        log.warn("delete da instância na Evolution falhou (seguindo)", {
          channelId,
          message: evolutionError,
        })
      }
    }

    for (let i = 0; i < threadIds.length; i += 200) {
      const { error } = await admin
        .from("notifications")
        .delete()
        .filter("metadata->>thread_id", "in", `(${threadIds.slice(i, i + 200).join(",")})`)
      if (error) {
        log.warn("limpeza de notificações falhou (seguindo)", { channelId, message: error.message })
        break
      }
    }

    const { error: delErr } = await admin.from("crm_channels").delete().eq("id", channelId)
    if (delErr) throw delErr

    log.info("canal excluído", {
      channelId,
      channel: channel.display_name,
      threads: threadIds.length,
      messages,
    })

    return successResponse(request, {
      deleted: true,
      threads: threadIds.length,
      messages,
      evolution_ok: evolutionOk,
      evolution_error: evolutionError,
    })
  } catch (error) {
    log.error("channel delete error:", error)
    return errorResponse(request, error, "crm-channel-delete")
  }
}
