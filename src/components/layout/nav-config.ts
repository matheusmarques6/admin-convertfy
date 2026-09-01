/**
 * nav-config — fonte ÚNICA da navegação por workspace.
 *
 * Consumida pela Sidebar (menu lateral, com gate de permissão por item)
 * e pela CommandPalette (⌘K — busca de páginas). Antes a paleta tinha
 * uma lista própria hardcoded que dessincronizou da sidebar (o workspace
 * Geral inteiro não aparecia na busca); derivar daqui elimina o drift:
 * item novo na sidebar = item buscável no ⌘K, automaticamente.
 */

import {
  Home,
  ImagePlus,
  Users,
  Store,
  Calendar,
  DollarSign,
  FileBarChart,
  Rocket,
  Columns3,
  LayoutDashboard,
  Heart,
  Sparkles,
  ListFilter,
  Filter,
  Briefcase,
  HeartHandshake,
  Inbox,
  Workflow,
  BarChart3,
  UserPlus,
  Phone,
  Users2,
  FileText,
  Megaphone,
  Package,
  CalendarDays,
  Instagram,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { NavItemId } from "@/lib/permissions/role-access"
import type { WorkspaceKey } from "@/hooks/use-workspace"
import { ROUTES } from "@/lib/routes"

export interface NavItem {
  id: NavItemId
  name: string
  href: string
  icon: LucideIcon
  group?: string
  requiresStoreAccess?: boolean
  badge?: string
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// ─────────────────────────────────────────────────────────────────────
// Estrutura padrao de cada workspace (consistencia visual):
//
//   1. Visao geral   — Dashboard, métricas top
//   2. Operacoes     — fluxos principais do workspace
//   3. Relacionados  — coisas auxiliares (agenda, inbox, etc)
//   4. Analise       — reports, BI
//
// Os 3 workspaces seguem essa hierarquia. Item "Dashboard" sempre
// primeiro, "Reports" sempre ultimo.
// ─────────────────────────────────────────────────────────────────────

export const COMERCIAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "comercial.dashboard", name: "Dashboard", href: ROUTES.ADMIN.COMERCIAL.DASHBOARD, icon: LayoutDashboard },
      { id: "comercial.ia", name: "Assistente IA", href: ROUTES.ADMIN.COMERCIAL.IA, icon: Sparkles },
    ],
  },
  {
    key: "vendas",
    label: "Vendas",
    items: [
      { id: "comercial.pipelines", name: "Pipelines", href: ROUTES.ADMIN.COMERCIAL.PIPELINES, icon: Briefcase },
      { id: "comercial.leads", name: "Leads", href: ROUTES.ADMIN.COMERCIAL.LEADS, icon: UserPlus },
      { id: "comercial.produtos", name: "Produtos", href: ROUTES.ADMIN.COMERCIAL.PRODUTOS, icon: Package },
      { id: "comercial.forms", name: "Formulários", href: ROUTES.ADMIN.COMERCIAL.FORMS, icon: FileText },
    ],
  },
  {
    key: "atendimento",
    label: "Atendimento",
    items: [
      { id: "comercial.inbox", name: "Inbox", href: ROUTES.ADMIN.INBOX, icon: Inbox },
      { id: "comercial.canais", name: "Canais", href: ROUTES.ADMIN.COMERCIAL.CANAIS, icon: Phone },
      { id: "comercial.instagram", name: "Instagram", href: ROUTES.ADMIN.COMERCIAL.INSTAGRAM, icon: Instagram },
      { id: "comercial.automacoes", name: "Automações", href: ROUTES.ADMIN.COMERCIAL.AUTOMACOES.LIST, icon: Workflow },
      { id: "comercial.meetings", name: "Reuniões", href: ROUTES.ADMIN.MEETINGS.LIST, icon: Calendar },
      { id: "comercial.agenda", name: "Agenda", href: ROUTES.ADMIN.COMERCIAL.AGENDA, icon: CalendarDays },
    ],
  },
  {
    key: "analise",
    label: "Analise",
    items: [
      { id: "comercial.funil", name: "Funil", href: ROUTES.ADMIN.COMERCIAL.FUNIL, icon: Filter },
      { id: "comercial.reports", name: "Reports", href: ROUTES.ADMIN.COMERCIAL.REPORTS, icon: BarChart3 },
      // (Onda 1: nomes com acentuação correta — a UI mostra pt-BR real.)
    ],
  },
]

