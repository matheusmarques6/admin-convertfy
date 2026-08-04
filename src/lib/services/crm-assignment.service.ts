/**
 * Distribuição automática de negócios (rodízio nativo da pipeline).
 *
 * `pipelines.assignment_mode='round_robin'` faz negócio criado SEM dono
 * humano explícito cair no membro ativo com menos negócios abertos
 * (least-loaded — melhor que rodízio sequencial: absorve férias e
 * volume desigual sozinho).
 *
 * Onde se aplica: form público e automação (action_create_deal). A
 * criação MANUAL não passa por aqui — quem cria o próprio negócio
 * espera ser o dono (comportamento Pipedrive).
 */

import type { createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("CrmAssignment")

type Admin = ReturnType<typeof createAdminClient>

/** Membro ativo da org com menos negócios abertos. */
export async function resolveLeastLoadedMember(
  admin: Admin,
  orgId: string,
): Promise<string | null> {
  const { data: members } = await admin
    .from("org_members")
    .select("profile_id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .limit(50)
  if (!members || members.length === 0) return null

  const counts = await Promise.all(
    members.map(async (m) => {
      const { count } = await admin
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", m.profile_id)
        .eq("status", "open")
      return { profile_id: m.profile_id, count: count || 0 }
    }),
  )
  counts.sort((a, b) => a.count - b.count)
  return counts[0]?.profile_id ?? null
}

/**
 * Dono automático segundo o modo da pipeline. Devolve null quando o
 * modo é manual, a coluna não existe (migration 20261068 pendente) ou
 * não há membro elegível — o chamador usa o fallback dele.
 */
export async function resolveAutoOwner(
  admin: Admin,
  pipelineId: string,
  orgId: string | null,
): Promise<string | null> {
  if (!orgId) return null
  try {
    const { data: pipeline, error } = await admin
      .from("pipelines")
      .select("assignment_mode")
      .eq("id", pipelineId)
      .maybeSingle()
    if (error || pipeline?.assignment_mode !== "round_robin") return null
    return await resolveLeastLoadedMember(admin, orgId)
  } catch (err) {
    log.warn("[Assignment] rodízio indisponível — segue fallback", { pipelineId, err })
    return null
  }
}
