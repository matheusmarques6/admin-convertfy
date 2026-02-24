# Cadastro Rapido de Lojas - Brownfield Enhancement PRD

> **Projeto:** admin-convertfy (Ana Lojas)
> **Tipo:** New Feature Addition (Brownfield Enhancement)
> **Solicitante:** COO
> **Data:** 2026-02-24
> **Versao:** 1.0
> **Status:** Draft

---

## Change Log

| Change | Date | Version | Description | Author |
|---|---|---|---|---|
| PRD criado | 2026-02-24 | 1.0 | Versao inicial do PRD | Orion/COO |
| Revisao arquitetural | 2026-02-24 | 1.1 | 4 problemas criticos encontrados (C1-C4), 5 decisoes arquiteturais (AD1-AD5), 3 novos riscos (R9-R11), stories atualizadas | Aria (Architect) |
| Elicitacao avancada | 2026-02-24 | 1.2 | 5 gaps resolvidos (G1-G5): permissao desvinculacao via can_edit, qualquer membro da org no MVP, client_onboardings nullable, auto-criar agent_store_access, StoreDetailTabs null safety | Orion (Elicitation) |

---

## 1. Intro Project Analysis and Context

### 1.1 Analysis Source

Analise IDE-based (fresh analysis) do projeto `admin-convertfy`.

### 1.2 Current Project State

O **admin-convertfy** e um painel administrativo para gestao de clientes e suas lojas de e-commerce. Construido com **Next.js 15 + React 19 + Supabase (PostgreSQL)**, usando App Router. O sistema gerencia integracoes com Shopify, Klaviyo, Meta Ads, GA4 e outros.

A entidade central e `client_stores`, que atualmente **obrigatoriamente** pertence a um `client` via FK `client_id NOT NULL` com `ON DELETE CASCADE`.

### 1.3 Available Documentation

- [x] Tech Stack Documentation
- [x] Source Tree/Architecture
- [ ] Coding Standards (parcial)
- [x] API Documentation (parcial - routes existem, docs formais nao)
- [x] External API Documentation (Shopify, Klaviyo, Meta, GA4)
- [ ] UX/UI Guidelines
- [ ] Technical Debt Documentation

### 1.4 Enhancement Scope

- **Enhancement Type:** New Feature Addition
- **Impact Assessment:** Moderate Impact (some existing code changes)

**Descricao:** Permitir o cadastro de lojas de forma independente (sem vinculo obrigatorio a um cliente), com possibilidade de associacao posterior. Isso requer tornar o `client_id` nullable na tabela `client_stores` e adaptar UI, API e regras de negocio.

### 1.5 Impact Assessment

| Area | Impacto | Detalhe |
|---|---|---|
| **Database** | Medio | `client_stores.client_id` precisa ser `nullable`, ajustar RLS |
| **RLS Policies** | Medio | Policies atuais filtram por `client_id` — precisam tratar `NULL` |
| **API Routes** | Medio | `/api/client-stores/credentials` POST — `client_id` opcional |
| **Services** | Baixo | `credentials.service.ts` nao depende diretamente de `client_id` |
| **UI - Stores** | Medio | Novo fluxo de cadastro rapido, indicador visual avulsa/vinculada |
| **UI - Clients** | Baixo | Tab "Lojas" em `/clients/[id]` continua funcionando |
| **Tabelas satelite** | Baixo | `campaigns`, `store_briefings`, etc. usam `store_id`, nao `client_id` |

### 1.6 Goals

- Permitir cadastro rapido de lojas sem vinculo obrigatorio a cliente
- Manter compatibilidade total com lojas ja vinculadas a clientes
- Possibilitar vinculacao/desvinculacao posterior de loja a cliente
- Acelerar o processo de onboarding de novas lojas na plataforma
- Dar visibilidade as lojas avulsas para gestao comercial

### 1.7 Background Context

O COO identificou que o processo atual de cadastro de lojas e atrelado ao cadastro de cliente, o que cria um gargalo operacional. Muitas vezes a equipe comercial precisa cadastrar uma loja rapidamente — para configurar integracoes, testar, ou iniciar um pre-onboarding — antes de ter todos os dados do cliente formalizados.

