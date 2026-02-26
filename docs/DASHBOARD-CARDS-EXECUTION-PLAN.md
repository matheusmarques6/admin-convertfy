# Plano de Execução: Novos Cards da Dashboard

**Para:** @dev (Dex)
**De:** @sm (River)
**Data:** 2026-02-26
**Ref:** `docs/DASHBOARD-NEW-CARDS-PLAN.md` (especificações detalhadas)

---

## Decisões Consolidadas

| Decisão | Resultado |
|---|---|
| TodayAgenda | **REMOVER** — redundante com Prévia do Calendário |
| RecentActivity | **MANTER** — full-width como timeline no rodapé |
| Top Lojas vs Banner | **SEPARAR** — remover top lojas do `TotalRevenueBanner`, card próprio |
| Piores Resultados | **Revenue Klaviyo** — bottom 5 da mesma API |
| Layout | **2 colunas** (recomendação UX) |

---

## Layout Final

```
┌──────────────────────────────────────────────────┐
│ QuickActions (full-width)                         │
├──────────────────────────────────────────────────┤
│ TotalRevenueBanner (full-width, SEM top lojas)    │
├────────────────────────┬─────────────────────────┤
│ Board Preview          │ Prévia Calendário        │
├────────────────────────┼─────────────────────────┤
│ Top Lojas              │ Piores Resultados        │
├────────────────────────┼─────────────────────────┤
│ Onboarding por Função  │ Alertas                  │
├────────────────────────┴─────────────────────────┤
│ RecentActivity (full-width, timeline compacta)    │
└──────────────────────────────────────────────────┘
```

---

## Steps de Execução

### Step 0: Limpar TotalRevenueBanner
**Arquivo:** `src/components/dashboard/total-revenue-banner.tsx`
**Ação:** Remover a seção de "Top Stores" (lista com barras de progresso) do componente. Manter apenas: total revenue, breakdown campanhas vs flows.
**Motivo:** Top lojas vai para card próprio.
**Teste:** Banner renderiza sem a lista de lojas. Sem erros de tipo.

---

### Step 1: Board Preview
**Criar:** `src/components/dashboard/board-preview.tsx`
**Tipo:** Client component (`"use client"`)

**O que faz:**
- Busca contagem de tasks por status via fetch client-side
- Mostra 4 contadores: Pendente, Em Andamento, Bloqueado, Em Revisão
- Badge de tarefas vencidas (due_date < hoje)
- Badge de tarefas bloqueadas
- Link "Ver Board →" para `/board`

**Dados:** Usar query server-side no `getDashboardData()`:
```typescript
// Tasks agrupadas por status (excluir completed/cancelled)
const { data: allTasks } = await supabase
  .from('tasks')
  .select('id, status, due_date')
  .not('status', 'in', '("completed","cancelled")')
```
Passar para o componente como prop: `{ tasks: Array<{ id, status, due_date }> }`
O componente conta por status e calcula vencidas no client-side.

**Referência visual:** Seção 2.1 do `DASHBOARD-NEW-CARDS-PLAN.md`

---

### Step 2: Prévia do Calendário (Semana)
**Criar:** `src/components/dashboard/week-calendar-preview.tsx`
**Tipo:** Client component

**O que faz:**
- Mostra 7 dias da semana atual com indicadores (dots) de eventos por dia
- Destaque no dia atual
- Lista eventos de hoje (reuniões com horário, tarefas com due_date)
- Link "Ver Calendário →" para `/meetings?view=calendar`

**Dados server-side a adicionar no `getDashboardData()`:**
```typescript
const weekStart = startOfWeek(now) // usar date-fns ou calcular manual
const weekEnd = endOfWeek(now)

const [{ data: weekMeetings }, { data: weekTasks }] = await Promise.all([
  supabase
    .from('meetings')
    .select('id, title, scheduled_at, duration_minutes, meeting_url, status')
    .eq('status', 'scheduled')
    .gte('scheduled_at', weekStart.toISOString())
    .lte('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at'),
  supabase
    .from('tasks')
    .select('id, title, due_date, status, priority, type')
    .not('status', 'in', '("completed","cancelled")')
    .gte('due_date', weekStart.toISOString())
    .lte('due_date', weekEnd.toISOString())
    .order('due_date'),
])
```
Props: `{ meetings: Meeting[], tasks: Task[] }`

**Referência visual:** Seção 2.2 do `DASHBOARD-NEW-CARDS-PLAN.md`

---

### Step 3: Top Lojas
**Criar:** `src/components/dashboard/top-stores-card.tsx`
**Tipo:** Client component

**O que faz:**
- Fetch client-side de `/api/dashboard/total-revenue?period=30d`
- Mostra top 5 lojas por revenue total
- Barra de progresso relativa ao maior valor
- Breakdown campaign vs flow (nos primeiros 2-3 itens)
- Seletor de período (7d, 15d, 30d)
- Cada loja clicável → `/stores/{id}`

**API:** JÁ EXISTE — `/api/dashboard/total-revenue` retorna `topStores[]`.
Não precisa modificar a API.

**Referência visual:** Seção 2.3 do `DASHBOARD-NEW-CARDS-PLAN.md`

---

### Step 4: Piores Resultados
**Criar:** `src/components/dashboard/worst-performers-card.tsx`
**Tipo:** Client component

