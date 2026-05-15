# Convertfy — Guia de Design completo

Este guia consolida **tudo** que é preciso para construir telas fiéis ao design da
aplicação. Foi derivado do código real em produção (`tailwind.config.ts`,
`src/app/globals.css`, `src/styles/*.css`, `src/components/ui/*`,
`src/components/layout/*`) e dos documentos `docs/crm/design-system.md`,
`docs/ANALISE-UI-UX-PORTAL-ADMIN.md` e `docs/design-system-preview.html`.

> Lê isto **antes** de criar qualquer nova tela. Se algum requisito visual
> contradisser este guia, o guia vence — abre uma issue para alinhar.

---

## 1. Visão geral — Dois sistemas, um aplicativo

A aplicação roda **dois Design Systems coexistentes**, cada um com escopo
estrito. Nunca misture tokens entre eles dentro de um mesmo componente.

| Sistema | Escopo | Brand | Densidade | Radii | Sombras |
|---|---|---|---|---|---|
| **DS v3.0 (Convertfy)** | `/admin/dashboard/**`, `/admin/stores/**`, `/admin/reports/**`, `/admin/campaigns/**`, `/admin/financial/**`, portal cliente, formulários públicos | Azul `#4E62D8 → #2137B6 → #041366` | Média (botão 36px, input 36px) | 6 / 8 / 12 / pill | `sm/md/lg`, alpha máx 0.06 |
| **CRM tokens** | `/admin/crm/**` (leads, pipelines, deals, inbox, automações, reports CRM) | **PRETO** `#1F1F1F` (nunca azul, nunca roxo) | Alta (botão 32px, input 32px, row 36px) | 3 / 4 / 6 / pill | xs/sm/md, quase invisíveis |
| **Sidebar (global)** | Sidebar `<aside>` em todo `/admin/**` | Surface `bg-black` com borda colorida do workspace | n/a | 6px | nenhuma (border-only) |

Como decidir:

- Está em rota `/admin/crm/**`? Use **CRM tokens** (`var(--crm-*)`, classes `crm-*`).
- Outra rota dentro do admin? Use **DS v3.0** (`var(--brand-*)`, `var(--gray-*)`,
  classes Tailwind padrão + `cf-*`).
- A **sidebar** é sempre preta (dark forçado), independente do workspace.

---

## 2. Tokens (DS v3.0 — admin geral)

Fonte de verdade: `src/app/globals.css` (`:root`) + `tailwind.config.ts`.

### 2.1 Cores — Brand (azul)

| Token CSS | Hex | Uso |
|---|---|---|
| `--brand-50` | `#EEF0FB` | Pill `info-bg`, hover sutil de link |
| `--brand-100` | `#C7CDEF` | Border `info` |
| `--brand-200` | `#A8B2EE` | (raro) |
| `--brand-300` | `#7B8DE5` | Dark mode brand text |
| `--brand-400` / `--brand-DEFAULT` | `#4E62D8` | **CTA primário, focus ring, link, ativo** |
| `--brand-500` | `#2137B6` | Hover do primary, gradient meio, text info |
| `--brand-600` | `#1A2D96` | Active mais escuro |
| `--brand-700` | `#0E1F73` | |
| `--brand-800` | `#041366` | Pressed do primary, gradient fim |
| `--brand-gradient` | `linear-gradient(90deg, #4E62D8, #2137B6, #041366)` | **Máximo 1 por página** (hero KPI ou CTA único) |

### 2.2 Cores — Cinzas (texto, borders, surfaces)

| Token | Hex | Uso típico |
|---|---|---|
| `--gray-white` | `#FFFFFF` | Card bg, page bg |
| `--gray-25` | `#FCFCFD` | Page bg alternativo |
| `--gray-50` | `#F8FAFC` | Muted bg, hover ghost |
| `--gray-100` | `#F3F4F6` | Secondary bg, pill neutral bg |
| `--gray-200` | `#E5E7EB` | Border default, divider |
| `--gray-300` | `#D1D5DB` | Border input |
| `--gray-400` | `#9CA3AF` | Placeholder, icon disabled |
| `--gray-500` | `#6B7280` | Texto muted, label secundária |
| `--gray-600` | `#4B5563` | Texto secundário |
| `--gray-700` | `#374151` | Body text em botão secondary |
| `--gray-800` | `#1F2937` | Headlines em dark surfaces |
| `--gray-900` | `#111827` | **Foreground default (texto principal)** |

Border padrão da app: `rgba(0,0,0,0.08)` (em vez de `gray-200` puro) — gera
contraste mais suave. Hover: `rgba(0,0,0,0.12)`.

### 2.3 Cores — Semânticas (sempre em **triplet** bg + text + border)

Regra obrigatória: nunca use só um dos três; sempre o conjunto inteiro.

