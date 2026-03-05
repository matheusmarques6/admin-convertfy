# Epic 21 - Cache-First com Realtime Push

**Prioridade:** Alta
**Status:** Ready for Dev
**Objetivo:** Refatorar o fluxo de dados dos dashboards para ser cache-first (leitura instantanea do banco) com background refresh via endpoint dedicado e push via Supabase Realtime, eliminando requisicoes live bloqueantes e garantindo consistencia entre admin e portal.

---

## Problema Atual

1. **Admin Total Revenue** (`/api/dashboard/total-revenue` — 590 linhas): faz N requisicoes live para cada loja a cada page load — lento (10-50s), timeout frequente, erros de rate limit
2. **Portal Dashboard**: mesmo que o admin tenha buscado os mesmos dados 2 min atras, refaz tudo do zero
3. **Sem push**: usuario precisa dar refresh manual (F5 ou botao) para ver dados atualizados
4. **Inconsistencia**: dados podem divergir entre admin e portal por terem sido buscados em momentos diferentes

## Solucao Aprovada

### Principio: "Read fast, refresh in background, push when ready"

```
Frontend carrega pagina
  |
  v
GET /api/dashboard/total-revenue
  |
  v
SELECT FROM store_revenue_summary WHERE period=X
  |
  v
Dados existem e fetched_at < threshold?
  |-- SIM --> Retorna instantaneo (<500ms, sem API call)
  |-- NAO --> Retorna o que tem (ou vazio) + responde { isStale: true }

Frontend recebe resposta
  |
  v
Se isStale:
  |-- POST /api/dashboard/refresh-revenue (fire-and-forget do FRONTEND)
  |-- Subscribe Realtime em store_revenue_summary
  |
  v
POST executa no servidor (maxDuration=120s):
  |-- Adquire lock em cron_locks
  |-- Busca TODAS as lojas (all-or-nothing)
  |-- UPSERT store_revenue_summary
  |-- Release lock
  |
  v
Supabase Realtime detecta UPDATE em store_revenue_summary
  |-- Envia evento para subscribers (filtrado por RLS)
  |
  v
Frontend recebe evento Realtime (com debounce 2s)
  |-- Re-fetch GET /total-revenue --> dados frescos
  |-- UI atualiza automaticamente, sem F5
```

### Regras de Staleness

| Contexto | Threshold | Justificativa |
|----------|-----------|---------------|
| Admin dashboard | 1 hora | Visao agregada, dados recentes aceitaveis |
| Portal cliente | 5 minutos | Cliente quer ver dados frescos da loja dele |
| Custom date range | 1 hora | Ranges customizados, sem Realtime, cache em `dashboard_cache` |

### Regra Critica: Refresh Completo (All-or-Nothing)

Quando um refresh e disparado, busca TODAS as lojas (nao so as stale). Motivos:
- Taxas de cambio devem ser do mesmo momento
- Periodos devem ser calculados com o mesmo "now"
- Dados parciais quebram a soma total
- Consistencia > performance

### Decisoes Arquiteturais (aprovadas por QA, DBA, Dev, Arquiteto)

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Background refresh | **Endpoint POST dedicado** (`/api/dashboard/refresh-revenue`) | Vercel-safe: cada request e completo, sem `waitUntil` ou fire-and-forget no server |
| Lock | **Reutilizar `cron_locks`** | Tabela e pattern ja existem, nao criar `refresh_locks` |
| Realtime canal | **`store_revenue_summary`** na publication | Evento nativo do Postgres, zero codigo extra no backend |
| Debounce | **2s no hook Realtime** | Cron gera 32 UPSERTs em sequencia; debounce agrupa em 1 re-fetch |
| `refresh_locks` tabela | **NAO criar** | Over-engineering; `cron_locks` com key `refresh_{orgId}_{period}` serve |
| Cron existente | **Manter como esta** (30min) | Fonte primaria; POST refresh e complemento on-demand |

---

## Ressalvas da Revisao (QA + DBA)

### ALTA PRIORIDADE — RLS Gap para Portal Users

**Achado:** A policy SELECT de `store_revenue_summary` usa `current_org_id()` e `can_access_store()`, que dependem de `org_members`. Portal users que NAO estao em `org_members` (ex: `acessos@convertfy.me`) nao conseguem ler dados via RLS — e portanto NAO recebem eventos Realtime.

