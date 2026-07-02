# Design System — Convertfy

> Parte da [arquitetura do sistema](./system-overview.md). Fontes da verdade no código: `src/styles/crm-tokens.css` (tokens `--crm-*`), `src/app/globals.css` (variáveis raiz + dark), `tailwind.config.ts`, `src/components/ui/` (61 componentes). Preview interativo: `docs/design-system-preview.html`.

> ⚠️ **Nota**: o CLAUDE.md ainda menciona "brand preto #1F1F1F" — está **desatualizado**. Desde o Convertfy DS Pipeline V2 (commit `3c101fb9`), o brand é **azul `#4E62D8`** com gradiente. A regra vigente é a de `crm-tokens.css`.

## Tokens

### Cores

| Grupo | Light | Dark | Uso |
|---|---|---|---|
| **Brand** | `#4E62D8` (hover `#2137B6`, dark `#041366`) | `#7B8CEA` (hover `#6A7CE0`) | Botões primários, links, focus ring |
| Brand gradient | `linear-gradient(90deg, #4E62D8, #2137B6, #041366)` | versão clareada | CTAs, hero |
| **Cinzas** (≈80% da UI) | gray-0 `#FFFFFF` → gray-900 `#111827` (50 `#F8FAFC` bg, 200 `#E5E7EB` borders, 500 `#6B7280` texto 2º, 700 `#374151` texto) | gray-0 `#18181B` → gray-900 `#FAFAFA` | Superfícies, borders, texto |
| **Semânticas** | positive `#ECFDF5/#065F46`, negative `#FEF2F2/#991B1B`, warning `#FFFBEB/#92400E`, info `#EEF0FB/#2137B6`, neutral `#F3F4F6/#374151` | backgrounds em rgba escuro | Somente status |
| **Canais** | email `#4E62D8`, sms `#065F46`, push `#7C3AED`, whatsapp `#146B3A` | — | Badges de canal |
| **Borders** | `rgba(0,0,0,0.08)` (hover 0.12) | `rgba(255,255,255,0.08)` (hover 0.16) | Cards, inputs |

### Tipografia

- **Sans**: Inter Variable (local via `@fontsource-variable/inter`), fallback Geist/system-ui. **Mono**: Geist Mono.
- Base do CRM é **13px** (densidade alta). Escala: 26px/600 (H1/KPI hero), 20px/600 (H2), 16px/500 (H3), 14px/500 (labels), 13px/400 (body), 12px (secundário/células), 11px/600 (badges).
- Números de dados: **32px/600** para KPIs.
- **Tabular numerals obrigatórios** em todo número: `font-feature-settings: "tnum" 1, "lnum" 1` aplicado em `[data-numeric]`, `time`, `code`, `.metric`, `.kpi-value`, `.table-cell`, `.crm-tnum`.

### Radius, sombras, espaçamento

| Token | Valor |
|---|---|
| radius | sm 6px (badges) · md 8px (cards/buttons/inputs — padrão) · lg 12px (drawers/modais) · full (avatars). CRM histórico usa 4-6px |
| sombras | Mínimas — **borders fazem a elevação**. shadow-xs `0 1px 0 rgba(0,0,0,0.04)` até shadow-lg suave; especiais: shadow-drawer, shadow-modal |
| espaçamento | escala de 4px: 4, 8, 12 (padding de card CRM), 16, 20, 24, 32, 40, 48, 64 |

### Dimensões fixas (densidade do CRM)

| Token | Valor |
|---|---|
| Card kanban / coluna | 280px / 296px |
| Sidebar | 220px (44px colapsada); pipeline-sidebar 280px |
| Topbar | 44px |
| Linha de tabela / header | **36px** / 32px |
| Input / botão | 32px (sm 28px, lg 36px) |
| Drawer / painel de filtros | 520px / 360px (mobile: 100vw) |

### Motion

- Timing padrão: `cubic-bezier(0.16, 1, 0.3, 1)` — fast 150ms (hover/focus), normal 220ms (drawer/modal), slow 300ms (sidebar). **Sem bounce.**
- Keyframes: `cf-advance` (pulse verde 1.2s ao avançar deal), `cf-assign` (ring azul 1.5s), `cf-statusin` (fade 220ms), `cf-toast` (slide-up 240ms), `cf-pulse-dot` (2s infinito).

