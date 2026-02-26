# QA Fix Request — Seção Operacional

**Data:** 2026-02-18
**Revisor:** Quinn (QA Agent)
**Gate Decision:** FAIL
**Total Issues:** 15 CRITICAL, 28 HIGH, 38 MEDIUM, 31 LOW

---

## Lote 1 — Segurança Multi-Tenant (CRITICAL)

> Todas as queries com `createAdminClient()` que bypassam RLS precisam de `org_id` filter explícito.
> Todos os PUT/DELETE precisam de ownership check.

### 1.1 Board — `getTasks()` sem `org_id`
- **Arquivo:** `src/app/(dashboard)/board/page.tsx` linhas 10-35
- **Problema:** `createAdminClient().from("tasks").select(...)` sem `.eq("org_id", orgId)`
- **Fix:** Obter `org_id` do user autenticado e adicionar filtro

### 1.2 Board — `getClients()` e `getStores()` sem `org_id`
- **Arquivo:** `src/app/(dashboard)/board/page.tsx` linhas 74-105
- **Fix:** Adicionar `.eq("org_id", orgId)` em ambas

### 1.3 Board — `getMeetings()` sem `org_id`
- **Arquivo:** `src/app/(dashboard)/board/page.tsx` linhas 107-192
- **Fix:** Adicionar filtro org na query de meetings

### 1.4 Board — Tasks PUT/DELETE sem ownership check
- **Arquivo:** `src/app/api/tasks/[id]/route.ts` linhas 93-195
- **Problema:** `requireAuth()` só valida sessão, não verifica se task pertence à org do user
- **Fix:** Buscar a task primeiro, comparar `org_id` antes de modificar/deletar

### 1.5 Reuniões — GET `/api/meetings` sem `org_id`
- **Arquivo:** `src/app/api/meetings/route.ts` linhas 31-45
- **Problema:** `createAdminClient()` sem filtro, retorna meetings de todas as orgs
- **Fix:** Adicionar `.eq("org_id", orgId)`

### 1.6 Reuniões — PUT/DELETE sem ownership check
- **Arquivo:** `src/app/api/meetings/[id]/route.ts` linhas 111-114 (PUT), 248-250 (DELETE)
- **Problema:** Qualquer user autenticado pode alterar/deletar meeting de outra org
- **Fix:** Verificar que meeting pertence à org do user antes de operar

### 1.7 Reuniões — Server component sem `org_id`
- **Arquivo:** `src/app/(dashboard)/meetings/page.tsx` linhas 15-29
- **Fix:** Adicionar filtro org na query do server component

### 1.8 Equipe — `listUsers()` sem paginação = duplicação de auth users
- **Arquivo:** `src/app/api/admin/org-members/route.ts` linha 195
- **Problema:** `auth.admin.listUsers()` retorna só os primeiros 50 users. `.find()` pode dar false negative, criando user duplicado
- **Fix:** Substituir por `auth.admin.getUserByEmail(body.email.toLowerCase())`

### 1.9 Financeiro — Wise reconciliation DELETE sem ownership check
- **Arquivo:** `src/app/api/integrations/wise/reconcile/route.ts` linhas 131-161
- **Fix:** Adicionar verificação de org antes de deletar

### 1.10 Financeiro — Wise reconciliation GET sem `org_id`
- **Arquivo:** `src/app/api/integrations/wise/reconcile/route.ts` linhas 101-124
- **Fix:** Adicionar filtro org_id na query

### 1.11 Relatórios — Queries sem `org_id` explícito
- **Arquivo:** `src/app/(dashboard)/reports/page.tsx` linhas 31-51
- **Arquivo:** `src/app/api/client-reports/route.ts` (DELETE e PUT)
- **Fix:** Adicionar org_id filter + ownership check nos handlers de mutação

---

## Lote 2 — Data Correctness (CRITICAL)

### 2.1 Board — `taskCreateSchema` type enum mismatch
- **Arquivo:** `src/lib/schemas/common.ts` linha 83
- **Problema:** Schema aceita `"task","bug","feature","improvement"` mas `TaskType` é `"onboarding","campaign","request","general","meeting","deadline"`. Criar qualquer task não-general falha com 400
- **Fix:** Alinhar o enum do Zod schema com `TaskType` de `src/types/task.ts`

