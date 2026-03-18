---
Prioridade: High
Sprint: Current
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "API Klaviyo — Rate Limit & Compliance"
Fase: "2 - High Priority"
Esforco: MEDIUM
Dependencias: "Nenhuma"
---

# Story AK-7 — SMS Stats por Canal

## Story

**Como** operador do sistema,
**Quero** que campanhas SMS sejam medidas com statistics de SMS (nao de email),
**Para que** os dashboards mostrem dados reais de SMS em vez de zeros.

## Contexto

### Problema

O sistema busca campanhas SMS corretamente (filtro `equals(messages.channel,'sms')`), mas ao solicitar metricas de reporting, usa statistics de email:

```typescript
statistics: [
  "recipients", "delivered", "open_rate", "click_rate",
  "conversion_rate", "conversion_value", ...
]
```

Para SMS, as statistics corretas sao:
- `recipients_sms`, `delivered_sms`, `click_rate_sms`
- `conversion_rate_sms`, `conversion_value_sms`
- `revenue_per_recipient_sms`, `unsubscribed_sms`
- `delivered_sms_unique`, `clicked_sms_unique`

Resultado: campanhas SMS retornam zeros para todas as metricas = **dados 100% perdidos**.

### Achados da Revisao (IMPORTANTES)

1. **Coluna `channel` JA EXISTE** no schema (`migration 20250213_advanced_reporting.sql`). TypeScript type `CampaignMetricRow` ja tem `channel: string` (linha 76). O cron ja popula `channel: info?.channel || "email"` (linha 702). **NAO precisa de migration para coluna.**

2. **`campaign-values-reports` aceita stats mistas** (email + SMS) no mesmo request. A Klaviyo retorna cada campaign com `send_channel` correto no grouping. NAO precisa de 2 requests separados.

3. **`open_rate` para SMS nao existe** — deve ser armazenado como `NULL`, nao `0`. Verificar se a coluna `open_rate` aceita NULL no schema antes de implementar.

### Dados

- `klaviyo-sync.service.ts` em `fetchCampaignNames()`: ja busca channels `["email", "sms"]`
- Report calls: usam sempre email statistics, independente do channel
- `metrics/route.ts:97-98`: busca email campaigns e sms campaigns separadamente
- Persistencia: coluna `channel` existe, mas metricas SMS sao todas zero

## Acceptance Criteria

### AK-7.1 — Statistics condicionais por canal

- [ ] Criar constante `EMAIL_STATISTICS` com as stats atuais de email
- [ ] Criar constante `SMS_STATISTICS` com as stats equivalentes de SMS:
  ```typescript
  const SMS_STATISTICS = [
    "recipients_sms", "delivered_sms", "delivered_sms_unique",
    "clicked_sms", "clicked_sms_unique", "click_rate_sms",
    "conversion_rate_sms", "conversion_value_sms", "conversions_sms",
    "revenue_per_recipient_sms", "unsubscribed_sms", "unsubscribed_sms_unique"
  ]
  ```
- [ ] Criar `CHANNEL_STATISTICS_MAP: Record<Channel, string[]>` para centralizar (extensivel para push/whatsapp futuro)
- [ ] No report call de campaigns, incluir AMBAS listas de stats no mesmo request (mixed stats)

### AK-7.2 — Cron sync com mapping de stats SMS

- [ ] No `syncStoreKlaviyoData()`, ao processar campaign results, verificar `send_channel` do grouping
- [ ] Se `send_channel === 'sms'`, mapear stats SMS para colunas existentes:
  - `delivered_sms` → coluna `delivered`
  - `click_rate_sms` → coluna `click_rate`
  - `conversion_value_sms` → coluna `conversion_value`
  - `revenue_per_recipient_sms` → coluna `revenue_per_recipient`
  - `unsubscribed_sms` → coluna `unsubscribed`
- [ ] Para `open_rate` em SMS: armazenar como `NULL` (nao `0`)
- [ ] Para `bounced` em SMS: armazenar como `NULL` (nao `0`)
- [ ] Verificar constraint da coluna `open_rate` — se `NOT NULL DEFAULT 0`, precisa migration para `DROP NOT NULL`

### AK-7.3 — Dashboard display

- [ ] Verificar que campaigns SMS mostram metricas reais no dashboard (nao zeros)
- [ ] Para colunas NULL (open_rate, bounced em SMS): exibir "N/A" ou "—", nao "0%"
- [ ] Opcional: indicar visualmente no dashboard que uma campanha e SMS vs Email (badge)

### AK-7.4 — Migration (se necessaria)

