---
Prioridade: High
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "1 - Cache (Foundation)"
Esforco: MEDIUM
Dependencias: Nenhuma
---

# Story RG-1 — Write-through Cache para Custom Ranges

## Story

**Como** operador do admin panel que consulta metricas de lojas com datas personalizadas,
**Quero** que os resultados de custom date ranges sejam persistidos em cache no banco,
**Para que** a segunda consulta do mesmo range seja instantanea e nao repita API calls desnecessarias na Klaviyo.

## Contexto

### Problema

Custom date ranges fazem ~12s de API calls por loja (3 calls XS-tier na Klaviyo). Atualmente os resultados nao sao cacheados — cada vez que o operador consulta o mesmo range, as mesmas API calls sao repetidas.

### Solucao

Estender a tabela `store_revenue_summary` para suportar custom ranges via colunas `range_start` e `range_end`. Quando `period_label = 'custom'`, esses campos identificam o range exato. Um CHECK constraint garante integridade: custom ranges DEVEM ter datas, periodos padrao NAO devem ter.

### TTL Strategy (tiered)

| Condicao | TTL | Justificativa |
|----------|-----|---------------|
| `end_date < hoje - 7 dias` (historico) | 30 dias | Dados nao mudam mais |
| `end_date < hoje` (recente) | 6 horas | Pode ter ajustes tardios |
| `end_date >= hoje`, range > 30 dias | 2 horas | Range longo, dados parciais |
| `end_date >= hoje`, range <= 30 dias | 30 minutos | Range curto, dados ativos |

### Schema Migration

```sql
-- 1. Drop e re-criar CHECK de period_label para incluir novos valores
ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS valid_period_label;
ALTER TABLE store_revenue_summary ADD CONSTRAINT valid_period_label CHECK (
  period_label IN ('7d', '15d', '30d', '90d', '1d', '12m', 'custom')
);

-- 2. Drop e re-criar CHECK de sync_source para incluir 'report'
ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS store_revenue_summary_sync_source_check;
ALTER TABLE store_revenue_summary ADD CONSTRAINT store_revenue_summary_sync_source_check CHECK (
  sync_source IN ('cron', 'live', 'report')
);

-- 3. Adicionar colunas de range
ALTER TABLE store_revenue_summary
  ADD COLUMN range_start date,
  ADD COLUMN range_end date;

-- 4. CHECK: custom requer datas, outros proibem
ALTER TABLE store_revenue_summary
  ADD CONSTRAINT chk_custom_range_dates CHECK (
    (period_label = 'custom' AND range_start IS NOT NULL AND range_end IS NOT NULL)
    OR (period_label != 'custom' AND range_start IS NULL AND range_end IS NULL)
  );

-- 5. Partial unique index para custom ranges
CREATE UNIQUE INDEX uq_store_custom_range
  ON store_revenue_summary (store_id, range_start, range_end)
  WHERE period_label = 'custom';
```

## Tasks

### Task 1 — Migration: adicionar colunas e constraints
- [x] Criar migration `supabase/migrations/20260318_report_generation_cache.sql`
- [x] DROP e re-criar CHECK constraint `valid_period_label` para incluir `'custom'`, `'1d'`, `'12m'`
- [x] Alterar CHECK de `sync_source` para incluir `'report'`
- [x] ADD COLUMN `range_start date` na tabela `store_revenue_summary`
- [x] ADD COLUMN `range_end date` na tabela `store_revenue_summary`
- [x] ADD CONSTRAINT `chk_custom_range_dates` (custom requer datas, outros proibem)
- [x] CREATE UNIQUE INDEX `uq_store_custom_range` no (store_id, range_start, range_end) WHERE period_label = 'custom'
- [x] Verificar que migration nao quebra rows existentes (todos tem period_label != 'custom', datas NULL)
- [x] DROP PK e re-criar como partial unique index `uq_store_period_standard` para non-custom rows (necessario para suportar multiplos custom ranges por store)
- [x] CREATE FUNCTION `upsert_custom_range_cache` para UPSERT atomico via RPC

**Ordem completa da migration:**
1. Drop `valid_period_label` CHECK
2. Re-criar `valid_period_label` com todos os valores incluindo `'custom'`, `'1d'`, `'12m'`
3. Drop e re-criar `sync_source` CHECK incluindo `'report'`
4. Add columns `range_start`, `range_end`
5. Add CHECK `chk_custom_range_dates`
6. Create partial unique index `uq_store_custom_range`

### Task 2 — Modificar report-summary.ts para write-through
- [x] Ao buscar dados de custom range, antes de chamar API: verificar cache no banco
- [x] Se cache existe e TTL valido: retornar dados do cache (skip API calls)
- [x] Se cache nao existe ou TTL expirado: chamar API normalmente
- [x] Apos receber dados da API: persistir resultado em `store_revenue_summary` com `period_label = 'custom'`, `range_start`, `range_end`
- [x] Usar UPSERT (ON CONFLICT) via RPC `upsert_custom_range_cache` para atualizar cache existente

### Task 3 — Implementar TTL logic em data-status.ts
- [x] Criar funcao `getCustomRangeTTL(rangeStart: Date, rangeEnd: Date): number` que retorna TTL em milissegundos
- [x] Implementar as 4 regras de TTL tiered conforme tabela acima
- [x] Criar funcao `isCustomRangeCacheFresh(fetchedAt, rangeStart, rangeEnd): boolean` que compara `fetched_at + TTL > now()`
- [x] Exportar ambas funcoes para uso em report-summary.ts