A necessidade e desburocratizar esse processo, permitindo que a loja exista de forma independente e seja associada a um cliente quando o relacionamento comercial estiver definido.

### 1.8 Stakeholder Analysis

| Stakeholder | Papel | Impacto | Interesse |
|---|---|---|---|
| **COO** | Sponsor/Solicitante | Alto | Alto |
| **Equipe Comercial** | Usuario principal | Alto | Alto |
| **Equipe de Onboarding** | Usuario secundario | Medio | Alto |
| **Account Managers** | Usuario de gestao | Medio | Medio |
| **Admins (TI)** | Operacao tecnica | Medio | Medio |
| **Clientes (Portal)** | Usuario final indireto | Baixo | Baixo |
| **Integracoes Externas** | Sistemas externos | Baixo | Nulo |

### 1.9 Scope Decisions (COO Validated)

| # | Decisao | Resposta |
|---|---|---|
| Q1 | Loja avulsa com integracoes ativas? | Sim, funcionalidade completa |
| Q2 | Loja avulsa com campanhas? | Sim |
| Q3 | Desvinculacao necessaria? | Sim, com nivel de autorizacao |
| Q4 | Campos obrigatorios cadastro rapido? | Nome + Plataforma + URL |
| Q5 | Quem pode cadastrar avulsas? | Admins + Comercial |
| Q6 | Quem pode vincular? | Admins + quem tem acesso a loja |
| Q7 | Alerta para avulsas antigas? | Sim, mesmo prazo das outras |
| Q8 | Avulsas em relatorios? | Sim, secao separada |
| Q9 | Portal do cliente mostra avulsas? | Nunca |
| Q10 | Existem lojas fake hoje? | Nao |

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requisito |
|---|---|
| **FR1** | O sistema deve permitir o cadastro de lojas sem vinculo a cliente, exigindo apenas: nome da loja, plataforma e URL |
| **FR2** | Lojas avulsas devem ter funcionalidade completa: integracoes (Shopify, Klaviyo, Meta, GA4), campanhas, briefings e onboarding |
| **FR3** | O sistema deve permitir vincular uma loja avulsa a um cliente existente, com busca e selecao de cliente |
| **FR4** | O sistema deve permitir desvincular uma loja de um cliente, retornando ao estado avulso, restrito a usuarios com nivel de autorizacao adequado |
| **FR5** | A listagem de lojas deve exibir indicador visual distinguindo lojas "Avulsas" de lojas "Vinculadas", com o nome do cliente quando vinculada |
| **FR6** | A listagem de lojas deve permitir filtrar por: Todas, Avulsas, Vinculadas |
| **FR7** | Ao vincular uma loja, o sistema deve validar se os campos obrigatorios para operacao completa estao preenchidos, solicitando o preenchimento se necessario |
| **FR8** | O sistema deve gerar alertas para lojas avulsas seguindo o mesmo prazo/regras de alerta das lojas vinculadas |
| **FR9** | Relatorios gerais devem exibir lojas avulsas em secao separada ("Lojas Avulsas"), nao misturadas com lojas vinculadas |
| **FR10** | O portal do cliente nao deve exibir lojas avulsas — apenas lojas vinculadas ao cliente logado |
| **FR11** | A pagina de detalhe da loja deve exibir o estado de vinculo (avulsa ou cliente X) com acao contextual (vincular ou desvincular) |

### 2.2 Non-Functional Requirements

| ID | Requisito |
|---|---|
| **NFR1** | A alteracao do schema (`client_id` nullable) deve ser feita via migration incremental sem downtime e sem afetar lojas existentes |
| **NFR2** | O cadastro rapido deve ser completavel em menos de 30 segundos (3 campos + submit) |
| **NFR3** | A operacao de vinculo/desvinculo deve ser atomica — sem estado intermediario |
| **NFR4** | O sistema deve manter audit trail de todas as operacoes de vinculo e desvinculo (quem, quando, de/para qual cliente) |
| **NFR5** | As RLS policies devem ser adaptadas para suportar `client_id = NULL` sem comprometer a seguranca multi-tenant |
| **NFR6** | Performance das queries de listagem nao deve degradar com a adicao do filtro avulsa/vinculada (indice em `client_id`) |

### 2.3 Compatibility Requirements