| Estado | bg | text | border | Quando usar |
|---|---|---|---|---|
| **positive** | `#ECFDF5` | `#065F46` | `#A7F3D0` | Sucesso, crescimento, status ok, delta `>0` |
| **negative** | `#FEF2F2` | `#991B1B` | `#FECACA` | Erro, queda, status falho, delta `<0` |
| **warning** | `#FFFBEB` | `#92400E` | `#FDE68A` | Aviso, atenção, status pendente |
| **neutral** | `#F3F4F6` | `#374151` | `#E5E7EB` | Estado neutro, default, "—" |
| **info** | `#EEF0FB` | `#2137B6` | `#C7CDEF` | Informação, hint, brand-acento sutil |

> Tailwind: `bg-positive-bg text-positive-text border-positive-border` (e equivalentes).

### 2.4 Cores — Channel (campanhas / automações)

| Canal | Token | Uso |
|---|---|---|
| Email | `--channel-email` `#4E62D8` | Igual ao brand-400 |
| SMS | `--channel-sms` `#065F46` | Verde escuro |
| Push | `--channel-push` `#7C3AED` / bg `#F3E8FF` | Roxo, **só** pra canal push |
| WhatsApp | `--channel-whatsapp` `#146B3A` / bg `#E6F9EC` | Verde WhatsApp |

### 2.5 Cores — Accent solids (CTAs de banner)

- `--accent-amber` `#D97706` — alertas premium, urgência leve.
- `--accent-red` `#DC2626` — erros bloqueantes, ação destrutiva irreversível.

Use **sólido** (não como bg + text) apenas em banner/CTA destacado. Nunca como text padrão.

### 2.6 Tipografia

Família única: **Inter** (`var(--font-inter)`); fallback `-apple-system,
BlinkMacSystemFont, sans-serif`. Dados/código: **Geist Mono**
(`var(--font-geist-mono)`).

Numerals **sempre** `tabular-nums lining-nums` (KPI, tabela, gráfico, badges
numéricos). Aplicado via classe `.tabular-nums` ou utilitário `.font-data`.

Escala tipográfica oficial (`tailwind.config.ts > fontSize`):

| Token | Tamanho | Line-height | Peso | Letter-spacing | Uso |
|---|---|---|---|---|---|
| `text-2xs` | 11px (0.6875rem) | 1rem | — | — | Microcopy, footnote |
| `text-xs` | 12px | 1rem | — | — | Hint, helper text |
| `text-sm` | 14px | 1.25rem | — | — | **Body default**, label form |
| `text-base` | 16px | 1.5rem | — | — | Card title secundário, body grande |
| `text-lg` | 18px | 1.75rem | — | — | Section heading médio |
| `text-xl` | 20px | 1.75rem | — | — | Section heading grande |
| `text-page-title` | 22px | 1.3 | 600 | -0.02em | **Título de página** (h1) |
| `text-kpi` | 32px | 1.1 | 600 | -0.03em | Valor numérico de KPI hero |
| `text-kpi-label` | 13px | 1.4 | 500 | — | Label de KPI ("Receita Total") |
| `text-delta` | 13px | 1.4 | 500 | — | Variação +12.4% |
| `text-badge` | 11px | 1.2 | 600 | 0.02em | Texto de pill/badge |
| `text-table-header` | 12px | 1.4 | 600 | 0.04em | TH de tabela (uppercase opcional) |
| `text-sidebar-label` | 10px | 1.4 | 500 | 0.06em uppercase | Group label da sidebar |

### 2.7 Border radius (somente **4 tokens**)

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` | 6px | **Botão, input, badge, pill, dropdown item** |
| `rounded-md` | 8px | **Card, modal, drawer, popover** |
| `rounded-lg` / `xl` / `2xl` | 12px | Container destacado (hero, banner grande) |
| `rounded-pill` / `rounded-full` | 9999px | Avatar, dot, counter circular |

> ⚠️ **Nunca** use 4px (parece bug) nem 16px+ (parece app de festa). Use 6/8/12/pill, ponto.

### 2.8 Shadows (3 níveis, alpha máx 0.06)

| Token | Valor | Uso |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.05)` | Botão hover suave |
| `shadow-md` | `0 2px 4px rgba(0,0,0,0.03), 0 4px 6px rgba(0,0,0,0.05)` | Dropdown, tooltip |
| `shadow-lg` | `0 1px 2px rgba(0,0,0,0.03), 0 4px 8px rgba(0,0,0,0.04), 0 12px 24px rgba(0,0,0,0.06)` | Modal, drawer, command palette |
| `shadow-ring-brand` | `0 0 0 2px #4E62D8` | Focus ring (WCAG 2.4.7) |