### 2.2 Reuniões — `participant_response` ignorado no PUT
- **Arquivo:** `src/app/api/meetings/[id]/route.ts`
- **Problema:** UI envia `{ participant_response: { participant_id, status } }` no PUT. API ignora completamente. Aceitar/recusar convite é no-op
- **Fix:** Adicionar code path que lê `body.participant_response` e faz `UPDATE meeting_participants SET response_status = ...`

### 2.3 Relatórios — `report_type` fallback inválido
- **Arquivo:** `src/app/api/client-reports/route.ts` linha 27
- **Problema:** `report_type || "general"` — `"general"` não é `ReportType` válido (`manual|klaviyo|shopify|combined`)
- **Fix:** Mudar fallback para `"manual"` ou validar com Zod antes

### 2.4 Relatórios — `engagedSegmentSize` nunca populado
- **Arquivo:** `src/app/(dashboard)/reports/[id]/page.tsx` linhas 469-477
- **Problema:** UI busca `overview.engagedSegmentSize`, API retorna em `engagement.engagedProfiles` (key diferente)
- **Fix:** Mapear `engagement.engagedProfiles` para `overview.engagedSegmentSize` na API ou ajustar a UI

### 2.5 Financeiro — URL Asaas hardcoded como produção
- **Arquivo:** `src/app/api/integrations/asaas/subscriptions/route.ts` linha 40
- **Problema:** `fetch("https://api.asaas.com/v3/subscriptions?...")` hardcoded, ignora config sandbox/production
- **Fix:** Usar `createAsaasService()` como as outras rotas fazem

### 2.6 Relatórios — `response.ok` não verificado antes de `.json()`
- **Arquivo:** `src/app/(dashboard)/reports/new/page.tsx` linhas 322-324
- **Arquivo:** `src/app/(dashboard)/reports/[id]/edit/page.tsx` linhas 191-196
- **Fix:** Verificar `!response.ok` antes de chamar `.json()`

### 2.7 Relatórios — GET handler inexistente em `/api/client-reports`
- **Arquivo:** `src/app/api/client-reports/route.ts`
- **Problema:** Só tem POST, PUT, DELETE. Sem GET handler
- **Fix:** Adicionar GET handler ou documentar que reads são feitos via Supabase direto (se intencional)

---

## Lote 3 — Error Handling (HIGH)

### 3.1 Padronizar auth com `requireAuth()` em todas as rotas
- **Arquivos afetados:**
  - `src/app/api/admin/org-members/route.ts` (POST usa auth manual)
  - `src/app/api/integrations/wise/transactions/route.ts`
  - `src/app/api/integrations/wise/balances/route.ts`
  - `src/app/api/integrations/wise/reconcile/route.ts`
- **Fix:** Substituir auth manual por `await requireAuth(supabase)` + usar `errorResponse()` nos erros

### 3.2 Substituir `NextResponse.json()` por `errorResponse()`/`successResponse()`
- **Arquivos afetados:**
  - `src/app/api/admin/org-members/route.ts` linhas 224-228, 265-269, 309-313
  - `src/app/api/meetings/[id]/route.ts` linha 226
- **Problema:** Respostas raw vazam mensagens internas do SDK e bypassam CORS + logging
- **Fix:** Usar `errorResponse(request, error, ctx)` e `successResponse(request, data)`

### 3.3 Substituir `console.error` por `logger` em server components
- **Arquivos afetados:**
  - `src/app/(dashboard)/board/page.tsx` linha 30
  - `src/app/(dashboard)/meetings/page.tsx` linha 32
  - `src/app/(dashboard)/team/page.tsx` linha 25
  - `src/app/(dashboard)/reports/[id]/page.tsx` linhas 161, 203, 232
  - `src/app/(dashboard)/reports/[id]/edit/page.tsx` linhas 102, 152, 243
  - `src/app/(dashboard)/reports/new/page.tsx` linhas 140, 179, 416
  - `src/components/reports/reports-list.tsx` linhas 277, 319
  - `src/components/financial/subscriptions-manager.tsx` linha 122
- **Fix:** Usar `logger.error()` em server components. Em client components usar toast. Mostrar error state ao invés de lista vazia silenciosa

