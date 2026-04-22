# Prompt — Corrigir 5 bugs de pipeline Omnisend no admin-convertfy

> **Contexto**: a integração Omnisend foi implementada em sessões anteriores. A Statistics API está funcionando e retornando dados reais (€12,853 attributedRevenue confirmado). O problema agora é que os dados não fluem corretamente do sync para a UI. São 5 bugs de pipeline de dados — NÃO é problema de API.

---

## Branch de trabalho

`claude/review-codebase-setup-g4NZd`

Todos os commits anteriores estão nesta branch. Continuar nela.

---

## Referência da API Omnisend (CONFIRMADO, não adivinhar)

### Autenticação (TODAS as requests)
```
Authorization: Omnisend-API-Key {apiKey}
Omnisend-Version: 2026-03-15
Content-Type: application/json
```

**IMPORTANTE**: o código em `src/lib/integrations/omnisend/client.ts` já usa este formato. NÃO alterar.

### Statistics API — Revenue (FUNCIONA, CONFIRMADO COM 200)
```
POST https://api.omnisend.com/api/analytics/statistics
Body:
{
  "queries": [{
    "alias": "revenue",
    "metrics": [
      { "name": "totalRevenue" },
      { "name": "totalOrders" },
      { "name": "attributedRevenue" },
      { "name": "attributedOrders" }
    ],
    "dateRange": {
      "from": "2026-03-23T00:00:00Z",
      "to": "2026-04-22T23:59:59Z"
    },
    "dimensions": [{ "name": "timestamp", "granularity": "month" }]
  }]
}

Response (200):
{
  "statistics": [{
    "alias": "revenue",
    "rows": [
      { "timestamp": "2026-03-01T00:00:00Z", "totalRevenue": 110003.69, "attributedRevenue": 0 },
      { "timestamp": "2026-04-01T00:00:00Z", "totalRevenue": 273778.09, "attributedRevenue": 12853.09 }
    ]
  }]
}
```

- `totalRevenue` = receita TOTAL da loja (todas as vendas, ~€383K/30d)
- `attributedRevenue` = receita atribuída ao Omnisend (~€12,853/30d)
- `totalOrders` = total de pedidos (~4,000/30d)
- `attributedOrders` = pedidos atribuídos (~146/30d)
- Granularidades válidas: `hour`, `day`, `week`, `month` (NÃO aceita `total`)
- Dimensões `campaign`/`workflow` NÃO são suportadas para attributedRevenue

### Campaign Stats (FUNCIONA)
```
GET https://api.omnisend.com/v3/campaigns/{campaignID}

Response (200):
{
  "campaignID": "69e14d8f79a3cd36b467613b",
  "name": "[17/04] - [10:00] - ...",
  "status": "sent",
  "sent": 4005,
  "opened": 1235,
  "clicked": 58,
  "bounced": 25,
  "complained": 0,
  "unsubscribed": 30,
  "byDevices": { "opened": { "mobile": 108, "tablet": 2, "desktop": 684 }, ... }
}
```

### Campaign List (FUNCIONA)
```
GET https://api.omnisend.com/v5/campaigns?limit=250
Paginação cursor: paging.cursors.after

Response: { campaigns: [{ id, name, status: "sent", channel: "email", startDate, endDate }] }
```

### Automations List (FUNCIONA)
```
GET https://api.omnisend.com/v5/automations?limit=250

Response: { automations: [{ id, name, isEnabled: true, trigger: { event: "..." }, blocks: [...] }] }
```

**ATENÇÃO**: campo é `isEnabled: true/false`, NÃO `status: "enabled"`. O filtro de automações ativas precisa usar `isEnabled`.

### Segments (FUNCIONA)
```
GET https://api.omnisend.com/v5/segments?limit=100

Response: { segments: [{ segmentID: "...", name: "Clientes que abriram email últimos 90 dias" }] }
```

**NÃO retorna `contactsCount`** — a contagem precisa ser feita via paginação de contacts ou fallback.

### Contacts (FUNCIONA)
```
GET https://api.omnisend.com/v5/contacts?limit=250
Paginação cursor: paging.next (URL completa)

NÃO retorna paging.total — contagem requer paginação completa.
```

### Endpoints que NÃO existem (retornam 404)
- `GET /v5/campaigns/{id}` → 404 (usar `/v3/campaigns/{id}`)
- `GET /v5/automations/{id}` → 404
- `GET /v5/automations/{id}/stats` → 404
- `GET /v5/events` → 404
- `GET /v3/orders` (GET) → 404
- `GET /v5/reports/*` → 404
- `POST /v2026-preview/statistics` → 404 (path errado, usar `/api/analytics/statistics`)

---

## Os 5 bugs a corrigir

### Bug 1 — FATURAMENTO TOTAL mostra €12,9K (attributedRevenue) em vez de €383K (totalRevenue)

**Onde está o problema**: No report (aba Reports da loja), o card "FATURAMENTO TOTAL" mostra o valor da `attributedRevenue` (€12,853 = receita atribuída ao Omnisend). O valor correto deveria ser `totalRevenue` (€383K = receita total da loja).

