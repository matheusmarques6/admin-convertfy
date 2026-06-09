/**
 * Mapa task.slug -> workspace target (mode + flow + email).
 * Fonte da verdade para roteamento entre o drawer de task e o
 * production-workspace. Sincronizado com onboarding-bootstrap.service
 * via test de contrato em __tests__/slug-mapping.test.ts.
 */

import type { FlowType } from "@/types/email-workspace"

export type WorkspaceMode = "preview" | "full" | "implementation"

export interface EmailTarget {
  kind: "email"
  mode: WorkspaceMode
  flowType: FlowType
  emailNumber: number
}

export interface EmailListSubItem {
  slug: string
  emailNumber: number
}

export interface EmailListTarget {
  kind: "email-list"
  mode: WorkspaceMode
  flowType: FlowType
  subItems: EmailListSubItem[]
}

export interface CheckboxOnlyTarget {
  kind: "checkbox-only"
  resource?: "brand" | "briefing"
}

/**
 * Visão geral de implementação: abre o workspace em modo `implementation` com
 * TODOS os flows (sem filtro por flow). Usado pela task âncora da Etapa 6
 * ("Enviar instruções…"), que é o ponto de entrada da etapa — o ops vê todos
 * os flows na sidebar e navega entre eles. Não tem flowType nem subItems.
 */
export interface ImplementationOverviewTarget {
  kind: "implementation-overview"
}

export type TaskWorkspaceTarget =
  | EmailTarget
  | EmailListTarget
  | CheckboxOnlyTarget
  | ImplementationOverviewTarget

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const subItems = (
  prefix: string,
  count: number,
): EmailListSubItem[] =>
  range(count).map((n) => ({ slug: `${prefix}_${n}`, emailNumber: n }))

/**
 * Factory dos targets de implementação (Etapa 6): email-list em modo
 * `implementation` cobrindo todos os e-mails do flow. Reusado pelo
 * TASK_SLUG_MAP e pelo fallback por título (tasks legadas com slug NULL).
 */
const implListTarget = (
  flowType: FlowType,
  count: number,
  prefix: string,
): EmailListTarget => ({
  kind: "email-list",
  mode: "implementation",
  flowType,
  subItems: subItems(prefix, count),
})

export const TASK_SLUG_MAP: Record<string, TaskWorkspaceTarget | null> = {
  // Etapa 3 — Designer cria pilotos
  preview_brand_brain: { kind: "checkbox-only", resource: "briefing" },
  preview_email_welcome: {
    kind: "email",
    mode: "preview",
    flowType: "welcome",
    emailNumber: 1,
  },
  preview_email_carrinho_1: {
    kind: "email",
    mode: "preview",
    flowType: "abandoned_cart",
    emailNumber: 1,
  },
  preview_email_carrinho_2: {
    kind: "email",
    mode: "preview",
    flowType: "abandoned_cart",
    emailNumber: 2,
  },
  preview_email_pos_compra: {
    kind: "email",
    mode: "preview",
    flowType: "upsell",
    emailNumber: 1,
  },

  // Etapa 5 — Emails finais (1 task por flow, sub_items = emails individuais)
  flow_welcome: {
    kind: "email-list",
    mode: "full",
    flowType: "welcome",
    subItems: subItems("welcome_email", 8),
  },
  flow_carrinho_abandonado: {
    kind: "email-list",
    mode: "full",
    flowType: "abandoned_cart",
    subItems: subItems("carrinho_email", 8),
  },
  flow_browse_abandoned: {
    kind: "email-list",
    mode: "full",
    flowType: "browse_abandonment",
    subItems: subItems("browse_abandoned_email", 5),
  },
  flow_upsell: {
    kind: "email-list",
    mode: "full",
    flowType: "upsell",
    subItems: subItems("upsell_email", 4),
  },
  flow_winback: {
    kind: "email-list",
    mode: "full",
    flowType: "win_back",
    subItems: subItems("winback_email", 3),
  },
  flow_site_abandoned: {
    kind: "email-list",
    mode: "full",
    flowType: "site_abandoned",
    subItems: subItems("site_abandoned_email", 1),
  },
  flow_etapas_envio: {
    kind: "email-list",
    mode: "full",
    flowType: "shipping_stages",
    subItems: subItems("envio_email", 5),
  },

  // Etapa 6 — Implementação na Omnisend (role ops). Cada item "Configurar a
  // automação de X Flow e subir os e-mails" abre o workspace em modo
  // `implementation` (handoff read-only + copiar): setup de disparo,
  // remetente, cupons, copy completa e mapa render↔copy do flow inteiro.
  // mode `implementation` é filtrado no reverse-lookup (resolveSlugForEmail)
  // pra não interferir no sync de status dos flows `full`/`preview`.
  impl_welcome: implListTarget("welcome", 8, "impl_welcome_email"),
  impl_carrinho: implListTarget("abandoned_cart", 8, "impl_carrinho_email"),
  impl_site_abandonado: implListTarget("site_abandoned", 1, "impl_site_abandonado_email"),
  impl_browse_abandonado: implListTarget("browse_abandonment", 5, "impl_browse_abandonado_email"),
  impl_post_purchase: implListTarget("upsell", 4, "impl_post_purchase_email"),
  impl_winback: implListTarget("win_back", 3, "impl_winback_email"),
  impl_pedido_pago: implListTarget("shipping_stages", 5, "impl_pedido_pago_email"),

  // Task âncora da Etapa 6 — ponto de entrada que o ops clica. Abre o handoff
  // completo (todos os flows) em modo implementation.
  impl_acesso_instrucoes: { kind: "implementation-overview" },

  // Itens da Etapa 6 SEM workspace de email (config técnica / verificação).
  // Mapeados explicitamente como `null` pra documentar a intenção e satisfazer
  // o contrato com o bootstrap. "Iniciar" nesses itens cai no 422 (com toast).
  impl_dns: null,
  impl_popup: null,
  impl_teste_e2e: null,
}