**Impacto:** Hoje funciona porque portal usa `createAdminClient()` no servidor (bypassa RLS). Mas Realtime no frontend usa JWT do user → RLS bloqueia.

**Correcao obrigatoria (Story 21.0):** Adicionar policy via `client_portal_users` em 3 tabelas:
- `store_revenue_summary`
- `klaviyo_campaign_metrics`
- `klaviyo_flow_metrics`

### MEDIA PRIORIDADE — Debounce Realtime

Cron gera 8 lojas x 4 periodos = 32 UPSERTs. Sem debounce, frontend faria 32 re-fetches.
Hook deve agrupar eventos com debounce de 2s.

### MEDIA PRIORIDADE — Refresh Concorrente

Se admin dispara refresh e portal tenta disparar 2min depois, o lock em `cron_locks` impede duplicata. POST retorna `{ alreadyRunning: true }`. Frontend mostra "Atualizando..." baseado no Realtime.

### BAIXA PRIORIDADE — Custom Date Ranges

Sem Realtime. Usa `dashboard_cache` com cache key `custom:{start}:{end}` e TTL 1h. Nao gera rows em `store_revenue_summary`.

### BAIXA PRIORIDADE — dashboard_cache Cleanup

Tipos que PERMANECEM em `dashboard_cache`: `shopify`, `ga4`, `asaas_payments`, `asaas_billing`, `klaviyo_metadata`, `exchange_rate`.
Tipos que SAEM: `client_performance`, `klaviyo_perf`.

---

## Stories

### Story 21.0 - Migration: RLS Policies + Realtime Publication

**Objetivo:** Pre-requisito de toda a epic. Corrigir gap de RLS para portal users e habilitar Realtime na tabela de cache.

**Acceptance Criteria:**
- [ ] AC1: Portal users (via `client_portal_users`) podem ler `store_revenue_summary` das lojas do seu cliente
- [ ] AC2: Portal users podem ler `klaviyo_campaign_metrics` das lojas do seu cliente
- [ ] AC3: Portal users podem ler `klaviyo_flow_metrics` das lojas do seu cliente
- [ ] AC4: `store_revenue_summary` adicionada na publication `supabase_realtime`
- [ ] AC5: Policies nao afetam admin users (policies existentes continuam funcionando)
- [ ] AC6: Service role continua com acesso total (cron e refresh dependem disso)

**Migration SQL:**
```sql
-- RLS policies para portal users
CREATE POLICY "portal_revenue_summary_select"
  ON store_revenue_summary FOR SELECT
  USING (store_id IN (
    SELECT cs.id FROM client_stores cs
    JOIN client_portal_users cpu ON cs.client_id = cpu.client_id
    WHERE cpu.auth_user_id = auth.uid() AND cpu.is_active = true
  ));

CREATE POLICY "portal_campaign_metrics_select"
  ON klaviyo_campaign_metrics FOR SELECT
  USING (store_id IN (
    SELECT cs.id FROM client_stores cs
    JOIN client_portal_users cpu ON cs.client_id = cpu.client_id
    WHERE cpu.auth_user_id = auth.uid() AND cpu.is_active = true
  ));

CREATE POLICY "portal_flow_metrics_select"
  ON klaviyo_flow_metrics FOR SELECT
  USING (store_id IN (
    SELECT cs.id FROM client_stores cs
    JOIN client_portal_users cpu ON cs.client_id = cpu.client_id
    WHERE cpu.auth_user_id = auth.uid() AND cpu.is_active = true
  ));

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE store_revenue_summary;
```

**Testing:**
- Verificar que portal user sem `org_members` consegue SELECT em `store_revenue_summary` (lojas do seu cliente)
- Verificar que portal user NAO ve lojas de outros clientes
- Verificar que admin continua vendo tudo
- Verificar que Realtime events chegam no frontend com JWT de portal user

**Files:**
- `supabase/migrations/YYYYMMDD_epic21_rls_realtime.sql`

**Risco:** Nenhum. Policies sao aditivas (OR). Nao quebram acesso existente.

---

### Story 21.1 - Refatorar Total Revenue para Cache-First (GET only)

**Objetivo:** O endpoint `GET /api/dashboard/total-revenue` vira leitura pura do banco. Sem live fetch, sem timeout, sem race conditions.