### 3.4 Board — Error state ausente no page
- **Arquivo:** `src/app/(dashboard)/board/page.tsx`
- **Problema:** Todas as 5 funções fetch retornam `[]` silenciosamente em erro
- **Fix:** Propagar erros para mostrar UI de erro ou usar error boundary

### 3.5 Financeiro — `toast()` chamado no corpo do render (loop infinito)
- **Arquivo:** `src/components/financial/charges-manager.tsx` linhas 115-121
- **Problema:** `if (fetchError) { toast({...}) }` fora de useEffect — dispara toast em cada render
- **Fix:** Mover para `useEffect([fetchError])`

### 3.6 Equipe — Validation order invertida no POST
- **Arquivo:** `src/app/api/admin/org-members/route.ts` linhas 148-169
- **Problema:** Permission check usa `body.org_id` antes de validar se existe. Retorna 403 ao invés de 400
- **Fix:** Mover validação de campos obrigatórios para antes do permission check

### 3.7 Equipe — Zod schema marca `email`/`name` como optional no create mode
- **Arquivo:** `src/components/team/team-member-dialog.tsx` linhas 72-73
- **Fix:** Adicionar `.superRefine()` condicional que requer email/name quando `!isEditing`

---

## Lote 4 — Performance (HIGH + MEDIUM)

### 4.1 Equipe — N+1 query pattern
- **Arquivo:** `src/app/(dashboard)/team/page.tsx` linhas 30-51
- **Arquivo:** `src/app/api/admin/org-members/route.ts` linhas 91-112
- **Problema:** 2 queries extras por membro (features + store access). Com 20 membros = 41 round trips. Duplicado entre page e API
- **Fix:** Usar JOIN query ou relational select do Supabase

### 4.2 Financeiro — N+1 serial requests em SubscriptionsManager
- **Arquivo:** `src/components/financial/subscriptions-manager.tsx` linhas 81-112
- **Problema:** 1 request por cliente, serial, sem rate-limit. Estoura Asaas com 50+ clientes
- **Fix:** Criar endpoint bulk ou adicionar concurrency limit com Promise pool

### 4.3 Reuniões — `days` array não memoizado no CalendarWeekView
- **Arquivo:** `src/components/meetings/calendar-week-view.tsx` linhas 44-63
- **Problema:** `days` recriado a cada render, invalidando o `useMemo` de `meetingsByDay`
- **Fix:** Envolver `days` em `useMemo([currentDate])`

### 4.4 Reuniões — `participant_id` filtrado em JS ao invés de SQL
- **Arquivo:** `src/app/api/meetings/route.ts` linhas 67-73
- **Fix:** Mover filtro para query Supabase com JOIN em `meeting_participants`

### 4.5 Financeiro — Date filter aplicado em memória no charges/list
- **Arquivo:** `src/app/api/integrations/asaas/charges/list/route.ts` linhas 40-68
- **Problema:** Busca TODAS as cobranças e filtra em JS. Asaas suporta `dueDate[ge]`/`dueDate[le]`
- **Fix:** Passar filtros de data como query params na chamada Asaas

### 4.6 Relatórios — Products fetch limitado a 250 sem paginação
- **Arquivo:** `src/lib/integrations/shopify/report.ts` linhas 806-818
- **Fix:** Implementar paginação como já feito em `fetchAllOrders`

---

## Lote 5 — Cleanup (MEDIUM + LOW)

### 5.1 Tipos duplicados — centralizar em `@/types/`
- `MemberWithDetails` duplicado em `team-table.tsx` e `team-member-dialog.tsx`
- 38 interfaces duplicadas across board components
- `ReportWithRelations` duplicado em 4 arquivos
- `Invoice`/`PaymentStatus` em `financial.ts` não usado por ninguém
- **Fix:** Definir uma vez em `@/types/` e importar

### 5.2 Permission gates — usar AND logic onde necessário
- `src/app/(dashboard)/board/page.tsx` linha 221
- `src/app/(dashboard)/team/page.tsx` linha 120
- **Fix:** Avaliar se deve ser `requiredAllFeatures` ao invés de `requiredFeatures`

