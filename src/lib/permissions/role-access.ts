// Matriz central de acesso por função.
//
// Cada item da sidebar tem um id estável (não depende de href). O gate é
// computado por interseção: a conta vê o item se QUALQUER uma de suas
// funções (`roles[]`) o libera. `admin` e `dev` são bypass total.
//
// Itens "read-only" para uma função são considerados visíveis, mas a
// página correspondente deve desabilitar ações de escrita. Usado hoje em
// "Equipe" para a função `suporte`.

import type { OrgRole } from "@/types/organization"

export type NavItemId =
  // Comercial
  | "comercial.dashboard"
  | "comercial.pipelines"
  | "comercial.leads"
  | "comercial.forms"
  | "comercial.inbox"
  | "comercial.canais"
  | "comercial.automacoes"
  | "comercial.meetings"
  | "comercial.reports"
  // Operacional
  | "ops.dashboard"
  | "ops.clients"
  | "ops.stores"
  | "ops.health"
  | "ops.cs.painel"
  | "ops.cs.forms"
  | "ops.cs.pipelines"
  | "ops.cs.ritual"
  | "ops.onboarding"
  | "ops.cs.cadences"
  | "ops.onboarding.tutorial"
  | "ops.pipelines.admin"
  | "ops.campaigns.central"
  | "ops.campaigns.list"
  | "ops.insights"
  | "ops.list_hygiene"
  | "ops.image_studio"
  | "ops.reports"
  // Geral
  | "geral.home"
  | "geral.board"
  | "geral.meetings"
  | "geral.team"
  | "geral.financial"
  | "geral.reports"
  | "tools.tools"
  | "tools.currency_audit"
  | "tools.email_generation"
  | "tools.ai_usage"
  | "tools.email_logs"
  | "tools.agent_runs"

const ALL_ITEMS: NavItemId[] = [
  "comercial.dashboard",
  "comercial.pipelines",
  "comercial.leads",
  "comercial.forms",
  "comercial.inbox",
  "comercial.canais",
  "comercial.automacoes",
  "comercial.meetings",
  "comercial.reports",
  "ops.dashboard",
  "ops.clients",
  "ops.stores",
  "ops.health",
  "ops.cs.painel",
  "ops.cs.forms",
  "ops.cs.pipelines",
  "ops.cs.ritual",
  "ops.onboarding",
  "ops.cs.cadences",
  "ops.onboarding.tutorial",
  "ops.pipelines.admin",
  "ops.campaigns.central",
  "ops.campaigns.list",
  "ops.insights",
  "ops.list_hygiene",
  "ops.image_studio",
  "ops.reports",
  "geral.home",
  "geral.board",
  "geral.meetings",
  "geral.team",
  "geral.financial",
  "geral.reports",
  "tools.tools",
  "tools.currency_audit",
  "tools.email_generation",
  "tools.ai_usage",
  "tools.email_logs",
  "tools.agent_runs",
]

// Funções bypass (veem tudo).
const BYPASS_ROLES: OrgRole[] = ["admin", "dev"]

const COO_ITEMS = new Set<NavItemId>([
  "comercial.inbox",
  "comercial.canais",
  "comercial.automacoes",
  "ops.dashboard",
  "ops.clients",
  "ops.stores",
  "ops.health",
  "ops.cs.painel",
  "ops.cs.forms",
  "ops.cs.pipelines",
  "ops.cs.ritual",
  "ops.onboarding",
  "ops.cs.cadences",
  "ops.onboarding.tutorial",
  "ops.pipelines.admin",
  "ops.campaigns.central",
  "ops.campaigns.list",
  "ops.insights",
  "ops.list_hygiene",
  "ops.image_studio",
  "ops.reports",
  "geral.home",
  "geral.board",
  "geral.meetings",
  "geral.team",
  "geral.financial",
  "geral.reports",
])

const SUPORTE_ITEMS = new Set<NavItemId>([
  "comercial.dashboard",
  "comercial.pipelines",
  "comercial.leads",
  "comercial.forms",
  "comercial.inbox",
  "comercial.canais",
  "comercial.automacoes",
  "comercial.meetings",
  "comercial.reports",
  "ops.dashboard",
  "ops.clients",
  "ops.stores",
  "ops.health",
  "ops.cs.painel",
  "ops.cs.forms",
  "ops.cs.pipelines",
  "ops.cs.ritual",
  "ops.onboarding",
  "ops.cs.cadences",
  "ops.onboarding.tutorial",
  "ops.image_studio",
  "geral.home",
  "geral.board",
  "geral.meetings",
  "geral.team",       // read-only (ver READONLY_BY_ROLE)
  "geral.financial",
  "geral.reports",
])