**Depende de:** 21.0

**Acceptance Criteria:**
- [ ] AC1: GET retorna dados de `store_revenue_summary` se `fetched_at > now() - 1h` para o period solicitado
- [ ] AC2: Resposta inclui `dataAge` (minutos desde `fetched_at` mais antigo) e `isStale: boolean`
- [ ] AC3: Se qualquer loja tem dados stale (>1h) ou missing, resposta tem `isStale: true`
- [ ] AC4: GET **nunca** faz chamadas para Klaviyo/Shopify — apenas leitura do banco
- [ ] AC5: Tempo de resposta < 500ms (vs 10-50s atual)
- [ ] AC6: `force_refresh=true` retorna dados existentes + `isStale: true` (frontend decide se chama POST)
- [ ] AC7: Manter backward compat do response shape (mesmos campos que hoje)
- [ ] AC8: Custom date ranges continuam usando `dashboard_cache` com TTL 1h (sem Realtime)

**O que REMOVER:**
- Funcao `liveFetchWithTimeout` (~170 linhas)
- `Promise.race` com timeout
- Fire-and-forget upserts inline
- Synthetic rows para stores com timeout

**O que FICA:**
- `buildStoreBreakdown()` — monta resposta a partir dos rows do banco
- `buildResponse()` — formata resposta final
- Conversao BRL via `convertToBRL()`

**Pseudo-codigo:**
```typescript
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "30d"
  const orgId = await resolveOrgId(user.id)

  // 1. Leitura do banco
  const { data: rows } = await supabase
    .from("store_revenue_summary")
    .select("*, client_stores!inner(id, store_name, client_id, clients(name))")
    .eq("period_label", period)
    .eq("org_id", orgId)

  // 2. Calcular staleness
  const oldestFetchedAt = rows.reduce(...)
  const dataAgeMinutes = minutesSince(oldestFetchedAt)
  const isStale = dataAgeMinutes > 60 || rows.length === 0

  // 3. Retornar
  const storeBreakdown = await buildStoreBreakdown(rows)
  return buildResponse(period, storeBreakdown, rows, {
    dataStatus: isStale ? "stale" : "ready",
    dataAge: dataAgeMinutes,
    isStale,
  })
}
```

**Files:**
- `src/app/api/dashboard/total-revenue/route.ts` — refatorar (de ~590 linhas para ~100)

---

### Story 21.2 - Endpoint POST Refresh Revenue

**Objetivo:** Endpoint dedicado que o frontend chama para disparar refresh completo. Executa como request normal no Vercel (sem truques de background).

**Depende de:** 21.0

**Acceptance Criteria:**
- [ ] AC1: `POST /api/dashboard/refresh-revenue` aceita `{ period: string }` no body
- [ ] AC2: Adquire lock em `cron_locks` com key `refresh_{orgId}_{period}` — so 1 refresh por org+period simultaneamente
- [ ] AC3: Se lock ja ativo (outro refresh rodando), retorna `{ alreadyRunning: true, lockedSince: ISO }` com status 200
- [ ] AC4: Lock tem TTL de 5 minutos (auto-release se processo morrer)
- [ ] AC5: Busca TODAS as lojas da org com Klaviyo credentials
- [ ] AC6: Reutiliza logica existente de `syncKlaviyoForPeriod` + `upsertSyncResults` do cron
- [ ] AC7: Se refresh falhar, NAO sobrescreve dados existentes (keep stale > write zeros)
- [ ] AC8: Ao concluir, release lock e retorna `{ success: true, storesRefreshed: N, durationMs: N }`
- [ ] AC9: `maxDuration = 120` (Vercel Pro)
- [ ] AC10: Log estruturado: inicio, progresso por loja, conclusao, erros

**Reutilizacao de codigo:**
O cron (`/api/cron/sync-reports`) ja tem toda a logica de:
- `acquireSyncLock` / `releaseSyncLock`
- `syncKlaviyoForPeriod`
- `upsertSyncResults`
- `fetchAudienceForStore`

Extrair um service compartilhado que ambos usam (cron e POST).

**Files:**
- `src/app/api/dashboard/refresh-revenue/route.ts` — novo endpoint
- `src/lib/services/revenue-refresh.service.ts` — logica extraida do cron (compartilhada)
- `src/app/api/cron/sync-reports/route.ts` — refatorar para usar o service compartilhado

