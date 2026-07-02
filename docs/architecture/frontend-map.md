# Mapa do Frontend — Páginas, Áreas e Navegação

> Parte da [arquitetura do sistema](./system-overview.md). ~160 páginas em `src/app/` (fora `api/`).

## Áreas

| Área | Caminho | Público | Auth | Layout |
|---|---|---|---|---|
| Autenticação | `(auth)/` | equipe interna | pública | centrado, sem chrome |
| **Admin (backoffice)** | `admin/` | equipe interna | sessão Supabase + RBAC | Sidebar com **workspace switcher** + MobileTopBar |
| **Portal do cliente** | `client/(portal)/` | clientes | portal auth (sessão separada) | `PortalShell` + ClientSidebar (white-label) |
| Formulários públicos | `public/`, `forms/[slug]`, `form/[token]` | leads/clientes | pública / token | standalone mobile-first |
| Rastreio | `track/`, `tracking/embed` | consumidor final | pública | widget embeddable (iframe liberado no middleware) |

Redirects legacy: `/dashboard → /admin/dashboard`, `/portal/* → /client/*`.

## Admin — 3 workspaces (sidebar `src/components/layout/sidebar.tsx`)

Gates por role centralizados em `src/lib/permissions/role-access.ts` — cada item de nav tem id estável (ex.: `comercial.dashboard`, `ops.clients`) checado por `canAccess(id, roles)`.

### COMERCIAL (sales, sales_manager, admin, dev)
- **Overview**: `/admin/comercial/dashboard`
- **Vendas**: Pipelines (`/admin/comercial/pipelines` — kanban de deals), Leads, Formulários
- **Atendimento**: Inbox (`/admin/inbox` — WhatsApp/Instagram unificado), Reuniões
- **Análise**: Reports

### OPERACIONAL (cs, ops_manager, marketing, admin, dev)
- **Overview**: `/admin/operacional/dashboard`
- **Clientes**: Clientes, Lojas (`/admin/stores` — detalhe com emails/produção/relatórios), Saúde (`/admin/health`)
- **Customer Success**: Formulários CS, Pipelines CS, Ritual de Sexta, Cadências
- **Onboarding**: `/admin/onboarding` + Tutorial do Cliente
- **Marketing**: Central de Campanhas (`/admin/campaigns/central`), Campanhas, Insights IA, Limpeza de lista
- **Atendimento**: Inbox, Canais, Automações (`/admin/operacional/automacoes` — builder ReactFlow)
- **Análise**: Reports

### GERAL (todos, com filtros)
- **Overview**: Início (produtividade), Minhas Tarefas, Projetos (kanban)
- **Agenda**: Reuniões · **Time**: gestão de equipe · **Financeiro**: financeiro + relatórios
- **Ferramentas** (admin/dev): Tools, Auditoria de Moeda, Geração de Emails (config de agentes), Custo de IA (`/admin/ai-usage`), Logs de Geração

### Settings (`/admin/settings/*`)
account, profile, permissions (admin), team, company, integrations, **email-generation** (tab agents = configs dos agentes IA), appearance, notifications + ~10 tabs específicas. Prompts versionados em `/admin/agents/prompts` (admin/owner ou tag `dev`, acesso por URL direta para devs).

## Portal do cliente (`/client/*`)

Navegação simples (ClientSidebar): Dashboard, Analytics, Minhas Lojas (+new/+detail), Campanhas (read-only), Flows, Faturas, Integrações (chaves Shopify/Klaviyo), Rastreamento (widget/config/pedidos), Configurações. Onboarding wizard condicional (`/client/onboarding/wizard`). Login próprio (`/client/login`) + troca de senha obrigatória no 1º acesso. Branding white-label via `/api/portal/branding`.

## Formulários e páginas públicas

- `/form/[token]` — wizard de onboarding do cliente (briefing, uploads, confirmação) — token-gated.
- `/forms/[slug]` — formulários públicos do CRM (lead capture com UTM).
- `/onboarding-help/[token]` — tutoriais renderizados com variáveis do cliente.
- `/track/[code]`, `/tracking/embed` — página/embed de rastreio de pedido.

## Padrões de frontend

| Aspecto | Padrão |
|---|---|
| Server vs Client | Layouts e páginas-raiz são Server Components (permissões + redirects + fetch Supabase direto); interatividade em Client Components (~metade das páginas) |
| Data fetching no cliente | **SWR** nas áreas CRM/Campaign Central (hooks `use-board`, `use-campaign-central`, páginas comercial/*); `fetch` manual + `useState` nas áreas mais antigas |
| Forms | react-hook-form + Zod (`@hookform/resolvers`) — ubíquo |
| Estado global | Context (workspace, sidebar) + **Zustand pontual** (`ai-chat-store`, `use-sidebar`, `productivity-store`, `lib/store`) |
| Rotas | constantes em `src/lib/routes.ts` |
| Tabelas | `data-table` própria (sorting/filter/paginação) + `@tanstack/react-virtual` p/ listas grandes |
| Tema | next-themes (light default, dark completo) |

## UX global

- **Cmd+K** — command palette (`src/components/ui/command-palette.tsx`): busca global de páginas/clientes/lojas.
- **Atalhos g+letra** (`CrmKeyboardShortcuts`, escopo `/admin`): g+d dashboard, g+p pipelines, g+l leads, g+r reports, g+o operacional, g+c pipelines CS, g+s saúde, g+a automações, g+i inbox.
- **Toasts** — Radix toast via `useToast()`.
- **AI Chat drawer** — assistente interno disponível no layout do admin (`/api/ai/chat`, streaming).
- **SSE** — status de geração de emails em tempo real nas telas de produção.

## Arquivos-chave

| Arquivo | Papel |
|---|---|
| `src/app/admin/layout.tsx` | Shell do admin (Sidebar, Header, CommandPalette, shortcuts, AiChatDrawer, Toaster) |
| `src/app/client/(portal)/layout.tsx` | Shell do portal (`PortalShell`) |
| `src/components/layout/sidebar.tsx` | Nav dos 3 workspaces |
| `src/components/client-layout/client-sidebar.tsx` | Nav do portal |
| `src/lib/permissions/role-access.ts` | Gates por role/feature |
| `src/hooks/use-workspace.ts` / `use-sidebar.ts` | Workspace ativo / estado da sidebar |