| ID | Requisito |
|---|---|
| **CR1** | Lojas existentes vinculadas a clientes devem continuar funcionando sem nenhuma alteracao de comportamento |
| **CR2** | O schema da tabela `client_stores` deve manter a FK `REFERENCES clients(id) ON DELETE CASCADE` — apenas tornar nullable |
| **CR3** | A UI existente do tab "Lojas" em `/clients/[id]` deve continuar funcionando (filtra por `client_id = clientId`) |
| **CR4** | Todas as integracoes existentes (Shopify, Klaviyo, Meta, GA4) devem funcionar identicamente para lojas avulsas e vinculadas |
| **CR5** | O endpoint `PUT /api/client-stores/credentials` deve continuar funcionando sem mudancas para lojas ja existentes |
| **CR6** | O `store_onboarding_data` e tabelas satelite que usam `store_id` nao devem ser afetados |

---

## 3. User Interface Enhancement Goals

### 3.1 Integration with Existing UI

A UI atual segue o padrao **shadcn/ui + Radix + Tailwind CSS**. Todos os novos componentes seguirao estes padroes:

- Componentes de tabela com filtros (padrao `clients-table.tsx`)
- Tabs com badges de contagem (padrao `stores-page-tabs.tsx`)
- Modais/Drawers para acoes contextuais
- Forms com `react-hook-form` + `Zod` validation

### 3.2 Modified/New Screens

| # | Tela | Tipo | Descricao |
|---|---|---|---|
| T1 | `/stores` — Lista de Lojas | Modificada | Botao [+ Cadastro Rapido], filtro Avulsas/Vinculadas, badge de status, botao [Vincular] |
| T2 | `/stores/[id]` — Detalhe da Loja | Modificada | Estado de vinculo no header, acao [Vincular] ou [Desvincular] |
| T3 | Quick Store Form | Novo componente | Form com 3 campos (nome, plataforma, URL) em modal |
| T4 | Store Link Modal | Novo componente | Modal com busca de clientes (autocomplete) + confirmacao |
| T5 | `/stores` — Alertas | Modificada | Incluir alertas de lojas avulsas |

### 3.3 UI Consistency Requirements

| Regra | Detalhe |
|---|---|
| Badges | `Badge` component: variante `secondary` para "Avulsa", variante `default` para "Vinculada: Cliente X" |
| Filtros | Padrao de filtro de `clients-table.tsx` (dropdown/toggle) |
| Form rapido | Mesmo estilo de `store-form-tab.tsx` com `react-hook-form` + Zod |
| Modal de vinculo | Dialog do Radix (padrao existente) |
| Acoes destrutivas | Desvincular usa confirmacao com texto vermelho (padrao de delete) |
| Responsividade | Mobile-first com Tailwind breakpoints |

### 3.4 Wireframes

#### Lista de Lojas (Modificada)

```
+-----------------------------------------------------------+
|  Lojas                          [+ Cadastro Rapido] [+]   |
|-----------------------------------------------------------|
|  Filtro: [Todas v]  [Buscar...]                           |
|          [Todas] [Avulsas (3)] [Vinculadas (12)]          |
|-----------------------------------------------------------|
|                                                           |
|  +-------------------------------------------------------+|
|  | Moda Express       shopify    [Avulsa]                ||
|  |   moda-express.myshopify.com           [Vincular]     ||
|  +-------------------------------------------------------+|
|                                                           |
|  +-------------------------------------------------------+|
|  | Tech Store Pro     shopify    [ABC Corp]              ||
|  |   techstore.com.br                    [Ver Cliente]   ||
|  +-------------------------------------------------------+|
|                                                           |
|  +-------------------------------------------------------+|
|  | Bella Joias        nuvemshop  [Avulsa]                ||
|  |   bellajoias.com.br                   [Vincular]      ||
|  +-------------------------------------------------------+|
+-----------------------------------------------------------+
```

#### Modal: Cadastro Rapido