---

### Story 21.3 - Supabase Realtime Hooks no Frontend

**Objetivo:** Frontend se inscreve em mudancas de `store_revenue_summary` para receber push automatico quando dados sao atualizados.

**Depende de:** 21.0 (Realtime publication), 21.1 (GET cache-first), 21.2 (POST refresh)

**Acceptance Criteria:**
- [ ] AC1: Hook `useRealtimeRevenue(orgId, period)` subscribe em `store_revenue_summary` via Supabase Realtime
- [ ] AC2: Debounce de 2s — multiplos eventos (cron atualiza 32 rows) resultam em 1 unico re-fetch
- [ ] AC3: Re-fetch chama `GET /total-revenue` (que agora e instantaneo) e atualiza state
- [ ] AC4: UI mostra indicador "Atualizando..." entre o POST e o evento Realtime de conclusao
- [ ] AC5: UI atualiza dados automaticamente quando evento chega (sem F5)
- [ ] AC6: Cleanup: `supabase.removeChannel()` ao desmontar componente
- [ ] AC7: Fallback: se Realtime desconectar, polling a cada 30s como backup
- [ ] AC8: O hook usa `createClient()` (browser client com anon key + JWT) — NAO service role

**Arquitetura do Hook:**
```typescript
function useRealtimeRevenue(orgId: string, period: string) {
  const supabase = createClient() // browser client com JWT
  const [isRefreshing, setIsRefreshing] = useState(false)
  const fetchRevenue = useCallback(async () => { /* GET /total-revenue */ }, [period])

  const debouncedFetch = useMemo(
    () => debounce(() => { fetchRevenue(); setIsRefreshing(false) }, 2000),
    [fetchRevenue]
  )

  // Trigger refresh se stale
  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await fetch("/api/dashboard/refresh-revenue", {
      method: "POST",
      body: JSON.stringify({ period })
    })
    // Nao espera resposta — Realtime avisara quando terminar
  }, [period])

  useEffect(() => {
    const channel = supabase
      .channel(`revenue-${orgId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "store_revenue_summary",
      }, () => debouncedFetch())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [orgId, supabase, debouncedFetch])

  return { isRefreshing, triggerRefresh }
}
```

**Files:**
- `src/hooks/use-realtime-revenue.ts` — novo
- `src/components/dashboard/total-revenue-banner.tsx` — integrar hook
- `src/app/(dashboard)/dashboard/page.tsx` — conectar se necessario

---

### Story 21.4 - Portal Dashboard Cache-First + Realtime

**Objetivo:** Portal do cliente usa a mesma infraestrutura de cache, com threshold de 5min e Realtime push.

**Depende de:** 21.0 (RLS policies), 21.3 (hooks)

**Acceptance Criteria:**
- [ ] AC1: `/api/portal/dashboard` le de `store_revenue_summary` + `klaviyo_campaign_metrics` + `klaviyo_flow_metrics` se `fetched_at > now() - 5min`
- [ ] AC2: Se dados stale (>5min), retorna existentes + `isStale: true`
- [ ] AC3: Portal `page.tsx` usa `useRealtimeRevenue` para receber push (adaptado para portal)
- [ ] AC4: Se admin ja buscou dados ha 3min, portal usa esses dados sem nenhuma API call
- [ ] AC5: Indicador visual "Atualizando..." no portal durante refresh
- [ ] AC6: Periodo custom nao dispara Realtime (usa fetch direto com cache de 1h em `dashboard_cache`)
- [ ] AC7: Portal pode chamar `POST /refresh-revenue` (mesmo endpoint do admin, lock compartilhado)

**Nota:** O Realtime filtra por RLS — portal user so recebe eventos das lojas dele (garantido pela policy da 21.0).

**Files:**
- `src/app/api/portal/dashboard/route.ts` — refatorar leitura para cache-first
- `src/app/portal/dashboard/page.tsx` — integrar Realtime hook

---

### Story 21.5 - Client Performance Cache-First + Realtime

**Objetivo:** Endpoint `/api/clients/[id]/performance` segue o mesmo padrao cache-first.

**Depende de:** 21.1, 21.3

**Acceptance Criteria:**
- [ ] AC1: Le de cache tables primeiro (`readKlaviyoFromCacheTables` ja existe — unificar logica)
- [ ] AC2: Threshold de 1h para dados validos
- [ ] AC3: Se stale, responde `isStale: true` (frontend chama POST refresh)
- [ ] AC4: Remove uso de `dashboard_cache` com `cache_type=client_performance` (migra para tabelas dedicadas)
- [ ] AC5: Frontend da pagina do cliente usa Realtime para auto-update

**Files:**
- `src/app/api/clients/[id]/performance/route.ts` — simplificar
- `src/app/(dashboard)/clients/[id]/page.tsx` — integrar Realtime

---

### Story 21.6 - Cleanup e Documentacao

**Objetivo:** Remover codigo legado e garantir transicao limpa.

**Depende de:** 21.1–21.5 completas

**Acceptance Criteria:**
- [ ] AC1: Remover `liveFetchWithTimeout` do `total-revenue/route.ts`
- [ ] AC2: Remover entries de `dashboard_cache` para tipos migrados (`klaviyo_perf`, `client_performance`)
- [ ] AC3: Remover `CACHE_TTL` e `STALE_GRACE_MINUTES` entries para tipos removidos em `src/lib/cache.ts`
- [ ] AC4: Atualizar cron `sync-reports` para usar `revenue-refresh.service.ts` compartilhado
- [ ] AC5: Documentar fluxo de dados atualizado (diagrama no epic)
- [ ] AC6: Tipos que PERMANECEM em `dashboard_cache`: `shopify`, `ga4`, `asaas_payments`, `asaas_billing`, `klaviyo_metadata`

**Files:**
- `src/app/api/dashboard/total-revenue/route.ts` — limpeza final
- `src/lib/cache.ts` — remover entries obsoletas
- `src/app/api/cron/sync-reports/route.ts` — refatorar para service compartilhado

---

## Ordem de Execucao

```
21.0 Migration (RLS + Realtime)     ← PRIMEIRO, pre-requisito de tudo
  |
  ├── 21.1 GET cache-first          ← pode paralelizar com 21.2
  ├── 21.2 POST refresh-revenue     ← pode paralelizar com 21.1
  |
  v