**Filosofia:** _borders fazem o trabalho primário, shadows só pra elevation
off-page_. Cards são `border + bg`, **não** `shadow`. Sombras grandes só em
overlays (modal/drawer/popover).

### 2.9 Spacing (grid 8px, tokens explícitos)

`tailwind.config.ts > spacing` mantém estes valores fixos:

| Token | px |
|---|---|
| `0.5` | 2 |
| `1` | 4 |
| `2` | 8 |
| `3` | 12 |
| `4` | 16 |
| `6` | 24 |
| `8` | 32 |
| `12` | 48 |
| `16` | 64 |

**Use só estes.** `p-5`, `gap-7`, `mt-9` etc. não existem aqui. Padding interno
de card padrão = 24px (`p-6`); padding de página = 24px desktop, 16px mobile.

### 2.10 Touch targets

- Min mobile: **44×44px** (`min-h-touch min-w-touch`)
- Confortável: **48×48px** (`min-h-touch-comfortable`)

Auto aplicado via `cf-touch` em `<=768px`. Botões `size="md"` (h-9 = 36px) **não
atendem** em mobile puro — quando o componente vai para mobile, use `size="lg"`
(h-11 = 44px) ou wrap em container 44px.

### 2.11 Transitions

- Padrão: `150ms cubic-bezier(0.16, 1, 0.3, 1)` (= `transition-ds` ou `duration-fast ease-out-expo`)
- Animações maiores: 220–300ms com a mesma curva
- Properties: `colors`, `border-color`, `box-shadow`, `opacity`, `transform` — **nunca** `all` em produção

Keyframes prontos: `fade-in`, `slide-in-from-left`, `slide-in-from-right`,
`accordion-down/up`, `shimmer`. CRM tem `cf-anim-advance` (pulse verde no
avanço de card), `cf-anim-assign` (ring brand-blue no avatar), `cf-anim-toast`.

### 2.12 Breakpoints

Mobile-first, alinhado a Shopify Polaris:

```
sm: 490px   md: 768px   lg: 1040px   xl: 1440px
```

Padrão de layout:

- `< 490px`: 1 coluna, stack vertical, KPIs em scroll horizontal.
- `490-767px`: 2 colunas em grids de KPI.
- `768-1039px`: tabela ainda em modo card; sidebar colapsada por default.
- `≥ 1040px`: layout completo, sidebar expandida.

---

## 3. Tokens CRM (escopo `/admin/crm/**`)

Fonte: `src/styles/crm-tokens.css`. Prefixo `--crm-*`. **Não** misture com DS v3.0.

### 3.1 Brand

- `--crm-brand`: `#1F1F1F` — **preto**, não azul, não roxo. Botão primary, header de tabela ativa.
- `--crm-brand-hover`: `#2A2A2A`.
- `--crm-accent`: `#2563EB` — só pra link/focus ring.

### 3.2 Cinzas (80% da UI no CRM)

| Token | Hex |
|---|---|
| `--crm-gray-0` | `#FFFFFF` |
| `--crm-gray-50` | `#FAFAFA` |
| `--crm-gray-100` | `#F4F4F5` |
| `--crm-gray-200` | `#E4E4E7` |
| `--crm-gray-300` | `#D4D4D8` |
| `--crm-gray-400` | `#A1A1AA` |
| `--crm-gray-500` | `#71717A` |
| `--crm-gray-600` | `#52525B` |
| `--crm-gray-700` | `#3F3F46` |
| `--crm-gray-800` | `#27272A` |
| `--crm-gray-900` | `#18181B` |
| `--crm-gray-950` | `#09090B` |

### 3.3 Tipografia CRM

- Família: `"Geist", "Inter", "Söhne", "Helvetica Neue", sans-serif`
- Escala:
  - `--crm-text-xs` 11px / `sm` 12px / **`base` 13px** (body default) / `md` 14px / `lg` 16px / `xl` 20px / `2xl` 26px / `3xl` 32px
- Pesos: `regular` 400 e `medium` 530 — **só esses dois**. Não use 600/700.

### 3.4 Dimensões fixas CRM

| Token | px | Uso |
|---|---|---|
| `--crm-card-kanban-width` | 280 | Card de deal no kanban |
| `--crm-column-kanban-width` | 296 | Coluna do kanban |
| `--crm-sidebar-width` | 216 | Sidebar CRM (subnav interno) |
| `--crm-sidebar-collapsed` | 56 | Sidebar colapsada |
| `--crm-topbar-height` | 44 | Topbar dentro do CRM |
| `--crm-table-row-height` | 36 | **Row** de tabela |
| `--crm-table-header-height` | 32 | TH |
| `--crm-input-height` | 32 | Input |
| `--crm-button-height` | 32 | Botão default |
| `--crm-button-height-sm` | 28 | Botão sm |
| `--crm-button-height-lg` | 36 | Botão lg |
| `--crm-card-padding` | 12 | Padding interno de card kanban |

