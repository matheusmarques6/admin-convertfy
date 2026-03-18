---
Prioridade: High
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "3 - Background Jobs (Core)"
Esforco: MEDIUM
Dependencias: RG-1
---

# Story RG-4 — Job Queue no Supabase

## Story

**Como** operador do admin panel que gera relatorios de multiplas lojas com datas personalizadas,
**Quero** que o sistema crie um job rastreavel no banco de dados para cada geracao,
**Para que** o processamento sobreviva a fechamento do browser, evite duplicacoes, e permita consultar status/resultado depois.

## Contexto

### Problema

Com 10+ lojas a ~12s cada, o processamento total pode exceder 60s (timeout Vercel). Mesmo com fan-out (RG-2), se o operador fechar o browser os fetches sao cancelados e o trabalho perdido.

### Solucao

Criar tabela `report_jobs` no Supabase para rastrear jobs de geracao de relatorios. APIs REST para criar job (POST) e consultar status (GET). Deduplicacao impede que o mesmo relatorio seja gerado em paralelo. RLS garante que cada org so veja seus proprios jobs.

### Schema

```sql
CREATE TABLE report_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  store_ids UUID[] NOT NULL,
  period TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'queued',
  progress JSONB DEFAULT '{}',
  result JSONB,
  viewed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days'
);
```

### Status Lifecycle

`queued` → `processing` → `completed` | `partial` | `failed` | `paused` | `cancelled` | `expired`

## Tasks

### Task 1 — Migration: criar tabela report_jobs
- [ ] Criar migration `supabase/migrations/YYYYMMDD_report_jobs.sql`
- [ ] CREATE TABLE `report_jobs` com schema conforme spec (incluindo `viewed_at`, FK em `user_id`)
- [ ] ADD CHECK constraint para status: `status IN ('queued', 'processing', 'completed', 'partial', 'failed', 'paused', 'cancelled', 'expired')` — Nota: TEXT + CHECK e escolha deliberada (nao ENUM) para facilitar evolucao futura sem migration de tipo
- [ ] Criar `updated_at` trigger:
  ```sql
  CREATE OR REPLACE FUNCTION update_report_jobs_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER trg_report_jobs_updated_at
    BEFORE UPDATE ON report_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_report_jobs_updated_at();
  ```
- [ ] Criar indexes abrangentes:
  ```sql
  -- Org history + notifications
  CREATE INDEX idx_report_jobs_org_created ON report_jobs (org_id, created_at DESC);

  -- Processor: pick next job
  CREATE INDEX idx_report_jobs_status_created ON report_jobs (status, created_at ASC)
    WHERE status IN ('queued', 'processing');

  -- Deduplication: active jobs for same range
  CREATE UNIQUE INDEX uq_report_jobs_active_range ON report_jobs (org_id, start_date, end_date)
    WHERE status IN ('queued', 'processing', 'paused');

  -- Cleanup
  CREATE INDEX idx_report_jobs_expires ON report_jobs (expires_at)
    WHERE expires_at IS NOT NULL;
  ```
- [ ] Adicionar COMMENT ON para schemas JSONB:
  ```sql
  COMMENT ON COLUMN report_jobs.progress IS 'Schema: { completed_stores: string[], failed_stores: { store_id: string, error: string }[], current_store?: string }';
  COMMENT ON COLUMN report_jobs.result IS 'Schema: resultado agregado do relatorio, usado pela pagina de historico (RG-7). Estrutura definida em src/types/report.ts';
  ```

### Task 2 — RLS policies na tabela report_jobs
- [ ] ENABLE RLS na tabela `report_jobs`
- [ ] Policy SELECT: usuario autenticado pode ler jobs da sua org (`org_id = current_org_id()`)
- [ ] Policy INSERT: usuario autenticado pode criar jobs na sua org
- [ ] Policy UPDATE: usuario autenticado pode atualizar jobs da sua org (status, progress, result)
- [ ] Policy DELETE: nenhuma (jobs expiram, nao sao deletados manualmente)
- [ ] Testar que usuario de org A NAO ve jobs de org B

### Task 3 — API: POST /api/reports/generate
- [ ] Criar `src/app/api/reports/generate/route.ts`
- [ ] Validar request body: `{ store_ids: string[], period: string, start_date?: string, end_date?: string }`
- [ ] Obter `org_id` e `user_id` do token autenticado
- [ ] **Deduplicacao**: antes de criar, verificar se ja existe job com mesmo `org_id` + `start_date` + `end_date` + `status IN ('queued', 'processing')`
- [ ] Se job duplicado encontrado: retornar job existente (HTTP 200) com flag `deduplicated: true`
- [ ] Se nao existe: criar novo job com status `queued` e `expires_at = now() + 7 days`
- [ ] Retornar job criado (HTTP 201) com `id`, `status`, `created_at`
- [ ] Usar `errorResponse()` pattern para error handling