```
+-----------------------------------------------------------+
|  Cadastro Rapido de Loja                              [X] |
|-----------------------------------------------------------|
|                                                           |
|  Nome da Loja *                                           |
|  +-------------------------------------------------------+|
|  |                                                       ||
|  +-------------------------------------------------------+|
|                                                           |
|  Plataforma *                                             |
|  +-------------------------------------------------------+|
|  | Selecione...  v  (Shopify|Nuvemshop|Woo|Outro)        ||
|  +-------------------------------------------------------+|
|                                                           |
|  URL da Loja *                                            |
|  +-------------------------------------------------------+|
|  | https://                                              ||
|  +-------------------------------------------------------+|
|                                                           |
|                          [Cancelar]  [Cadastrar Loja]     |
+-----------------------------------------------------------+
```

#### Modal: Vincular a Cliente

```
+-----------------------------------------------------------+
|  Vincular Loja a Cliente                              [X] |
|-----------------------------------------------------------|
|                                                           |
|  Loja: Moda Express (shopify)                             |
|                                                           |
|  Buscar Cliente *                                         |
|  +-------------------------------------------------------+|
|  | Digite o nome do cliente...                           ||
|  +-------------------------------------------------------+|
|  +-------------------------------------------------------+|
|  |  ABC Corp - contato@abc.com                       [v] ||
|  |  ABCDa Moda - loja@abcda.com                         ||
|  +-------------------------------------------------------+|
|                                                           |
|  Ao vincular, a loja passara a fazer parte dos            |
|  relatorios e gestao do cliente selecionado.              |
|                                                           |
|                          [Cancelar]  [Confirmar Vinculo]  |
+-----------------------------------------------------------+
```

---

## 4. Technical Constraints and Integration Requirements

### 4.1 Existing Technology Stack

| Camada | Tecnologia | Versao |
|---|---|---|
| Framework | Next.js (App Router) | 15 |
| Frontend | React + TypeScript | 19 / 5 |
| UI | shadcn/ui + Radix + Tailwind | Latest |
| Database | Supabase (PostgreSQL) | - |
| Auth | Supabase Auth + RLS | - |
| Forms | react-hook-form + Zod | - |
| State | Zustand + SWR | - |
| Encryption | Campo-level (`enc:v1:`) | Custom |
| Deploy | Vercel | - |

### 4.2 Integration Approach

**Database Integration:**

- Migration incremental: `ALTER TABLE client_stores ALTER COLUMN client_id DROP NOT NULL`
- Manter FK `REFERENCES clients(id) ON DELETE CASCADE` — nullable FK funciona normalmente no PostgreSQL
- `org_id` para lojas avulsas: capturar via `current_org_id()` no insert (RLS helper ja existe)
- Indice parcial: `CREATE INDEX idx_client_stores_orphan ON client_stores(org_id) WHERE client_id IS NULL`

**API Integration:**

- Modificar `POST /api/client-stores/credentials` — `client_id` opcional
- Nova rota `PATCH /api/client-stores/[id]/link` — vincular/desvincular
- Sem mudancas em `PUT /api/client-stores/credentials`
- Sem mudancas em `/api/stores/control`, `/api/stores/feedback`, `/api/stores/alerts`

**Frontend Integration:**

- Novos componentes seguem padrao existente (shadcn + react-hook-form)
- Modificacoes em componentes existentes sao aditivas (badges, filtros, botoes)
- Reutilizar hooks SWR existentes para busca de clientes

**Testing Integration:**

- Testes unitarios com Vitest para novos schemas Zod
- Testar RLS policies com queries Supabase em diferentes roles

### 4.3 Code Organization

| Novo Arquivo | Localizacao | Padrao Seguido |
|---|---|---|
| `quick-store-form.tsx` | `src/components/stores/` | `store-form-tab.tsx` |
| `store-link-modal.tsx` | `src/components/stores/` | Modais existentes |
| `store-link-badge.tsx` | `src/components/stores/` | Badges existentes |
| `link/route.ts` | `src/app/api/client-stores/[id]/` | `credentials/route.ts` |
| `store.schemas.ts` | `src/lib/schemas/` | `common.ts` |
| Migration SQL | `supabase/migrations/` | Migrations existentes |

### 4.4 Risk Assessment