- [ ] Verificar se `open_rate` e `bounced` aceitam NULL no schema atual
- [ ] Se nao: `ALTER TABLE klaviyo_campaign_metrics ALTER COLUMN open_rate DROP NOT NULL;`
- [ ] Adicionar CHECK constraint para channel: `CHECK (channel IN ('email', 'sms', 'push', 'whatsapp'))`

### AK-7.5 — Testes

- [ ] Testar que campaign email usa `EMAIL_STATISTICS` e retorna metricas normais
- [ ] Testar que campaign SMS usa `SMS_STATISTICS` e retorna metricas nao-zero
- [ ] Testar mapping de stats SMS para colunas existentes
- [ ] Testar que campaigns mistas (email + sms) na mesma org sao processadas corretamente
- [ ] Testar que `open_rate` e `NULL` para SMS, nao `0`
- [ ] Testar edge case: `send_channel` desconhecido (ex: push) → tratar como email (default)

## Impacto Esperado

- Dados de SMS passam a ser capturados (atualmente 100% perdidos)
- Dashboards mostram metricas reais para campanhas SMS
- Melhor visibilidade do ROI de SMS marketing

## Riscos

- Se `open_rate` coluna e `NOT NULL DEFAULT 0`, precisa migration para aceitar NULL
- Rows historicas com `channel = 'sms'` e metricas de email serao sobrescritas com metricas SMS no proximo sync (comportamento desejado — dados anteriores estavam incorretos)
- Se a loja nao usa SMS, nenhum impacto (stats retornam vazio, nao erro)

## Arquivos Afetados

- `src/lib/services/klaviyo-sync.service.ts` — stats condicionais + mapping
- `src/app/api/integrations/klaviyo/metrics/route.ts` — stats condicionais
- Migration: CHECK constraint + potencial DROP NOT NULL em open_rate/bounced
- Portal/Admin dashboards: exibir "N/A" para metricas inexistentes + channel badge

---

## Revisao Multi-Agente (Atualizada pos-revisao)

### @dev — Anotacoes de Implementacao

- **Complexidade revisada: MEDIUM** (nao LOW). Mapping semantico + UI para "N/A" + potencial migration.
- A coluna `channel` **ja existe** — NAO criar migration para ela.
- **Abordagem**: incluir AMBAS listas de stats no mesmo request de `campaign-values-reports`. A Klaviyo retorna cada campaign com `send_channel` correto. No processing, condicionar o mapping de stats baseado em `send_channel`.
- `CHANNEL_STATISTICS_MAP` centraliza a logica. Pattern extensivel para push/whatsapp futuro.
- Reusar `CampaignMetricRow` existente (linha 69) — ja tem campo `channel`.

### @qa — Anotacoes de Qualidade (Revisao 2)

- **BLOCKER anterior resolvido**: Story agora reconhece que coluna `channel` ja existe e ajusta esforco.
- **Teste critico**: Verificar com conta Klaviyo real que stats mistas (email + SMS) funcionam no mesmo request. Se nao funcionar, precisa de 2 requests separados.
- **Regressao**: Campaigns email devem retornar metricas IDENTICAS ao comportamento atual.
- **Edge case**: `open_rate` = NULL para SMS — verificar que frontend exibe "—" e nao "0%".
- **Validacao de constraint**: Antes da migration, verificar se `open_rate` e `bounced` sao NOT NULL no schema.

### @data-engineer — Anotacoes de Dados (Revisao 2)

- **Migration corrigida**: Coluna `channel` ja existe (migration `20250213`). Nenhuma migration de coluna necessaria.
- **Migration possivel**: CHECK constraint para `channel` e DROP NOT NULL para `open_rate`/`bounced` se necessario.
- **Backfill**: Rows historicas com `channel = 'sms'` e metricas zeradas serao corrigidas no proximo sync cycle. NAO precisa de backfill manual.
- **RLS**: Nenhum impacto — policies usam `org_id`/`store_id`, nao `channel`.

### @architect — Anotacoes Arquiteturais

- **Design `CHANNEL_STATISTICS_MAP`**: Correto e extensivel. Centraliza a logica de stats por canal.
- **Futurismo**: Push notifications da Klaviyo usarao o mesmo pattern. O design acomoda.
- **Sugestao**: Exportar `type Channel = 'email' | 'sms' | 'push' | 'whatsapp'` como tipo formal.

### @analyst — Anotacoes de Impacto (Revisao 2)

- **Bug de dados funcional, nao melhoria**. SMS 100% perdido justifica P1, nao P2.
- **Acao pre-dev**: Verificar quantas das 42 lojas tem campaigns SMS ativas. Se >10, considerar priorizar antes de AK-2.
- **UX**: Badge "SMS"/"Email" nas campanhas melhora compreensao do dashboard. Recomendado (nao opcional).