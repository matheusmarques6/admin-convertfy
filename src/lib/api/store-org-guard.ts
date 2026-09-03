/**
 * Guard de organização para recursos POR LOJA acessados com service
 * role (createAdminClient bypassa RLS — a rota é quem tem de escopar).
 *
 * Espelha a policy RLS de client_monthly_reports (`is_admin() OR
 * is_org_member()`), fechada por org: profile com role 'admin' passa;
 * qualquer outro usuário precisa ser membro ativo de org
 * (resolveOrgId lança 403 sem isso) E a loja precisa ser DESSA org.
 * Loja de outra org devolve 404 — não vaza existência.
 *
 * Nota multi-org (mesmo TODO de is_org_owner): resolveOrgId resolve a
 * PRIMEIRA org ativa do usuário; hoje o produto é single-org na
 * prática, então isso é exato. Quando multi-org chegar, trocar por
 * checagem de membership na org da loja.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { AppError } from "@/lib/api/errors"
import { resolveOrgId } from "@/lib/api/resolve-org"

async function isSystemAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle()
  return data?.role === "admin"
}

export async function assertStoreInUserOrg(
  admin: SupabaseClient,
  userId: string,
  storeId: string,
): Promise<void> {
  if (await isSystemAdmin(admin, userId)) return
  const orgId = await resolveOrgId(userId)
  const { data: store } = await admin
    .from("client_stores")
    .select("id, org_id")
    .eq("id", storeId)
    .maybeSingle()
  if (!store || store.org_id !== orgId) {
    throw new AppError("Loja não encontrada", 404, "not-found")
  }
}

/** Variante para recursos endereçados pelo id do RELATÓRIO mensal. */
export async function assertReportInUserOrg(
  admin: SupabaseClient,
  userId: string,
  reportId: string,
): Promise<void> {
  if (await isSystemAdmin(admin, userId)) return
  const { data: report } = await admin
    .from("client_monthly_reports")
    .select("store_id")
    .eq("id", reportId)
    .maybeSingle()
  if (!report?.store_id) {
    throw new AppError("Relatório não encontrado", 404, "not-found")
  }
  await assertStoreInUserOrg(admin, userId, String(report.store_id))
}

/**
 * Versão booleana para server components (RSC não tem errorResponse —
 * a página chama notFound()). Sem sessão → false.
 */
export async function canAccessReport(
  admin: SupabaseClient,
  userId: string | null | undefined,
  reportId: string,
): Promise<boolean> {
  if (!userId) return false
  try {
    await assertReportInUserOrg(admin, userId, reportId)
    return true
  } catch {
    return false
  }
}