| Risco | Prob. | Impacto | Mitigacao |
|---|---|---|---|
| R1: Lojas orfas se acumulam | Alta | Medio | Dashboard de lojas avulsas com idade, alertas apos X dias |
| R2: RLS INSERT policy rejeita `client_id = NULL` | Alta | Alto | Alterar policy: `client_id IS NULL OR can_access_client(client_id)` |
| R3: `ON DELETE CASCADE` com client_id NULL | Baixa | Baixo | FK nullable funciona normalmente no PostgreSQL |
| R4: `org_id` nulo em lojas avulsas | Alta | Alto | **[AD1]** Trigger `set_store_org_id()` no banco garante preenchimento automatico |
| R5: `store_onboarding_data` tem FK NOT NULL para `clients(id)` | Media | Medio | **[ARCH-C3]** Tornado nullable na migration — ja que `store_id UNIQUE` e a FK principal |
| R6: Desvinculacao com campanhas ativas | Media | Alto | Campanhas usam `store_id` — risco baixo, validar relatorios |
| R7: Link "Cliente" na pagina de detalhe quebra com NULL | Alta | Baixo | Fallback "Loja Avulsa — Sem cliente vinculado" |
| R8: Tipo TypeScript `client_id: string` nao aceita null | Alta | Medio | Alterar para `client_id: string \| null` |
| **R9: `/api/stores/control` usa INNER JOIN com clients** | **Alta** | **Alto** | **[ARCH-C1]** Mudar `clients!inner` para `clients` (LEFT JOIN) — sem isso lojas avulsas nao aparecem na listagem principal |
| **R10: `store_alerts.client_id` NOT NULL** | **Alta** | **Alto** | **[ARCH-C2]** Tornado nullable na migration — sem isso lojas avulsas nao geram alertas |
| **R11: `store-alert-checker.ts` pode excluir avulsas** | **Media** | **Alto** | **[ARCH-C4]** Refatorar queries e `createAlert()` para aceitar `client_id: null` |

### 4.5 Architectural Decisions

| # | Decisao | Rationale |
|---|---|---|
| AD1 | Trigger `set_store_org_id()` para `org_id` automatico | Consistencia a nivel de banco — qualquer INSERT tera `org_id` preenchido |
| AD2 | Estender tabela `activities` com novos tipos (`store_created`, `store_linked`, `store_unlinked`) | Reusar infra existente de audit trail, timeline unificada |
| AD3 | Cascata de `client_id` em tabelas satelite ao vincular/desvincular | Manter `store_alerts.client_id` e `store_onboarding_data.client_id` consistentes |
| AD4 | LEFT JOIN (remover `!inner`) no `/api/stores/control` | Inclusao de lojas avulsas sem quebrar lojas vinculadas |
| AD5 | Migration unica consolidada (3 tabelas + RLS + trigger + enum) | Atomicidade e rollback simples |

---

## 5. Epic and Story Structure

### Epic Approach

**Epic Structure Decision:** Um unico epic porque e uma feature coesa com objetivo claro (desacoplar loja de cliente). Todas as stories sao interdependentes (DB -> API -> UI) e nao ha features paralelas nao-relacionadas.

---

### Epic 1: Cadastro Rapido de Lojas Independentes

**Epic Goal:** Permitir cadastro e operacao de lojas sem vinculo obrigatorio a cliente, com vinculacao/desvinculacao posterior controlada por permissoes.

**Integration Requirements:** Manter 100% de compatibilidade com lojas existentes vinculadas.

---

#### Story 1.1 — Schema e RLS: Tornar `client_id` Nullable

> Como administrador do sistema,
> quero que o banco de dados suporte lojas sem `client_id`,
> para que a equipe comercial possa cadastrar lojas de forma independente.

**Acceptance Criteria:**

1. Migration criada: `client_stores.client_id` e nullable
2. FK `REFERENCES clients(id) ON DELETE CASCADE` mantida
3. RLS INSERT policy aceita `client_id IS NULL` para admins e comercial
4. `org_id` e preenchido via `current_org_id()` quando `client_id` e NULL
5. Indice parcial criado para lojas avulsas (`WHERE client_id IS NULL`)
6. Lojas existentes nao sao afetadas (todas mantem `client_id` atual)

**Integration Verification:**

- IV1: Lojas existentes continuam acessiveis via RLS sem mudanca
- IV2: `ON DELETE CASCADE` funciona normalmente para lojas vinculadas
- IV3: Queries existentes (`WHERE client_id = x`) retornam os mesmos resultados

---

