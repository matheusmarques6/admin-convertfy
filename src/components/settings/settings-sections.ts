/**
 * settings-sections — fonte ÚNICA das seções de Configurações.
 *
 * Consumida por:
 *  - SettingsModal (modal global estilo ⌘K — nav + conteúdo por seção)
 *  - /admin/settings (hub de cards — página cheia preservada)
 *  - CommandPalette (⌘K — cada seção vira item buscável)
 *
 * `kind`:
 *  - "component": o conteúdo renderiza DENTRO do modal (componente client
 *    em settings-section-components.tsx) e também na página cheia.
 *  - "page-link": abre a página cheia (seções com gate/pré-fetch
 *    server-side — Geração de Emails e Logs usam canManagePrompts + tag
 *    dev no servidor; internalizá-las exigiria expor o gate via API).
 *
 * Metadados PUROS (sem componentes) para poder ser importado por RSC
 * (o hub) sem arrastar next/dynamic com ssr:false.
 */

import {
  User,
  Settings2,
  Users,
  Palette,
  Plug,
  Sparkles,
  Wrench,
  Wand2,
  FileText,
  Send,
  LifeBuoy,
  ListChecks,
  QrCode,
  type LucideIcon,
} from "lucide-react"

export type SettingsSectionKind = "component" | "page-link"

export interface SettingsSectionMeta {
  /** Chave estável — vai na URL (?settings=<key>) e indexa o componente. */
  key: string
  title: string
  description: string
  icon: LucideIcon
  /** Rota da página cheia (sempre existe — fallback/deep link). */
  href: string
  adminOnly?: boolean
  /**
   * Credenciais/infra GLOBAIS do deploy: exige admin/super_admin de
   * PROFILE — org owner NÃO vê (a API correspondente também nega; o
   * flag evita mostrar a seção e tomar 403 no load).
   */
  globalAdminOnly?: boolean
  kind: SettingsSectionKind
}

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    key: "account",
    title: "Conta",
    description: "Dados pessoais, empresa e senha",
    icon: User,
    href: "/admin/settings/account",
    kind: "component",
  },
  {
    key: "preferences",
    title: "Preferências",
    description: "Notificações, aparência e tema",
    icon: Settings2,
    href: "/admin/settings/preferences",
    kind: "component",
  },
  {
    key: "team",
    title: "Equipe",
    description: "Usuários, roles e permissões",
    icon: Users,
    href: "/admin/settings/team",
    adminOnly: true,
    kind: "component",
  },
  {
    key: "customize",
    title: "Personalização",
    description: "Campos custom, tags e templates de email",
    icon: Palette,
    href: "/admin/settings/customize",
    adminOnly: true,
    kind: "component",
  },
  {
    key: "integrations",
    title: "Integrações",
    description: "Shopify, Klaviyo, Asaas, Wise e outras conexões",
    icon: Plug,
    href: "/admin/settings/integrations",
    kind: "component",
  },
  {
    key: "briefings",
    title: "Briefings",
    description: "Veja o briefing completo de cada loja",
    icon: FileText,
    href: "/admin/settings/briefings",
    kind: "component",
  },
  {
    key: "tutorial-cliente",
    title: "Tutorial do cliente",
    description: "Páginas de ajuda enviadas ao cliente no onboarding (link público)",
    icon: LifeBuoy,
    href: "/admin/onboarding-help",
    kind: "page-link",
  },
  {
    key: "ai-templates",
    title: "Templates IA",
    description: "Prompts reutilizáveis com variáveis pra o assistente Claude",
    icon: Sparkles,
    href: "/admin/settings/ai-templates",
    adminOnly: true,
    kind: "component",
  },
  {
    key: "email-generation",
    title: "Geração de Emails",
    description: "Blueprints, prompts dos agentes e configurações de geração",
    icon: Wand2,
    href: "/admin/settings/email-generation",
    adminOnly: true,
    kind: "page-link",
  },
  {
    key: "email-generation-logs",
    title: "Logs de geração",
    description: "Histórico de execuções dos agentes de email",
    icon: ListChecks,
    href: "/admin/settings/email-generation-logs",
    adminOnly: true,
    kind: "page-link",
  },
  {
    key: "campaign-central",
    title: "Central de Campanhas",
    description: "Janela, thresholds e modelos dos agentes de sugestão e trends",
    icon: Sparkles,
    href: "/admin/settings/campaign-central",
    adminOnly: true,
    kind: "component",
  },
  {
    key: "implementation",
    title: "Setup de Implementação",
    description: "Gatilho, público, evento e UTM por flow (Modo Implementação)",
    icon: Send,
    href: "/admin/settings/implementation",
    adminOnly: true,
    kind: "component",
  },
  {
    key: "whatsapp-qr",
    title: "WhatsApp QR (Evolution)",
    description: "Servidor não-oficial: API key e secret do webhook",
    icon: QrCode,
    href: "/admin/settings/whatsapp-qr",
    adminOnly: true,
    globalAdminOnly: true,
    kind: "component",
  },
  {
    key: "custom-fields",
    title: "Campos customizados",
    description: "Campos extras de leads, deals e contatos (CRM)",
    icon: Settings2,
    href: "/admin/settings/custom-fields",
    adminOnly: true,
    kind: "component",
  },
  {
    key: "manutencao",
    title: "Manutenção",
    description: "Reconciliar tasks legadas e outras ações administrativas",
    icon: Wrench,
    href: "/admin/settings/manutencao",
    adminOnly: true,
    kind: "component",
  },
]

export function findSettingsSection(key: string | null): SettingsSectionMeta | null {
  if (!key) return null
  return SETTINGS_SECTIONS.find((s) => s.key === key) ?? null
}

/**
 * Gate client-side dos itens adminOnly — MESMO critério do hub server
 * (/admin/settings/page.tsx): admin/super_admin de profile OU owner/admin
 * da org. Recebe o shape do usePermissions().permissions.
 */
export function canSeeSection(
  section: SettingsSectionMeta,
  perms: { isAdmin: boolean; isOrgOwner?: boolean } | null,
): boolean {
  if (!section.adminOnly && !section.globalAdminOnly) return true
  if (!perms) return false
  // globalAdminOnly: infra do deploy — org owner não basta.
  if (section.globalAdminOnly) return perms.isAdmin
  return perms.isAdmin || perms.isOrgOwner === true
}
