# Plano: Novos Cards Operacionais da Dashboard

**Data:** 2026-02-26
**Status:** Proposta
**Pré-requisito:** Reestruturação financeira concluída (d0bf8d7)

---

## 1. Visão Geral

A dashboard admin ficou enxuta após mover dados financeiros para `/financial`. Agora precisa de cards operacionais que deem visibilidade imediata sobre o que está acontecendo na agência.

### Layout Proposto

```
┌─────────────────────────────────────────────────────────┐
│ QuickActions                                             │
├─────────────────────────────────────────────────────────┤
│ TotalRevenueBanner (Klaviyo - já existe)                 │
├──────────────────────────┬──────────────────────────────┤
│                          │                              │
│  BOARD PREVIEW           │  PRÉVIA DO CALENDÁRIO        │
│  (Kanban resumido)       │  (Mini calendário semanal)   │
│                          │                              │
├──────────────────────────┼──────────────────────────────┤
│                          │                              │
│  TOP LOJAS               │  PIORES RESULTADOS           │
│  (Ranking por revenue)   │  (Ranking por métricas)      │
│                          │                              │
├──────────────────────────┼──────────────────────────────┤
│                          │                              │
│  ONBOARDING POR FUNÇÃO   │  ALERTAS                     │
│  (Scoped por role)       │  (já existe, reposicionar)   │
│                          │                              │
└──────────────────────────┴──────────────────────────────┘
```

---

## 2. Especificação dos Cards

---

### 2.1 Board Preview (Kanban Resumido)

**O que mostra:** Contagem de tarefas por coluna do kanban, com indicadores visuais.

**Dados disponíveis:** Tabela `tasks` — campos `status`, `priority`, `assignee_id`, `due_date`, `type`, `source_type`

**Colunas exibidas (da `board.ts`):**

| Status | Label | Cor |
|--------|-------|-----|
| `pending` | Pendente | slate |
| `in_progress` | Em Andamento | blue |
| `blocked` | Bloqueado | red |
| `review` | Em Revisão | amber |
| `completed` | Concluído | emerald |

**Layout do card:**
```
┌─ Board ──────────────────────────────────┐
│                                          │
│  Pendente  Andamento  Bloqueado  Revisão │
│    12        5          2         3      │
│    ██        ██         ██        ██     │
│                                          │
│  ⚠ 3 tarefas vencidas                   │
│  🔴 2 tarefas bloqueadas                │
│                                          │
│  [Ver Board →]                           │
└──────────────────────────────────────────┘
```

**Destaques:**
- Contagem por coluna (excluindo `completed` e `cancelled`)
- Badge de tarefas vencidas (`due_date < hoje && status !== completed`)
- Badge de tarefas bloqueadas
- Link para `/board`

**Scope:** Para admin/owner, mostra TODAS as tarefas da org. Não scoped por agente.

**API:** Query server-side direto no `getDashboardData()`:
```sql
SELECT status, count(*)
FROM tasks
WHERE org_id = ? AND status NOT IN ('completed', 'cancelled')
GROUP BY status
```

**Componente:** `src/components/dashboard/board-preview.tsx` (novo)

---

### 2.2 Prévia do Calendário (Semana Atual)

**O que mostra:** Mini calendário da semana atual com reuniões e tarefas com due_date.

**Dados disponíveis:**
- `meetings` (status=scheduled, scheduled_at na semana)
- `tasks` (due_date na semana)

**Layout do card:**
```
┌─ Esta Semana ────────────────────────────┐
│                                          │
│  Seg  Ter  Qua  Qui  Sex  Sáb  Dom      │
│  24   25   26   27   28   01   02        │
│   ·    ●●   ●   ··    ·                 │
│                                          │
│  HOJE (Qua 26):                          │
│  09:00  Reunião com Cliente X            │
│  14:00  Review campanha Y               │
│  🔵 2 tarefas vencem hoje               │
│                                          │
│  [Ver Calendário →]                      │
└──────────────────────────────────────────┘
```