#### Story 1.2 — API: Cadastro sem `client_id` e Endpoint de Vinculo

> Como desenvolvedor da API,
> quero endpoints que suportem criacao de loja sem `client_id` e vinculacao posterior,
> para que o frontend possa implementar os novos fluxos.

**Acceptance Criteria:**

1. `POST /api/client-stores/credentials` aceita body sem `client_id` (campo opcional)
2. Quando `client_id` ausente, `org_id` e capturado do usuario autenticado
3. Novo endpoint `PATCH /api/client-stores/[id]/link` com body `{ client_id: uuid | null }`
4. Endpoint de link valida permissao: `is_admin()` ou `can_access_store(id)`
5. Endpoint de link valida que `client_id` (quando informado) pertence a mesma org
6. Zod schema criado para validacao de input (store create + link)
7. Audit trail registrado para operacoes de vinculo/desvinculo

**Integration Verification:**

- IV1: `PUT /api/client-stores/credentials` continua funcionando sem mudancas
- IV2: Criacao de loja COM `client_id` funciona identicamente ao fluxo atual
- IV3: Integracoes existentes (Shopify, Klaviyo) nao sao afetadas

---

#### Story 1.3 — Types e Schemas: Atualizar Modelos

> Como desenvolvedor,
> quero que os tipos TypeScript e schemas Zod reflitam `client_id` como nullable,
> para evitar erros de tipo e garantir validacao consistente.

**Acceptance Criteria:**

1. `ClientStore.client_id` atualizado para `string | null` em `src/types/index.ts`
2. Novo schema Zod `storeCreateSchema` em `src/lib/schemas/`
3. Novo schema Zod `storeLinkSchema` para o endpoint de vinculo
4. Tipo `StoreCredentials` no `credentials.service.ts` atualizado
5. Nenhum erro de TypeScript no build (`npm run typecheck`)

**Integration Verification:**

- IV1: Tipos existentes que dependem de `ClientStore` compilam sem erro
- IV2: Schemas existentes em `common.ts` nao sao modificados

---

#### Story 1.4 — UI: Cadastro Rapido de Loja

> Como membro da equipe comercial,
> quero cadastrar uma loja rapidamente com apenas nome, plataforma e URL,
> para que eu possa configurar integracoes sem precisar ter um cliente cadastrado.

**Acceptance Criteria:**

1. Botao [+ Cadastro Rapido] na pagina `/stores`
2. Modal com form de 3 campos: nome da loja, plataforma (select), URL
3. Validacao Zod dos campos com feedback visual
4. Submit chama `POST /api/client-stores/credentials` sem `client_id`
5. Apos salvar, loja aparece na lista com badge "Avulsa"
6. Form completavel em menos de 30 segundos
7. Tratamento de erro com mensagens claras

**Integration Verification:**

- IV1: Botao de cadastro completo (existente) continua funcionando
- IV2: Lista de lojas renderiza corretamente com lojas avulsas e vinculadas

---

#### Story 1.5 — UI: Badge, Filtros e Indicadores

> Como membro da equipe,
> quero ver claramente quais lojas sao avulsas e quais sao vinculadas,
> para que eu possa gerenciar e priorizar vinculacoes.

**Acceptance Criteria:**

1. Badge visual em cada loja: "Avulsa" (secondary) ou "Vinculada: [Nome Cliente]" (default)
2. Filtro na listagem: Todas / Avulsas (com contagem) / Vinculadas (com contagem)
3. Pagina de detalhe `/stores/[id]` exibe status de vinculo no header
4. Se avulsa: mostra "Loja Avulsa — Sem cliente vinculado" com acao [Vincular]
5. Se vinculada: mostra "Vinculada a [Cliente]" com link para o cliente

**Integration Verification:**

- IV1: Lojas vinculadas existentes exibem corretamente o nome do cliente
- IV2: Tab "Lojas" em `/clients/[id]` nao e afetada

---

#### Story 1.6 — UI: Vincular e Desvincular Loja

> Como membro da equipe com permissao,
> quero vincular uma loja avulsa a um cliente ou desvincular uma loja existente,
> para que eu possa organizar lojas conforme os relacionamentos comerciais evoluem.

**Acceptance Criteria:**

