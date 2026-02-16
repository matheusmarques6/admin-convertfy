# PLANO DE REFATORACAO COMPLETO - Backend + Frontend

**Data:** 2026-02-16
**Squad:** Orion (Orchestrator) + Architect + Developer + UX Designer
**Prioridade:** Backend e Frontend em paralelo

---

## DECISOES DO USUARIO (Base do Plano)

| Decisao | Escolha |
|---------|---------|
| Tema | Dark + Light Mode funcional |
| Klaviyo UI | Dados integrados na loja do cliente (nao pagina separada) |
| Portal vs Admin | Design system compartilhado, branding diferente por agencia |
| Navegacao | Sidebar com secoes agrupadas |
| Cliente Detail | Tabs horizontais (Overview, Lojas, Marketing, Financeiro, Timeline, Config) |
| Klaviyo no Cliente | Integrado dentro de cada loja |
| Integracoes | Wizard step-by-step no primeiro login + ao adicionar nova loja |
| Onboarding | Step 1: Dados pessoais → Step 2: Dados da loja → Step 3: Shopify → Step 4: Klaviyo |
| N8N | Futuro - apos o onboarding, n8n analisa loja e cria copy de emails (NAO FAZER AGORA) |

---

## VISAO GERAL DAS FASES

```
FASE 0 ─── Quick Wins & Limpeza (1-2 dias)
  │         Remover duplicatas obvias, codigo morto
  │
FASE 1 ─── Backend: Unificacao de Credenciais (2-3 dias)
  │         Resolver causa raiz de dados ausentes
  │
FASE 2 ─── Backend: Padronizacao de APIs (1-2 dias)
  │         Consolidar Klaviyo, padronizar respostas
  │
FASE 3 ─── Frontend: Design System & Tema (2-3 dias)
  │         Light/Dark mode, componentes base, sidebar
  │
FASE 4 ─── Frontend: Reestruturacao de Paginas (3-4 dias)
  │         Cliente detail, loja com integracoes, reports
  │
FASE 5 ─── Wizard de Onboarding (2-3 dias)
  │         Fluxo step-by-step primeiro login + nova loja
  │
FASE 6 ─── Portal do Cliente + Branding (1-2 dias)
  │         Portal com design system compartilhado
  │
FASE 7 ─── Limpeza Final & Testes (1-2 dias)
          Remover arquivos antigos, testar fluxos
```

**Estimativa total: 13-21 dias uteis**

---

## FASE 0: Quick Wins & Limpeza (1-2 dias)

### 0.1 Deletar arquivo duplicado do Supabase admin

**Acao:** Deletar `src/lib/supabase/admin.ts`
**Impacto:** 8 arquivos precisam atualizar import

**Arquivos a editar:**
```
src/app/(dashboard)/pipeline/page.tsx
src/app/api/admin/encrypt-credentials/route.ts
src/app/api/pipeline/import/route.ts
src/app/api/pipeline/members/route.ts
src/app/api/pipeline/route.ts
src/app/api/portal-users/change-password/route.ts
src/app/api/portal-users/reset-password/route.ts
src/app/api/portal-users/route.ts
```

**Mudanca em cada arquivo:**
```typescript
// ANTES:
import { createAdminClient } from "@/lib/supabase/admin"

// DEPOIS:
import { createAdminClient } from "@/lib/supabase/server"
```

### 0.2 Deletar Klaviyo service morto

**Acao:** Deletar `src/lib/integrations/klaviyo-service.ts`
**Impacto:** ZERO - nenhum arquivo importa este modulo (codigo morto confirmado)

### 0.3 Deletar automation-switch duplicado

**Acao:** Deletar `src/components/automations/automation-switch.tsx`
**Impacto:** ZERO - nenhum arquivo importa (automation-toggle.tsx e o que e usado)

### 0.4 Unificar constantes Klaviyo

**Arquivo:** `src/lib/integrations/klaviyo/client.ts`
**Acao:** Garantir que KLAVIYO_API_URL e MIN_REQUEST_INTERVAL sao a unica fonte de verdade

**Arquivo:** `src/lib/integrations/klaviyo-sync.ts` (se existir constantes duplicadas)
**Acao:** Importar de `klaviyo/client.ts` ao inves de redefinir

---

## FASE 1: Backend - Unificacao de Credenciais (2-3 dias)

