# Story: Sistema de Alertas de Lojas

**ID:** STORE-ALERTS
**Prioridade:** Alta
**Status:** Draft
**Data:** 2026-02-23
**Estimativa:** Epic (4 tasks)

---

## Objetivo

Criar um sistema de alertas inteligente que monitore a saúde das lojas e notifique a equipe quando houver problemas críticos, tanto na interface (aba Alertas) quanto via WhatsApp (Evolution API).

---

## User Stories

**Como** gestor de contas,
**Eu quero** ser alertado automaticamente quando uma loja apresentar problemas de performance ou integração,
**Para que** eu possa agir rapidamente e evitar perda de receita para o cliente.

---

## Triggers de Alerta

| # | Tipo | Condição | Severidade |
|---|------|----------|------------|
| 1 | `low_revenue` | Faturamento abaixo do limiar configurado por loja (% de queda vs média 3 meses) | `critical` |
| 2 | `klaviyo_account_error` | Falha na conexão/autenticação da API Klaviyo (chave inválida, conta suspensa, etc.) | `critical` |
| 3 | `campaign_failure` | Campanha com status de erro/falha no envio | `warning` |
| 4 | `low_recovery_rate` | Taxa de recuperação de email (resultado %) abaixo de 10% | `warning` |

---

## Critérios de Aceite

### Task 1 — Backend: Tabela e Service de Alertas

- [ ] Criar migration Supabase `store_alerts`
  ```sql
  store_alerts (
    id uuid PK default gen_random_uuid(),
    store_id uuid FK → client_stores.id NOT NULL,
    client_id uuid FK → clients.id NOT NULL,
    type text NOT NULL, -- 'low_revenue' | 'klaviyo_account_error' | 'campaign_failure' | 'low_recovery_rate'
    severity text NOT NULL, -- 'critical' | 'warning' | 'info'
    title text NOT NULL,
    message text NOT NULL,
    status text NOT NULL DEFAULT 'active', -- 'active' | 'acknowledged' | 'resolved'
    metadata jsonb DEFAULT '{}', -- dados contextuais (valores, thresholds, etc.)
    resolved_at timestamptz,
    resolved_by uuid FK → profiles.id,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  )
  ```
- [ ] Adicionar coluna `alert_revenue_threshold` (integer, default 30) na tabela `client_stores` — limiar de queda % configurável por loja
- [ ] Criar `src/lib/services/store-alert.service.ts` com:
  - `createAlert(data)` — cria alerta + dispara notificação in-app + WhatsApp
  - `getAlertsByStore(storeId, filters?)` — listar alertas de uma loja
  - `getActiveAlerts()` — todos alertas ativos (para painel geral)
  - `getAlertsSummary()` — contadores por tipo/severidade
  - `acknowledgeAlert(alertId, userId)` — marcar como visto
  - `resolveAlert(alertId, userId)` — resolver alerta
  - `checkDuplicateAlert(storeId, type)` — evitar alertas duplicados (mesmo tipo ativo)

### Task 2 — Backend: Engine de Verificação + API Routes

- [ ] Criar `src/lib/services/store-alert-checker.ts` — engine que verifica as 4 condições:
  - **checkRevenue(store):** Buscar faturamento atual vs média últimos 3 meses. Se queda > `alert_revenue_threshold` → alerta `low_revenue`
  - **checkKlaviyoHealth(store):** Testar conexão API Klaviyo. Se falhar → alerta `klaviyo_account_error`
  - **checkCampaignFailures(store):** Verificar campanhas dos últimos 7 dias com status de erro → alerta `campaign_failure`
  - **checkRecoveryRate(store):** Se `result_percentage` < 10% → alerta `low_recovery_rate`
  - **runAllChecks(storeId?):** Executar todas as verificações (para uma loja ou todas)
- [ ] Criar API route `POST /api/stores/alerts/check` — executar verificação manual (botão)
  - Query param `?store_id=xxx` para verificar loja específica
  - Sem param = verificar todas as lojas
  - Retorna `{ alerts_created: number, alerts_resolved: number, details: [...] }`
- [ ] Criar API route `GET /api/stores/alerts` — listar alertas
  - Query params: `store_id`, `status`, `type`, `severity`, `limit`
- [ ] Criar API route `PATCH /api/stores/alerts/[id]` — atualizar alerta (acknowledge/resolve)
- [ ] Criar API route `GET /api/stores/alerts/summary` — resumo de alertas
- [ ] Criar cron/scheduled job semanal (via Supabase pg_cron ou Vercel Cron):
  - Route: `GET /api/cron/store-alerts-check`
  - Headers: `Authorization: Bearer CRON_SECRET`
  - Executa `runAllChecks()` para todas as lojas ativas

### Task 3 — Frontend: Aba Alertas na Página da Loja

- [ ] Criar componente `src/components/stores/store-alerts-tab.tsx`:
  - Lista de alertas com ícones por severidade (critical = vermelho, warning = amarelo)
  - Badge de contagem no tab trigger
  - Cada alerta mostra: tipo, mensagem, data, status
  - Ações: "Marcar como visto", "Resolver", "Ver detalhes"
  - Filtros: por tipo, severidade, status
  - Estado vazio: "Nenhum alerta — tudo certo!"
- [ ] Adicionar tab "Alertas" no `store-detail-tabs.tsx`:
  - Ícone: `AlertTriangle` (lucide)
  - Badge vermelho com contagem de alertas ativos
  - Posicionar antes da tab "Configurações"
