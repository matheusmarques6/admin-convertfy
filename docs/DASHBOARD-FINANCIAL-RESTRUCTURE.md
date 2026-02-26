# Reestruturação: Mover Dados Financeiros da Dashboard para o Financeiro

**Data:** 2026-02-25
**Status:** Proposta
**Impacto:** Médio-Alto (Dashboard + Financial module)

---

## 1. Problema Atual

A dashboard principal (`/dashboard`) acumula **dados financeiros pesados** que não fazem sentido para uma visão geral operacional:

| Componente | Tipo | Destino |
|---|---|---|
| `BillingMetrics` | Financeiro | **MOVE** → `/financial` aba "Análise" |
| `DashboardCharts` | Financeiro + CRM | **MOVE** → `/financial` aba "Análise" |

**Componentes que FICAM na dashboard:**
- `TotalRevenueBanner` — revenue Klaviyo (campanhas + flows), top stores
- `QuickActions` — atalhos operacionais
- `TodayAgenda` — reuniões do dia
- `DashboardAlerts` — alertas e lembretes
- `RecentActivity` — atividade recente

---

## 2. Solução Proposta

### 2.1 Mover para `/financial` como nova aba "Análise"

A página `/financial` atualmente tem **3 abas**:
- Cobranças (`ChargesManager`)
- Assinaturas (`SubscriptionsManager`)
- Wise (`WiseReconciliation`)

**Adicionar nova aba "Análise"** como primeira aba (default):

```
/financial
├── Análise (NOVA - default) ← BillingMetrics + DashboardCharts
├── Cobranças ← ChargesManager (já existe)
├── Assinaturas ← SubscriptionsManager (já existe)
└── Wise ← WiseReconciliation (já existe)
```

### 2.2 Dashboard fica enxuta e operacional

```
/dashboard (após mudança)
├── TotalRevenueBanner (resultado Klaviyo)
├── QuickActions (atalhos rápidos)
├── TodayAgenda (agenda do dia)
├── DashboardAlerts (alertas e lembretes)
└── RecentActivity (atividade recente)
```

---

## 3. Arquivos Afetados

### 3.1 Arquivos que MUDAM

| Arquivo | Mudança |
|---|---|
| `src/app/(dashboard)/dashboard/page.tsx` | Remover imports e renderização de `BillingMetrics`, `DashboardCharts`. Remover fetch de dados financeiros (`revenueData`, `mrr`). Manter `TotalRevenueBanner`. Reorganizar layout. |
| `src/app/(dashboard)/financial/page.tsx` | Adicionar aba "Análise" com os 2 componentes financeiros movidos (`BillingMetrics` + `DashboardCharts`). Torná-la aba default. |

### 3.2 Componentes REUTILIZADOS (sem alteração)

| Componente | Caminho | Obs |
|---|---|---|
| `TotalRevenueBanner` | `src/components/dashboard/total-revenue-banner.tsx` | **FICA na dashboard.** Funciona standalone via fetch interno. |
| `BillingMetrics` | `src/components/dashboard/billing-metrics.tsx` | **MOVE para financial.** Recebe `mrr` como prop opcional. Faz fetch interno de `/api/integrations/asaas/billing`. |
| `DashboardCharts` | `src/components/dashboard/charts.tsx` | **MOVE para financial.** Recebe props server-side opcionais. Faz fetch interno de `/api/dashboard/financial-summary`. |

### 3.3 APIs que NÃO mudam

Todas as APIs continuam funcionando normalmente — os componentes fazem suas próprias chamadas client-side:

| API | Usado por | Impacto |
|---|---|---|
| `/api/dashboard/total-revenue` | `TotalRevenueBanner` (fica na dashboard) | Nenhum |
| `/api/integrations/asaas/billing` | `BillingMetrics` (move para financial) | Nenhum |
| `/api/dashboard/financial-summary` | `DashboardCharts` | Nenhum |

### 3.4 Dados server-side a REMOVER do dashboard

O `getDashboardData()` em `dashboard/page.tsx` busca dados que só servem para os componentes financeiros:

```
REMOVER do getDashboardData():
- Revenue last 6 months (client_charges + invoices) → usado por DashboardCharts
- MRR from contracts → usado por BillingMetrics

MANTER no getDashboardData():
- meetings (upcoming) → usado por TodayAgenda + DashboardAlerts
- clients by status → se usado por alertas
- recent activities → usado por RecentActivity
- alerts (overdue charges, expiring contracts, low health) → usado por DashboardAlerts
```