### ESTA E A FASE MAIS CRITICA - Resolve dados ausentes

### 1.1 Criar migration SQL para unificar credenciais

**Novo arquivo:** `supabase/migrations/20260217_unify_credentials.sql`

```sql
-- 1. Adicionar campos faltantes em client_stores (se nao existirem)
ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_page_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_credentials JSONB,
  ADD COLUMN IF NOT EXISTS google_calendar_credentials JSONB,
  ADD COLUMN IF NOT EXISTS integration_status JSONB DEFAULT '{}';

-- 2. Migrar dados existentes de integrations para client_stores
-- (Script de backfill - rodar manualmente apos validar)

-- 3. Criar view de compatibilidade (temporaria)
CREATE OR REPLACE VIEW v_store_integrations AS
SELECT
  cs.id as store_id,
  cs.client_id,
  cs.org_id,
  cs.store_name,
  cs.shopify_store_domain,
  cs.shopify_access_token,
  cs.klaviyo_api_key,
  cs.klaviyo_private_key,
  cs.ga4_property_id,
  cs.ga4_credentials,
  cs.meta_access_token,
  cs.integration_status
FROM client_stores cs
WHERE cs.is_active = true;
```

### 1.2 Atualizar OAuth callbacks para salvar em client_stores

**Arquivos a editar:**

#### `src/app/api/integrations/shopify/callback/route.ts`
```typescript
// ANTES: Salva em tabela "integrations"
await supabase.from('integrations').upsert({
  type: 'shopify',
  credentials: { access_token, shop },
  is_active: true
})

// DEPOIS: Salva em tabela "client_stores"
await adminClient.from('client_stores').update({
  shopify_access_token: encrypt(access_token),
  shopify_store_domain: shop,
  integration_status: {
    ...existingStatus,
    shopify: { connected: true, connected_at: new Date().toISOString() }
  }
}).eq('id', storeId)
```

#### `src/app/api/integrations/meta/callback/route.ts`
```typescript
// ANTES: Salva em "integrations"
// DEPOIS: Salva em "client_stores" com campo meta_access_token
```

#### `src/app/api/integrations/google/callback/route.ts`
```typescript
// ANTES: Salva em "integrations"
// DEPOIS: Salva em "client_stores" com campos google_*
```

### 1.3 Atualizar Settings/Save route

**Arquivo:** `src/app/api/integrations/save/route.ts`
```typescript
// ANTES: Salva em "integrations" (JSON blob)
// DEPOIS: Salva nos campos especificos de "client_stores"
// Requer receber store_id no request body
```

### 1.4 Criar helper unificado de credenciais

**Novo arquivo:** `src/lib/services/credentials.service.ts`

```typescript
export async function getStoreCredentials(storeId: string) {
  const adminClient = createAdminClient()
  const { data: store } = await adminClient
    .from('client_stores')
    .select('*')
    .eq('id', storeId)
    .single()

  if (!store) throw new NotFoundError('Store')

  return decryptStoreCredentials(store)
}

export async function updateStoreCredentials(
  storeId: string,
  credentials: Partial<StoreCredentials>
) {
  const adminClient = createAdminClient()
  const encrypted = encryptStoreCredentials(credentials)

  const { error } = await adminClient
    .from('client_stores')
    .update({
      ...encrypted,
      updated_at: new Date().toISOString()
    })
    .eq('id', storeId)

  if (error) throw new AppError('Erro ao atualizar credenciais', 500)
}

export async function getStoreIntegrationStatus(storeId: string) {
  // Retorna status de cada integracao (connected/disconnected)
}
```

### 1.5 Atualizar rotas de report para usar credentials service

**Arquivos a editar:**
- `src/app/api/integrations/shopify/report/route.ts` → usar `getStoreCredentials()`
- `src/app/api/integrations/klaviyo/report/route.ts` → usar `getStoreCredentials()`
- `src/app/api/integrations/google-analytics/report/route.ts` → usar `getStoreCredentials()`

### 1.6 Decidir destino da tabela "integrations"

**Opcao recomendada:** Manter `integrations` APENAS para configuracoes globais da organizacao (ex: chaves de API compartilhadas, webhooks). Remover todo uso per-client.

---

## FASE 2: Backend - Padronizacao de APIs (1-2 dias)