const DESIGNER_IMPLEM_ITEMS = new Set<NavItemId>([
  "ops.dashboard",
  "ops.stores",
  "ops.onboarding",
  "ops.image_studio",
  "geral.home",
  "geral.board",
])

export const ACCESS_BY_ROLE: Record<OrgRole, Set<NavItemId>> = {
  admin: new Set(ALL_ITEMS),
  dev: new Set(ALL_ITEMS),
  coo: COO_ITEMS,
  suporte: SUPORTE_ITEMS,
  designer: DESIGNER_IMPLEM_ITEMS,
  implementacao: DESIGNER_IMPLEM_ITEMS,
}

const READONLY_SUPORTE = new Set<NavItemId>(["geral.team"])

export const READONLY_BY_ROLE: Record<OrgRole, Set<NavItemId>> = {
  admin: new Set(),
  dev: new Set(),
  coo: new Set(),
  suporte: READONLY_SUPORTE,
  designer: new Set(),
  implementacao: new Set(),
}

/** True se QUALQUER função da conta libera o item. Admin/Dev = bypass. */
export function canAccess(itemId: NavItemId, roles: readonly OrgRole[]): boolean {
  if (roles.some((r) => BYPASS_ROLES.includes(r))) return true
  return roles.some((r) => ACCESS_BY_ROLE[r]?.has(itemId))
}

/**
 * True se a conta só tem acesso read-only ao item. Útil para páginas que
 * precisam ocultar/disable ações de escrita (ex.: Equipe para Suporte).
 * Retorna false se a conta tem acesso de escrita por outra função.
 */
export function isReadOnly(itemId: NavItemId, roles: readonly OrgRole[]): boolean {
  if (!canAccess(itemId, roles)) return false
  if (roles.some((r) => BYPASS_ROLES.includes(r))) return false
  // Tem escrita por alguma função?
  const hasWrite = roles.some((r) => {
    const access = ACCESS_BY_ROLE[r]
    const readonly = READONLY_BY_ROLE[r]
    return access?.has(itemId) && !readonly?.has(itemId)
  })
  return !hasWrite
}

/** Funções que podem criar contas (gating de /api/team/invite e similares). */
export const ROLES_CAN_CREATE_ACCOUNTS: OrgRole[] = ["admin", "dev", "coo"]

export function canCreateAccounts(roles: readonly OrgRole[]): boolean {
  return roles.some((r) => ROLES_CAN_CREATE_ACCOUNTS.includes(r))
}

export const ALL_ORG_ROLES: OrgRole[] = [
  "admin",
  "dev",
  "coo",
  "suporte",
  "designer",
  "implementacao",
]

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  dev: "Dev",
  coo: "COO",
  suporte: "Suporte",
  designer: "Designer",
  implementacao: "Implementação",
}

// Mapa de funções legadas (ENUM antigo) → 6 funções canônicas. Usado para
// exibir e pré-preencher a edição de contas migradas antes do backfill da
// junção `org_member_roles`. DEVE espelhar o CASE de backfill da migration
// 20260801. Qualquer valor desconhecido cai em "suporte".
const LEGACY_ROLE_MAP: Record<string, OrgRole> = {
  // já canônicos (passthrough)
  admin: "admin",
  dev: "dev",
  coo: "coo",
  suporte: "suporte",
  designer: "designer",
  implementacao: "implementacao",
  // legados
  owner: "admin",
  developer: "implementacao",
  support: "suporte",
  manager: "suporte",
  coordinator: "suporte",
  copywriter: "suporte",
  analyst: "suporte",
  sdr: "suporte",
  techlead: "dev",
  ops: "suporte",
  estrategista: "suporte",
  cs: "suporte",
  financeiro: "suporte",
  member: "suporte",
}

/** Converte qualquer valor de role (legado ou canônico) numa das 6 funções. */
export function toCanonicalRole(raw: string | null | undefined): OrgRole {
  if (!raw) return "suporte"
  return LEGACY_ROLE_MAP[raw] ?? "suporte"
}

/**
 * Resolve o conjunto canônico de funções de um membro. Prioriza a junção
 * `org_member_roles` (fonte de verdade); se vazia/indisponível, faz fallback
 * para o `org_members.role` legado mapeado. Sempre retorna ≥1 função, sem
 * duplicatas.
 */
export function resolveMemberRoles(
  junctionRoles: readonly (string | null | undefined)[] | null | undefined,
  legacyRole: string | null | undefined,
): OrgRole[] {
  const fromJunction = (junctionRoles ?? [])
    .map((r) => (r ? toCanonicalRole(r) : null))
    .filter((r): r is OrgRole => r !== null)
  const base = fromJunction.length > 0 ? fromJunction : [toCanonicalRole(legacyRole)]
  return Array.from(new Set(base))
}
