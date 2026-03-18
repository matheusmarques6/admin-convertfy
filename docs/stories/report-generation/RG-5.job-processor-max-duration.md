---
Prioridade: High
Sprint: Backlog
Assignee: "@dev"
Revisao: "@qa"
Status: Ready for Dev
Epic: "Report Generation — Relatorios Personalizados em Background"
Fase: "3 - Background Jobs (Core)"
Esforco: MEDIUM-HIGH
Dependencias: RG-4
---

# Story RG-5 — Job Processor com maxDuration

## Story

**Como** operador do admin panel que gerou um relatorio para multiplas lojas,
**Quero** que o processamento ocorra em background com tempo estendido (300s),
**Para que** relatorios com ate ~20 lojas sejam processados em uma unica invocacao, salvando progresso a cada etapa.

## Contexto

### Problema

Cada loja requer ~12s de API calls na Klaviyo (3 calls XS-tier). Com 10+ lojas, o processamento pode ser longo. Precisamos de um processor com tempo suficiente para cobrir a maioria dos cenarios.

### Solucao

Criar um endpoint `POST /api/reports/process` que:
1. Usa `export const maxDuration = 300` (Vercel Pro — mesmo pattern do cron sync existente)
2. Com 300s e ~12s/loja, processa ~20 lojas por invocacao (280s safety margin)
3. Pega jobs com status `queued`, `processing` ou `paused` (retomando de onde parou)
4. Cada loja: chama `getKlaviyoRevenueForStore()` de `src/lib/integrations/klaviyo/report-summary.ts` (reutiliza codigo existente)
5. Atualiza `report_jobs.progress` JSONB com status por loja (atomic merge, nao overwrite)
6. Ao finalizar, popula `report_jobs.result` com snapshot agregado dos dados

### Autenticacao

O endpoint `POST /api/reports/process` usa `requireCronAuth()` (mesmo pattern do cron sync existente). O endpoint `POST /api/reports/generate` (RG-4, user-facing, autenticado) chama process passando o header `CRON_SECRET` (fire-and-forget via `fetch()` sem await na response). O frontend NUNCA chama process diretamente.

### Trigger Mechanism

1. `POST /api/reports/generate` (user-facing, autenticado) → cria job → chama `POST /api/reports/process` com header CRON_SECRET (fire-and-forget via `fetch()` sem await na response)
2. Se o process function atinge o timeout com lojas restantes → seta status para `paused`
3. Frontend polling (RG-6) detecta `paused` e mostra botao [Retomar]
4. [Retomar] chama `POST /api/reports/generate` que detecta job existente pausado e re-dispara process

### Status Transitions

```
queued → processing → completed   (todas lojas OK)
                    → partial     (algumas falharam)
                    → paused      (timeout ou rate limit 429)
                    → failed      (todas falharam ou max retries)
```

### Snapshot Result JSONB

Quando o job completa (ou parcial), `report_jobs.result` e populado com snapshot agregado:

```typescript
result: {
  total_revenue: number,
  attributed_revenue: number,
  stores_processed: number,
  stores_failed: number,
  per_store: {
    [storeId: string]: {
      revenue: number,
      attributed: number,
      flows_revenue: number,
      campaigns_revenue: number,
      error?: string
    }
  },
  generated_at: string
}
```

Isso desacopla a visualizacao do historico (RG-7) do TTL do cache — relatorios antigos continuam visiveis via `result`.

### JSONB Atomic Update

Progress JSONB deve ser atualizado com merge atomico, NAO overwrite completo:

```sql
UPDATE report_jobs
SET progress = progress || $2::jsonb,
    updated_at = now()
WHERE id = $1;
```

Usar Supabase `.rpc()` para este update, nao `.update()`.

### Invocation Tracking

O campo `progress` JSONB deve conter um `invocation_count` que incrementa a cada invocacao do processor para o mesmo job. Se `invocation_count > 5`, o job e marcado como `failed` com motivo `max_retries_exceeded` para prevenir loops infinitos.

### Stuck Job Detection

Jobs com `status = 'processing'` e `updated_at < now() - interval '5 minutes'` sao considerados stuck. O processor deve detectar e marcar como `failed` com motivo `stuck_timeout`.

## Tasks

### Task 1 — Criar route handler do processor
- [ ] Criar `src/app/api/reports/process/route.ts`
- [ ] Exportar `export const maxDuration = 300` (Vercel Pro)
- [ ] POST handler com `requireCronAuth()` (mesmo pattern do cron sync)
- [ ] Buscar proximo job `queued`, `processing` ou `paused` (ORDER BY created_at ASC, LIMIT 1)
- [ ] Validar que o job existe e nao esta em status terminal (completed/failed/cancelled/expired)
- [ ] Incrementar `invocation_count` no progress JSONB. Se > 5, falhar job com `max_retries_exceeded`
- [ ] Extrair lista de lojas pendentes do job (store_ids menos as ja completas no progress)
- [ ] Atualizar status para `processing` e `updated_at = now()`