### Task 4 — Testes unitarios
- [x] Teste: TTL historico (end_date 30 dias atras) = 30 dias
- [x] Teste: TTL recente (end_date ontem) = 6 horas
- [x] Teste: TTL ongoing longo (end_date hoje, range 60 dias) = 2 horas
- [x] Teste: TTL ongoing curto (end_date hoje, range 7 dias) = 30 minutos
- [x] Teste: cache fresh retorna true quando dentro do TTL
- [x] Teste: cache stale retorna false quando TTL expirado
- [ ] Teste: write-through persiste corretamente com range_start e range_end
- [ ] Teste: segunda chamada com mesmo range retorna cache (nao chama API)

## Acceptance Criteria

### RG-1.1 — Migration aplicada sem erros
- [ ] Migration executa sem erros em banco com dados existentes
- [ ] Colunas `range_start` e `range_end` existem na tabela
- [ ] CHECK constraint `chk_custom_range_dates` ativo
- [ ] Unique index `uq_store_custom_range` ativo
- [ ] Rows existentes (period_label != 'custom') nao sao afetados

### RG-1.2 — Custom range results sao cacheados
- [ ] Primeira consulta de custom range: chama API Klaviyo e persiste resultado
- [ ] Segunda consulta do MESMO range: retorna dados do cache, ZERO API calls
- [ ] Resultado do cache e identico ao resultado da API

### RG-1.3 — TTL tiered e respeitado
- [ ] Range historico (end_date < hoje - 7d): cache valido por 30 dias
- [ ] Range recente (end_date < hoje): cache valido por 6 horas
- [ ] Range ongoing longo (end_date >= hoje, >30d): cache valido por 2 horas
- [ ] Range ongoing curto (end_date >= hoje, <=30d): cache valido por 30 minutos
- [ ] Cache expirado dispara nova chamada API e atualiza o registro

### RG-1.4 — Constraint enforced
- [ ] Tentar inserir period_label='custom' sem range_start/range_end → erro CHECK
- [ ] Tentar inserir period_label='7d' com range_start preenchido → erro CHECK
- [ ] Inserir dois custom ranges com mesmos store_id + range_start + range_end → erro UNIQUE

### RG-1.5 — UPSERT usa raw SQL
- [ ] Custom range UPSERT usa raw SQL (nao `.upsert()`), conflito resolvido via partial unique index

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/migrations/20260318_report_generation_cache.sql` | CREATE | Migration: PK→partial unique, range_start/end, CHECK, UNIQUE INDEX, RPC upsert_custom_range_cache |
| `src/lib/integrations/klaviyo/report-summary.ts` | MODIFY | Write-through: cache-first for custom ranges + persist via RPC after API |
| `src/lib/shared/data-status.ts` | MODIFY | TTL tiered logic: getCustomRangeTTL, isCustomRangeCacheFresh |
| `src/lib/shared/data-status-custom-range.test.ts` | CREATE | 14 unit tests for custom range TTL functions |

## Testing Notes

- Testar migration em banco local com dados existentes (nao deve quebrar)
- Testar TTL com datas mockadas (freeze time)
- Testar write-through com mock da API Klaviyo
- Verificar que periodos padrao (7d, 30d, etc) continuam funcionando normalmente

## Technical Notes

- A tabela `store_revenue_summary` ja e usada pelo cron sync para periodos padrao
- O campo `fetched_at` existente sera usado para calcular TTL
- Para periodos padrao, o unique constraint existente (store_id + period_label) continua valendo
- NAO alterar o comportamento do cron sync — esta story so afeta custom ranges

### PK Strategy para Custom Ranges

A PK existente e `(store_id, period_label)`. Multiplos custom ranges por loja conflitariam nessa PK. Estrategia: **manter PK existente como esta**. Para custom range UPSERT, usar **raw SQL** com `ON CONFLICT` no partial unique index `uq_store_custom_range`, NAO usar Supabase `.upsert()`:

```sql
INSERT INTO store_revenue_summary (store_id, period_label, org_id, range_start, range_end, ...)
VALUES ($1, 'custom', $2, $3, $4, ...)
ON CONFLICT (store_id, range_start, range_end) WHERE period_label = 'custom'
DO UPDATE SET
  klaviyo_total_revenue = EXCLUDED.klaviyo_total_revenue,
  fetched_at = NOW(),
  updated_at = NOW();
```

### Concurrent Writes

Dois usuarios requisitando o mesmo custom range simultaneamente — o partial unique index + ON CONFLICT resolve atomicamente. Nao precisa de advisory lock.

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Migration falha em producao por dados inconsistentes | Testar em staging primeiro. Rows existentes tem period_label != 'custom' e datas NULL, o que satisfaz o CHECK |
| Cache retorna dados stale para ranges ativos | TTL tiered garante refresh frequente para ranges que incluem "hoje" |
| Conflito com cron sync que tambem escreve em store_revenue_summary | Cron sync usa period_label = '7d'/'30d'/etc, nunca 'custom'. Nao ha overlap |
| Epic 54.1 tambem modifica `store_revenue_summary` (period_label) | RG-1 migration deve rodar antes ou coordenar com Epic 54 migrations. Verificar ordem de execucao antes de deploy |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