### Task 4 — API: GET /api/reports/[id]
- [ ] Criar `src/app/api/reports/[id]/route.ts`
- [ ] Validar `id` como UUID valido
- [ ] Buscar job por `id` (RLS garante que so retorna se pertence a org do usuario)
- [ ] Se nao encontrado: retornar HTTP 404
- [ ] Se encontrado: retornar job completo com `id`, `status`, `progress`, `result`, timestamps
- [ ] Incluir campo computado `is_expired: boolean` baseado em `expires_at < now()`

### Task 5 — Deduplicacao robusta via partial UNIQUE index
- [ ] Deduplicacao atomica via `uq_report_jobs_active_range` (partial UNIQUE index criado na Task 1)
- [ ] INSERT usa `ON CONFLICT ON CONSTRAINT uq_report_jobs_active_range DO NOTHING`
- [ ] Se 0 rows inserted: buscar job existente ativo (`SELECT ... WHERE org_id = $1 AND start_date = $2 AND end_date = $3 AND status IN ('queued', 'processing', 'paused')`)
- [ ] Se job existente esta `paused`: retornar como duplicado (operador pode retomar)
- [ ] Se job existente esta `completed`/`partial`/`failed`: permitir criar novo (re-geracao)
- [ ] NAO usar advisory lock — partial unique index resolve race condition atomicamente

### Task 6 — Types e validacao
- [ ] Criar/estender `src/types/report.ts` com `ReportJob` interface
- [ ] Definir `ReportJobStatus` union type
- [ ] Definir `ReportJobProgress` type para o campo JSONB progress: `{ completed_stores: string[], failed_stores: { store_id: string, error: string }[], current_store?: string }`
- [ ] Validacao de request body com zod schema

### Task 7 — Testes
- [ ] Teste: criar job retorna HTTP 201 com id e status 'queued'
- [ ] Teste: buscar job existente retorna dados completos
- [ ] Teste: buscar job inexistente retorna HTTP 404
- [ ] Teste: deduplicacao — segundo request com mesmo range retorna job existente (HTTP 200)
- [ ] Teste: deduplicacao — job completed permite criar novo
- [ ] Teste: expires_at setado para 7 dias no futuro
- [ ] Teste: RLS — usuario de org A nao consegue ler job de org B
- [ ] Teste: validacao — store_ids vazio retorna HTTP 400
- [ ] Teste: validacao — period 'custom' sem start_date/end_date retorna HTTP 400

### Task 8 — API: GET /api/reports (list endpoint)
- [ ] Criar `src/app/api/reports/route.ts`
- [ ] GET: listar jobs da org atual, filtrados por status, ordenados por `created_at DESC`
- [ ] Query params: `?status=active` (queued+processing), `?status=all`, `?limit=10`
- [ ] Usa query RLS-filtered (`createClient`, NAO admin client)
- [ ] Paginacao cursor-based para historico extenso
- [ ] Necessario para RG-6 (polling) e RG-7 (history page)

### Task 9 — Endpoint de cancelamento: `PATCH /api/reports/[id]/route.ts`
- [ ] Aceita body `{ status: 'cancelled' }` via PATCH
- [ ] So permite cancelamento se status atual e `queued` ou `paused` (NAO `processing` — evitar race conditions)
- [ ] Usa query RLS-filtered (`createClient`) — usuario so cancela jobs da sua org
- [ ] Retorna 409 Conflict se job ja esta `processing`, `completed`, `failed`, ou `expired`
- [ ] Retorna 200 com job atualizado se cancelamento bem-sucedido
- [ ] Validar que body contem exatamente `{ status: 'cancelled' }` — rejeitar outros valores

## Acceptance Criteria

### RG-4.1 — Job criado corretamente
- [ ] POST /api/reports/generate cria job com status 'queued'
- [ ] Job tem `org_id`, `user_id`, `store_ids`, `period`, `start_date`, `end_date`
- [ ] `expires_at` setado para 7 dias apos criacao
- [ ] `progress` inicializado como `{}`
- [ ] Retorna HTTP 201 com job id