**Destaques:**
- 7 dias da semana com indicadores (pontos) por dia
- Destaque do dia atual com eventos listados
- Contagem de tarefas que vencem hoje
- Link para `/meetings?view=calendar`

**Diferença do TodayAgenda:** O TodayAgenda mostra SÓ reuniões de hoje. Este card mostra a **semana inteira** com reuniões + tarefas.

**API:** Query server-side:
```sql
-- Meetings da semana
SELECT * FROM meetings WHERE status = 'scheduled'
  AND scheduled_at BETWEEN start_of_week AND end_of_week

-- Tasks com due_date na semana
SELECT * FROM tasks WHERE due_date BETWEEN start_of_week AND end_of_week
  AND status NOT IN ('completed', 'cancelled')
```

**Componente:** `src/components/dashboard/week-calendar-preview.tsx` (novo)

**Nota:** Com este card, o `TodayAgenda` pode ser **removido** da dashboard (informação redundante). Ou mantido se quiser manter o foco do dia separado.

---

### 2.3 Top Lojas

**O que mostra:** Ranking das 5 melhores lojas por revenue Klaviyo.

**Dados disponíveis:** API `/api/dashboard/total-revenue` já retorna `topStores` com:
```typescript
{ storeId, storeName, clientName, totalRevenue, campaignRevenue, flowRevenue }
```

**Layout do card:**
```
┌─ Top Lojas ──────────────────────────────┐
│                                          │
│  1. Loja Alpha        R$ 45.200  ████████│
│     Campaign: R$ 30k  Flow: R$ 15k      │
│                                          │
│  2. Loja Beta         R$ 38.100  ██████  │
│     Campaign: R$ 25k  Flow: R$ 13k      │
│                                          │
│  3. Loja Gamma        R$ 22.500  ████    │
│  4. Loja Delta        R$ 18.300  ███     │
│  5. Loja Epsilon      R$ 12.000  ██      │
│                                          │
│  Período: Últimos 30 dias       [🔄]    │
└──────────────────────────────────────────┘
```

**Destaques:**
- Top 5 lojas ordenadas por revenue total
- Barra de progresso relativa
- Breakdown campaign vs flow nas primeiras 2-3
- Seletor de período (7d, 15d, 30d)
- Cada loja clicável → `/stores/{id}`

**API:** Reutilizar `/api/dashboard/total-revenue` (já existe, já retorna `topStores`)

**Nota:** O `TotalRevenueBanner` já mostra top lojas. Decisão: manter ambos (banner = resultado total + top lojas inline) ou separar (banner = só total, card = ranking detalhado).

**Componente:** `src/components/dashboard/top-stores-card.tsx` (novo)

---

### 2.4 Piores Resultados

**O que mostra:** Ranking das 5 lojas com piores métricas, servindo como alerta de ação.

**Dados disponíveis:**
- Klaviyo performance service: open_rate, click_rate, bounce_rate, unsubscribe_rate
- Health score algorithm (já existe em `list-health-metrics.tsx`)
- Recovery rate (attributed revenue / total revenue)

**Métrica de ranking:** Revenue Klaviyo (mesmo dado do Top Lojas, invertido).

**Layout do card:**
```
┌─ Atenção Necessária ─────────────────────┐
│                                          │
│  1. Loja Zeta        R$ 120     ██       │
│     Campaign: R$ 80  Flow: R$ 40        │
│                                          │
│  2. Loja Omega       R$ 350     ██       │
│     Campaign: R$ 200  Flow: R$ 150      │
│                                          │
│  3. Loja Kappa       R$ 580     ███      │
│  4. Loja Theta       R$ 720     ███      │
│  5. Loja Iota        R$ 980     ████     │
│                                          │
│  Período: Últimos 30 dias       [🔄]    │
└──────────────────────────────────────────┘
```

**Destaques:**
- Bottom 5 lojas por revenue Klaviyo (menor revenue primeiro)
- Barra de progresso relativa
- Breakdown campaign vs flow
- Seletor de período (mesmo do Top Lojas)
- Cada loja clicável → `/stores/{id}`

