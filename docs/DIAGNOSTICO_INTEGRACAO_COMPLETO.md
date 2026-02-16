# DIAGNOSTICO COMPLETO - Problemas de Integracao e Redundancias

**Data:** 2026-02-16
**Autor:** Orion (AIOS Master Orchestrator)
**Escopo:** Analise completa do codebase admin-convertfy

---

## SUMARIO EXECUTIVO

O sistema admin-convertfy e uma plataforma SaaS robusta (Next.js 15 + Supabase) com 110+ API endpoints, 80+ tabelas, 80+ componentes React e 8+ integracoes externas. A analise revelou **problemas criticos em 5 eixos principais** que explicam por que dados nao aparecem, clientes estao dessincronizados e existem redundancias significativas.

### Problemas Identificados por Gravidade

| Gravidade | Qtd | Descricao |
|-----------|-----|-----------|
| CRITICO | 4 | Clientes admin duplicados, Klaviyo duplicado, credenciais em 2 tabelas, rotas API duplicadas |
| ALTO | 5 | Componentes de report triplicados, paginas Klaviyo duplicadas, constantes duplicadas, inconsistencia rate-limit, fluxo de dados fragmentado |
| MEDIO | 3 | Organizacao de tipos, cache inconsistente, padrao de fetch misto |
| BAIXO | 2 | TODOs pendentes, imports desorganizados |

---

## EIXO 1: POR QUE DADOS NAO APARECEM

### 1.1 Duas Tabelas de Credenciais (Causa Raiz Principal)

**PROBLEMA CRITICO:** Existem DUAS tabelas armazenando credenciais de integracao:

```
TABELA 1: client_stores
  - shopify_access_token (encrypted)
  - shopify_api_key (encrypted)
  - shopify_api_secret (encrypted)
  - klaviyo_api_key (encrypted)
  - klaviyo_private_key (encrypted)
  - klaviyo_public_key (encrypted)
  - ga4_credentials (encrypted)
  - Vinculada a: client_id + org_id

TABELA 2: integrations
  - credentials (JSON blob encrypted)
  - type: shopify | klaviyo | asaas | meta_ads | google_ads | etc
  - Vinculada a: nenhum client_id direto
```

**IMPACTO:**
- Quando credenciais sao salvas via OAuth (Shopify, Meta, Google) → vao para `integrations`
- Quando credenciais sao salvas via formulario de store → vao para `client_stores`
- API routes de report buscam de `client_stores`
- Settings de integracao busca de `integrations`
- **RESULTADO: Uma integracao conectada via OAuth nao aparece nos reports do cliente e vice-versa**

**FLUXO QUEBRADO:**
```
OAuth Shopify → callback → salva em "integrations" (sem client_id)
                                    ↓
Report Shopify → busca em "client_stores" (por client_id) → NAO ENCONTRA → dados vazios!
```

### 1.2 Dois Clientes Admin Supabase

**PROBLEMA:** Existem DUAS implementacoes identicas de `createAdminClient()`:

| Arquivo | Localizacao |
|---------|-------------|
| `src/lib/supabase/admin.ts` | Implementacao standalone (19 linhas) |
| `src/lib/supabase/server.ts` | Implementacao dentro do server.ts (linhas 32-48) |

**IMPACTO:**
- Imports inconsistentes: algumas rotas importam de `admin.ts`, outras de `server.ts`
- Possibilidade de criar multiplas instancias Supabase
- Confusao sobre qual usar

**Diferencas:**

| Aspecto | admin.ts | server.ts |
|---------|----------|-----------|
| Import | `createClient` de `@supabase/supabase-js` | `createClient as createSupabaseClient` |
| Validacao | Checa URL + key | Checa apenas key |
| Deve manter? | NAO - DELETAR | SIM - MANTER |

### 1.3 Client-Side vs Server-Side Inconsistente

**PROBLEMA:** Alguns componentes usam o browser client (sujeito a RLS) para operacoes que deveriam ser feitas via API routes.

**Exemplos:**
- `src/lib/services/notification.service.ts` → usa browser client para operacoes cross-org
- `src/lib/events/publisher.ts` → usa browser client para inserir eventos
- `src/components/clients/client-stores.tsx` → busca credenciais diretamente do Supabase

**IMPACTO:** Dados podem nao aparecer se as politicas RLS bloquearem o acesso, especialmente apos a migracao multi-tenant (org_id).

---