export const OPERACIONAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "ops.dashboard", name: "Dashboard", href: ROUTES.ADMIN.OPERACIONAL.DASHBOARD, icon: LayoutDashboard },
      { id: "ops.ia", name: "Assistente IA", href: ROUTES.ADMIN.OPERACIONAL.IA, icon: Sparkles },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    items: [
      { id: "ops.clients", name: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST, icon: Users },
      { id: "ops.stores", name: "Lojas", href: ROUTES.ADMIN.STORES.LIST, icon: Store, requiresStoreAccess: true },
      { id: "ops.health", name: "Saúde", href: ROUTES.ADMIN.HEALTH, icon: Heart },
    ],
  },
  {
    key: "customer-success",
    label: "Customer Success",
    items: [
      // Página única com sub-abas: Painel + Formulários + Cadências
      // (jul/2026 — antes eram 3 itens; as rotas antigas redirecionam
      // pras abas). "Configurar pipelines" saiu da nav: a página segue
      // existindo, acessível pelos botões "Configurar" do próprio hub.
      { id: "ops.cs.painel", name: "Customer Success", href: ROUTES.ADMIN.OPERACIONAL.CS.PAINEL, icon: HeartHandshake },
      { id: "ops.cs.ritual", name: "Ritual de Sexta", href: ROUTES.ADMIN.OPERACIONAL.CS.RITUAL, icon: Sparkles },
    ],
  },
  {
    key: "onboarding",
    label: "Onboarding",
    items: [
      { id: "ops.onboarding", name: "Onboarding", href: ROUTES.ADMIN.ONBOARDING_V2.LIST, icon: Rocket },
      // "Tutorial cliente" saiu da nav (jul/2026): vive como card em
      // /admin/settings (a página /admin/onboarding-help não mudou).
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    items: [
      // Campanhas 2→1 (Onda 1, ago/2026): "Central de Campanhas" + a lista
      // viraram UM item — o hub abre na Central; a rota /admin/campaigns
      // segue viva (acessível por link direto), só saiu da nav.
      { id: "ops.campaigns.central", name: "Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.CENTRAL, icon: Megaphone },
      { id: "ops.image_studio", name: "Geração de Imagens", href: ROUTES.ADMIN.IMAGE_STUDIO, icon: ImagePlus },
      { id: "ops.insights", name: "Insights IA", href: ROUTES.ADMIN.INSIGHTS, icon: Sparkles },
      { id: "ops.list_hygiene", name: "Limpeza", href: ROUTES.ADMIN.LIST_HYGIENE, icon: ListFilter },
    ],
  },
  // Grupo "Analise" saiu (jul/2026): Reports de CS virou a aba
  // "Tendências" do Monitor de Saúde (/admin/health?tab=tendencias).
]

export const GERAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "geral.home", name: "Início", href: ROUTES.ADMIN.PRODUCTIVITY.HOME, icon: Home },
      { id: "geral.board", name: "Projetos", href: ROUTES.ADMIN.PRODUCTIVITY.BOARD, icon: Columns3 },
    ],
  },
  {
    key: "agenda",
    label: "Agenda",
    items: [
      // Nome próprio pra rota compartilhada (Onda 1): "Reuniões" no
      // Comercial = todas; aqui = só as minhas (?scope=mine).
      { id: "geral.meetings", name: "Minhas reuniões", href: ROUTES.ADMIN.MEETINGS.MINE, icon: Calendar },
    ],
  },
  {
    key: "time",
    label: "Time",
    items: [
      { id: "geral.team", name: "Equipe", href: ROUTES.ADMIN.TEAM, icon: Users2 },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    items: [
      { id: "geral.financial", name: "Financeiro", href: ROUTES.ADMIN.FINANCIAL, icon: DollarSign },
      { id: "geral.reports", name: "Relatórios", href: ROUTES.ADMIN.REPORTS.LIST, icon: FileBarChart },
    ],
  },
  // Grupo "Ferramentas" saiu do Geral (Onda 1, ago/2026): os 5 itens
  // técnicos (só admin/dev) viraram cards da seção "Ferramentas" em
  // Configurações (settings-sections.ts). As rotas seguem vivas e agora
  // são NEUTRAS no use-workspace (visitar não troca o workspace).
]

export const NAV_BY_WORKSPACE: Record<WorkspaceKey, NavGroup[]> = {
  comercial: COMERCIAL_NAV,
  operacional: OPERACIONAL_NAV,
  geral: GERAL_NAV,
}

// ─────────────────────────────────────────────────────────────────────
// Gate de permissão — helpers PUROS compartilhados por Sidebar, switcher
// de workspaces, ⌘K e atalhos de teclado (⌥1-3). Antes cada consumidor
// refazia (ou PULAVA) o filtro: o ⌘K listava páginas que a sidebar
// escondia. Uma régua só elimina o drift.
// ─────────────────────────────────────────────────────────────────────

export interface NavPermissionCtx {
  canAccess: (id: NavItemId) => boolean
  isAdmin: boolean
  roles: string[]
  storeAccessCount: number
}

export function navItemAllowed(item: NavItem, ctx: NavPermissionCtx): boolean {
  if (!ctx.canAccess(item.id)) return false
  if (item.requiresStoreAccess && !ctx.isAdmin && !ctx.roles.includes("dev")) {
    return ctx.storeAccessCount > 0
  }
  return true
}

export function filterNavGroups(groups: NavGroup[], ctx: NavPermissionCtx): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((i) => navItemAllowed(i, ctx)) }))
    .filter((group) => group.items.length > 0)
}

/** Workspace visível no switcher = tem ao menos 1 item permitido. */
export function workspaceAllowed(ws: WorkspaceKey, ctx: NavPermissionCtx): boolean {
  return filterNavGroups(NAV_BY_WORKSPACE[ws], ctx).length > 0
}

/** Destino ao trocar de workspace: o 1º item permitido (a home pode ser vetada). */
export function firstAllowedItem(ws: WorkspaceKey, ctx: NavPermissionCtx): NavItem | null {
  const groups = filterNavGroups(NAV_BY_WORKSPACE[ws], ctx)
  return groups.length > 0 ? groups[0].items[0] : null
}