**API:** Extensão de `/api/dashboard/total-revenue` — já busca todas as lojas, apenas retornar `bottomStores` junto com `topStores`. Zero custo adicional.

**Componente:** `src/components/dashboard/worst-performers-card.tsx` (novo)

---

### 2.5 Onboarding por Função

**O que mostra:** Card de onboardings ativos filtrados pelo ROLE do usuário logado.

**Roles e o que cada um vê:**

| Role | Vê no Card | Ação Principal |
|------|-----------|----------------|
| `owner` / `manager` | Todos os onboardings + aguardando aprovação | Aprovar |
| `coordinator` | Onboardings que coordena | Acompanhar progresso |
| `copywriter` | Fase "Gerando Copies" | Criar/revisar copies |
| `designer` | Fase "Design" | Criar assets |
| `developer` | Fase "Implementação" | Implementar |
| `support` | Todos ativos | Acompanhar |

**Fases do onboarding (da `onboarding-kanban.tsx`):**

| Fase | ID |
|------|-----|
| Aguardando Aprovação | `pending_approval` |
| Gerando Copies | `generating_copies` |
| Design | `design` |
| Implementação | `implementation` |
| Concluído | `completed` |

**Layout do card (exemplo para Owner/Manager):**
```
┌─ Onboardings ────────────────────────────┐
│                                          │
│  ⏳ Aguardando Aprovação: 3              │
│  ✍️  Gerando Copies: 2                   │
│  🎨 Design: 1                            │
│  🔧 Implementação: 4                     │
│                                          │
│  Progresso Médio: 47%  ████████░░░░░░░░  │
│                                          │
│  Próximos a vencer:                      │
│  • Loja X (target: 28/02) - 65%         │
│  • Loja Y (target: 02/03) - 30%         │
│                                          │
│  [Ver Onboardings →]                     │
└──────────────────────────────────────────┘
```

**Layout do card (exemplo para Developer):**
```
┌─ Suas Implementações ────────────────────┐
│                                          │
│  🔧 4 onboardings na fase Implementação  │
│                                          │
│  1. Loja Alpha - 75% ████████████░░░░    │
│     3 steps pendentes                    │
│                                          │
│  2. Loja Beta  - 40% ████████░░░░░░░░   │
│     5 steps pendentes                    │
│                                          │
│  [Ver Onboardings →]                     │
└──────────────────────────────────────────┘
```

**API:** Query server-side no `getDashboardData()`:
```sql
SELECT o.*, c.name as client_name, s.store_name
FROM client_onboardings o
JOIN clients c ON o.client_id = c.id
JOIN client_stores s ON o.store_id = s.id
WHERE o.status != 'completed'
ORDER BY o.target_completion_date ASC
```

Filtrar no server-side com base no role do usuário logado + `current_phase`.

**Componente:** `src/components/dashboard/onboarding-preview.tsx` (novo)

---

### 2.6 Alertas (Reposicionado)

**O que é:** O `DashboardAlerts` já existe. Será reposicionado no novo layout.

**O que mostra hoje:**
- Pagamentos vencidos (high severity)
- Contratos expirando em 30 dias (medium)
- Clientes com health score < 30 (low)
- Próximas reuniões

**Mudança:** Nenhuma no componente. Apenas reposicionar no grid.

---

## 3. Componentes que SAEM da Dashboard

| Componente | Motivo | Destino |
|---|---|---|
| `TodayAgenda` | Redundante com "Prévia do Calendário" | Removido (info está no novo card) |
| `RecentActivity` | Menos prioridade que os novos cards | Removido ou movido para Board |

**Decisão necessária:** Manter `RecentActivity` em algum lugar ou descartar?

---