## EIXO 2: POR QUE CLIENTES ESTAO DESSINCRONIZADOS

### 2.1 Credenciais em Lugares Diferentes

```
                     CLIENTE A
                    /         \
     client_stores              integrations
     (Shopify token)           (Shopify OAuth)
     (Klaviyo key)             (Meta OAuth)
                               (Google OAuth)
```

Quando um agente configura uma loja via `client_stores`, as credenciais OAuth (salvas em `integrations`) nao sao vinculadas automaticamente ao cliente.

### 2.2 Multi-Tenancy Recente (org_id)

A migracao `20260216_add_org_id_multitenant.sql` adicionou `org_id` a 13 tabelas. O backfill e feito via chain:

```
clients.owner_id → org_members.profile_id → org_members.org_id
```

**RISCO:** Se um profile pertence a multiplas orgs, o DISTINCT ON escolhe a primeira (por role + data), o que pode associar dados ao org errado.

### 2.3 Portal Users vs Admin Users

Existem dois sistemas de autenticacao paralelos:

| Sistema | Tabela | Auth | Uso |
|---------|--------|------|-----|
| Admin | `profiles` + Supabase Auth | Session-based | Dashboard admin |
| Portal | `client_portal_users` + JWT manual | Token-based | Portal do cliente |

**IMPACTO:** Um cliente cadastrado no portal (`client_portal_users`) nao e automaticamente sincronizado com o sistema de clientes (`clients`). A relacao e via `client_id`, mas a criacao nao e atomica.

---

## EIXO 3: REDUNDANCIAS IDENTIFICADAS

### 3.1 Mapa Completo de Redundancias

```
REDUNDANCIAS CRITICAS (DEVEM SER RESOLVIDAS)
│
├── 1. Supabase Admin Client (2 arquivos identicos)
│   ├── src/lib/supabase/admin.ts          ← DELETAR
│   └── src/lib/supabase/server.ts         ← MANTER
│
├── 2. Klaviyo Service (2 implementacoes)
│   ├── src/lib/integrations/klaviyo-service.ts     ← DEPRECAR (classe, sem retry)
│   └── src/lib/integrations/klaviyo/               ← MANTER (funcional, com retry)
│       ├── client.ts    (HTTP + retry)
│       ├── account.ts   (account ops)
│       ├── metrics.ts   (metric ops)
│       └── index.ts     (barrel export)
│
├── 3. Constantes Klaviyo (definidas 2x)
│   ├── klaviyo-sync.ts:   KLAVIYO_API_URL, RATE_LIMIT_DELAY_MS = 100
│   └── klaviyo/client.ts: KLAVIYO_API_URL, MIN_REQUEST_INTERVAL = 1000
│   └── NOTA: Rate limit inconsistente! (100ms vs 1000ms)
│
├── 4. Rotas API Klaviyo (2 diretorios)
│   ├── src/app/api/klaviyo/              ← LEGADO (5 rotas)
│   │   ├── alerts/route.ts
│   │   ├── campaigns/route.ts           ← DUPLICADA
│   │   ├── compare/route.ts
│   │   ├── rankings/route.ts
│   │   └── sync/route.ts
│   └── src/app/api/integrations/klaviyo/ ← PADRAO (6 rotas)
│       ├── campaigns/route.ts           ← DUPLICADA
│       ├── debug/route.ts
│       ├── flows/route.ts
│       ├── metrics/route.ts
│       ├── report/route.ts
│       └── test/route.ts

REDUNDANCIAS ALTAS (RESOLVER EM BREVE)
│
├── 5. Componentes de Report Klaviyo (3 componentes similares)
│   ├── src/components/clients/client-klaviyo-reports.tsx       (~300 linhas)
│   ├── src/components/clients/klaviyo-fullscreen-report.tsx    (~600 linhas)
│   └── src/components/clients/klaviyo-performance-report.tsx   (~500 linhas)
│   └── TOTAL: ~1400 linhas com >60% codigo duplicado
│
├── 6. Paginas Klaviyo (3 paginas com mesmo padrao)
│   ├── src/app/(dashboard)/klaviyo/campaigns/page.tsx
│   ├── src/app/(dashboard)/klaviyo/flows/page.tsx
│   └── src/app/(dashboard)/klaviyo-metrics/page.tsx
│   └── TOTAL: ~900 linhas com >70% codigo duplicado
│
└── 7. Tabelas de Credenciais (2 tabelas)
    ├── client_stores    (por cliente/loja)
    └── integrations     (por tipo de servico)
    └── IMPACTO: Fonte principal de dados ausentes
```