### 3.5 Radius CRM

- `--crm-radius-sm` 3px, `--crm-radius-md` **4px** (default), `--crm-radius-lg` 6px, `--crm-radius-full` 9999px.
- **Nunca** 8px no CRM — isso é a regra mais frequentemente violada.

### 3.6 Sombras CRM

Quase nada. `--crm-shadow-xs` é só 1px solid. `--crm-shadow-md` `0 4px 12px rgba(0,0,0,0.08)` só em popover/dropdown.

### 3.7 Utilitários prontos

- `.crm-card` — card base
- `.crm-button-primary` — primário preto, h 32px
- `.crm-button-ghost` — ghost com border `gray-300`
- `.crm-input` — input h 32px

---

## 4. Dark mode

Ativado via classe `.dark` ou atributo `[data-theme="dark"]` no `<html>`.

Regra fundamental (`DS v3.0 Regra 11`): **surfaces elevadas ficam mais
claras**, não mais escuras. Hierarquia:

| Camada | Cor |
|---|---|
| Page bg | `#0F1117` |
| Card | `#1A1D27` |
| Popover/Dropdown | `#242836` |
| Hover | `#2A2F3D` |
| Text primário | `#EAEDF3` |
| Text secundário | `#8B92A5` |
| Text muted | `#5C6378` |
| Brand | `#7B8CEA` (mais claro pra contrastar) |
| Border | `rgba(255,255,255,0.08)` |

Semantic dark (alpha 0.15 nos borders):
- positive: bg `#052E1C` text `#6EE7B7`
- negative: bg `#3B1111` text `#FCA5A5`
- warning: bg `#3B2506` text `#FCD34D`
- info: bg `#141C3D` text `#A8B8F0`

> A **sidebar é sempre dark** (`<aside class="dark">`), mesmo no tema light.
> Trata-se de identidade visual fixa.

---

## 5. Componentes — Catálogo e regras de uso

Localização: `src/components/ui/*`. **Sempre** reutilize estes — não crie
componente equivalente do zero.

### 5.1 Button (`<Button>`)

```tsx
import { Button } from "@/components/ui/button"

<Button variant="primary" size="md">Salvar</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="ghost" size="sm">Voltar</Button>
<Button variant="destructive">Excluir</Button>
<Button size="icon" aria-label="Atualizar"><RefreshCw /></Button>
```

**Variants:** `primary | secondary | ghost | destructive`.
**Sizes:** `sm` (28px) / `md` (36px, default) / `lg` (44px) + `icon-sm` / `icon` / `icon-lg` (quadrados).
**Sempre** `rounded-[6px]`, font 13–14px, peso 500.
**Sempre** focus ring: `box-shadow: 0 0 0 2px #4E62D8` (dark `#7B8CEA`).

Regras:
- **Máximo 1 primary por contexto** (header, modal, form). Demais são `secondary` ou `ghost`.
- **Destructive** apenas para ações irreversíveis (excluir, cancelar plano). Sempre com confirmação.
- Para CRM use `<button className="crm-button-primary">` (preto, h 32px) ou o componente equivalente do escopo CRM.
- Botão com ícone: ícone à esquerda, `gap-2` (8px). Ícone right só pra "abrir menu" (ChevronDown).

### 5.2 Card (`<Card>`)