21.3 Realtime hooks frontend        ← depende de 21.0 + 21.1 + 21.2
  |
  ├── 21.4 Portal cache-first       ← depende de 21.0 + 21.3
  ├── 21.5 Client perf cache-first  ← depende de 21.1 + 21.3
  |
  v
21.6 Cleanup                        ← depende de tudo acima
```

## Riscos e Mitigacoes

| Risco | Prob. | Impacto | Mitigacao |
|-------|-------|---------|-----------|
| Realtime desconecta | Media | Dados nao atualizam | Fallback polling 30s |
| POST refresh timeout (>120s) | Baixa | Refresh incompleto | Lock com TTL; cron como backup a cada 30min |
| Lock orfao (processo morre) | Baixa | Bloqueia refreshes | TTL 5min com auto-cleanup |
| RLS bloqueia Realtime | **Resolvido** | Portal nao recebia eventos | Story 21.0 corrige com policies |
| 32 eventos Realtime do cron | **Resolvido** | 32 re-fetches | Debounce 2s no hook |
| Dois refreshes simultaneos | **Resolvido** | Desperdicio de API calls | Lock em `cron_locks` |

## Metricas de Sucesso

| Metrica | Antes | Depois |
|---------|-------|--------|
| Tempo resposta total-revenue | 10-50s | <500ms |
| Requisicoes Klaviyo por page load | 8-40 | 0 (cache hit) |
| Refresh manual necessario | Sempre | Nunca (Realtime push) |
| Consistencia admin/portal | Divergente | Mesma fonte (store_revenue_summary) |
| Timeout errors | Frequente | Eliminado (GET nao faz API call) |

## Dados do Ambiente (validados pelo DBA)

| Fato | Valor |
|------|-------|
| Lojas ativas | 61 (8 com Klaviyo) |
| Rows em `store_revenue_summary` | 32 |
| Realtime publication atual | Vazia (nenhuma tabela) |
| Cron atual | `*/30 * * * *` (a cada 30min) |
| Cron maxDuration | 300s |
| Indice principal | `idx_revenue_summary_org_period_expires` (cobre query principal) |
| Portal users sem org_members | 1 de 4 |