### 3.2 Estimativa de Impacto

| Redundancia | Linhas Afetadas | Esforco Fix | Risco se Nao Resolver |
|-------------|----------------|-------------|----------------------|
| Supabase admin.ts | ~70 | 1-2h | Medio - imports confusos |
| Klaviyo service vs client | ~600 | 4-6h | Alto - retry inconsistente |
| Constantes duplicadas | ~10 | 30min | Alto - versao API diverge |
| Rotas API duplicadas | ~500 | 6-8h | Alto - comportamento divergente |
| Reports triplicados | ~1400 | 6-8h | Medio - manutencao triplicada |
| Paginas duplicadas | ~900 | 4-6h | Medio - UX inconsistente |
| Credenciais 2 tabelas | Schema | 8-12h | CRITICO - dados ausentes |

---

## EIXO 4: MAPA DE FLUXO DE DADOS

### 4.1 Fluxo Atual (Com Problemas)

```
                            ENTRADA DE CREDENCIAIS
                           /                       \
                  OAuth Flow                   Formulario Manual
                  (Shopify, Meta, Google)      (Shopify, Klaviyo)
                          |                          |
                    callback/route.ts          credentials/route.ts
                          |                          |
                  tabela "integrations"       tabela "client_stores"
                  (sem client_id)            (com client_id)
                          |                          |
                  Settings Page              Report Components
                  (mostra conectado)         (buscam por client_id)
                                                     |
                                             NAO ENCONTRA OAuth creds!
                                                     |
                                              DADOS VAZIOS / ERRO
```

### 4.2 Fluxo Proposto (Corrigido)

```
                            ENTRADA DE CREDENCIAIS
                           /                       \
                  OAuth Flow                   Formulario Manual
                          |                          |
                    callback/route.ts          credentials/route.ts
                          |                          |
                          └──────────┬───────────────┘
                                     |
                           tabela "client_stores"
                           (com client_id + org_id)
                           (credentials encrypted)
                                     |
                          ┌──────────┼──────────────┐
                          |          |              |
                    Report      Settings       Sync Jobs
                    Components  Page           (Klaviyo, Shopify)
```

### 4.3 Mapa de Acesso a Dados por Funcionalidade

```
DASHBOARD ADMIN
├── /api/clients/manage → clients (Supabase server)
├── /api/integrations/shopify/report → client_stores → Shopify API
├── /api/integrations/klaviyo/report → client_stores → Klaviyo API
├── /api/integrations/asaas/* → integrations → Asaas API
└── /api/klaviyo/campaigns → klaviyo_campaigns (cache local)

PORTAL CLIENTE
├── /api/portal/dashboard → client_portal_users → client_stores → APIs
├── /api/portal/stores → client_stores (filtrado por client_id)
├── /api/portal/stores/[id]/report → client_stores → Shopify + Klaviyo
└── /api/portal/invoices → invoices (filtrado por client_id)

SETTINGS
├── /api/integrations/save → integrations (JSON encrypted)
├── /api/integrations/test → testa conexao (sem salvar)
├── /api/integrations/shopify/authorize → OAuth → integrations
└── /api/client-stores/credentials → client_stores (field-level encrypted)
```

---

## EIXO 5: PLANO DE ACAO

### Fase 1: Quick Wins (Dia 1 - 2-3 horas)

| # | Acao | Arquivo | Tipo |
|---|------|---------|------|
| 1.1 | Deletar `admin.ts` duplicado | `src/lib/supabase/admin.ts` | DELETE |
| 1.2 | Atualizar imports que usam admin.ts | Buscar `from.*supabase/admin` | EDIT |
| 1.3 | Unificar constantes Klaviyo | `src/lib/integrations/klaviyo-sync.ts` | EDIT |
| 1.4 | Resolver rate-limit inconsistente (100ms vs 1000ms) | Ambos arquivos | EDIT |

### Fase 2: Unificacao de Credenciais (Dia 2-3 - 8-12 horas)

**ESTA E A FASE MAIS CRITICA - resolve o problema de dados ausentes**