export function resolveTaskWorkspaceTarget(
  slug: string | null | undefined,
): TaskWorkspaceTarget | null {
  if (!slug) return null
  return TASK_SLUG_MAP[slug] ?? null
}

/**
 * Fallback: tasks legadas podem ter sido criadas com `slug=NULL` ou um
 * slug diferente do mapa atual. Tenta inferir o target a partir do
 * título da task (matching case-insensitive). Usado SÓ quando o slug
 * não resolve. Não substitui o mapping primário — é defensivo.
 */
const TITLE_FALLBACK_RULES: Array<{
  match: RegExp
  target: TaskWorkspaceTarget
}> = [
  {
    match: /brand\s*brain.*refer/i,
    target: { kind: "checkbox-only", resource: "briefing" },
  },
  {
    match: /(email[-\s]?piloto.*welcome|piloto.*boas[-\s]vindas|email-piloto\s*1[:\s])/i,
    target: { kind: "email", mode: "preview", flowType: "welcome", emailNumber: 1 },
  },
  {
    match: /(email[-\s]?piloto\s*2[:\s].*carrinho|piloto.*carrinho.*parte\s*1)/i,
    target: { kind: "email", mode: "preview", flowType: "abandoned_cart", emailNumber: 1 },
  },
  {
    match: /piloto.*carrinho.*parte\s*2/i,
    target: { kind: "email", mode: "preview", flowType: "abandoned_cart", emailNumber: 2 },
  },
  {
    match: /(email[-\s]?piloto\s*3[:\s].*pos|piloto.*pos[-\s]compra|piloto.*upsell)/i,
    target: { kind: "email", mode: "preview", flowType: "upsell", emailNumber: 1 },
  },
  // Etapa 6 — tasks "Configurar a automação de [flow] e subir os e-mails".
  // Cobre cards legados cujas tasks foram criadas com slug NULL (antes dos
  // slugs impl_* existirem no template). Ancorado em "configurar" pra não
  // colidir com os títulos de piloto ("Criar email-piloto...").
  {
    match: /configurar.*welcome/i,
    target: implListTarget("welcome", 8, "impl_welcome_email"),
  },
  {
    match: /configurar.*(carrinho|checkout)/i,
    target: implListTarget("abandoned_cart", 8, "impl_carrinho_email"),
  },
  {
    match: /configurar.*site\s*abandonad/i,
    target: implListTarget("site_abandoned", 1, "impl_site_abandonado_email"),
  },
  {
    match: /configurar.*browse\s*abandonad/i,
    target: implListTarget("browse_abandonment", 5, "impl_browse_abandonado_email"),
  },
  {
    match: /configurar.*(post[-\s]?purchase|p[oó]s[-\s]?compra)/i,
    target: implListTarget("upsell", 4, "impl_post_purchase_email"),
  },
  {
    match: /configurar.*win[-\s]?back/i,
    target: implListTarget("win_back", 3, "impl_winback_email"),
  },
  {
    match: /configurar.*pedido\s*pago/i,
    target: implListTarget("shipping_stages", 5, "impl_pedido_pago_email"),
  },
  // Task âncora da Etapa 6 — "Enviar instruções … criar conta Klaviyo/Omnisend".
  // Abre a visão geral (todos os flows). Cobre cards legados com slug NULL.
  {
    match: /(instru[cç][õo]es|criar\s*conta).*(klaviyo|omnisend)/i,
    target: { kind: "implementation-overview" },
  },
]

export function resolveTaskWorkspaceTargetByTitle(
  title: string | null | undefined,
): TaskWorkspaceTarget | null {
  if (!title) return null
  for (const rule of TITLE_FALLBACK_RULES) {
    if (rule.match.test(title)) return rule.target
  }
  return null
}

/**
 * Para tasks 1:N (`flow_*`), resolve o target de um sub_item específico.
 * Ex: parent=`flow_welcome`, sub=`welcome_email_3` -> { welcome, #3 }.
 */
export function resolveSubItemEmailTarget(
  parentSlug: string,
  subItemSlug: string,
): EmailTarget | null {
  const target = resolveTaskWorkspaceTarget(parentSlug)
  if (!target || target.kind !== "email-list") return null
  const sub = target.subItems.find((s) => s.slug === subItemSlug)
  if (!sub) return null
  return {
    kind: "email",
    mode: target.mode,
    flowType: target.flowType,
    emailNumber: sub.emailNumber,
  }
}

/**
 * Caminho reverso: encontra qual task.slug é dona de um email
 * (flowType + emailNumber), prioridade preview > full. Usado pelo sync
 * para subir o status da task quando email muda no workspace.
 */
export function resolveSlugForEmail(
  flowType: FlowType,
  emailNumber: number,
): { parentSlug: string; subItemSlug?: string } | null {
  for (const [slug, target] of Object.entries(TASK_SLUG_MAP)) {
    if (!target) continue
    // `implementation` é um handoff read-only — nunca é dono do email pro sync
    // de status. A posse fica com os targets `preview` (1:1) e `full` (flow).
    if (
      (target.kind === "email" || target.kind === "email-list") &&
      target.mode === "implementation"
    ) {
      continue
    }
    if (
      target.kind === "email" &&
      target.flowType === flowType &&
      target.emailNumber === emailNumber
    ) {
      return { parentSlug: slug }
    }
    if (target.kind === "email-list" && target.flowType === flowType) {
      const sub = target.subItems.find((s) => s.emailNumber === emailNumber)
      if (sub) return { parentSlug: slug, subItemSlug: sub.slug }
    }
  }
  return null
}