**Nota sobre `DashboardCharts`:** Este componente recebe `revenueData`, `clientsData` e `pipelineData` como props server-side, MAS também faz fetch client-side de `/api/dashboard/financial-summary`. Ao movê-lo para `/financial`, temos 2 opções:

- **Opção A (simples):** Mover o componente sem props server-side. Ele já faz fetch client-side, então a aba Receita funcionará. As tabs Pipeline e Clientes receberiam dados vazios e fariam fallback para estados empty.
- **Opção B (ideal):** Transformar `/financial/page.tsx` em server component que busca `clientsData` e `pipelineData` também. Ou adicionar fetch client-side para Pipeline e Clientes dentro do `DashboardCharts`.

**Recomendação:** Opção A para entrega rápida, refatorar depois se necessário.

---

## 4. Detalhamento das Mudanças

### 4.1 `src/app/(dashboard)/dashboard/page.tsx`

**ANTES:**
```tsx
<TotalRevenueBanner />
<QuickActions />
<BillingMetrics mrr={data.mrr} />
<div className="grid grid-cols-7 gap-6">
  <div className="col-span-4">
    <DashboardCharts revenueData={...} clientsData={...} pipelineData={...} />
  </div>
  <div className="col-span-3">
    <TodayAgenda />
    <DashboardAlerts />
    <RecentActivity />
  </div>
</div>
```

**DEPOIS:**
```tsx
<TotalRevenueBanner />
<QuickActions />
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
  <TodayAgenda />
  <DashboardAlerts />
  <RecentActivity />
</div>
```

### 4.2 `src/app/(dashboard)/financial/page.tsx`

**ANTES (3 abas):**
```tsx
<Tabs defaultValue="charges">
  <TabsList>
    <TabsTrigger value="charges">Cobranças</TabsTrigger>
    <TabsTrigger value="subscriptions">Assinaturas</TabsTrigger>
    <TabsTrigger value="wise">Wise</TabsTrigger>
  </TabsList>
  ...
</Tabs>
```

**DEPOIS (4 abas, "Análise" como default):**
```tsx
<Tabs defaultValue="analysis">
  <TabsList>
    <TabsTrigger value="analysis">
      <BarChart3 /> Análise
    </TabsTrigger>
    <TabsTrigger value="charges">
      <DollarSign /> Cobranças
    </TabsTrigger>
    <TabsTrigger value="subscriptions">
      <Repeat /> Assinaturas
    </TabsTrigger>
    <TabsTrigger value="wise">
      <Wallet /> Wise
    </TabsTrigger>
  </TabsList>

  <TabsContent value="analysis">
    <BillingMetrics />
    <DashboardCharts />
  </TabsContent>

  <TabsContent value="charges"><ChargesManager /></TabsContent>
  <TabsContent value="subscriptions"><SubscriptionsManager /></TabsContent>
  <TabsContent value="wise"><WiseReconciliation /></TabsContent>
</Tabs>
```

---

## 5. Considerações Especiais

### 5.1 Prop `mrr` do BillingMetrics

Atualmente, `BillingMetrics` recebe `mrr` como prop do server component da dashboard (calculado de `contracts`). No financeiro, há 2 caminhos:

- **Opção simples:** Passar `mrr` como `undefined`. O componente já trata esse caso — mostra o MRR que vem da API do Asaas.
- **Opção ideal:** Tornar `/financial/page.tsx` um server component que calcula o MRR e passa como prop.

### 5.2 TotalRevenueBanner

O `TotalRevenueBanner` **permanece na dashboard** principal e na operacional. Não é afetado por esta mudança.

### 5.3 Permissões

- `/financial` exige feature `view_financial`
- `/dashboard` é acessível a todos os admin/owner
- **Implicação:** Dados financeiros que antes eram visíveis na dashboard para qualquer admin agora exigem `view_financial`. Verificar se todos admin/owner têm essa permissão.

### 5.4 Props server-side do DashboardCharts

O `DashboardCharts` recebe dados server-side (revenueData, clientsData, pipelineData) para renderização inicial rápida:

- **Receita:** Já tem fetch client-side para `/api/dashboard/financial-summary` — funciona sem props.
- **Pipeline:** Recebe `pipelineData` como prop. Sem prop, a aba Pipeline ficará vazia.
- **Clientes:** Recebe `clientsData` como prop. Sem prop, a aba Clientes ficará vazia.