### Task 2 — Processar lojas (ate ~20 por invocacao)
- [ ] Para cada loja pendente: obter credenciais Klaviyo via `getStoreCredentials()`
- [ ] MUST reusar `getKlaviyoRevenueForStore()` de `src/lib/integrations/klaviyo/report-summary.ts` — nao criar terceira implementacao de revenue fetching
- [ ] Escrever resultado em `store_revenue_summary` com `period_label = 'custom'`, `range_start`, `range_end`
- [ ] Atualizar `report_jobs.progress` via RPC atomic merge: `progress || $2::jsonb`
- [ ] Se loja falha: marcar no progress como `{ "status": "failed", "error": "motivo", "failed_at": "..." }`
- [ ] Continuar com proxima loja (erro em uma nao bloqueia as outras)
- [ ] Monitorar tempo de execucao: se atingir 280s com lojas restantes, salvar progresso e setar status `paused`

### Task 3 — Rate limit handling (429)
- [ ] Interceptar `KlaviyoRateLimitError` durante processamento de loja
- [ ] Ao receber 429: pausar o job (status = `paused`)
- [ ] Salvar progresso atual via RPC atomic merge (lojas ja completadas ficam salvas)
- [ ] Registrar no progress: `{ "paused_reason": "rate_limit", "paused_at": "..." }`
- [ ] Frontend polling (RG-6) detecta `paused` e mostra botao [Retomar] ao operador

### Task 4 — Finalizacao, snapshot e status do job
- [ ] Apos processar todas as lojas: determinar status final
- [ ] Se todas completaram: status = `completed`
- [ ] Se algumas falharam: status = `partial`
- [ ] Se todas falharam: status = `failed`
- [ ] Poplar `report_jobs.result` JSONB com snapshot agregado:
  ```typescript
  result: {
    total_revenue: number,
    attributed_revenue: number,
    stores_processed: number,
    stores_failed: number,
    per_store: { [storeId: string]: { revenue, attributed, flows_revenue, campaigns_revenue, error? } },
    generated_at: string
  }
  ```
- [ ] Atualizar `updated_at` em cada operacao de progresso

### Task 5 — JSONB atomic update RPC
- [ ] Criar Supabase RPC function `merge_report_job_progress(job_id, partial_progress)`
- [ ] RPC executa: `UPDATE report_jobs SET progress = progress || $2::jsonb, updated_at = now() WHERE id = $1`
- [ ] Todos os updates de progress no processor devem usar `.rpc()`, nao `.update()`

### Task 6 — Stuck job detection
- [ ] No inicio de cada invocacao: buscar jobs com `status = 'processing'` e `updated_at < now() - interval '5 minutes'`
- [ ] Marcar jobs stuck como `failed` com `progress.failure_reason = 'stuck_timeout'`
- [ ] Log warning para monitoramento
- [ ] Stuck detection roda ANTES de pegar o proximo job (cleanup first)

### Task 7 — Testes
- [ ] Teste: processor rejeita requests sem CRON_SECRET (requireCronAuth)
- [ ] Teste: processor pega job queued e processa ate ~20 lojas
- [ ] Teste: progresso salvo corretamente no JSONB por loja (atomic merge)
- [ ] Teste: erro em uma loja nao bloqueia as outras
- [ ] Teste: rate limit 429 pausa o job e salva progresso
- [ ] Teste: timeout (280s) pausa o job com lojas restantes
- [ ] Teste: status final `completed` quando todas lojas OK
- [ ] Teste: status final `partial` quando algumas falharam
- [ ] Teste: status final `failed` quando todas falharam
- [ ] Teste: stuck detection marca jobs antigos como failed
- [ ] Teste: invocation_count > 5 marca job como failed (max_retries_exceeded)
- [ ] Teste: snapshot result JSONB populado corretamente ao finalizar
- [ ] Teste: processor usa `getKlaviyoRevenueForStore()` (nao duplica logica)

## Acceptance Criteria

### RG-5.1 — Processor processa ate ~20 lojas por invocacao (maxDuration=300)
- [ ] Usa `export const maxDuration = 300` (Vercel Pro)
- [ ] Cada invocacao processa lojas ate atingir 280s safety margin
- [ ] Cada loja tem seus dados escritos em `store_revenue_summary`
- [ ] Endpoint protegido por `requireCronAuth()` — frontend nunca chama diretamente

### RG-5.2 — Trigger e retomada funcionam corretamente
- [ ] `POST /api/reports/generate` cria job e dispara process com CRON_SECRET (fire-and-forget)
- [ ] Se process atinge timeout com lojas restantes: status = `paused`
- [ ] Frontend polling (RG-6) detecta `paused` e mostra [Retomar]
- [ ] [Retomar] chama generate que detecta job pausado e re-dispara process