## 4. Arquivos a Criar

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/components/dashboard/board-preview.tsx` | Client Component | Contagem de tarefas por coluna do kanban |
| `src/components/dashboard/week-calendar-preview.tsx` | Client Component | Mini calendário semanal com eventos |
| `src/components/dashboard/top-stores-card.tsx` | Client Component | Ranking top 5 lojas por revenue |
| `src/components/dashboard/worst-performers-card.tsx` | Client Component | Ranking bottom 5 lojas por health score |
| `src/components/dashboard/onboarding-preview.tsx` | Client Component | Onboardings filtrados por role |

## 5. Arquivos a Modificar

| Arquivo | Mudança |
|---|---|
| `src/app/(dashboard)/dashboard/page.tsx` | Adicionar novos componentes, buscar dados adicionais, remover TodayAgenda/RecentActivity |
| `src/app/api/dashboard/total-revenue/route.ts` | Possivelmente adicionar `bottomStores` (opcional se usar API separada) |

---

## 6. Dados Server-side a Adicionar no `getDashboardData()`

```typescript
// Board Preview — contagem por status
const { data: taskCounts } = await supabase.rpc('get_task_counts_by_status')
// Ou query direta com group by

// Tarefas vencidas
const { data: overdueTasks } = await supabase
  .from('tasks')
  .select('id')
  .lt('due_date', now.toISOString())
  .not('status', 'in', '("completed","cancelled")')

// Week Calendar — meetings + tasks da semana
const weekStart = getStartOfWeek(now)
const weekEnd = getEndOfWeek(now)
const { data: weekMeetings } = await supabase
  .from('meetings')
  .select('id, title, scheduled_at, duration_minutes, meeting_url')
  .eq('status', 'scheduled')
  .gte('scheduled_at', weekStart)
  .lte('scheduled_at', weekEnd)

const { data: weekTasks } = await supabase
  .from('tasks')
  .select('id, title, due_date, status, priority, type')
  .gte('due_date', weekStart)
  .lte('due_date', weekEnd)
  .not('status', 'in', '("completed","cancelled")')

// Onboardings ativos
const { data: activeOnboardings } = await supabase
  .from('client_onboardings')
  .select(`
    id, status, current_phase, progress_percent,
    target_completion_date, assigned_to,
    client:clients(id, name),
    store:client_stores(id, store_name),
    assignee:org_members(id, role, profile:profiles(name))
  `)
  .neq('status', 'completed')
  .order('target_completion_date', { ascending: true })
```

---

## 7. Ordem de Implementação

| Passo | Card | Complexidade | Dependência |
|-------|------|-------------|-------------|
| 1 | **Board Preview** | Baixa | Só query de contagem |
| 2 | **Prévia Calendário** | Média | Query meetings + tasks da semana |
| 3 | **Onboarding por Função** | Média | Query onboardings + lógica de role |
| 4 | **Top Lojas** | Baixa | API já existe (`/total-revenue`) |
| 5 | **Piores Resultados** | Baixa | Mesma API do Top Lojas, só inverter sort |
| 6 | **Alertas** | Nenhuma | Só reposicionar |

**Recomendação:** Implementar 1 → 2 → 3 → 4 → 6 primeiro (todos usam dados locais/DB). Deixar 5 (Piores Resultados) por último por depender de dados externos Klaviyo com rate limiting.

---

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Dashboard server-side fica pesada com muitas queries | Médio | Usar `Promise.all()` para paralelizar, queries otimizadas |
| Onboarding por role precisa resolver role do user logado | Baixo | Já resolvemos role no `DashboardPage` (authProfile + orgMember) |
| Top Lojas duplica info do TotalRevenueBanner | Baixo | Decidir: separar ranking do banner ou manter redundância |

---

## 9. Decisões Pendentes

1. **TodayAgenda:** Remover (redundante com Prévia Calendário) ou manter separado?
2. **RecentActivity:** Remover da dashboard ou manter em algum lugar?
3. **Top Lojas vs TotalRevenueBanner:** O banner já mostra top lojas. Ter card separado ou remover do banner?
4. **Piores Resultados:** **DEFINIDO** — Revenue Klaviyo (bottom 5, mesma API do Top Lojas)
5. **Layout:** Grid 2 colunas fixo ou adaptar para 3 colunas em telas grandes?

---

*Documento gerado por Orion — AIOS Master Orchestrator*