**Valores esperados (Azzurro Milano, 30d)**:
| Card | Valor correto | Valor exibido hoje |
|------|--------------|-------------------|
| FATURAMENTO TOTAL | ~€383.000 | €12.900 ❌ |
| Receita Atribuída Convertfy | ~€12.853 | €12.900 (correto mas arredondado) |
| TOTAL DE PEDIDOS | ~4.048 | 0 ❌ |
| TICKET MÉDIO | ~€94 | €0 ❌ |

**Causa provável**: O sync grava `totalStoreRevenue` em `store_revenue_summary.store_total_revenue`, mas o campo `omnisend_total_revenue` recebe `totalCampaignRevenue + totalAutomationRevenue` (que é a receita ATRIBUÍDA, não total). O report builder pode estar lendo `omnisend_total_revenue` como "faturamento total" em vez de `store_total_revenue`.

**Arquivos a investigar**:
```bash
grep -rn "store_total_revenue\|omnisend_total_revenue\|totalStoreRevenue\|FATURAMENTO TOTAL" src/ --include="*.ts" --include="*.tsx"
```

**Fix**: garantir que:
- `store_revenue_summary.store_total_revenue` = `revenueStats.totalRevenue` (€383K)
- `store_revenue_summary.store_orders` = `revenueStats.totalOrders` (~4048)
- `store_revenue_summary.omnisend_total_revenue` = `revenueStats.attributedRevenue` (€12,853)
- O card FATURAMENTO TOTAL lê de `store_total_revenue`
- O card Receita Atribuída lê de `omnisend_total_revenue`
- Não arredondar valores — mostrar centavos (€12.853,09 não €12,9 mil)

### Bug 2 — Total de Leads = 0 e Engajados 90D = 0 no report

**Onde está o problema**: O report da loja mostra "TOTAL DE LEADS: 0" e "LEADS ENGAJADOS 90D: 0". Os logs anteriores confirmaram que o sync retorna `totalContacts: 14094` e `subscribedContacts: 4290`.

**Causa provável**: O sync service grava em `store_revenue_summary` com `period_label: "30d"`, mas o report builder pode ler com um `period_label` diferente, ou ler de outra tabela.

**Arquivos a investigar**:
```bash
grep -rn "total_leads\|engaged_leads\|totalContacts\|TOTAL DE LEADS\|Contatos na base" src/ --include="*.ts" --include="*.tsx"
```

**Valores esperados**:
- Total de Leads: 14.094 (total de contatos)
- Leads Engajados 90D: usar segmento "Clientes que abriram email últimos 90 dias" (se contactsCount não disponível, fallback para subscribedContacts = 4.290)
- Taxa de engajamento: `engaged / total * 100`

### Bug 3 — Campanhas = 0 e Flows = 0 no report

**Onde está o problema**: O report mostra "Campanhas Enviadas: 0", "Flows Ativos: 0", "Entregues: 0". Mas a API retorna 18 campanhas com status "sent" e 9 automações com `isEnabled: true`.

**Causas prováveis (verificar todas)**:
1. O filtro de automações ativas usa `status === "enabled"` mas a API retorna `isEnabled: true` (campo booleano, não string)
2. As campanhas podem não estar sendo persistidas em `omnisend_campaign_metrics` — verificar se o upsert funciona
3. O report builder pode ler do cache stale em vez do sync fresh

**Arquivos a investigar**:
```bash
# Filtro de automações ativas
grep -rn "enabled\|isEnabled\|status.*active\|status.*live" src/lib/services/omnisend-sync.service.ts

# Persistência de campanhas
grep -rn "omnisend_campaign_metrics\|omnisend_flow_metrics" src/lib/services/sync-persistence.service.ts

# Report builder
grep -rn "campaignRows\|automationRows\|Campanhas Enviadas\|Flows Ativos" src/ --include="*.ts" --include="*.tsx"
```

**Fix para isEnabled**:
```typescript
// ERRADO (código atual):
const isLive = a.status === "enabled" || a.status === "active"

// CORRETO (baseado na API v5):
const isLive = a.isEnabled === true || a.status === "enabled" || a.status === "active"
```

**OBS**: A interface `OmnisendAutomation` já tem `[key: string]: unknown` como catch-all, então `isEnabled` é acessível. Mas o campo não está declarado na interface — adicionar `isEnabled?: boolean`.

### Bug 4 — Stores Overview: Azzurro com R$ 0 e sem badge OMNISEND

**Onde está o problema**: Na página `/admin/stores`, o card da Azzurro Milano mostra "RECEITA TOTAL: R$ 0,00" e nenhum badge de plataforma. Deveria mostrar receita real e badge "OMNISEND".

**Causa provável**: 
- O `store_revenue_summary` pode estar vazio para a Azzurro no period_label "30d"
- O `email_platform` pode não estar preenchido para Azzurro no client_stores
- O componente `store-overview-card.tsx` já tem renderização condicional do badge (confirmado em sessão anterior) — o problema é que `emailPlatform` vem como `undefined` ou `"none"` 