### 2.1 Consolidar rotas Klaviyo

**ANTES (2 diretorios):**
```
src/app/api/klaviyo/           ← LEGADO (Supabase cache)
src/app/api/integrations/klaviyo/  ← ATIVO (API live)
```

**DEPOIS (1 diretorio):**
```
src/app/api/integrations/klaviyo/
  ├── campaigns/route.ts    (merge do legado + novo)
  ├── flows/route.ts
  ├── metrics/route.ts
  ├── report/route.ts
  ├── test/route.ts
  ├── debug/route.ts
  ├── sync/route.ts         (migrado de /api/klaviyo/sync)
  ├── alerts/route.ts       (migrado de /api/klaviyo/alerts)
  ├── compare/route.ts      (migrado de /api/klaviyo/compare)
  └── rankings/route.ts     (migrado de /api/klaviyo/rankings)
```

**Acao:** Migrar rotas de `/api/klaviyo/` para `/api/integrations/klaviyo/`, consolidando quando houver duplicata.

**Impacto frontend:** Atualizar todas as chamadas fetch que usam `/api/klaviyo/` para `/api/integrations/klaviyo/`

### 2.2 Padronizar respostas de API

**Regra:** TODAS as rotas devem usar `successResponse()` e `errorResponse()` de `src/lib/api/errors.ts`

**Arquivos que precisam ser atualizados (~25 rotas):**
- Rotas de integracoes que usam `NextResponse.json()` direto
- Rotas de webhook que tem error handling manual
- Rotas de campaign-batches

### 2.3 Padronizar autenticacao

**Regra:** TODAS as rotas (exceto webhooks) devem usar `requireAuth()` ou `requireRole()`

**Rotas que precisam ser corrigidas:**
- `campaigns/[id]/approve/route.ts` → substituir auth manual por `requireAuth()`
- `campaigns/[id]/reject/route.ts` → idem
- `campaigns/[id]/submit/route.ts` → idem
- Rotas admin sem `requireRole()` → adicionar

### 2.4 Consolidar rate limiting

**Decisao:** Manter AMBOS os sistemas por enquanto:
- `rate-limit.ts` (in-memory) → para endpoints de alta frequencia (webhooks, auth)
- `rate-limit.service.ts` (database) → para audit trail (login, password reset)

**Futuro:** Migrar tudo para database-backed quando necessario

---

## FASE 3: Frontend - Design System & Tema (2-3 dias)

### 3.1 Implementar Light + Dark Mode funcional

**Arquivo:** `src/app/layout.tsx`
```typescript
// ANTES:
<ThemeProvider forcedTheme="dark">

// DEPOIS:
<ThemeProvider
  attribute="class"
  defaultTheme="dark"
  enableSystem={false}
  storageKey="convertfy-theme"
>
```

**Arquivo:** `src/app/globals.css`
- Verificar e completar TODAS as variaveis CSS para light mode
- Garantir que todos os componentes respeitam as variaveis

**Arquivo:** `src/components/layout/header.tsx`
- Toggle de tema ja existe (Sun/Moon) - garantir que funciona

### 3.2 Reorganizar Sidebar com secoes agrupadas

**Arquivo:** `src/components/layout/sidebar.tsx`

**ANTES:** Lista plana de 14 itens
**DEPOIS:** Secoes agrupadas:

```typescript
const navigationSections = [
  {
    label: "Principal",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { name: "Clientes", icon: Users, href: "/clients" },
      { name: "Lojas", icon: Store, href: "/stores" },
    ]
  },
  {
    label: "CRM & Vendas",
    items: [
      { name: "Pipeline", icon: Kanban, href: "/pipeline" },
      { name: "Board", icon: LayoutGrid, href: "/board" },
      { name: "Reunioes", icon: Calendar, href: "/meetings" },
    ]
  },
  {
    label: "Marketing",
    items: [
      { name: "Campanhas", icon: Megaphone, href: "/campaigns" },
      { name: "Automacoes", icon: Zap, href: "/automations" },
    ]
  },
  {
    label: "Operacional",
    items: [
      { name: "Equipe", icon: UsersRound, href: "/team" },
      { name: "Onboarding", icon: ClipboardCheck, href: "/onboarding" },
      { name: "Relatorios", icon: BarChart3, href: "/reports" },
      { name: "Financeiro", icon: DollarSign, href: "/financial" },
    ]
  },
  {
    label: "Ferramentas",
    items: [
      { name: "Ferramentas", icon: Wrench, href: "/tools" },
    ]
  }
]
```