| # | Acao | Detalhes |
|---|------|---------|
| 2.1 | Decidir tabela unica | Manter `client_stores` como fonte unica |
| 2.2 | Migrar dados de `integrations` para `client_stores` | SQL migration |
| 2.3 | Atualizar OAuth callbacks | Salvar em `client_stores` ao inves de `integrations` |
| 2.4 | Atualizar Settings page | Ler/escrever de `client_stores` |
| 2.5 | Manter `integrations` apenas para configs globais (nao por cliente) | Ou remover |
| 2.6 | Criar migration de backfill | Vincular registros existentes de `integrations` a clientes |

### Fase 3: Consolidacao Klaviyo (Dia 4-5 - 8-10 horas)

| # | Acao | Detalhes |
|---|------|---------|
| 3.1 | Deprecar `klaviyo-service.ts` | Substituir por modulos em `/klaviyo/` |
| 3.2 | Migrar rotas de `/api/klaviyo/` para `/api/integrations/klaviyo/` | Merge + delete |
| 3.3 | Unificar 3 componentes de report | Criar `KlaviyoReport` com modos |
| 3.4 | Unificar 3 paginas Klaviyo | Uma pagina com tabs |

### Fase 4: Consistencia de Dados (Dia 6-7 - 6-8 horas)

| # | Acao | Detalhes |
|---|------|---------|
| 4.1 | Auditar todos os componentes client-side que acessam Supabase direto | Migrar para API routes |
| 4.2 | Verificar RLS policies apos migracao multi-tenant | Testar com diferentes roles |
| 4.3 | Padronizar client usage (browser vs server vs admin) | Documentar regras |
| 4.4 | Garantir atomicidade na criacao de portal users | Transacao unica |

### Fase 5: Limpeza e Documentacao (Dia 8 - 4 horas)

| # | Acao | Detalhes |
|---|------|---------|
| 5.1 | Remover arquivos deprecated | admin.ts, klaviyo-service.ts, etc |
| 5.2 | Atualizar CLAUDE.md com padroes corretos | Import paths, conventions |
| 5.3 | Documentar fluxo de dados unificado | Diagrama atualizado |
| 5.4 | Criar testes para fluxos criticos | Credenciais, sync, reports |

---

## INVENTARIO DE TABELAS SUPABASE (80+)

### Tabelas Core
| Tabela | Proposito | Relacoes |
|--------|-----------|----------|
| profiles | Usuarios admin | auth.users (1:1) |
| organizations | Organizacoes/agencias | profiles (n:1) |
| org_members | Membros da org | orgs + profiles |
| clients | Clientes gerenciados | org_id (multi-tenant) |
| client_stores | Lojas + credenciais | client_id + org_id |
| integrations | Credenciais globais | NENHUM client_id! |

### Tabelas Campanha
| Tabela | Proposito |
|--------|-----------|
| campaigns | Campanhas locais |
| campaign_batches | Operacoes em lote |
| campaign_history | Auditoria |
| campaign_alerts | Alertas de threshold |
| campaign_metrics | Metricas agregadas |
| campaign_metrics_history | Historico diario |
| klaviyo_campaigns | Cache Klaviyo |
| klaviyo_sync_jobs | Tracking de sync |
| klaviyo_sync_config | Config de sync |
| klaviyo_flow_metrics | Metricas de flow |
| klaviyo_campaign_metrics | Metricas de campanha |

### Tabelas Pipeline
| Tabela | Proposito |
|--------|-----------|
| pipelines | Definicoes |
| pipeline_stages | Estagios |
| deals | Oportunidades |
| pipeline_members | Acesso |
| pipeline_import_rules | Regras de import |
| pipeline_import_logs | Auditoria |
| contracts | Contratos |
| invoices | Faturas |

### Tabelas Portal
| Tabela | Proposito |
|--------|-----------|
| client_portal_users | Usuarios portal |
| client_portal_sessions | Sessoes |
| client_portal_activity | Auditoria |
| client_notification_preferences | Preferencias |
| client_report_tokens | Tokens compartilhaveis |

### Tabelas Task/Collab
| Tabela | Proposito |
|--------|-----------|
| tasks | Tarefas |
| task_comments | Comentarios |
| task_checklists | Checklists |
| task_history | Historico |
| meetings | Reunioes |
| meeting_participants | Participantes |

### Tabelas Financial
| Tabela | Proposito |
|--------|-----------|
| client_subscriptions | Assinaturas |
| client_charges | Cobrancas |
| wise_reconciliations | Reconciliacao Wise |
| product_costs | Custos de produto |
| store_cost_settings | Config de custos |

