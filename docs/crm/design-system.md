# CRM Design System

Tokens em `src/styles/crm-tokens.css`. **Sempre via `var(--crm-*)`**, nunca
valores hard-coded. Componentes usam `style={{}}` ou utilities (`.crm-card`,
`.crm-button-primary`, `.crm-button-ghost`, `.crm-input`).

## Tipografia

```
font: Geist (primary) → Inter (fallback) → system-ui
mono: Geist Mono → JetBrains Mono

text-xs    11px   —  metadados, badges
text-sm    12px   —  table cells secundarias
text-base  13px   —  body padrao
text-md    14px   —  titulos pequenos, labels
text-lg    16px   —  H3
text-xl    20px   —  H2
text-2xl   26px   —  H1 dashboard

weight-regular  400
weight-medium   530   (sim, 530 — peso visualmente mais elegante que 500)
```

## Cores

**80% da UI e cinza**. Cores semanticas (success/warning/danger/info) sao
escassas — apenas para status, nao para decoracao.

```
gray-0    #FFFFFF   surface principal (light)
gray-50   #FAFAFA   background de pagina
gray-100  #F4F4F5   hover sutil
gray-200  #E4E4E7   borders
gray-500  #71717A   texto secundario
gray-700  #3F3F46   texto principal (dark on light)
gray-900  #18181B   titulos

brand     #1F1F1F   PRETO (botoes primarios) — nunca azul, nunca roxo
accent    #2563EB   apenas link e focus ring
```

## Espacamento

Escala 4px. Use `--crm-space-{1..16}`. Padding default de card: `12px`.

## Border-radius

```
radius-sm   3px   chips, badges
radius-md   4px   cards, buttons, inputs (DEFAULT)
radius-lg   6px   modais, drawers
radius-full      avatars
```

**Nunca usar 8px ou maior**. Quina sutil = identidade visual.

## Sombras

Quase inexistentes. Cards tem `border 1px`, nao `box-shadow`.

```
shadow-xs  0 1px 0 rgba(0,0,0,0.04)
shadow-sm  0 1px 2px rgba(0,0,0,0.06)
shadow-md  0 4px 12px rgba(0,0,0,0.08)
shadow-lg  0 12px 32px rgba(0,0,0,0.12)
```

## Dimensoes fixas

```
card-kanban-width      280px
column-kanban-width    296px (= card + gutter)
sidebar-width          216px (expandida)
sidebar-collapsed       56px
topbar-height           44px
table-row-height        36px
table-header-height     32px
input-height            32px
button-height           32px
button-height-sm        28px
button-height-lg        36px
card-padding            12px
```

## Densidade

Tabelas/listas tem **densidade alta** — 36px por linha, fonte 13px. Layouts
priorizam quantidade de informacao visivel sobre respiro.

## Dark mode

Auto via `[data-theme="dark"]` ou `.dark` no root. Tokens invertem
(gray-0 vira preto, gray-900 vira branco). Brand inverte tambem (preto vira
branco em dark mode).

## Animacao

```
ease       cubic-bezier(0.2, 0, 0.2, 1)
duration-fast    150ms   hover, focus
duration-normal  200ms   transitions de drawer/modal
duration-slow    300ms   sidebar collapse
```

Sem bounce, sem overshoot. Movimentos sutis.