**Renderizacao:**
```tsx
{navigationSections.map(section => (
  <div key={section.label}>
    {!sidebarCollapsed && (
      <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {section.label}
      </p>
    )}
    {section.items.filter(item => hasPermission(item)).map(item => (
      <NavItem key={item.href} {...item} />
    ))}
  </div>
))}
```

**NOTA:** Remover "Metricas Klaviyo" como item separado - dados Klaviyo ficam dentro do cliente/loja.

### 3.3 Criar componentes base reutilizaveis

**Novos componentes:**

#### `src/components/ui/empty-state.tsx`
```typescript
interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}
```

#### `src/components/ui/page-header.tsx`
```typescript
interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
}
```

#### `src/components/ui/stat-card.tsx`
```typescript
interface StatCardProps {
  title: string
  value: string | number
  icon?: LucideIcon
  trend?: { value: number; label: string }
  variant?: "default" | "success" | "warning" | "destructive"
}
```

#### `src/components/ui/data-table.tsx` (generico)
```typescript
interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  searchable?: boolean
  filterable?: boolean
  exportable?: boolean
  pagination?: boolean
  loading?: boolean
  emptyState?: EmptyStateProps
}
```

### 3.4 Criar hook useFetch

**Novo arquivo:** `src/hooks/use-fetch.ts`
```typescript
export function useFetch<T>(url: string, options?: UseFetchOptions) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (overrideOptions?: RequestInit) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, { ...options, ...overrideOptions })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `Erro ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      return json
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido"
      setError(message)
      toast({ variant: "destructive", title: "Erro", description: message })
      throw err
    } finally {
      setLoading(false)
    }
  }, [url])

  return { data, loading, error, execute, setData }
}
```

### 3.5 Centralizar tipos compartilhados

**Novo arquivo:** `src/types/store.ts`
```typescript
export interface ClientStore {
  id: string
  client_id: string
  org_id?: string
  store_name: string
  url?: string
  platform?: string
  niche?: string
  country?: string
  language?: string
  target_audience?: string
  free_shipping_type?: string
  shopify_store_domain?: string
  shopify_access_token?: string
  klaviyo_api_key?: string
  klaviyo_private_key?: string
  ga4_property_id?: string
  integration_status?: IntegrationStatus
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface IntegrationStatus {
  shopify?: { connected: boolean; connected_at?: string }
  klaviyo?: { connected: boolean; connected_at?: string }
  meta?: { connected: boolean; connected_at?: string }
  google_ads?: { connected: boolean; connected_at?: string }
  ga4?: { connected: boolean; connected_at?: string }
}
```

**Novo arquivo:** `src/types/klaviyo.ts`
```typescript
export interface KlaviyoReportData { ... }
export interface KlaviyoFlowMetrics { ... }
export interface KlaviyoCampaignMetrics { ... }
```

### 3.6 Criar constantes compartilhadas

**Novo arquivo:** `src/lib/constants/campaigns.ts`
```typescript
export const CAMPAIGN_STATUS_CONFIG = { ... }
export const LANGUAGE_FLAGS = { ... }
export const CHANNEL_OPTIONS = [ ... ]
```

---

## FASE 4: Frontend - Reestruturacao de Paginas (3-4 dias)

### 4.1 Reestruturar pagina de detalhe do Cliente

**Arquivo:** `src/app/(dashboard)/clients/[id]/page.tsx`

**NOVA ESTRUTURA COM TABS:**
```
/clients/[id]
├── Tab: Overview
│   ├── Dados do cliente (nome, email, CNPJ, etc.)
│   ├── Status cards (total lojas, receita total, status onboarding)
│   └── Timeline recente (ultimas 5 atividades)
│
├── Tab: Lojas
│   ├── Lista de lojas do cliente
│   ├── Para cada loja:
│   │   ├── Status das integracoes (Shopify ✅, Klaviyo ✅, GA4 ❌)
│   │   ├── KPIs rapidos (receita, pedidos, taxa conversao)
│   │   └── Botao "Ver detalhes" → abre view expandida
│   └── Botao "+ Nova Loja" → abre wizard
│
├── Tab: Financeiro
│   ├── Assinatura atual
│   ├── Historico de cobrancas
│   └── Faturas
│
├── Tab: Timeline
│   ├── Todas as atividades do cliente
│   └── Filtro por tipo
│
└── Tab: Configuracoes
    ├── Editar dados do cliente
    ├── Portal access
    └── Preferencias de notificacao
```

### 4.2 Criar view de Loja com integracoes Klaviyo

**Novo componente:** `src/components/stores/store-detail-view.tsx`

```
Store Detail View (dentro da tab Lojas do cliente)
├── Header: Nome da loja + badges de integracao
├── Section: Performance
│   ├── KPIs Shopify (receita, pedidos, ticket medio, recorrencia)
│   └── KPIs Klaviyo (open rate, click rate, revenue atribuida, RPR)
├── Section: Campanhas recentes (Klaviyo)
│   └── Tabela das ultimas 10 campanhas com metricas
├── Section: Flows ativos (Klaviyo)
│   └── Tabela dos flows com receita gerada
├── Section: Dados da Loja
│   ├── Dominio Shopify
│   ├── Plataforma, nicho, pais, idioma
│   └── Publico alvo, tipo de frete
└── Section: Integracoes
    ├── Shopify: status + reconectar
    ├── Klaviyo: status + reconectar
    ├── GA4: status + conectar
    └── Meta: status + conectar
```

### 4.3 Consolidar componentes de report Klaviyo

**ANTES (3 componentes, ~1400 linhas):**
```
client-klaviyo-reports.tsx       (~532 linhas)
klaviyo-fullscreen-report.tsx    (~827 linhas)
klaviyo-performance-report.tsx   (~900 linhas)
```

**DEPOIS (1 componente + 1 sub-componente):**
```
src/components/stores/store-klaviyo-metrics.tsx    (~400 linhas)
  - Recebe storeId como prop
  - Busca dados de /api/integrations/klaviyo/report
  - Renderiza KPIs, campanhas, flows
  - Modo: inline (dentro da loja) ou fullscreen (overlay)
```

### 4.4 Remover paginas Klaviyo standalone

**DELETAR:**
- `src/app/(dashboard)/klaviyo/campaigns/page.tsx`
- `src/app/(dashboard)/klaviyo/flows/page.tsx`
- `src/app/(dashboard)/klaviyo-metrics/page.tsx`

**MOVER FUNCIONALIDADE PARA:**
- Dados de campanha/flow → dentro de `store-detail-view.tsx`
- Rankings cross-store → dashboard admin (card/widget)
- Alerts → sistema de notificacoes existente

### 4.5 Consolidar campaign modals

**ANTES (3 modais, ~1638 linhas):**
```
campaign-modal.tsx           (~734 linhas) - view/approve/reject
campaign-form-modal.tsx      (~654 linhas) - create
campaign-batch-modal.tsx     (~250 linhas) - batch create
```

**DEPOIS (2 modais, ~800 linhas estimadas):**
```
campaign-view-modal.tsx      (~400 linhas) - view + approve/reject
campaign-create-modal.tsx    (~400 linhas) - create + batch (com toggle)
```

**Extrair para compartilhar:**
- `src/lib/constants/campaigns.ts` → statusConfig, languageFlags
- `src/components/campaigns/store-selector.tsx` → seletor de loja reutilizavel

### 4.6 Substituir alert() por toast

**Arquivos afetados:**
- `src/components/campaigns/campaign-modal.tsx` (linha 211)
- `src/components/clients/client-reports.tsx`
- `src/components/pipeline/pipeline-settings-dialog.tsx`
- `src/components/onboarding/onboarding-kanban.tsx`

---

## FASE 5: Wizard de Onboarding (2-3 dias)

### 5.1 Criar fluxo de primeiro login do portal

**Novo componente:** `src/components/onboarding/client-onboarding-wizard.tsx`

```
STEP 1: Dados Pessoais
├── Nome completo (obrigatorio)
├── Email (obrigatorio, pre-preenchido)
├── CNPJ (obrigatorio, com mascara e validacao)
└── Botao: Proximo

STEP 2: Dados da Loja
├── Nome da loja (obrigatorio)
├── URL da loja (obrigatorio)
├── Plataforma (select: Shopify, WooCommerce, etc)
├── Nicho da loja (select ou texto)
├── Pais da loja (select)
├── Lingua da loja (select)
├── Publico alvo (textarea)
├── Frete gratis (radio: fixo | personalizado)
└── Botao: Proximo

STEP 3: Conectar Shopify (obrigatorio)
├── Campo: Codigo de colaborador Shopify
├── Instrucoes visuais de como obter o codigo
├── Validacao do codigo
└── Botao: Proximo

STEP 4: Conectar Klaviyo (obrigatorio)
├── Campo: Klaviyo Private API Key
├── Campo: Klaviyo Public API Key
├── Instrucoes visuais de como obter as chaves
├── Botao "Testar Conexao"
├── Status: Conectado ✅ / Erro ❌
└── Botao: Concluir

STEP 5: Conclusao
├── Resumo do que foi configurado
├── Checklist visual (✅ Dados pessoais, ✅ Loja, ✅ Shopify, ✅ Klaviyo)
└── Botao: "Ir para o Dashboard"
```

### 5.2 API routes para o wizard

**Novo arquivo:** `src/app/api/onboarding/client-setup/route.ts`
```typescript
// POST - Salva dados pessoais + loja + credenciais em uma transacao
// Cria: client_portal_users update + client_stores insert
// Encripta credenciais antes de salvar
```

**Novo arquivo:** `src/app/api/onboarding/test-shopify/route.ts`
```typescript
// POST - Testa codigo de colaborador Shopify
```

**Novo arquivo:** `src/app/api/onboarding/test-klaviyo/route.ts`
```typescript
// POST - Testa conexao Klaviyo com as chaves fornecidas
```

### 5.3 Integrar wizard no portal

**Arquivo:** `src/app/portal/layout.tsx`
```typescript
// Verificar se o cliente completou o onboarding
// Se nao → redirecionar para /portal/setup
// Se sim → renderizar layout normal
```

**Novo arquivo:** `src/app/portal/setup/page.tsx`
```typescript
// Pagina do wizard de onboarding
// Usa <ClientOnboardingWizard />
```

### 5.4 Wizard "Nova Loja" (para clientes ja onboardados)

**Reusar o wizard** dos Steps 2-4, pulando Step 1 (dados pessoais ja existem)

**Trigger:** Botao "+ Nova Loja" na tab Lojas do cliente

---

## FASE 6: Portal do Cliente + Branding (1-2 dias)

### 6.1 Design system compartilhado com branding customizavel

**Novo arquivo:** `src/lib/theme/branding.ts`
```typescript
export interface AgencyBranding {
  primaryColor: string
  logoUrl: string
  faviconUrl: string
  companyName: string
}

export function getBrandingForOrg(orgId: string): AgencyBranding {
  // Busca branding da org ou retorna default
}
```

**Arquivo:** `src/app/portal/layout.tsx`
```typescript
// Aplicar CSS variables de branding da agencia
// --brand-primary, --brand-logo, etc.
```

### 6.2 Atualizar portal para usar componentes compartilhados

**Componentes que o portal deve compartilhar com admin:**
- `ui/button.tsx`, `ui/card.tsx`, `ui/table.tsx`, etc. (ja compartilham)
- `ui/page-header.tsx` (novo)
- `ui/stat-card.tsx` (novo)
- `ui/empty-state.tsx` (novo)
- `stores/store-detail-view.tsx` (modo portal - sem edicao)

---

## FASE 7: Limpeza Final & Testes (1-2 dias)

### 7.1 Arquivos a DELETAR

```
src/lib/supabase/admin.ts                              ← Fase 0
src/lib/integrations/klaviyo-service.ts                 ← Fase 0
src/components/automations/automation-switch.tsx         ← Fase 0
src/app/api/klaviyo/ (diretorio inteiro)                ← Fase 2
src/components/clients/klaviyo-fullscreen-report.tsx     ← Fase 4
src/components/clients/klaviyo-performance-report.tsx    ← Fase 4
src/components/clients/client-klaviyo-reports.tsx        ← Fase 4
src/app/(dashboard)/klaviyo/ (diretorio inteiro)        ← Fase 4
src/app/(dashboard)/klaviyo-metrics/page.tsx             ← Fase 4
```

### 7.2 Verificacoes finais

- [ ] `npm run build` compila sem erros
- [ ] `npm run lint` passa
- [ ] `npm run typecheck` passa
- [ ] Light mode funciona em todas as paginas
- [ ] Dark mode funciona em todas as paginas
- [ ] Sidebar agrupada renderiza corretamente
- [ ] Cliente detail com tabs funciona
- [ ] Loja detail com Klaviyo integrado funciona
- [ ] Wizard de onboarding completa sem erros
- [ ] OAuth Shopify salva em client_stores
- [ ] OAuth Meta salva em client_stores
- [ ] OAuth Google salva em client_stores
- [ ] Reports Shopify encontra credenciais
- [ ] Reports Klaviyo encontra credenciais
- [ ] Portal do cliente carrega com branding
- [ ] Mobile responsivo funciona

### 7.3 Arquivos novos criados nesta refatoracao

```
BACKEND:
  supabase/migrations/20260217_unify_credentials.sql
  src/lib/services/credentials.service.ts
  src/app/api/onboarding/client-setup/route.ts
  src/app/api/onboarding/test-shopify/route.ts
  src/app/api/onboarding/test-klaviyo/route.ts

FRONTEND:
  src/components/ui/empty-state.tsx
  src/components/ui/page-header.tsx
  src/components/ui/stat-card.tsx
  src/components/ui/data-table.tsx
  src/components/stores/store-detail-view.tsx
  src/components/stores/store-klaviyo-metrics.tsx
  src/components/stores/store-integration-status.tsx
  src/components/campaigns/store-selector.tsx
  src/components/onboarding/client-onboarding-wizard.tsx
  src/hooks/use-fetch.ts
  src/types/store.ts
  src/types/klaviyo.ts
  src/lib/constants/campaigns.ts
  src/lib/theme/branding.ts
  src/app/portal/setup/page.tsx
```

---

## MAPA DE IMPACTO POR ARQUIVO

### Arquivos DELETADOS (9)
| Arquivo | Fase | Motivo |
|---------|------|--------|
| `src/lib/supabase/admin.ts` | 0 | Duplicata |
| `src/lib/integrations/klaviyo-service.ts` | 0 | Codigo morto |
| `src/components/automations/automation-switch.tsx` | 0 | Codigo morto |
| `src/app/api/klaviyo/*` (5 rotas) | 2 | Migradas |
| `src/components/clients/klaviyo-*.tsx` (3) | 4 | Consolidadas |
| `src/app/(dashboard)/klaviyo*` (3 paginas) | 4 | Removidas |

### Arquivos EDITADOS (~50+)
| Categoria | Qtd | Tipo de mudanca |
|-----------|-----|----------------|
| Imports supabase/admin | 8 | Trocar import path |
| OAuth callbacks | 3 | Salvar em client_stores |
| Report routes | 3 | Usar credentials service |
| Rotas com NextResponse.json | ~25 | Usar successResponse() |
| Sidebar | 1 | Reorganizar com secoes |
| Layout root | 1 | Habilitar light mode |
| Cliente detail | 1 | Tabs horizontais |
| Campaign modals | 3 | Consolidar em 2 |
| Componentes com alert() | 4 | Trocar por toast |
| Portal layout | 1 | Branding + onboarding check |

### Arquivos CRIADOS (~18)
| Categoria | Qtd |
|-----------|-----|
| Migrations SQL | 1 |
| API routes novas | 3 |
| Componentes UI base | 4 |
| Componentes de loja | 3 |
| Componentes de onboarding | 1 |
| Hooks | 1 |
| Types | 2 |
| Constants | 1 |
| Services | 1 |
| Pages | 1 |

---

## NOTA PARA FUTURO (N8N Integration)

Apos o onboarding wizard estar funcional, o fluxo sera:
1. Cliente completa wizard → dados salvos em client_stores
2. Webhook dispara para N8N com os dados da loja
3. N8N analisa a loja (Shopify data, concorrentes, nicho)
4. N8N gera copy dos emails de onboarding
5. Emails sao enviados via Klaviyo automaticamente

**NAO IMPLEMENTAR AGORA** - apenas garantir que o webhook pode ser adicionado depois.

---

*Plano criado por: Orion (Orchestrator) + Architect + Developer + UX Designer*
*Base: Diagnostico completo + analise de 4 agentes paralelos + decisoes do usuario*
