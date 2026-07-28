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
  Mail,
  DollarSign,
  FileBarChart,
  Rocket,
  Columns3,
  LayoutDashboard,
  Heart,
  Sparkles,
  ListFilter,
  Briefcase,
  HeartHandshake,
  Inbox,
  Workflow,
  BarChart3,
  UserPlus,
  Phone,
  Users2,
  Wrench,
  Coins,
  FileText,
  Megaphone,
  Cpu,
  ListChecks,
  Activity,
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
    ],
  },
  {
    key: "vendas",
    label: "Vendas",
    items: [
      { id: "comercial.pipelines", name: "Pipelines", href: ROUTES.ADMIN.COMERCIAL.PIPELINES, icon: Briefcase },
      { id: "comercial.leads", name: "Leads", href: ROUTES.ADMIN.COMERCIAL.LEADS, icon: UserPlus },
      { id: "comercial.forms", name: "Formularios", href: ROUTES.ADMIN.COMERCIAL.FORMS, icon: FileText },
    ],
  },
  {
    key: "atendimento",
    label: "Atendimento",
    items: [
      { id: "comercial.inbox", name: "Inbox", href: ROUTES.ADMIN.INBOX, icon: Inbox },
      { id: "comercial.canais", name: "Canais", href: ROUTES.ADMIN.COMERCIAL.CANAIS, icon: Phone },
      { id: "comercial.automacoes", name: "Automacoes", href: ROUTES.ADMIN.COMERCIAL.AUTOMACOES.LIST, icon: Workflow },
      { id: "comercial.meetings", name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.LIST, icon: Calendar },
    ],
  },
  {
    key: "analise",
    label: "Analise",
    items: [
      { id: "comercial.reports", name: "Reports", href: ROUTES.ADMIN.COMERCIAL.REPORTS, icon: BarChart3 },
    ],
  },
]

export const OPERACIONAL_NAV: NavGroup[] = [
  {
    key: "overview",
    label: "",
    items: [
      { id: "ops.dashboard", name: "Dashboard", href: ROUTES.ADMIN.OPERACIONAL.DASHBOARD, icon: LayoutDashboard },
    ],
  },
  {
    key: "clientes",
    label: "Clientes",
    items: [
      { id: "ops.clients", name: "Clientes", href: ROUTES.ADMIN.CLIENTS.LIST, icon: Users },
      { id: "ops.stores", name: "Lojas", href: ROUTES.ADMIN.STORES.LIST, icon: Store, requiresStoreAccess: true },
      { id: "ops.health", name: "Saude", href: ROUTES.ADMIN.HEALTH, icon: Heart },
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
      { id: "ops.campaigns.central", name: "Central de Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.CENTRAL, icon: Megaphone },
      { id: "ops.campaigns.list", name: "Campanhas", href: ROUTES.ADMIN.CAMPAIGNS.LIST, icon: Mail },
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
      { id: "geral.home", name: "Inicio", href: ROUTES.ADMIN.PRODUCTIVITY.HOME, icon: Home },
      { id: "geral.board", name: "Projetos", href: ROUTES.ADMIN.PRODUCTIVITY.BOARD, icon: Columns3 },
    ],
  },
  {
    key: "agenda",
    label: "Agenda",
    items: [
      { id: "geral.meetings", name: "Reunioes", href: ROUTES.ADMIN.MEETINGS.MINE, icon: Calendar },
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
      { id: "geral.reports", name: "Relatorios", href: ROUTES.ADMIN.REPORTS.LIST, icon: FileBarChart },
    ],
  },
  {
    key: "ferramentas",
    label: "Ferramentas",
    items: [
      // Grupo restrito a admin/dev — gate centralizado em role-access.ts.
      { id: "tools.tools", name: "Ferramentas", href: ROUTES.ADMIN.TOOLS, icon: Wrench },
      { id: "tools.currency_audit", name: "Auditoria moeda", href: ROUTES.ADMIN.TOOLS_CURRENCY_AUDIT, icon: Coins },
      { id: "tools.email_generation", name: "Geração de Emails", href: ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION, icon: Mail },
      { id: "tools.ai_usage", name: "Custo de IA", href: ROUTES.ADMIN.AI_USAGE, icon: Cpu },
      { id: "tools.email_logs", name: "Logs de geração", href: ROUTES.ADMIN.SETTINGS.EMAIL_GENERATION_LOGS, icon: ListChecks },
      { id: "tools.agent_runs", name: "Execuções ao vivo", href: ROUTES.ADMIN.AGENTS.RUNS, icon: Activity },
    ],
  },
]

export const NAV_BY_WORKSPACE: Record<WorkspaceKey, NavGroup[]> = {
  comercial: COMERCIAL_NAV,
  operacional: OPERACIONAL_NAV,
  geral: GERAL_NAV,
}