**Arquivos a investigar**:
```bash
grep -rn "emailPlatform\|email_platform\|badge\|OMNISEND\|KLAVIYO" src/components/stores/store-overview-card.tsx
grep -rn "email_platform" src/app/api/dashboard/stores-overview/route.ts
```

### Bug 5 — Vivazz: trocou para Omnisend mas ainda mostra Klaviyo

**Onde está o problema**: A loja Vivazz teve a integração Klaviyo removida e Omnisend adicionada. Mas o card ainda mostra badge "KLAVIYO" e dados antigos do Klaviyo (R$ 85.474,37).

**Causa**: Quando uma loja troca de plataforma, o sistema precisa automaticamente:
1. Atualizar `client_stores.email_platform = 'omnisend'`
2. Limpar cache Klaviyo stale em `store_revenue_summary` (zerar `klaviyo_*_revenue`)
3. Limpar `klaviyo_campaign_metrics` e `klaviyo_flow_metrics` para essa loja
4. Rodar um sync Omnisend para popular os novos dados

**Onde implementar**: No endpoint que salva/atualiza credenciais de integração. Provavelmente em:
```bash
grep -rn "omnisend_api_key.*update\|UPDATE.*omnisend\|saveCredentials\|updateIntegration" src/ --include="*.ts"
```

**Lógica de migração de plataforma**:
```typescript
async function onPlatformChange(storeId: string, newPlatform: 'omnisend' | 'klaviyo') {
  const oldPlatform = newPlatform === 'omnisend' ? 'klaviyo' : 'omnisend'
  
  // 1. Atualizar email_platform
  await supabase.from('client_stores')
    .update({ email_platform: newPlatform })
    .eq('id', storeId)
  
  // 2. Limpar revenue do provider antigo
  if (oldPlatform === 'klaviyo') {
    await supabase.from('store_revenue_summary')
      .update({ klaviyo_total_revenue: 0, klaviyo_campaign_revenue: 0, klaviyo_flow_revenue: 0 })
      .eq('store_id', storeId)
    await supabase.from('klaviyo_campaign_metrics').delete().eq('store_id', storeId)
    await supabase.from('klaviyo_flow_metrics').delete().eq('store_id', storeId)
  }
  
  // 3. Triggar sync do novo provider
  // (acontece automaticamente no próximo cron ou ao abrir a loja)
}
```

---

## Arquivos-chave do codebase

| Arquivo | Função |
|---------|--------|
| `src/lib/integrations/omnisend/client.ts` | Cliente HTTP Omnisend (auth, rate limit, paginação) |
| `src/lib/services/omnisend-sync.service.ts` | Sync: busca dados da API e retorna `OmnisendSyncData` |
| `src/lib/services/sync-persistence.service.ts` | Grava `OmnisendSyncData` no Supabase (store_revenue_summary + omnisend_*_metrics) |
| `src/lib/integrations/omnisend/campaigns-flows-builder.ts` | Constrói resposta de campaigns/flows (cache → live fetch) |
| `src/lib/integrations/omnisend/report-builder.ts` | Constrói resposta do report da loja |
| `src/lib/services/unified-metrics.service.ts` | Agrega Klaviyo + Omnisend para dashboard |
| `src/app/api/dashboard/stores-overview/route.ts` | API do overview de lojas |
| `src/components/stores/store-overview-card.tsx` | Card visual da loja (badge Klaviyo/Omnisend) |

---

## Tabelas Supabase relevantes

| Tabela | Uso |
|--------|-----|
| `store_revenue_summary` | Cache de revenue agregada (PK: store_id + period_label) |
| `omnisend_campaign_metrics` | Cache de métricas por campanha |
| `omnisend_flow_metrics` | Cache de métricas por automação |
| `klaviyo_campaign_metrics` | Cache Klaviyo (limpar quando migra) |
| `klaviyo_flow_metrics` | Cache Klaviyo (limpar quando migra) |
| `client_stores` | Loja com `email_platform`, `omnisend_api_key`, `klaviyo_*_key` |

---

## Valores de referência (Azzurro Milano, 30d, painel Omnisend real)

| Métrica | Valor real | Tolerância |
|---------|-----------|------------|
| Receita total loja | ~€383.000 | ±10% |
| Receita atribuída Omnisend | €12.853,09 | exato |
| Total de pedidos | ~4.048 | ±5% |
| Pedidos atribuídos | ~146 | ±5 |
| Campanhas enviadas | 18 | exato |
| Automações ativas | 9 | exato |
| Total de contatos | ~14.094 | ±100 |
| Subscribers | ~4.290 | ±50 |

---

## Guardrails

- ❌ NÃO alterar a autenticação da API (já está correta)
- ❌ NÃO tentar endpoints que retornam 404 (listados acima)
- ❌ NÃO mexer no código Klaviyo (só limpar cache quando migra)
- ❌ NÃO arredondar valores de revenue (mostrar centavos)
- ✅ Cada fix = 1 commit separado
- ✅ Verificar typecheck antes de cada commit
- ✅ Se algum número ficar > 2x fora da tolerância, parar e investigar