### 5.3 Sub-pages de Reports sem `PagePermissionWrapper`
- `reports/new/page.tsx`, `reports/[id]/page.tsx`, `reports/[id]/edit/page.tsx`
- **Fix:** Adicionar wrapper de permissão

### 5.4 Missing `loading.tsx`
- `/meetings` — não tem loading skeleton
- **Fix:** Criar `src/app/(dashboard)/meetings/loading.tsx`

### 5.5 Missing `error.tsx`
- `/reports/new` e `/reports/[id]/edit`
- **Fix:** Criar error boundaries

### 5.6 Board — Dead code nos dot indicators
- `src/components/board/board-calendar-view.tsx` linhas 254-265
- **Problema:** `!hasEvents && taskCount > 0` é contradição lógica — nunca executa
- **Fix:** Corrigir lógica ou remover

### 5.7 Board — `onSuccess` typed as `any`
- `src/components/board/task-dialog.tsx` linha 81
- **Fix:** Tipar como `TaskWithRelations`

### 5.8 Reuniões — Slot-click no calendário é no-op
- `src/components/meetings/meetings-page-client.tsx` linhas 195-198
- **Problema:** `date` param ignorado, dialog abre sem pre-fill
- **Fix:** Passar date como prop para o MeetingDialog

### 5.9 Board — `meeting-dialog.tsx` `p.org_member` nunca populado
- `src/components/board/meeting-dialog.tsx` linhas 144-150
- **Fix:** Incluir join de `org_member` na query ou ajustar fallback

### 5.10 Equipe — `loadMemberStoreAccess` silencia erros (risco data loss)
- `src/components/team/team-member-dialog.tsx` linhas 172-182
- **Fix:** Mostrar toast de erro e não permitir save se store access falhou ao carregar

### 5.11 Equipe — Activity log usa `type: "client_created"` para team operations
- `src/app/api/admin/org-members/route.ts` linha 346; `[id]/route.ts` linha 262
- **Fix:** Criar tipos de activity adequados (`team_member_created`, `team_member_updated`)

### 5.12 Financeiro — MRR calculation missing `BIMONTHLY`
- `src/components/financial/subscriptions-manager.tsx` linhas 181-201
- **Fix:** Adicionar case `BIMONTHLY: value / 2`

### 5.13 Financeiro — `as never` cast em charges/list
- `src/app/api/integrations/asaas/charges/list/route.ts` linha 55
- **Fix:** Tipar `params` corretamente

### 5.14 Financeiro — `log` declarado mas não usado
- `src/app/api/integrations/wise/balances/route.ts` linha 8
- `src/app/api/integrations/wise/transactions/route.ts` linha 8
- **Fix:** Usar ou remover

### 5.15 Relatórios — Dead code no empty state ternary
- `src/components/reports/reports-list.tsx` linhas 553-554
- **Problema:** Ambos branches do ternário retornam o mesmo texto
- **Fix:** Diferenciar mensagem com/sem filtros ativos

### 5.16 Relatórios — `report_type` exibido como raw string no edit
- `src/app/(dashboard)/reports/[id]/edit/page.tsx` linha 289
- **Fix:** Usar `getReportTypeLabel()` como o detail page faz

### 5.17 Relatórios — Sensitive credential fields fetched desnecessariamente
- `src/app/(dashboard)/reports/page.tsx` linhas 71-83
- **Fix:** Usar `.not("klaviyo_private_key", "is", null)` como filtro ao invés de selecionar os campos

### 5.18 Acessibilidade — `aria-label` faltando em botões icon-only
- Board: task-card.tsx, board-calendar-view.tsx
- Equipe: team-table.tsx linhas 299-302
- **Fix:** Adicionar `aria-label` descritivo

---

## Prioridade de Execução

```
Lote 1 (Segurança)      -> BLOQUEIA deploy. Fazer primeiro.
Lote 2 (Data)            -> BLOQUEIA funcionalidade. Fazer segundo.
Lote 3 (Error Handling)  -> Degrada UX severamente. Fazer terceiro.
Lote 4 (Performance)     -> Degrada com escala. Fazer quarto.
Lote 5 (Cleanup)         -> Nice-to-have. Fazer por último.
```

---

*Gerado por Quinn (QA Agent) — 2026-02-18*