### Breakpoints

sm 490px · md 768px · lg 1040px · xl 1440px (inspirados no Shopify Polaris). Container max 1400px.

## Regras não-negociáveis

1. **Brand azul `#4E62D8`** com gradiente — nunca preto/roxo avulso.
2. **Cinzas dominam ~80% da UI**; cores semânticas só para status.
3. **Sem sombras grandes** — elevação por border 1px + hover de border-color/superfície.
4. **Densidade alta**: linhas 36px, corpo 13px, cards kanban 280px.
5. **Radius contido**: 4-6px no CRM, 6/8/12 nas áreas novas — nunca radius grandes.
6. **Tabular numerals em todo número.**
7. **Focus ring** `0 0 0 2px var(--crm-brand)` (dark usa `#7B8CEA` para WCAG AA); sem `outline` default.
8. **Toda cor via CSS variable** (`var(--crm-*)` no CRM) — nunca hex hardcoded em componente; dark mode automático via `.dark`/`[data-theme="dark"]`.
9. **Touch targets** ≥44px no mobile; drawers viram 100vw.
10. **Acessibilidade WCAG AA** (contraste ≥4.5:1 texto, ≥3:1 gráficos).

## Temas (light/dark)

- `next-themes` com `attribute="class"`, default **light**, `enableSystem`.
- Mapeamento completo de tokens no `.dark` (cinzas invertidos, brand clareado para `#7B8CEA`, borders em rgba branco, semânticas com backgrounds translúcidos).

## Componentes

### `src/components/ui/` (61)

- **Primitivos shadcn/Radix**: accordion, alert(-dialog), avatar, badge, breadcrumbs, button, calendar, card, checkbox, collapsible, command(-palette), dialog, drawer, dropdown-menu, form-field, input, label, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, switch, table, tabs, textarea, toast(er), tooltip…
- **Customizados Convertfy**: `kpi-card(-row)`, `data-table` (sorting/filtering/paginação), `date-range-picker`, `period-picker`, `filter-bar`/`filter-select`, `channel-badge`, `status-badge`/`status-tabs`/`sync-status-badge`, `segmented-tabs`/`underline-tabs`, `currency-input`, `cpf-cnpj-input`, `phone-input`, `save-bar` (sticky), `rate-limit-banner`, `data-status-banner`, `empty-state`/`error-state`/`page-skeleton`, `glow-card`, `ambient-background`, `welcome-tour`, `time-ago`, `count-badge`, `refresh-button`.
- Padrão: `cva()` (class-variance-authority) para variants + `tailwind-merge`/`clsx`; cores sempre via CSS variables.

### Componentes de domínio (`src/components/*`)

crm, cs-crm, pipeline, board (kanban dnd), campaigns + campaign-central(+settings), email-generation(+logs), email-blueprints/outlines/components, onboarding(+v2), dashboard, financial, reports, clients, stores, tasks, meetings, calendar, forms, automations (ReactFlow), ai/ai-usage/agents, portal, client-layout, layout, settings, team, productivity, ritual, operational, shared, providers.

## Bibliotecas de UI

| Lib | Uso |
|---|---|
| Radix UI (via shadcn/ui) | primitivos acessíveis |
| lucide-react | ícones SVG, `currentColor`, stroke 2 |
| recharts | gráficos de dashboards/reports |
| reactflow | builder visual de automações (DAG) |
| @hello-pangea/dnd | drag-and-drop de kanbans |
| cmdk | command palette (Cmd+K) |
| vaul | drawers mobile |
| framer-motion | microinterações |
| react-day-picker | base do calendar/date-range |

## Áreas visuais

| Área | Identidade |
|---|---|
| **Admin** (`/admin`) | Brand azul, densidade alta, sidebar colapsável 220→44px, light default + dark completo |
| **Portal do cliente** (`/client`) | **White-label** — logo/cores/nome por organização via `/api/portal/branding`; densidade média |
| **Formulários públicos** (`/form/[token]`, `/forms/[slug]`) | Standalone, mobile-first, branding da loja |
| **Widget de tracking** | Embutido via iframe/script no site do cliente; cores configuráveis pelo cliente (`widget_config`) |