**O que faz:**
- Fetch client-side de `/api/dashboard/total-revenue?period=30d`
- Mostra bottom 5 lojas por revenue total (menor primeiro)
- Mesma estrutura visual do Top Lojas (barras, breakdown)
- Seletor de período sincronizado ou independente

**API a modificar:** `src/app/api/dashboard/total-revenue/route.ts`
- Adicionar `bottomStores` na resposta (bottom 5 por revenue)
- A API já busca TODAS as lojas e ordena — só retornar os últimos 5 também

**Mudança na API (mínima):**
```typescript
// Já existe: const sorted = allStores.sort((a, b) => b.totalRevenue - a.totalRevenue)
// Já existe: topStores: sorted.slice(0, 5)
// ADICIONAR: bottomStores: sorted.filter(s => s.totalRevenue > 0).reverse().slice(0, 5)
// Nota: filtrar revenue > 0 para não mostrar lojas sem dados
```

**Referência visual:** Seção 2.4 do `DASHBOARD-NEW-CARDS-PLAN.md`

---

### Step 5: Onboarding por Função
**Criar:** `src/components/dashboard/onboarding-preview.tsx`
**Tipo:** Client component

**O que faz:**
- Recebe onboardings e role do usuário como props
- Filtra exibição baseado no role:
  - `owner`/`manager`: todas as fases com contagem + progresso médio + próximos a vencer
  - `coordinator`: onboardings que coordena
  - `copywriter`: só fase `generating_copies`
  - `designer`: só fase `design`
  - `developer`: só fase `implementation`
  - `support`: todos ativos
- Link "Ver Onboardings →" para `/onboarding`

**Dados server-side:**
```typescript
const { data: activeOnboardings } = await supabase
  .from('client_onboardings')
  .select(`
    id, status, current_phase, progress_percent,
    target_completion_date, assigned_to,
    client:clients(id, name),
    store:client_stores(id, store_name)
  `)
  .neq('status', 'completed')
  .order('target_completion_date', { ascending: true })
```

**Props:** `{ onboardings: Onboarding[], userRole: OrgRole }`

**Fases (IDs da `onboarding-kanban.tsx`):**
- `pending_approval` → Aguardando Aprovação
- `generating_copies` → Gerando Copies
- `design` → Design
- `implementation` → Implementação

**Referência visual:** Seção 2.5 do `DASHBOARD-NEW-CARDS-PLAN.md`

---

### Step 6: Montar o Layout Final
**Modificar:** `src/app/(dashboard)/dashboard/page.tsx`

**Ações:**
1. Remover import de `TodayAgenda`
2. Adicionar imports dos 5 novos componentes
3. Atualizar `getDashboardData()` com queries adicionais (tasks, weekMeetings, weekTasks, onboardings)
4. Resolver `orgMemberRole` para o onboarding card (já temos `authProfile` e `orgMember`)
5. Montar o grid 2 colunas:

```tsx
<div className="space-y-6">
  <QuickActions />
  <TotalRevenueBanner />

  {/* Grid 2 colunas */}
  <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
    <BoardPreview tasks={data.activeTasks} />
    <WeekCalendarPreview meetings={data.weekMeetings} tasks={data.weekTasks} />
    <TopStoresCard />
    <WorstPerformersCard />
    <OnboardingPreview onboardings={data.onboardings} userRole={userRole} />
    <DashboardAlerts meetings={data.upcomingMeetings} alerts={data.alerts} />
  </div>

  {/* Full-width footer */}
  <RecentActivity activities={data.activities} />
</div>
```

**Teste:** Dashboard renderiza todos os cards sem erros. Layout responsivo (2 cols desktop, 1 col mobile).

---

### Step 7: Verificação Final
- [ ] `npx tsc --noEmit` — zero erros
- [ ] `npx next lint` — zero warnings
- [ ] Dashboard admin renderiza todos os 6 cards + banner + quickactions + activity
- [ ] TotalRevenueBanner não mostra mais top lojas
- [ ] TodayAgenda removido, sem referências restantes
- [ ] Board Preview mostra contagem por status
- [ ] Prévia Calendário mostra semana com eventos
- [ ] Top Lojas carrega via API existente
- [ ] Piores Resultados carrega via API (com `bottomStores` adicionado)
- [ ] Onboarding filtra por role do usuário
- [ ] Alertas reposicionado no grid
- [ ] RecentActivity full-width no rodapé
- [ ] Layout responsivo: 2 cols desktop, 1 col mobile
- [ ] `/dashboard/operational` não afetada

---

## Resumo de Arquivos

### Criar (5)
```
src/components/dashboard/board-preview.tsx
src/components/dashboard/week-calendar-preview.tsx
src/components/dashboard/top-stores-card.tsx
src/components/dashboard/worst-performers-card.tsx
src/components/dashboard/onboarding-preview.tsx
```

### Modificar (3)
```
src/components/dashboard/total-revenue-banner.tsx  → remover seção top lojas
src/app/api/dashboard/total-revenue/route.ts       → adicionar bottomStores
src/app/(dashboard)/dashboard/page.tsx             → novo layout + queries + imports
```

### Remover uso (1)
```
TodayAgenda → remover import/uso do dashboard/page.tsx
```

---

*Plano criado por River — removendo obstáculos 🌊*