### RG-5.3 — Progresso salvo por loja (atomic merge)
- [ ] `report_jobs.progress` JSONB contem status individual por store_id
- [ ] Status por loja: `completed`, `failed`, ou `pending`
- [ ] Lojas completadas persistem entre invocacoes (nao reprocessadas)
- [ ] Updates usam RPC atomic merge (`progress || $2::jsonb`), nao overwrite

### RG-5.4 — Rate limit 429 pausa o job
- [ ] Ao receber 429 da Klaviyo: job muda para status `paused`
- [ ] Lojas ja processadas ficam salvas
- [ ] Job pode ser retomado posteriormente via [Retomar] no frontend

### RG-5.5 — Stuck detection funciona
- [ ] Jobs em `processing` por >5 minutos sem update sao marcados como `failed`
- [ ] Motivo `stuck_timeout` registrado no progress

### RG-5.6 — Error handling por loja
- [ ] Falha em uma loja nao impede processamento das demais
- [ ] Motivo do erro registrado no progress da loja
- [ ] Status final reflete resultado agregado (completed/partial/failed)

### RG-5.7 — Snapshot result JSONB populado ao finalizar
- [ ] `report_jobs.result` contem snapshot agregado (total_revenue, attributed_revenue, per_store, etc.)
- [ ] Historico (RG-7) le de `result`, nao de cache tables — desacoplado do TTL

### RG-5.8 — Invocation count previne loops infinitos
- [ ] `progress.invocation_count` incrementa a cada invocacao
- [ ] Se > 5 invocacoes: job marcado como `failed` com `max_retries_exceeded`

### RG-5.9 — Processor reutiliza codigo existente
- [ ] Processor MUST usar `getKlaviyoRevenueForStore()` de `src/lib/integrations/klaviyo/report-summary.ts`
- [ ] Nenhuma terceira implementacao de revenue fetching

## File List

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/app/api/reports/process/route.ts` | CREATE | Endpoint do job processor com maxDuration=300 |
| `src/app/api/reports/process/route.test.ts` | CREATE | Testes do processor |
| `supabase/migrations/XXX_add_merge_report_job_progress_rpc.sql` | CREATE | RPC function para atomic JSONB merge |

## Testing Notes

- Mockar APIs Klaviyo para simular tempo de processamento e erros
- Mockar `KlaviyoRateLimitError` para testar pausa por 429
- Mockar `getKlaviyoRevenueForStore()` para testar integracao
- Testar stuck detection com jobs que tem `updated_at` antigo
- Verificar que progresso JSONB e atualizado via RPC atomic merge (nao perde dados entre updates)
- Testar que `requireCronAuth()` rejeita requests sem CRON_SECRET
- Testar invocation_count incrementa e falha apos > 5

## Technical Notes

- `export const maxDuration = 300` no route.ts (Vercel Pro, mesmo pattern do cron sync)
- Endpoint protegido por `requireCronAuth()` — chamado apenas pelo generate endpoint com CRON_SECRET header
- MUST reusar `getKlaviyoRevenueForStore()` de `src/lib/integrations/klaviyo/report-summary.ts`
- `getStoreCredentials()` ja trata decriptacao — usar como fonte unica de credenciais
- `KlaviyoRateLimitError` e `KlaviyoPermissionError` devem ser re-thrown (nao engolidas)
- Progress JSONB atualizado via Supabase `.rpc()` com atomic merge (`progress || $2::jsonb`), NAO `.update()`
- Safety margin: 280s (20s de margem antes dos 300s de maxDuration)
- `invocation_count` no progress JSONB previne loops infinitos (max 5)
- Snapshot `result` JSONB populado ao finalizar — desacopla historico do cache TTL

## Riscos

| Risco | Mitigacao |
|-------|----------|
| Loop infinito (retomadas sem progresso) | `invocation_count > 5` marca como `failed` com `max_retries_exceeded`. Stuck detection apos 5min |
| Race condition: 2 processors pegam o mesmo job | Usar UPDATE ... WHERE status = 'queued' RETURNING para lock atomico |
| Progress JSONB perde dados em update concorrente | Atomic merge via RPC (`progress \|\| $2::jsonb`), nao overwrite |
| Vercel Pro downgrade para Hobby | maxDuration cai de 300s para 60s. **Requer plano Vercel Pro** — documentar como requisito de infra |
| Timeout com lojas restantes | Status `paused`, frontend mostra [Retomar], generate re-dispara process |

## Change Log

| Data | Autor | Mudanca |
|------|-------|---------|
| 2026-03-18 | @dev | Story criada a partir da spec report-generation-feature.md |
| 2026-03-18 | @review | Substituir function chaining por maxDuration=300 (Vercel Pro). Adicionar requireCronAuth, snapshot result JSONB, atomic merge RPC, invocation_count, reuso de getKlaviyoRevenueForStore(). Risco: requer Vercel Pro |