- [ ] Adicionar botão "Verificar Agora" no topo da aba:
  - Chama `POST /api/stores/alerts/check?store_id=xxx`
  - Loading spinner durante verificação
  - Toast com resultado
- [ ] Na tab "Configurações", adicionar campo para configurar `alert_revenue_threshold`:
  - Slider ou input numérico (10% a 80%, default 30%)
  - Label: "Limiar de alerta de faturamento"
  - Descrição: "Alerta quando o faturamento cair mais que X% em relação à média"

### Task 4 — Integração WhatsApp via Evolution API

- [ ] Criar `src/lib/integrations/evolution-api.ts`:
  - Configuração via env vars: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`
  - `sendGroupMessage(groupId, message)` — envia mensagem para grupo
  - `formatAlertMessage(alert)` — formata alerta em texto legível para WhatsApp
    ```
    🚨 *ALERTA: [Tipo]*
    📍 Loja: [Nome da Loja]
    👤 Cliente: [Nome do Cliente]

    [Mensagem do alerta]

    📊 Detalhes:
    - [dados relevantes do metadata]

    🔗 Ver no painel: [URL]
    ```
- [ ] Configuração no `.env`:
  ```
  EVOLUTION_API_URL=https://sua-instancia.evolution-api.com
  EVOLUTION_API_KEY=sua-api-key
  EVOLUTION_INSTANCE_NAME=nome-da-instancia
  EVOLUTION_ALERT_GROUP_ID=id-do-grupo-de-alertas
  ```
- [ ] No `store-alert.service.ts`, ao criar alerta:
  1. Salvar no banco (store_alerts)
  2. Criar notificação in-app (notification.service.ts) para todos admins
  3. Enviar mensagem WhatsApp para o grupo via Evolution API
- [ ] Tratamento de erro resiliente — se WhatsApp falhar, alerta ainda é salvo no banco

---

## Regras de Negócio

1. **Sem duplicatas:** Não criar novo alerta se já existe um alerta ativo do mesmo tipo para a mesma loja
2. **Auto-resolução:** Se uma verificação detectar que a condição foi corrigida (ex: faturamento voltou ao normal), resolver automaticamente o alerta anterior
3. **Threshold por loja:** Cada loja tem seu próprio limiar de faturamento (`alert_revenue_threshold`)
4. **Frequência:** Verificação semanal automática + botão manual
5. **Notificação dupla:** Todo alerta vai para: banco (aba alertas) + notificação in-app + WhatsApp grupo
6. **Histórico:** Alertas resolvidos ficam no histórico (não são deletados)

---

## Arquitetura

```
[Cron Semanal / Botão Manual]
         ↓
  store-alert-checker.ts
    (verifica 4 condições)
         ↓
  store-alert.service.ts
    (cria alerta no DB)
         ↓
    ┌────┼────────┐
    ↓    ↓        ↓
  DB   In-App   WhatsApp
  (store_alerts) (notification.service) (evolution-api.ts)
```

---

## Stack Técnica

- **Backend:** Next.js API Routes + Supabase PostgreSQL
- **Frontend:** React + Tailwind + Radix UI (padrão existente)
- **WhatsApp:** Evolution API (REST)
- **Cron:** Vercel Cron Jobs ou Supabase pg_cron
- **Notificações in-app:** NotificationService existente

---

## Dependências Existentes (reutilizar)

- `src/lib/services/notification.service.ts` — notificações in-app
- `src/lib/integrations/klaviyo/report-summary.ts` — dados de receita Klaviyo
- `src/lib/integrations/shopify/report.ts` — dados de receita Shopify
- `src/app/api/stores/control/route.ts` — lógica de cálculo de resultado %
- `src/components/stores/store-detail-tabs.tsx` — tabs da loja (adicionar aba)
- `src/app/api/integrations/klaviyo/test/route.ts` — teste de conexão Klaviyo

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/YYYYMMDD_store_alerts.sql` | Migration da tabela store_alerts |
| `src/lib/services/store-alert.service.ts` | Service CRUD de alertas |
| `src/lib/services/store-alert-checker.ts` | Engine de verificação das 4 condições |
| `src/lib/integrations/evolution-api.ts` | Client da Evolution API |
| `src/app/api/stores/alerts/check/route.ts` | API verificação manual |
| `src/app/api/stores/alerts/route.ts` | API listar alertas |
| `src/app/api/stores/alerts/[id]/route.ts` | API atualizar alerta |
| `src/app/api/stores/alerts/summary/route.ts` | API resumo alertas |
| `src/app/api/cron/store-alerts-check/route.ts` | Cron semanal |
| `src/components/stores/store-alerts-tab.tsx` | Componente aba alertas |

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/stores/store-detail-tabs.tsx` | Adicionar tab "Alertas" |
| `.env.local` | Adicionar variáveis da Evolution API |

---

## Fora do Escopo (v1)

- Dashboard global de alertas (pode ser adicionado depois)
- Configuração de quais tipos de alerta notificar no WhatsApp
- Alertas por email
- Regras customizadas de alerta
- Integração com Slack/Discord

---

## Definição de Pronto (DoD)

- [ ] Todas as tasks acima marcadas como concluídas
- [ ] Alertas sendo criados corretamente para as 4 condições
- [ ] Aba "Alertas" visível e funcional na página da loja
- [ ] Botão "Verificar Agora" funcionando
- [ ] Notificação WhatsApp chegando no grupo via Evolution API
- [ ] Alertas duplicados sendo prevenidos
- [ ] Auto-resolução funcionando
- [ ] Threshold configurável por loja
- [ ] Código sem erros de lint/typecheck