### Tabelas Reporting
| Tabela | Proposito |
|--------|-----------|
| client_reports | Reports de cliente |
| order_attribution | Atribuicao de pedidos |
| attribution_summary | Resumo de atribuicao |
| store_top_customers | Top clientes cache |
| dashboard_cache | Cache do dashboard |

### Tabelas Sistema
| Tabela | Proposito |
|--------|-----------|
| rate_limits | Controle de rate |
| rate_limit_config | Config de rate |
| password_reset_audit | Auditoria de senhas |
| events | Sistema de eventos |
| activities | Trail de atividades |
| notifications | Notificacoes |
| automations | Automacoes |
| automation_logs | Logs de automacao |
| settings | Configuracoes |
| custom_fields | Campos customizados |
| tags | Tags/labels |
| email_templates | Templates de email |
| agent_store_access | Controle de acesso |

### Tabelas Onboarding
| Tabela | Proposito |
|--------|-----------|
| client_onboardings | Onboardings |
| client_onboarding_steps | Steps |
| client_briefings | Briefings |
| onboarding_templates | Templates |
| onboarding_template_steps | Steps de template |
| onboarding_history | Historico |
| store_feedback_calls | Feedback |

### Views
| View | Proposito |
|------|-----------|
| v_campaigns_with_metrics | JOIN campanhas + metricas |
| v_unread_alerts | Alertas nao lidos |

---

## INVENTARIO DE API ROUTES (110+)

### Integracao
- 3 rotas Shopify (authorize, test, report)
- 10+ rotas Klaviyo (test, report, campaigns, flows, metrics, debug, alerts, sync, compare, rankings)
- 9 rotas Asaas (webhook, sync, customers, charges, payments, subscriptions, billing, clients-status)
- 2 rotas Meta (authorize, callback)
- 2 rotas Google (authorize, callback)
- 1 rota Google Analytics (report)
- 3 rotas Wise (balances, transactions, reconcile)
- 1 rota WhatsApp (webhook)
- 3 rotas genericas (save, test, delete)

### Admin
- 8 rotas portal-users
- 3 rotas org-members
- 2 rotas organizations
- 2 rotas stores
- 1 rota features
- 1 rota store-access
- 1 rota campaign-batches
- 1 rota encrypt-credentials

### Core
- 8 rotas tasks (CRUD + comments + checklists + reorder)
- 6 rotas campaigns (CRUD + submit/approve/reject + history)
- 4 rotas pipeline (manage + members + deals + import)
- 5 rotas meetings (CRUD)
- 5 rotas onboarding (CRUD + steps + webhook + templates)
- 3 rotas billing (charges + subscriptions + reports)

### Portal
- 9 rotas (dashboard, stores, campaigns, invoices, settings, auth, onboarding)

### Auth
- 5 rotas (login, register, change-password, portal auth, verify)

---

## ARVORE DE DECISAO: QUAL TABELA USAR PARA CREDENCIAIS?

```
Preciso buscar credenciais de integracao?
│
├── E para um cliente especifico?
│   ├── SIM → Buscar em client_stores (por client_id)
│   │         Campos: shopify_access_token, klaviyo_api_key, etc.
│   │
│   └── NAO → Buscar em integrations (por type)
│             Campo: credentials (JSON encrypted)
│
└── PROBLEMA: OAuth salva em integrations SEM client_id
              Reports buscam em client_stores POR client_id
              = DADOS AUSENTES
```

---

## CONCLUSAO

Os problemas reportados (dados ausentes, clientes dessincronizados, redundancias) tem **uma causa raiz principal**: a dualidade entre `client_stores` e `integrations` para armazenar credenciais. Isso e agravado por:

1. **Duas implementacoes do admin client Supabase** → imports inconsistentes
2. **Duas implementacoes do Klaviyo service** → comportamento divergente
3. **Dois diretorios de API routes para Klaviyo** → confusao sobre qual usar
4. **Tres componentes de report quase identicos** → manutencao triplicada
5. **Tres paginas Klaviyo com mesmo padrao** → codigo duplicado

A resolucao completa requer **~35-45 horas de trabalho**, divididas em 5 fases, com a Fase 2 (unificacao de credenciais) sendo a mais critica e com maior impacto nos problemas reportados.

---

*Documento gerado por Orion, AIOS Master Orchestrator*
*Analise baseada em varredura completa do codebase em 2026-02-16*