1. Botao [Vincular] visivel em lojas avulsas (na lista e no detalhe)
2. Modal de vinculo com busca de clientes (autocomplete, filtra pela org)
3. Preview do cliente selecionado antes de confirmar
4. Ao vincular, validar campos obrigatorios para operacao completa
5. Botao [Desvincular] visivel em lojas vinculadas (apenas para usuarios autorizados)
6. Confirmacao explicita ao desvincular com aviso sobre impacto
7. Feedback visual apos acao (toast/notification)

**Integration Verification:**

- IV1: Apos vincular, loja aparece no tab "Lojas" do cliente
- IV2: Apos desvincular, loja some do tab "Lojas" do cliente
- IV3: Campanhas e integracoes continuam funcionando apos vinculo/desvinculo

---

#### Story 1.7 — Alertas e Relatorios para Lojas Avulsas

> Como gestor,
> quero que lojas avulsas gerem alertas no mesmo prazo das vinculadas e aparecam em relatorios separados,
> para que nenhuma loja fique sem acompanhamento.

**Acceptance Criteria:**

1. Sistema de alertas existente inclui lojas avulsas com mesmas regras de prazo
2. Relatorios gerais tem secao separada "Lojas Avulsas"
3. Queries de relatorio filtram: `WHERE client_id IS NULL` para secao avulsa
4. Contagem de lojas avulsas visivel no dashboard (se aplicavel)

**Integration Verification:**

- IV1: Alertas de lojas vinculadas continuam funcionando normalmente
- IV2: Relatorios existentes (por cliente) nao incluem lojas avulsas

---

### Story Dependency Map

```
Story 1.1 (Schema/RLS)
    |
    +---> Story 1.2 (API)
              |
              +---> Story 1.3 (Types/Schemas)
                        |
                        +---> Story 1.4 (UI: Cadastro Rapido)    [paralelo]
                        |
                        +---> Story 1.5 (UI: Badges/Filtros)     [paralelo]
                        |
                        +---> Story 1.6 (UI: Vincular/Desvincular) [paralelo]
                        |
                        +---> Story 1.7 (Alertas/Relatorios)
```

**Sequencia:** 1.1 -> 1.2 -> 1.3 -> [1.4, 1.5, 1.6 em paralelo] -> 1.7

Stories 1.4, 1.5 e 1.6 podem ser desenvolvidas em paralelo apos 1.3.

---

## 6. Validation Checklist

- [x] Escopo validado com stakeholder (COO) — Q1-Q10 respondidas
- [x] Analise do projeto existente realizada — deep dive em schema, API, RLS, UI
- [x] Requisitos funcionais definidos (FR1-FR11)
- [x] Requisitos nao funcionais definidos (NFR1-NFR6)
- [x] Requisitos de compatibilidade definidos (CR1-CR6)
- [x] UI/UX definida com wireframes
- [x] Constraints tecnicas documentadas
- [x] Epic e stories estruturadas (1 epic, 7 stories)
- [x] Dependencias entre stories mapeadas
- [x] Riscos identificados e mitigados (8 riscos)
- [x] Analise de stakeholders realizada (7 stakeholders)
- [x] Questionario de escopo respondido (10 perguntas)

---

## 7. Next Steps

### For UX Expert (@ux-design-expert):

Revisar wireframes propostos na secao 3.4 e criar prototipos de alta fidelidade para:
1. Modal de Cadastro Rapido (T3)
2. Modal de Vincular a Cliente (T4)
3. Badge e filtros na listagem (T1)
4. Estado de vinculo na pagina de detalhe (T2)

### For Architect (@architect):

Revisar constraints tecnicas na secao 4 e validar:
1. Estrategia de migration (client_id nullable)
2. Adaptacao das RLS policies
3. Novo endpoint PATCH para vinculo/desvinculo
4. Indice parcial para lojas avulsas
5. Estrategia de audit trail

### For Development Team (@dev):

1. Iniciar pela Story 1.1 (Schema/RLS) — fundacao de toda a feature
2. Seguir sequencia de dependencias: 1.1 -> 1.2 -> 1.3 -> [1.4-1.6] -> 1.7
3. Rodar `npm run typecheck` e `npm run lint` apos cada story

---

*Synkra AIOS - PRD gerado por Orion (aios-master) em 2026-02-24*