```tsx
<Card>
  <CardHeader>
    <CardTitle>Receita por canal</CardTitle>
    <CardDescription>Últimos 30 dias</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

- `bg-white` + `border rgba(0,0,0,0.08)` + `rounded-[8px]`.
- Padding interno: `p-6` (24px). Cards densos podem `p-4` (16px).
- **Não** use shadow em estado normal. Hover: borda escurece para `rgba(0,0,0,0.12)`.
- Header → Title (16px semibold) + Description (14px muted) + opcionalmente ações à direita (`flex justify-between`).
- Para CRM: use `.crm-card` (radius 4px, padding 12px).

### 5.3 Input (`<Input>`) e Form Field

- h-9 (36px), `rounded-[6px]`, border `rgba(0,0,0,0.08)`.
- Placeholder `text-gray-400`.
- Focus: `shadow-[0_0_0_2px_#4E62D8]` (sem outline).
- Disabled: `opacity-50 cursor-not-allowed`.

Estados de validação (compostos via `<FormField>`):

| Estado | Border | Helper |
|---|---|---|
| Default | `rgba(0,0,0,0.08)` | `text-gray-500` |
| Focus | `shadow-ring-brand` | — |
| Error | `border-negative-border` + ring negativo | `text-negative-text` |
| Success | `border-positive-border` | `text-positive-text` |

Label sempre acima, 14px, `text-gray-700`, com asterisco `text-negative-text` quando obrigatório.

### 5.4 Select / Dropdown / Popover

- Trigger: mesmas dimensões do Input.
- Content: `rounded-[8px]`, `shadow-md`, max-height + scroll interno.
- Item: h 32px, hover `bg-gray-50`, ativo `bg-brand-50 text-brand-500`.
- Para multi-select use `<FilterSelect>` ou `<FilterBar>`.

### 5.5 Badge (`<Badge>`)

```tsx
<Badge variant="positive">Pago</Badge>
<Badge variant="warning" showDot={false}>Atenção</Badge>
```

- Variants: `positive | negative | warning | neutral | info`.
- Dot indicator: 6px circle, mesma cor do `text` da variante. Default `showDot=true`.
- 11px / peso 600 / `tracking-[0.02em]` / `rounded-[6px]`.
- **Padroniza com semantic triplets.** Não invente cores customizadas pra status — mapeia pra uma das 5 variants.

Para tipos especiais existem: `<ChannelBadge>`, `<StatusBadge>`, `<CountBadge>`, `<SyncStatusBadge>`.

### 5.6 KpiCard (`<KpiCard>`)

```tsx
<KpiCard
  label="Receita Total"
  value="R$ 842.567"
  delta={{ value: 16.4, label: "vs mês anterior" }}
  sparkData={[10, 12, 11, 14, 18, 22, 20]}
  tooltip="Soma dos pedidos pagos no período"
/>
```

Estrutura visual fixa:
- Label (13px medium, gray-500) + opcional Info icon
- Value (32px semibold, `-0.03em`, **tabular-nums**)
- Delta + Sparkline lado a lado, mt-3

Regras:
- **Máximo 1 KPI `variant="gradient"` por página** (o "hero number").
- Delta usa triplets semânticos: positive (verde escuro), negative (vermelho escuro), neutral (cinza).
- Sparkline opcional — `width=80 height=24`, área com gradiente brand.
- Loading: `<KpiCardSkeleton>` automático via `loading={true}`.
- 7+ KPIs viram scroll horizontal mobile (`<KpiCardRow>`).

### 5.7 PageHeader (`<PageHeader>`)

```tsx
<PageHeader
  title="Pedidos"
  description="Histórico de pedidos da loja"
  icon={ShoppingBag}
  badge={1284}
  breadcrumb={[{ label: "Lojas", href: "/admin/stores" }, { label: "Loja X" }]}
  actions={<Button>Exportar</Button>}
/>
```

- Title h1 22px / 600 / `-0.02em`.
- Icon **naked** (sem círculo, sem bg) — `text-muted-foreground`, 24px.
- Description 14px muted, mt-1.
- Actions à direita desktop, full-width stack mobile.
- Breadcrumbs sempre acima (mb-2) quando profundidade ≥ 2.

### 5.8 Table / DataTable

`<Table>` (`src/components/ui/table.tsx`) — primitivos simples.
`<DataTable>` — sortable, paginação, virtualização (`>100` rows), responsivo
(mobile → cards).

Padrões:
- TH: h-10 (mobile) / h-12 (desktop), `text-table-header` (12px, 600, uppercase letter-spacing 0.04em).
- TD: padding `p-2 sm:p-4` (8/16px).
- Linhas zebradas: **não**. Use só border-bottom `gray-200`.
- Row hover: `bg-gray-50` (DS v3.0) ou `bg-gray-100` (CRM).
- Alinhamento por tipo: text/badge/date à esquerda, number/currency/percentage à direita.
- Numerais com `tabular-nums` obrigatório.
- Empty state interno: `<EmptyState>` centrado dentro do `<TableBody>` (colspan total).

### 5.9 EmptyState

```tsx
<EmptyState
  icon={Inbox}
  title="Nenhum pedido ainda"
  description="Quando você receber pedidos, eles aparecem aqui."
  action={{ label: "Criar primeiro pedido", onClick: () => ... }}
/>
```

- Container `border-2 border-dashed border-border rounded-[8px] bg-muted/30`.
- Icon 32px, muted.
- Compact: `compact={true}` para empty dentro de cards pequenos (sem borda dashed).

### 5.10 Alert / Banner

`<Alert>`, `<AlertBanner>`, `<DataStatusBanner>`, `<RateLimitBanner>`.

- Layout: ícone (esquerda) + title + description + action (CTA opcional).
- Usa triplets semânticos (`positive/negative/warning/info/neutral`).
- Banner top de página: full-width, `rounded-[6px]`.

### 5.11 Dialog / Sheet / Drawer

- `<Dialog>` — modal centralizado, max-w 500–700px, `rounded-[8px]`, `shadow-lg`.
- `<Sheet>` — slide from right, larguras `sm` 400 / `md` 540 / `lg` 720 / `xl` 1024.
- `<Drawer>` — bottom sheet mobile (vaul).
- Header: title 16px semibold + close icon top-right.
- Footer: ações à direita, primary à direita absoluta (`<Cancel/> <Save/>`).
- Overlay `bg-black/40` + `backdrop-blur-sm` (opcional).

### 5.12 Toast (`<Toast>` / `useToast()`)

- Posição: bottom-right desktop, bottom-center mobile.
- Tipos: `default | success | error | warning | info` (mapeia triplets).
- Auto-dismiss 5s; persistente em error com action "Tentar novamente".
- Animação `cf-anim-toast` (slide-up 240ms).

### 5.13 Tabs

- `<Tabs>` — sublinhado clássico (radix).
- `<UnderlineTabs>` — linha sob ativo, 2px brand-400.
- `<SegmentedTabs>` — pill group (filtros).
- `<StatusTabs>` — tabs com count badge.

Active tab: `text-brand-500` + underline 2px ou bg `brand-50`.

### 5.14 Sidebar (layout)

- Largura: **248px** expandida / **68px** colapsada.
- Sempre `bg-black` + `border-r border-white/[0.06]` + classe `dark`.
- **Border-top 2px colorida** identifica o workspace (comercial/operacional/CS).
- Header: h 56px, logo à esquerda, toggle expand/collapse à direita.
- WorkspaceSwitcher logo abaixo do header (separa "3 sistemas").
- Items: h-9 (36px), `rounded-[6px]`, ícone 16-20px + label 13–14px.
- Item ativo: `bg-white/[0.08]` + `text-white`, opcional border-left brand 2px.
- Hover: `bg-white/[0.06]`.
- Group label: `text-sidebar-label` (10px, 600, uppercase, `0.06em`), `text-white/40`, mb-1.
- Footer fixo: user menu (`<SidebarUser>`).

### 5.15 Topbar / Header

- h-14 (56px), `bg-white` + border-bottom `gray-200`.
- Conteúdo: search global à esquerda + ações à direita (notifications, theme toggle, user).
- Mobile: hamburger menu à esquerda, logo centro.

### 5.16 Command Palette (`<CommandPalette>`)

- Disparo: **Cmd+K / Ctrl+K** globalmente.
- Modal centralizado, max-w 600px, `rounded-[8px]`, `shadow-lg`.
- Input 44px (h-11), sem border, focus sem ring (já tá em modal).
- Resultados agrupados; item ativo `bg-brand-50`.
- Atalhos do CRM: sequência **"g + letra"** (`gl`=leads, `gp`=pipelines, `gc`=CS, `gi`=inbox, `ga`=automações, `gr`=reports, `gd`=dashboard).

### 5.17 Ícones

- Biblioteca única: **lucide-react**.
- Tamanhos: 14 / 16 / 18 / 20 / 24. Use `<Icon icon={...} size={16} />` wrapper para garantir consistência.
- **Nunca** ícone com fundo circular colorido (DS v3.0 Regra 12). Ícone vive solto no fluxo, mesmo no PageHeader e nos cards.
- Cor: herda do contexto (`currentColor`) ou `text-muted-foreground`.

### 5.18 Logo

- `<Logo>` — wordmark completo (sidebar expandida, header de auth, página pública).
- `<LogoIcon>` — só símbolo (sidebar colapsada, favicon-like).

---

## 6. Layout patterns — Templates de tela

### 6.1 Estrutura global

```
┌──────────────────────────────────────────────────────────────┐
│  Topbar (h-14, white)                                        │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ Sidebar  │  Page content                                     │
│ 248px    │  max-w-7xl mx-auto px-6 (desktop) / px-4 (mobile) │
│ (dark)   │  py-6 / py-8                                      │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

Mobile: sidebar vira drawer (slide-in-from-left, w-280px).

### 6.2 Template — Página de listagem

```
PageHeader (title + description + actions [primary + filtros])
↓ space-y-6
FilterBar (chips de filtros ativos + busca)
↓
KPIs row (1-4 KpiCards em grid, gap-4)
↓
DataTable
  ├─ Header com sort
  ├─ Rows (zebra OFF, hover gray-50)
  ├─ Pagination footer
└─ EmptyState quando data.length === 0
```

### 6.3 Template — Dashboard

```
PageHeader
↓
KPIs hero (4 KpiCards, primeiro pode ser variant="gradient")
↓ grid lg:grid-cols-2 gap-6
Card [chart Receita] + Card [chart Conversão]
↓
Card [tabela top performers] (full width)
```

### 6.4 Template — Detalhe (record)

```
PageHeader (com breadcrumb)
↓ grid lg:grid-cols-[1fr_320px] gap-6
Left (main):
  ├─ Card de info principal
  ├─ Tabs (Atividade / Pedidos / Notas)
  └─ Content das tabs
Right (aside):
  ├─ Card "Resumo"
  ├─ Card "Ações rápidas"
  └─ Card "Histórico"
```

### 6.5 Template — Formulário

```
PageHeader (title="Editar X" + actions=[Cancel, Save])
↓
Card único OU múltiplos cards de seção
  ├─ Section heading (text-base font-semibold + description)
  ├─ FormField (label + input + helper)
  └─ ...
↓
SaveBar fixo bottom (aparece quando há mudanças)
```

`<SaveBar>` flutua bottom, full-width, `bg-white border-t shadow-md`, mostra "Você tem alterações não salvas" + botões Discard/Save.

### 6.6 Template — Kanban (CRM only)

```
PageHeader (CRM) + filter bar
↓
Horizontal scroll container
  ├─ Coluna 296px [header + count + total + cards 280px]
  ├─ Coluna 296px ...
  └─ + Add stage
```

Cards de deal: `crm-card`, padding 12px, border-left 3px com cor do stage (`cf-accent-left`).

### 6.7 Spacing entre seções

- Entre cards do dashboard: `gap-6` (24px) ou `gap-4` (16px) em densidade alta.
- Entre seções verticais: `space-y-6` (24px) padrão, `space-y-8` (32px) para hierarquia clara.
- Entre PageHeader e content: `mt-6` (24px).

---

## 7. Estados — UI completa

Toda tela precisa cobrir **5 estados**:

| Estado | Componente / padrão |
|---|---|
| **Loading** | `<PageSkeleton>` para página, `<Skeleton>` para campo, `<KpiCardSkeleton>` para KPI, `<Spinner>` (raro) |
| **Empty** | `<EmptyState>` com icon + title + action |
| **Error** | `<ErrorState>` com retry CTA + descrição do erro |
| **Partial** (degradação) | `<DataStatusBanner>` no topo + dados parciais |
| **Success** | toast + animação `cf-anim-statusin` no item modificado |

Skeletons: usam `animate-pulse` + `bg-gray-100 dark:bg-[#242836]`. **Não** use shimmer barato (`bg-gradient animate-shimmer`) — só `animate-pulse`.

---

## 8. Microinterações (CRM e além)

Definidas em `convertfy-ds-v3.css`:

| Classe | O que faz | Quando |
|---|---|---|
| `cf-anim-advance` | Pulse verde 1.2s | Card avança de stage no kanban |
| `cf-anim-assign` | Ring brand 1.5s no avatar | Atribui alguém ao deal |
| `cf-anim-statusin` | Fade-down 220ms | Status muda em badge |
| `cf-anim-toast` | Slide-up 240ms | Toast aparece |

**Não** adicione confettis, particles, bouncy springs. O DS é sério/contido.

---

## 9. Acessibilidade — Regras inegociáveis

1. **Focus visible obrigatório** em todo elemento interativo: `box-shadow 0 0 0 2px #4E62D8` (dark `#7B8CEA`). Usa `.cf-focusable` ou `focus-visible:` Tailwind.
2. **Touch target ≥ 44×44px** em mobile (`min-h-touch`).
3. **Contraste**: text default `gray-900` em `white` = ratio 16:1 ✓. Muted `gray-500` em `white` = 4.8:1 (passa AA pra texto ≥ 14px). **Nunca** use `gray-400` como text em fundo branco.
4. **Ícone-only button**: sempre `aria-label`.
5. **Form**: `<label htmlFor>` ligando ao input; erro via `aria-describedby` + `aria-invalid="true"`.
6. **Modal**: focus trap (radix já faz), retorno do focus pro trigger ao fechar.
7. **Skip link** opcional pro main em layouts complexos.
8. **Prefers-reduced-motion**: desativa keyframes não-essenciais (a app respeita via `@media (prefers-reduced-motion)` no Tailwind — adicione manualmente em animações novas).

---

## 10. Numerais, datas, dinheiro

- **Sempre `tabular-nums`** em qualquer número renderizado: KPI, tabela, badge numérico, gráfico, percentual, contador. Aplique `.tabular-nums`, `.font-data`, ou wrap em `<span data-numeric>`.
- **Moeda BRL**: `R$ 1.234,56` (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`).
- **Inteiros grandes**: separador `.` a cada 3 dígitos (`Intl.NumberFormat('pt-BR')`).
- **Percentual**: 1 casa decimal (`32.5%`). 0 casas se inteiro exato.
- **Data curta**: `dd/MM/yyyy` (pt-BR). Hora: `HH:mm`.
- **Relativo**: usar `<TimeAgo>` (`há 3 horas`, `ontem`). Threshold > 7 dias volta pra data absoluta.
- **Delta**: sempre com sinal `+12.4%` / `-3.1%` / `0%`. Verde / vermelho / cinza neutro.

---

## 11. Regras de ouro (não-negociáveis)

Compiladas de `docs/crm/design-system.md` e DS v3.0 audits:

1. **Um Design System por rota.** CRM em `/admin/crm/**`, DS v3.0 no resto. Nunca importar `crm-tokens` fora do CRM nem `brand-gradient` dentro do CRM.
2. **Border faz, shadow não.** Cards = border. Shadow só em overlays.
3. **Triplets semânticos andam juntos.** bg + text + border casados sempre.
4. **Inter + Geist Mono. Pesos 400, 500, 600.** Nada mais. CRM: 400 e 530.
5. **4 radii. 6/8/12/pill.** CRM: 3/4/6/pill. Esquece o resto.
6. **Spacing 8px grid.** `p-5`, `gap-7`, `mt-9` proibidos. Use só os tokens.
7. **Brand color = ação.** Não decora título com azul. Só botão primary, link, ativo, focus ring.
8. **Brand gradient: 1 por página.** Reservar pro hero KPI ou CTA único.
9. **Ícone naked, sem círculo colorido.**
10. **Tabular nums obrigatório em todo número.**
11. **Sidebar sempre dark.** Topbar segue o tema.
12. **Loading + Empty + Error + Success** cobertos antes de marcar tela como done.
13. **Mobile 44px touch min** sempre.
14. **CRM brand = preto.** Nunca azul, nunca roxo.
15. **CRM density alta.** Botão 32px, input 32px, row 36px. Não infle.

---

## 12. Checklist de revisão (antes de PR)

Cole no PR description quando criar/alterar tela:

```
Design System Compliance:
- [ ] Tokens corretos (DS v3.0 ou CRM — não misturado)
- [ ] Cores semânticas em triplets (bg + text + border)
- [ ] Border-radius dentro dos 4 tokens (6/8/12/pill ou 3/4/6/pill no CRM)
- [ ] Spacing no grid 8px (p-2, p-3, p-4, p-6, p-8...)
- [ ] Tipografia: Inter, pesos 400/500/600, tamanhos da escala
- [ ] tabular-nums em todos os números
- [ ] Focus ring visível em interativos
- [ ] Touch target ≥ 44px mobile
- [ ] 5 estados cobertos (loading/empty/error/partial/success)
- [ ] Dark mode testado
- [ ] Ícones lucide, sem círculo colorido
- [ ] Brand gradient ≤ 1 ocorrência
- [ ] Primary button ≤ 1 por contexto
- [ ] Skeleton igual à shape final (sem layout shift)
- [ ] Toast em ações destrutivas/sucesso
```

---

## 13. Onde encontrar exemplos de referência

| O quê | Onde |
|---|---|
| Tokens DS v3.0 | `src/app/globals.css`, `tailwind.config.ts` |
| Tokens CRM | `src/styles/crm-tokens.css` |
| Utilities + animações | `src/styles/convertfy-ds-v3.css` |
| Catálogo visual interativo | `docs/design-system-preview.html` (abra no browser) |
| Componentes UI | `src/components/ui/*` |
| Layout (sidebar/header) | `src/components/layout/*` |
| Exemplo de dashboard | `src/app/admin/dashboard/page.tsx` |
| Exemplo de tabela | `src/app/admin/stores/page.tsx` |
| Exemplo CRM (kanban) | `src/app/admin/crm/pipelines/[id]/page.tsx` |
| Exemplo formulário | `src/app/admin/settings/**/page.tsx` |
| Spec CRM original | `docs/crm/design-system.md` |
| Spec invoice banner | `docs/specs/invoice-revenue-banner-design-spec.md` |
| Auditoria UI/UX | `docs/ANALISE-UI-UX-PORTAL-ADMIN.md`, `docs/ANALISE_FRONTEND_COMPLETA.md` |

---

## 14. Quando criar coisa nova

1. **Procura primeiro.** `rg "Component"` em `src/components/ui` antes de escrever.
2. **Compose, don't fork.** Use Card + Button + Badge como blocos.
3. **Token, não literal.** `bg-positive-bg` ✓, `bg-[#ECFDF5]` ✗ (exceto em variantes oficiais já documentadas em código).
4. **Variants via cva.** Padrão da casa (`button.tsx`, `badge.tsx` como referência).
5. **Documenta no README do diretório** se for componente público.
6. **Storybook não existe** — adicione preview em `docs/design-system-preview.html` ou rota interna de showcase se relevante.

---

*Última atualização: 2026-05-15. Atualize quando tokens ou padrões mudarem.
Em conflito, este guia vence — qualquer divergência levanta issue.*
