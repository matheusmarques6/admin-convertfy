# Admin Convertfy — Fixes, Melhorias & Integrações

> Guia operacional para agentes. Cada item tem: localização exata, diagnóstico, e instrução de fix.
> Atualizado: 2026-02-19

---

## Índice

1. [Arquitetura Geral](#1-arquitetura-geral)
2. [Dashboard — Fixes](#2-dashboard--fixes)
3. [Clientes — Fixes](#3-clientes--fixes)
4. [Lojas — Fixes](#4-lojas--fixes)
5. [Campanhas — Fixes](#5-campanhas--fixes)
6. [Reuniões — Fixes](#6-reuniões--fixes)
7. [Board — Fixes](#7-board--fixes)
8. [Financeiro — Fixes](#8-financeiro--fixes)
9. [Relatórios — Fixes](#9-relatórios--fixes)
10. [Integrações entre Sistemas](#10-integrações-entre-sistemas)
11. [Padrões do Projeto (para agentes)](#11-padrões-do-projeto-para-agentes)

---

## 1. Arquitetura Geral

### Stack
- **Framework**: Next.js 15 App Router
- **Database**: Supabase (PostgreSQL + RLS)
- **Multi-tenant**: via `org_id` em todas as tabelas
- **UI**: shadcn/ui + Tailwind CSS (dark mode via `next-themes`, class-based)
- **State**: Zustand para client state
- **Auth**: Supabase Auth (user RLS via `createClient()`, service role via `createAdminClient()`)

### Estrutura de Diretórios (Relevante)
```
src/
├── app/
│   ├── (dashboard)/        # Admin panel (server + client components)
│   │   ├── dashboard/      # Main dashboard
│   │   ├── clients/        # Client management
│   │   ├── stores/         # Store control panel
│   │   ├── campaigns/      # Campaign management
│   │   ├── meetings/       # Meetings
│   │   ├── board/          # Kanban + Calendar
│   │   ├── onboarding/     # Onboarding kanban (admin view)
│   │   ├── reports/        # Reports list
│   │   ├── financial/      # Financial (Charges, Subscriptions, Wise)
│   │   ├── team/           # Team management
│   │   └── pipeline/       # Sales pipeline
│   ├── (auth)/             # Login/register
│   ├── portal/             # Client portal
│   │   ├── onboarding/     # Client onboarding view
│   │   ├── stores/         # Client store config
│   │   └── dashboard/      # Client dashboard
│   └── api/                # API routes
│       ├── integrations/   # Asaas, Klaviyo, Shopify, Wise
│       ├── clients/        # Client CRUD + performance
│       ├── campaigns/      # Campaign CRUD + sync
│       ├── stores/         # Store control + feedback
│       ├── meetings/       # Meeting CRUD
│       ├── onboarding/     # Onboarding management
│       ├── client-charges/ # Local charges
│       ├── client-subscriptions/ # Local subscriptions
│       ├── client-reports/ # Reports
│       └── portal/         # Portal-specific APIs
├── components/
│   ├── dashboard/          # billing-metrics, charts, alerts, quick-actions, etc.
│   ├── clients/            # client-overview, client-stores, client-financial, etc.
│   ├── stores/             # store-control-panel, store-detail-tabs (órfão)
│   ├── campaigns/          # campaign-modal, campaign-form-modal, campaigns-list-view
│   ├── onboarding/         # onboarding-kanban
│   ├── board/              # task-board, task-board-with-calendar
│   ├── meetings/           # meeting-calendar, meeting-dialog
│   ├── reports/            # reports-list
│   ├── financial/          # charges-manager, subscriptions-manager, wise-reconciliation
│   └── team/               # team-table, team-member-dialog
├── lib/
│   ├── services/           # credentials.service, client.service
│   ├── integrations/       # klaviyo/, shopify/ (report-summary, report)
│   ├── crypto.ts           # AES-256-GCM encryption
│   └── supabase/           # createClient, createAdminClient
└── types/                  # index.ts, campaign.ts
```

### Padrões Críticos
- **Credenciais**: `getStoreCredentials(storeId)` em `src/lib/services/credentials.service.ts`
- **Error Handling**: `errorResponse(request, error, ctx)` + `AppError` em API routes
- **Encryption**: AES-256-GCM, prefix `enc:v1:`, via `@/lib/crypto`
- **Data Sources**: `client_stores` = dados per-loja. `integrations` = config org-level (Asaas, Wise)

---

## 2. Dashboard — Fixes

### FIX-DASH-01: MRR não mostra dados
**Arquivo**: `src/app/(dashboard)/dashboard/page.tsx` (função `getDashboardData`)
**Componente**: `src/components/dashboard/billing-metrics.tsx`
**Diagnóstico**: MRR puxa da tabela `contracts` (status=active, soma `monthly_value`). Se não mostra dados, é porque:
1. Não há contratos ativos na tabela `contracts`
2. O campo `monthly_value` está NULL ou 0
**Ação**:
- Verificar se existem registros em `contracts` com `status = 'active'` e `monthly_value > 0`
- Se a tabela existir mas estiver vazia, o problema é upstream (contratos nunca são criados — ver FIX-CLI-03)
- Se MRR=0, o componente mostra "R$ 0,00" corretamente — o fix é garantir que contratos sejam criados

### FIX-DASH-02: Resumo financeiro não funciona
**Arquivo**: `src/components/dashboard/billing-metrics.tsx`
**API**: `GET /api/integrations/asaas/billing?period={period}`
**Arquivo API**: `src/app/api/integrations/asaas/billing/route.ts`
**Diagnóstico**: O billing metrics depende de integração Asaas ativa. Se `connected: false`, mostra "Conecte a Asaas".
**Ação**:
- Verificar se existe registro em tabela `integrations` com `type = 'asaas'`, `is_active = true`, e credenciais válidas
- A API decrypta credenciais e chama Asaas — se credenciais inválidas, falha silenciosamente
- Adicionar melhor feedback de erro quando Asaas retorna 401/403 (hoje mostra genérico)

### FIX-DASH-03: Cor do botão "Novo Cliente"
**Arquivo 1**: `src/components/dashboard/quick-actions.tsx` (linha ~20-30)
**Arquivo 2**: `src/app/(dashboard)/clients/page.tsx` (linha ~65-70)
**Diagnóstico**: Usa `variant="default"` que pega a cor primary do tema
**Ação**: Mudar para classe/variant desejada. Exemplos:
```tsx
// Para verde:
<Button className="bg-green-600 hover:bg-green-700 text-white">
// Para accent customizado:
<Button variant="default" className="bg-[#COR_DESEJADA]">
```

### FIX-DASH-04: "Resultado Total" (Convertfy Revenue) — NÃO EXISTE
**Diagnóstico**: Não há componente que some o `conversion_value` do Klaviyo de todas as lojas para mostrar quanto a Convertfy gerou.
**O que existe**: "Total Período" em billing-metrics mostra cobranças Asaas (receita DA Convertfy), não receita GERADA pela Convertfy para clientes.
**Ação**: Criar novo componente — ver `SCALE-ROADMAP.md` seção "Dashboard Resultado Total"

---

## 3. Clientes — Fixes

### FIX-CLI-01: Badge de pendentes no botão Import Asaas
**Arquivo**: `src/components/clients/import-asaas-button.tsx`
**Diagnóstico**: O dialog mostra stats (X de Y sincronizados), mas o botão externo **não tem badge/bolinha** indicando pendências.
**Ação**:
- No `import-asaas-button.tsx`, o componente já faz fetch de stats ao abrir dialog
- Mover o fetch para o mount do botão (ou parent) e adicionar badge:
```tsx
// Adicionar ao botão:
<Button variant="outline" className="relative">
  <Upload className="h-4 w-4 mr-2" />
  Importar do Asaas
  {pendingCount > 0 && (
    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
      {pendingCount}
    </span>
  )}
</Button>
```
- Usar SWR ou useEffect para carregar count sem abrir dialog
- API: `GET /api/integrations/asaas/customers` retorna `asaasCustomers` e `syncedClients` — a diferença é o pending count

### FIX-CLI-02: Botão "Configurar integração" em Visão Geral
**Arquivo**: `src/components/clients/client-performance-review.tsx` (componente `ClientPerformanceKPIs`)
**Diagnóstico**: Aparece em estado de erro quando não há lojas configuradas. O botão pode não estar roteando corretamente.
**Ação**:
- Localizar o handler do botão "Configurar Integrações"
- Verificar se redireciona para a tab correta: `/clients/[id]?tab=stores` ou abre dialog de add store
- Testar o fluxo: clicar → deve levar à config de lojas do cliente

### FIX-CLI-03: "Novo Contrato" não funciona
**Arquivo**: `src/components/clients/client-contracts.tsx`
**Diagnóstico**: O botão "Novo Contrato" mostra toast "Em desenvolvimento". **Criação de contratos NÃO está implementada.**
**Ação** (implementar):
1. Criar dialog/form com campos: plan_name, monthly_value, start_date, end_date, notes, document_url
2. API: `POST /api/client-contracts` (criar nova rota ou usar existente se houver)
3. Tabela: `contracts` — campos existem, só falta a UI + rota de criação
4. Ao criar contrato, o MRR do dashboard será atualizado automaticamente

### FIX-CLI-04: Loading states incompletos
**Arquivo**: `src/components/clients/client-overview.tsx`
**Arquivo**: `src/components/clients/client-performance-review.tsx`
**Diagnóstico**: `KPISkeletons` e `TableSkeleton` existem para KPIs. Mas os cards de overview (contato, financeiro, gestão) não têm skeleton individual — usam spinner genérico.
**Ação**:
- Adicionar `Skeleton` components (de shadcn/ui) em cada card enquanto dados carregam
- Especialmente no card "Resumo Financeiro" que espera dados Asaas
- Padrão a seguir: `src/components/ui/skeleton.tsx` já existe

### FIX-CLI-05: Erro Klaviyo no Overview vs sucesso no Test
**Arquivo Overview**: `src/components/clients/client-performance-review.tsx` → usa `/api/clients/[id]/performance`
**Arquivo Test**: `src/components/clients/client-stores.tsx` → usa `/api/integrations/klaviyo/test`
**Diagnóstico**: São testes DIFERENTES:
- **Test** (Lojas): Só valida autenticação da API key — `GET /lists/` com 200 = OK
- **Overview**: Tenta buscar **métricas completas** (campanhas, flows, revenue) — pode falhar por:
  - Scopes insuficientes na API key
  - Nenhum dado de campanha/flow na conta
  - Store sem `klaviyo_list_id` configurado
**Ação**:
- No endpoint `/api/clients/[id]/performance`, melhorar o error message:
  - Se 401/403 → "API key sem permissão para métricas"
  - Se 200 mas vazio → "Conta Klaviyo sem dados de campanha/flow"
  - Se sem store selecionada → "Selecione uma loja com Klaviyo configurado"
- No component, distinguir entre "sem conexão" e "sem dados"

---

## 4. Lojas — Fixes

### FIX-STO-01: "Ver Relatório" link errado
**Arquivo**: `src/components/stores/store-control-panel.tsx` (dialog "Configurações da Loja")
**Diagnóstico**: O link "Ver Relatório" navega para `/clients/[client_id]?tab=klaviyo`. Deveria levar ao último relatório gerado da loja.
**Ação**:
- Buscar último relatório da loja: `SELECT * FROM client_reports WHERE store_id = ? ORDER BY created_at DESC LIMIT 1`
- Se existe relatório: navegar para `/reports/[report_id]` ou `/clients/[client_id]?tab=report&store_id=[store_id]`
- Se não existe: mostrar toast "Nenhum relatório gerado para esta loja" com botão "Gerar agora"

### FIX-STO-02: "Última Call" desconectada de Reuniões
**Arquivo**: `src/components/stores/store-control-panel.tsx`
**Arquivo API**: `src/app/api/stores/control/route.ts`
**Diagnóstico**: `last_feedback_date` vem da tabela `store_feedback_calls` (sistema de feedback). As reuniões ficam na tabela `meetings`. São **dois sistemas separados**.
**Ação** (integrar):
- Opção A (simples): Na coluna "Última Call", buscar o mais recente entre `store_feedback_calls.conducted_at` e `meetings.scheduled_at` (WHERE client_id matches AND status=completed)
- Opção B (completa): Quando uma reunião é marcada como concluída e está atrelada a uma loja, criar automaticamente um `store_feedback_call`
- Recomendado: Opção A para fix rápido, Opção B na fase de escala

### FIX-STO-03: Página `/stores/[id]` não existe
**Arquivo existente (órfão)**: `src/components/stores/store-detail-tabs.tsx`
**Diagnóstico**: O componente `store-detail-tabs` tem tabs (Overview, Campaigns, Flows, Report, Settings) mas **não há página** que o renderize.
**Ação**:
- Criar `src/app/(dashboard)/stores/[id]/page.tsx`
- Importar e renderizar `StoreDetailTabs` com o store_id do params
- Buscar dados da loja server-side
- Atualizar links no `store-control-panel.tsx` para apontar para `/stores/[id]`

---

## 5. Campanhas — Fixes

### FIX-CAM-01: Performance sem dados reais (FALSO ALARME)
**Diagnóstico**: A performance **TEM dados reais** do Klaviyo. Se mostra vazio, é porque:
1. Nenhuma loja selecionada no filtro
2. A loja não tem campanhas no Klaviyo
3. Credenciais Klaviyo inválidas ou sem scopes
**Ação**: Melhorar UX de estado vazio — mostrar motivo específico em vez de tabela vazia

### FIX-CAM-02: Approval workflow sem UI
**Arquivo**: `src/components/campaigns/campaign-form-modal.tsx`
**Diagnóstico**: Campos `submitted_by`, `reviewed_by`, `rejection_reason`, `approval_notes` existem no banco mas sem UI.
**Ação**: Para escala — ver `SCALE-ROADMAP.md`

---

## 6. Reuniões — Fixes

### FIX-MTG-01: UI limitada de criação
**Arquivo**: `src/app/(dashboard)/meetings/page.tsx`
**Arquivo Component**: `src/components/meetings/meetings-page-client.tsx`
**Diagnóstico**: Página server-rendered mostra lista mas creation dialog pode estar incompleto.
**Ação**:
- Verificar se `meeting-dialog.tsx` tem form completo de criação
- Garantir campos: title, client_id, store (exibir loja + nome do cliente), scheduled_at, duration, meeting_url, participants

### FIX-MTG-02: Marcar como concluída + anexar
**Arquivo**: `src/components/meetings/meeting-dialog.tsx`
**Diagnóstico**: Status pode ser mudado para `completed`, mas não há UI dedicada para "concluir reunião" com campo de notas/anexo que aparece para os participantes.
**Ação**:
- Adicionar botão "Concluir Reunião" na visualização do meeting
- Ao clicar: abrir dialog com textarea para notas/resumo + upload de anexos
- Ao salvar: `PATCH /api/meetings` com status=completed + notes
- Notificar participantes (para escala, ver SCALE-ROADMAP)

---

## 7. Board — Fixes

### FIX-BRD-01: Sem criação de tasks visível
**Arquivo**: `src/app/(dashboard)/board/page.tsx`
**Arquivo**: `src/components/board/task-board-with-calendar.tsx`
**Diagnóstico**: O board mostra tasks existentes com drag-drop, mas pode não ter botão visível "Nova Task".
**Ação**: Verificar se há botão de criação. Se não, adicionar "+" em cada coluna do kanban ou botão global.

### FIX-BRD-02: Calendário sem modos de visualização
**Arquivo**: `src/components/board/board-calendar-view.tsx`
**Diagnóstico**: Sem toggle mensal/semanal/diário.
**Ação**: Para escala — ver `SCALE-ROADMAP.md`

---

## 8. Financeiro — Fixes

### FIX-FIN-01: Performance de carregamento
**Arquivo**: `src/app/(dashboard)/financial/page.tsx`
**Componentes**: `charges-manager.tsx`, `subscriptions-manager.tsx`
**Diagnóstico**: Carrega tudo upfront via useEffect sem paginação. Hooks `useAsaasCharges` fazem múltiplas chamadas API.
**Ação**:
1. Implementar paginação no `charges-manager` (limit=50 por página)
2. Adicionar skeleton loading enquanto dados carregam
3. Usar SWR com `revalidateOnFocus: false` para evitar refetch desnecessário
4. Cachear dados de charges no server (TTL 5min, similar ao billing endpoint)
5. Lazy load tabs — só carregar dados da tab ativa

---

## 9. Relatórios — Fixes

### FIX-REP-01: Poucos dados e UI fraca
**Arquivo**: `src/app/(dashboard)/reports/page.tsx`
**Componente**: `src/components/reports/reports-list.tsx`
**Diagnóstico**: Lista mostra relatórios com campos básicos. Report data JSON tem dados ricos (revenue, email performance, campaigns, flows) mas a UI não os exibe completamente.
**Ação**:
1. Criar componente `report-detail.tsx` que renderize todo o `report_data` JSON
2. Seções: Revenue Overview, Email Performance, Top Campaigns, Top Flows, Account Health
3. Usar charts (recharts, já no projeto) para visualizar métricas
4. Adicionar export PDF/PNG (usar html2canvas ou similar)

### FIX-REP-02: Sem UI de geração manual
**Diagnóstico**: Existe cron route `/api/cron/sync-reports` mas sem botão "Gerar Relatório" na UI.
**Ação**:
- Adicionar botão "Gerar Relatório" na lista de stores pendentes
- Chamar endpoint de geração passando store_id e período
- Mostrar progresso enquanto gera (loading state)

---

## 10. Integrações entre Sistemas

### INT-01: Reuniões ↔ Lojas (Última Call)
**Status**: DESCONECTADOS
**Problema**: `store_feedback_calls` (feedback de loja) e `meetings` (reuniões) são tabelas separadas sem link.
**Solução**:
- Adicionar campo `store_id` na tabela `meetings` (nullable)
- Quando reunião tem store_id e é concluída → atualizar `client_stores.last_feedback_date`
- No `store-control-panel`, buscar MAX entre feedback_calls e meetings por store

### INT-02: Onboarding → Board
**Status**: DESCONECTADOS
**Problema**: Quando um novo onboarding é criado, deveria gerar tasks no board do agente responsável.
**Solução**:
- Trigger: Quando `client_onboardings.status` muda para `in_progress`
- Action: Criar task no `tasks` table com `type='onboarding'`, `assigned_to=onboarding.assigned_to`
- Display: Board já suporta `task_type='onboarding'`

### INT-03: Campanhas → Board
**Status**: DESCONECTADOS
**Problema**: Campanhas agendadas não geram tasks no board.
**Solução**:
- Trigger: Quando campanha status muda para `scheduled`
- Action: Criar task com `type='campaign'`, deadline = `scheduled_date`
- Assign: ao criador da campanha ou ao responsável pela loja

### INT-04: Reuniões → Board
**Status**: PARCIAL (calendar mostra meetings)
**Problema**: Reuniões aparecem no calendário do board mas não como tasks no kanban.
**Solução**:
- Ao criar reunião, opcionalmente criar task `type='meeting'` no board
- Ou manter como está (calendar integration) e não duplicar

### INT-05: Relatórios → Lojas (Ver Relatório)
**Status**: LINK ERRADO
**Problema**: "Ver Relatório" nas configs da loja leva para tab errada.
**Solução**: Ver FIX-STO-01

### INT-06: Clientes → Portal (Visibilidade de Reuniões)
**Status**: PARCIAL
**Problema**: Portal deveria mostrar reuniões atreladas ao cliente. Existe mas UX é limitada.
**Solução**:
- Portal meetings page: filtrar `meetings` WHERE `client_id = current_client.id`
- Mostrar status, notas pós-reunião, próxima reunião agendada

---

## 11. Padrões do Projeto (para agentes)

### Criar nova API Route
```typescript
// src/app/api/{resource}/route.ts
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { errorResponse } from "@/lib/api-utils"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // ... lógica
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorResponse(request, error, "resource.get")
  }
}
```

### Criar novo componente de página
```typescript
// src/app/(dashboard)/{page}/page.tsx
import { createClient } from "@/lib/supabase/server"
import { PagePermissionWrapper } from "@/components/permission-wrapper"

export default async function PageName() {
  const supabase = await createClient()
  // fetch data server-side
  return (
    <PagePermissionWrapper requiredFeatures={["feature_name"]}>
      {/* content */}
    </PagePermissionWrapper>
  )
}
```

### Padrão de credenciais encriptadas
```typescript
import { getStoreCredentials } from "@/lib/services/credentials.service"

const creds = await getStoreCredentials(storeId) // Retorna decrypted
// creds.klaviyo_private_key → string limpa
// creds.shopify_access_token → string limpa
```

### Padrão de client component com SWR
```typescript
"use client"
import useSWR from "swr"
const fetcher = (url: string) => fetch(url).then(r => r.json())

function MyComponent({ id }: { id: string }) {
  const { data, error, isLoading } = useSWR(`/api/resource?id=${id}`, fetcher)
  if (isLoading) return <Skeleton />
  if (error) return <ErrorState />
  return <div>{/* render data */}</div>
}
```

### Tabelas Supabase relevantes
| Tabela | Uso | Campos chave |
|--------|-----|--------------|
| `clients` | Clientes | id, name, company, status, health_score, owner_id, org_id |
| `client_stores` | Lojas per-client | id, client_id, store_name, platform, klaviyo_*, shopify_*, feedback_* |
| `contracts` | Contratos | id, client_id, plan_name, monthly_value, status, start_date, end_date |
| `campaigns` | Campanhas | id, store_id, client_id, name, status, scheduled_date, channel |
| `meetings` | Reuniões | id, client_id, user_id, title, scheduled_at, status, notes |
| `meeting_participants` | Participantes | meeting_id, participant_id, participant_type, response_status |
| `tasks` | Tasks do Board | id, title, status, assigned_to, client_id, store_id, task_type |
| `client_onboardings` | Onboarding | id, client_id, store_id, status, progress_percent, assigned_to |
| `client_onboarding_steps` | Steps | id, onboarding_id, step_name, status, category |
| `store_feedback_calls` | Feedback calls | id, store_id, conducted_by, conducted_at, notes |
| `client_reports` | Relatórios | id, client_id, store_id, report_data (JSON), status |
| `client_charges` | Cobranças locais | id, client_id, amount, status, payment_method |
| `client_subscriptions` | Assinaturas | id, client_id, name, value, cycle, status |
| `integrations` | Config org-level | id, org_id, type (asaas/wise), credentials, is_active |
| `org_members` | Equipe | id, org_id, role, profile_id |
| `org_member_features` | Permissões | org_member_id, feature_key, enabled |
| `activities` | Log de atividades | id, type, client_id, profile_id, metadata |

---

## Prioridade de Execução Sugerida

### Sprint 1 — Quick Wins (1-2 dias)
1. FIX-DASH-03 — Cor do botão (5 min)
2. FIX-CLI-01 — Badge pendentes Asaas (30 min)
3. FIX-STO-01 — Link "Ver Relatório" (30 min)
4. FIX-CLI-04 — Loading states (1h)
5. FIX-CLI-05 — Mensagens de erro Klaviyo (1h)

### Sprint 2 — Funcionalidades Quebradas (2-3 dias)
1. FIX-CLI-03 — Novo Contrato (criar form + API) (4h)
2. FIX-DASH-01 — MRR (validar dados, depende de FIX-CLI-03) (1h)
3. FIX-DASH-02 — Resumo financeiro erro handling (2h)
4. FIX-STO-03 — Criar página /stores/[id] (3h)
5. FIX-FIN-01 — Performance financeiro (3h)

### Sprint 3 — Integrações (2-3 dias)
1. INT-01 — Reuniões ↔ Lojas (3h)
2. INT-02 — Onboarding → Board (2h)
3. INT-05 — Relatórios → Lojas (1h, depende de FIX-STO-01)
4. FIX-REP-01 — Melhorar UI relatórios (4h)
5. FIX-REP-02 — Botão gerar relatório (2h)

### Sprint 4 — Polish (1-2 dias)
1. FIX-MTG-01 — Meeting creation UI (2h)
2. FIX-MTG-02 — Concluir reunião + anexar (3h)
3. FIX-BRD-01 — Criação de tasks no board (1h)
4. FIX-CAM-01 — Empty states campanhas (1h)

---

*Documento gerado por Orion (AIOS Master) — 2026-02-19*