**Ação necessária:** Adicionar fetch client-side para Pipeline e Clientes dentro do `DashboardCharts`, ou transformar a página financeira em server component.

---

## 6. Ordem de Execução

### Passo 1: Preparar DashboardCharts (se opção B)
- Adicionar fetch client-side para `clientsData` e `pipelineData`
- Tornar todas as props opcionais (já são `?`)

### Passo 2: Atualizar `/financial/page.tsx`
- Adicionar imports de `BillingMetrics` e `DashboardCharts`
- Adicionar aba "Análise" como `defaultValue`
- Renderizar `BillingMetrics` + `DashboardCharts`

### Passo 3: Limpar `/dashboard/page.tsx`
- Remover imports de `BillingMetrics`, `DashboardCharts` (manter `TotalRevenueBanner`)
- Remover dados desnecessários do `getDashboardData()`
- Reorganizar layout com componentes restantes

### Passo 4: Testar
- [ ] `/financial` carrega com aba "Análise" como default
- [ ] `BillingMetrics` funciona no financeiro sem prop `mrr` (ou com)
- [ ] `DashboardCharts` funciona no financeiro sem props server-side
- [ ] `/dashboard` mostra TotalRevenueBanner + QuickActions + Agenda + Alertas + Atividade
- [ ] `/dashboard/operational` continua funcionando normalmente
- [ ] Permissão `view_financial` não quebra acesso
- [ ] Lint + typecheck passando

### Passo 5: Cleanup (opcional)
- Mover componentes de `src/components/dashboard/` para `src/components/financial/`
- Remover queries financeiras de `getDashboardData()`
- Atualizar testes se existirem

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| `DashboardCharts` sem props fica com abas vazias | Alta | Médio | Adicionar fetch client-side ou tornar financial server component |
| Usuários admin sem `view_financial` perdem acesso a dados | Média | Alto | Verificar que todos admin/owner têm `view_financial` |
| Loading states duplicados (cada componente faz fetch) | Baixa | Baixo | Aceitável — cada componente já tem seu próprio skeleton |
| Dashboard operacional dos agentes afetada | Nula | - | Não mexemos na operational |

---

## 8. Resumo Visual

```
ANTES:
┌─────────────────────────────────────────────┐
│ /dashboard                                   │
│ ┌─────────────────────────────────────────┐ │
│ │ TotalRevenueBanner (Klaviyo)            │ │  ← FICA
│ ├─────────────────────────────────────────┤ │
│ │ QuickActions                            │ │  ← FICA
│ ├─────────────────────────────────────────┤ │
│ │ BillingMetrics (Asaas)                  │ │  ← MOVE
│ ├──────────────────────┬──────────────────┤ │
│ │ DashboardCharts      │ TodayAgenda      │ │  ← CHARTS MOVE
│ │ (Receita/Pipeline/   │ DashboardAlerts  │ │  ← AGENDA FICA
│ │  Clientes)           │ RecentActivity   │ │  ← ALERTAS FICA
│ └──────────────────────┴──────────────────┘ │
└─────────────────────────────────────────────┘

DEPOIS:
┌─────────────────────────────────────────────┐
│ /dashboard (enxuta)                          │
│ ┌─────────────────────────────────────────┐ │
│ │ TotalRevenueBanner (Klaviyo)            │ │
│ ├─────────────────────────────────────────┤ │
│ │ QuickActions                            │ │
│ ├────────────┬────────────┬───────────────┤ │
│ │ TodayAgenda│ Alerts     │ RecentActivity│ │
│ └────────────┴────────────┴───────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ /financial                                   │
│ [Análise] [Cobranças] [Assinaturas] [Wise]   │
│ ┌─────────────────────────────────────────┐ │
│ │ BillingMetrics                          │ │
│ │ DashboardCharts                         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 9. Decisões Definidas

1. **Permissões:** Acesso restrito a **Admin/Owner** apenas. Eles já possuem `view_financial` por padrão.
2. **DashboardCharts tabs Pipeline/Clientes:** **Mover tudo junto** para o financeiro (Receita + Pipeline + Clientes ficam na aba Análise).
3. **Renomear componentes:** **Sim.** `DashboardCharts` → `FinancialCharts` (`charts.tsx` → `financial-charts.tsx`).
4. **Dashboard pós-mudança:** Discutir novos cards operacionais **após** a migração ser concluída com sucesso.

---

*Documento gerado por Orion — AIOS Master Orchestrator*