### RG-4.2 — Status queryable
- [ ] GET /api/reports/[id] retorna job com todos os campos
- [ ] Status reflete lifecycle correto (queued → processing → completed/partial/failed)
- [ ] Campo `progress` inclui lista de lojas completadas e com erro
- [ ] HTTP 404 para job inexistente ou de outra org

### RG-4.3 — Deduplicacao funciona
- [ ] Segundo request com mesmo org + range retorna job existente (nao cria duplicado)
- [ ] Response inclui flag `deduplicated: true` para indicar que retornou existente
- [ ] Job ja completado/falhado permite nova criacao (re-geracao)
- [ ] Job em processamento retorna o existente

### RG-4.4 — RLS enforced
- [ ] Usuario autenticado so ve jobs da sua organizacao
- [ ] Insert so permitido com org_id do usuario
- [ ] Update so permitido para jobs da org do usuario
- [ ] Delete nao permitido (policy inexistente)

### RG-4.5 — List endpoint
- [ ] `GET /api/reports` retorna lista filtrada por status com paginacao cursor-based

### RG-4.6 — Deduplicacao atomica
- [ ] Deduplicacao atomica via UNIQUE partial index (sem advisory lock)

### RG-4.8 — Cancelamento de job
- [ ] Job pode ser cancelado via PATCH quando status e `queued` ou `paused`. Retorna 409 se job ja esta `processing`, `completed`, `failed`, ou `expired`.

### RG-4.7 — Validacao de input
- [ ] `store_ids` vazio → HTTP 400
- [ ] `period = 'custom'` sem `start_date`/`end_date` → HTTP 400
- [ ] UUID invalido no path → HTTP 400
- [ ] Body mal formatado → HTTP 400 com mensagem descritiva

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/migrations/YYYYMMDD_report_jobs.sql` | CREATE | Migration: tabela report_jobs, CHECK, indexes, RLS policies, updated_at trigger |
| `src/app/api/reports/route.ts` | CREATE | GET handler: listar jobs por org, filtro por status, paginacao cursor-based |
| `src/app/api/reports/generate/route.ts` | CREATE | POST handler: criar job, deduplicacao, validacao |
| `src/app/api/reports/[id]/route.ts` | CREATE | GET handler: buscar job por id + PATCH handler: cancelamento de job |
| `src/types/report.ts` | CREATE or MODIFY | Types: ReportJob, ReportJobStatus, ReportJobProgress |
| `src/lib/validations/report.ts` | CREATE | Zod schemas para validacao de request body |
| `src/app/api/reports/generate/route.test.ts` | CREATE | Testes da API: create, dedup, validacao |
| `src/app/api/reports/[id]/route.test.ts` | CREATE | Testes da API: get, 404, RLS |

## Testing Notes

- Testar migration em banco local com `supabase db reset`
- Testar RLS com dois usuarios de orgs diferentes
- Testar deduplicacao com requests rapidos (simular double-click)
- Testar validacao com payloads invalidos (missing fields, wrong types)
- Verificar que `updated_at` trigger funciona em UPDATE

## Technical Notes

- A tabela `report_jobs` e independente de `store_revenue_summary` — RG-1 cacheia resultados por loja, RG-4 rastreia o job agregado
- O campo `progress` JSONB permite extensibilidade futura sem migration
- O campo `result` JSONB armazena o resultado agregado (usado pela pagina de historico em RG-7)
- Esta story NAO implementa o processor (quem muda status de queued → processing → completed). Isso e RG-5.
- `updated_at` trigger: funcao dedicada `update_report_jobs_updated_at()` (ver Task 1)
- Deduplicacao: via partial UNIQUE index `uq_report_jobs_active_range`, NAO advisory lock. INSERT com ON CONFLICT DO NOTHING + fetch se 0 rows.
- **Status TEXT + CHECK** e escolha deliberada (nao ENUM) para facilitar evolucao futura sem migration de tipo
- **Route naming**: Endpoints existentes `/admin/reports` servem a feature `client_reports` (paginas admin). Novos endpoints em `/api/reports/` (API layer) NAO conflitam com as paginas admin. Manter essa distincao documentada.

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Race condition na deduplicacao (2 requests simultaneos criam 2 jobs) | Partial UNIQUE index `uq_report_jobs_active_range` + INSERT ON CONFLICT DO NOTHING resolve atomicamente |
| JSONB sem schema pode ter dados inconsistentes | Validar no application layer com zod antes de INSERT/UPDATE |
| Jobs nunca expirados acumulam no banco | Cleanup via cron (RG-8) + `expires_at` index para queries eficientes |
| RLS policy incorreta expoe dados entre orgs | Testar com usuarios de diferentes orgs antes de deploy |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
