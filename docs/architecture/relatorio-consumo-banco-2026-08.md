# Relatório de consumo do banco de dados — admin-convertfy

**Data:** 26/08/2026 · **Projeto Supabase:** `ppygkfeffknypfncsnlv` ("admin convertfy", us-west-2, Postgres 17.6)
**Janela de medição:** `pg_stat_statements` acumulado desde 15/07/2026 (~42 dias) + logs de edge/Postgres das últimas 24h + inspeção do schema e do código na branch principal (`claude/resume-previous-session-UvATK`, HEAD `e1c6c5d`).

Este relatório responde: **o que consome o banco, quanto, com que latência, quanto disco ocupa — e o que usar, como usar e em qual ocasião.**

---

## 1. Sumário executivo

Nos 42 dias medidos o banco executou **7,35 milhões de statements** somando **~16,4 horas de tempo de execução**. Seis achados dominam tudo o resto:

| # | Achado | Impacto |
|---|--------|---------|
| 1 | **`crm_webhook_events` ocupa 978 MB dos 1.143 MB do banco (86% do disco)** — 15 mil eventos do Evolution com payload médio de 63 KB (mídia em base64), 96% com mais de 30 dias. **O prune diário falha todo dia**: o `DELETE` leva ~8,2 s e morre no `statement_timeout` de 8 s do role `authenticator` (HTTP 500 no log), faz rollback e a tabela só cresce. | Disco |
| 2 | **Uma única query é 37,8% de TODO o tempo do banco**: o `COUNT` exato de `status='dead'` em `crm_webhook_events`, feito pelo cron `whatsapp-reprocess-webhooks` **a cada minuto**. Não existe índice cobrindo `'dead'` (só parciais para `pending/failed` e `done`) → seq scan da tabela inchada, 1.440×/dia, média 371 ms, pico 7,8 s. Total: 6,2 h de CPU em 42 dias. | Tempo de banco |
| 3 | **Realtime é 27,8% do tempo do banco** (2,17 M chamadas de `list_changes`). Alimentado por 11 tabelas na publication e agravado por um bug de montagem: **cada aba do admin abre 5 canais duplicados de notificações** (Sidebar ×2 + SidebarUser ×2 + MobileTopBar), e `deals` está com `REPLICA IDENTITY FULL` (WAL da linha inteira em todo update). | Tempo de banco |
| 4 | **Storm de sessão expirada**: às 03h da manhã (BRT) de 26/08, uma aba esquecida com sessão vencida gerou **65 mil requisições/hora** (padrão completo do dashboard em loop de retry). Corrigido no commit `e1c6c5d` (26/08 15:10 UTC) — **precisa estar deployado**. Os picos de 06–07h e 14–15h UTC concentram os 167 statement timeouts das últimas 24h. | Picos / erros |
| 5 | **RLS caro em CPU**: 139 policies reavaliam `auth.uid()`/`auth.jwt()` **linha a linha** (`auth_rls_initplan`) e 151 casos de múltiplas policies permissivas na mesma tabela/ação. Resultado visível: `profiles` com **22,3 milhões de seq scans** e `org_members` com **10,9 milhões**. | CPU |
| 6 | **Instância no limite**: `max_connections=60` (compute pequeno), cache hit 99,99% (memória OK — o gargalo é CPU). Nos picos, queries triviais de catálogo levaram 10–95 s. O projeto foi **redimensionado hoje** (status `RESIZING` observado 15:19–15:36 UTC), mas o advisor avisa: **o Auth está fixado em 10 conexões** — aumentar a instância não melhora o Auth sem trocar para alocação percentual. | Capacidade |

---

## 2. Como o sistema fala com o banco (arquitetura de acesso)

Não há conexão SQL direta: **todo acesso passa pelo PostgREST** (`supabase-js`), o que significa 1 round-trip HTTP + `set_config` de contexto por query (1,25 M `set_config` na janela ≈ **~30 mil requisições PostgREST/dia**).

| Caminho | Client | RLS | Quem usa |
|---------|--------|-----|----------|
| **Service role** | `createAdminClient()` (`src/lib/supabase/admin.ts:10`) | **Bypassa RLS** | 382 das 516 rotas de API + todos os crons. O isolamento multi-tenant é 100% responsabilidade do código (`.eq("org_id", …)`). |
| **Sessão (cookies)** | `createClient()` (`src/lib/supabase/server.ts`) | Ativo | Usado quase só para validar sessão (`requireAuth`); poucas rotas pesadas o usam para dados (ex.: export de clientes). |
| **Browser direto** | `src/lib/supabase/client.ts` | Ativo | ~36 arquivos consultam PostgREST direto do navegador (sino de notificações, `unified_invoices` no overview do cliente, financeiro, timeline, drawer de deals…). É onde o custo do RLS aparece. |

**Overhead fixo por request autenticada:** `requireAuth` → `auth.getUser()` (chamada REMOTA ao Auth, 559 ms de média!) + `resolveOrgId` → 1 SELECT em `org_members` **sem cache** (`src/lib/api/resolve-org.ts:12`) — por isso `org_members` tem 33 mil hits/dia. Rotas com loja somam `requireStoreAccess` = mais 3–4 queries. O layout do admin (Server Component) faz **~6 queries por navegação de página**, incluindo listagem de todas as `client_stores` com join para admin/dev.

---

## 3. Fotografia do dia da medição (contexto importante)

A medição foi feita num dia **atípico**, e isso é parte do diagnóstico:

| Hora (UTC) | Evento |
|------------|--------|
| 06h–07h | **Storm**: 65.164 + 43.595 req/h (baseline noturno: ~800/h). Padrão = dashboard completo (`auth/user` 17 mil + `org_members` 17 mil + `client_stores` 15 mil + métricas 34 mil) às 03h BRT — aba esquecida com sessão expirada em loop de retry de 401. 30+24 statement timeouts. |
| 13h–14h | Início do expediente + storm residual: 23 mil e 45 mil req/h, latência média da API subiu de ~100 ms para 1.092 ms, 61 timeouts. |
| 14:25–15:10 | Time trabalhando no incidente: commits `20af836`, `ed967da` (erros/504 no painel Vercel) e `e1c6c5d` (**fix do storm de 401**). |
| ~15:15–15:36 | **Resize do projeto Supabase** (status `RESIZING`; conexões derrubadas com "terminating connection due to administrator command"). Após o resize, `max_connections` continua 60. |

Nos momentos de saturação, o log registra queries de catálogo do próprio Supabase levando 10–95 s (`SELECT COUNT(*) FROM pg_settings` em 14 s) — ou seja, **a máquina inteira travada por CPU**, não uma query específica lenta.

---

## 4. Uso: para onde vai o tempo do banco (42 dias)

### 4.1 Top consumidores por tempo total

| % do tempo | Query (normalizada) | Chamadas | Média | Máx | Origem |
|-----------:|---------------------|---------:|------:|----:|--------|
| **37,8%** | `SELECT id FROM crm_webhook_events WHERE status=$1` + count exato | 60.147 | 371 ms | 7,8 s | Cron `whatsapp-reprocess-webhooks` (a cada minuto): contagem de `dead` sem índice (`route.ts:54`) |
| **27,8%** | `SELECT wal->>… FROM realtime.list_changes(…)` | 2.166.603 | 7,6 ms | 15,1 s | Infra do Realtime (polling do WAL para as 11 tabelas da publication) |
| **4,9%** | `SELECT id FROM campaigns WHERE status=$1` + count exato | 3.048 | **942 ms** | 4,6 s | Watchdogs de campanha — tabela tem só 1.509 linhas; a média altíssima é saturação da instância + count exato |
| 2,0% | `SELECT notifications.* WHERE user_id=$1 AND read=$2` | 23.528 | 49,8 ms | 7,0 s | Sino de notificações (browser, poll 30 s por aba) |
| 1,7% | `SELECT name FROM pg_timezone_names` | 1.211 | 840 ms | 6,7 s | Supabase Studio (não é o app) |
| 1,3% | RPC `pending_crm_webhook_events_for_reprocess` | 60.251 | 13,2 ms | 3,1 s | Cron reprocess (a cada minuto) — `SELECT *` traz `raw_payload` de 63 KB/linha quando há pendentes |
| 1,3% | `UPDATE email_flow_emails SET failed_at…` | 24.099 | 32,1 ms | 1,3 s | Watchdog de geração de emails |
| 1,1% | `set_config(…)` (contexto PostgREST) | 1.255.429 | 0,5 ms | 6,2 s | Overhead fixo de toda requisição PostgREST |
| 1,1% | `SELECT notifications WHERE read=$1 AND metadata->>$2=$3…` | 7.742 | 83,7 ms | 3,3 s | Limpeza de notificações do inbox por `metadata->>thread_id` (sem índice para essa chave) |
| 1,0% | Introspecção de schema (PostgREST reload + pg-meta/Studio) | ~2.600 | 480–610 ms | 6,9 s | Reload do schema cache a cada migration + Studio aberto |

### 4.2 Top por frequência (o "pulso" do sistema)

| Chamadas (42d) | O quê | Ritmo |
|---------------:|-------|-------|
| 2,17 M | Realtime `list_changes` | contínuo |
| 1,26 M | `set_config` PostgREST | ~30 mil req/dia |
| ~196 mil ×5 | Queries do Auth server (`sessions`, `users`, `mfa_factors`, `identities`, `mfa_amr_claims`) | cada `auth.getUser()` remoto |
| 60.280 | `SELECT … FROM events WHERE processed=false` | cron `process-deal-won`, 1/min (1,25 ms — saudável) |
| 60.263 | `SELECT * FROM email_dispatch_jobs WHERE status IN (…)` | cron `email-dispatch-queue`, 1/min (0,46 ms — saudável) |
| 60.251 | RPC reprocess de webhooks | 1/min |
| 60.147 | Count de `crm_webhook_events` | 1/min (**371 ms — o problema**) |
| 38.669 | `pg_publication_tables` | Realtime verificando a publication |
| 24.099 / 23.528 / 15.236 | Updates de watchdog / sino / TTL de `store_revenue_summary` | contínuo |

**Leitura:** os crons de fila com índice parcial correto custam ~1 ms por tick (`events`, `email_dispatch_jobs`) — o padrão está certo; o que destoa é exclusivamente a contagem de `dead` (sem índice) e o peso morto da tabela.

### 4.3 Volume HTTP nas 24h (edge do Supabase)

235.689 requisições. Top endpoints: `auth/v1/user` 35.967 · `org_members` 33.265 · `client_stores` 30.284 · `omnisend_campaign_metrics` 21.128 · `klaviyo_campaign_metrics` 21.116 · `store_revenue_summary` 19.239 · flows 21.204 · `store_daily_metrics` 10.566. Baseline ocioso: **~800 req/h, 100% service_role (crons)**. Pico: 65 mil/h (storm).

---

## 5. Latência

### 5.1 Visão pelo edge (24h, inclui filas do dia do incidente)

| Endpoint | Chamadas | Média | p95 | 5xx |
|----------|---------:|------:|----:|----:|
| `/auth/v1/user` | 35.967 | **559 ms** | 1,8 s | 54 |
| `/rest/v1/org_members` | 33.265 | 290 ms | 1,6 s | 1 |
| `/rest/v1/client_stores` | 26.151 | 350 ms | 1,9 s | 3 |
| `/rest/v1/omnisend_campaign_metrics` | 21.128 | 494 ms | 2,7 s | 0 |
| `/rest/v1/store_revenue_summary` | 15.099 | 507 ms | 2,8 s | 0 |
| `/rest/v1/crm_history_import_jobs` (cron 1/min) | 2.865 | **3,1 s** | 1,2 s* | 48 |
| RPC `pending_crm_webhook_events_for_reprocess` | 1.432 | **4,0 s** | 1,3 s* | 34 |
| `/rest/v1/crm_automation_runs` (cron 1/min) | 1.431 | 3,6 s | 1,1 s* | 28 |
| `/rest/v1/crm_webhook_events` HEAD (o count) | 1.398 | 1,7 s | **8,5 s** | **76** |

\* média > p95 = poucas execuções extremas (janelas de saturação, requests de 30–100 s) puxando a média — fora dos picos os crons são rápidos.

### 5.2 Piores latências médias de query (≥20 chamadas, sem catálogo)

1. `campaigns` count por status — **942 ms** (1.509 linhas! puro efeito de saturação + count exato)
2. View `v_email_generation_logs` — **889 ms** (view com `jsonb_typeof`/`jsonb_array_length` por linha, consumida com refresh de 30 s pelo workspace de logs)
3. `crm_webhook_events` count — 371 ms
4. `tasks` lista do board — 226 ms · `task_deliverables` — 218 ms · `email_flows` — 208 ms · `agent_store_access` — 186 ms

### 5.3 Timeouts

- O role `authenticator` (todo o PostgREST) tem **`statement_timeout=8s`**. Qualquer query acima disso morre — é o teto que mata o prune (8,2 s) e apareceu 167× nas últimas 24h.
- `pg_stat_statements` mostra máximos de 3–8 s em queries corriqueiras — todos nos horários dos picos.
- Cache hit de 99,99% (heap) / 99,98% (índices): **o problema nunca foi I/O de disco; é CPU** (counts/seq scans/RLS por linha) numa instância pequena.

---

## 6. Disco

### 6.1 Visão geral

**Banco: 1.143 MB.** Schemas: `public` concentra tudo (auth 3,8 MB, storage 4,3 MB). Distribuição:

| Tabela | Total | Heap | Índices | TOAST | Linhas vivas |
|--------|------:|-----:|--------:|------:|-------------:|
| **`crm_webhook_events`** | **978 MB** | 20 MB | 1 MB | **958 MB** | 15.087 |
| `email_generation_runs` | 33 MB | 4 MB | 1,6 MB | 27 MB | 5.283 |
| `omnisend_reports_cache` | 31 MB | 23 MB | 8 MB | — | 22.672 |
| `notifications` | 6,9 MB | 4,9 MB | 2 MB | — | 15.354 |
| `email_blocks` | 5,6 MB | 3,8 MB | 1,5 MB | — | 7.826 |
| demais 215 tabelas | ~90 MB | | | | |

### 6.2 O caso `crm_webhook_events` (86% do banco)

- 15.087 linhas · **15.070 do provedor `evolution`** · payload médio **63,3 KB** · máximo **4,23 MB** (mídia WhatsApp em base64 dentro do JSON) · total de payload: **932 MB**.
- Status: 15.079 `done` (912 MB) + 8 `processing`. **15.071 elegíveis para prune agora** (done, `processed_at` > 7 dias). O mais antigo é de 14/07.
- A function `prune_crm_webhook_events()` está correta (`DELETE WHERE status='done' AND processed_at < now()-7d`), o cron chama certo (`src/app/api/cron/whatsapp-prune-webhook-events/route.ts`) — mas nas 24h medidas a RPC rodou 1× , levou **8.226 ms e retornou 500** (statement timeout de 8 s). **Todo dia tenta, todo dia estoura, todo dia faz rollback.** Quanto mais cresce, mais impossível fica.
- Efeito colateral: 120 mil seq scans somando **1,64 bilhão de tuplas lidas** nessa tabela (o count do item 4.1). Último autovacuum: 22/07.
- Nota pós-limpeza: `DELETE` devolve espaço para reuso interno, não para o SO — o tamanho reportado só cai com vacuum/rewrite; o importante é estancar o crescimento.

### 6.3 Higiene de índices e sobras

- **396 índices nunca usados** (~8,9 MB — pouco disco, mas cada um taxa todo INSERT/UPDATE da sua tabela). Advisors: 351 `unused_index` + 178 FKs sem índice.
- **8 pares de índices idênticos** (dropar um de cada): `client_portal_users` ×2, `email_blocks`, `invoices`, `klaviyo_campaign_metrics`, `klaviyo_flow_metrics`, `store_briefings`, `store_top_products`.
- **2 tabelas de backup esquecidas** sem PK: `email_component_variants_bkp_retag4`, `email_component_variants_backup_20260708`.
- `notifications`: **15.065 de 15.354 não-lidas (98%)** — nada expira nem marca como lida em massa; o sino conta isso a cada 30 s por aba.
- Cache tables (`klaviyo_*_metrics`, `omnisend_*`) vivem em ciclo delete+insert dos syncs (107 mil inserts / 106 mil deletes em `omnisend_campaign_metrics`) — churn constante, autovacuum dá conta, mas é bloat recorrente.

---

## 7. Mapa completo de consumidores

### 7.1 Crons (34 agendados no `vercel.json`)

**Piso ocioso: ~9 queries/minuto ≈ 13 mil queries/dia com o sistema parado.** Autenticação via `CRON_SECRET` (zero queries).

**A cada minuto (1.440×/dia):**

| Cron | Idle | Com trabalho | Observações |
|------|-----:|--------------|-------------|
| `whatsapp-reprocess-webhooks` | 2 | +2 a ~8/evento (até 100) | ⚠️ 1 das 2 é o **count de `dead` sem índice** (37,8% do banco). RPC de listagem usa `SELECT *` (traz payload de 63 KB/linha) |
| `conversion-dispatch` | 2 | +1/form (N+1) + 2 writes/evento + Meta CAPI | ⚠️ 1 das 2 idle é um **UPDATE de "revive"** que roda mesmo sem nada preso (WAL/lock por minuto) |
| `crm-history-import` | 2 | claim + ~2–3/mensagem ×100/página + Evolution API | Bem indexado; com job ativo segura conexões por até 4 min |
| `crm-automation-resume` | 1 | claim + `automations` por run (N+1) + 4–8/run ×20 | Índice parcial correto |
| `process-deal-won` | 1 | +15–40 por `deal.won` (createFromDeal) + UPDATE por evento | **Único sem claim atômico** (idempotência a jusante); filtro `event_type` fora do índice parcial |
| `email-dispatch-queue` | 1 | claims + heartbeat/lote + Architect (LLM, minutos) | `SELECT *` traz JSONB `emails` inteiro |

**A cada 5–15 min:** `email-generation-watchdog` (5 min — **~8 queries fixas por tick**, 6 frentes, 3 delas são UPDATEs disparados sempre), `campaign-copy-watchdog` (5 min, 1 idle), `whatsapp-connection-health` (5 min, 2 idle + HTTP Evolution por canal), `whatsapp-close-windows` (10 min, 1 RPC), `whatsapp-resync-templates` (15 min, 2 idle + Meta por canal).

**Meia em meia hora:** `sync-reports` (**o maior consumidor**: ~700–1.500 queries/ciclo segundo o próprio código; N+1 de `getStoreCredentials` com `SELECT *` em `client_stores` por loja — existe `getMultipleStoreCredentials` batch, não usado; upsert+delete de cleanup por loja×período; lock via `acquire_sync_lock`), `sync-omnisend` (mesmo padrão de N+1; diário às 04h roda 4 períodos), `vault-sync` (2–3 idle, curto-circuito por SHA).

**Diários:** `crm-snapshot` (⚠️ 6–7 SELECTs de `deals` **por pipeline** com agregação em JS + `crm_leads` sem limit ≈ 230 queries), `crm-health-compute` (~8–12/loja, sequencial), `crm-ads-sync` (Meta 30d ×3 níveis, upsert em lotes de 500 — bom), `store-daily-metrics` (limpo, sem N+1), `reports/cleanup` (deletes em lote + 3 RPCs de limpeza), `whatsapp-prune-webhook-events` (**quebrado — seção 6.2**), `onboarding-sla-check`, `onboarding-form-reminder`, `instagram-snapshot` (histórico de followers dentro do JSONB `config`). **Semanais/anuais:** store-alerts-check, board-automation, weekly-feedback, weekly-acompanhamento-reset, campaign-suggestions-cycle, holidays-sync-yearly.

### 7.2 Rotas de API interativas (516 handlers)

**Dashboards que agregam em runtime (o padrão-problema):**
- `/api/crm/funnel` — a rota mais pesada: **todos** os deals não-arquivados (`limit(10000)`, sem janela de data — decisão documentada), `crm_deal_history` 10 mil, `crm_leads` 10 mil, `crm_ad_insights` 20 mil, `unified_invoices` sem limit + **N+1 sequencial** de `crm_leads` em chunks de 200 (`route.ts:332`).
- `/api/crm/performance` — deals `limit(10000)` sem filtro de data (janela aplicada em JS) + history 20 mil.
- `/api/crm/dashboard/sales` — 5 queries paralelas sem limit + atividades com join `limit(20000)`; já passou de 4 s (comentário no código).
- **Contraponto correto:** `/api/crm/reports/timeseries` lê só snapshots (`crm_org_snapshots` etc.) — é o modelo a seguir.

**Família `/api/dashboard/*`** — boa arquitetura (snapshot-first: `store_revenue_summary`, `*_campaign_metrics`, `store_daily_metrics`), mas as queries do `unified-metrics.service.ts` **não têm `.limit()`** → truncamento silencioso no teto de 1.000 linhas do PostgREST quando a base crescer; `financial-summary` varre `deals` inteiro sem org.

**CRM operacional:**
- Kanban `/api/crm/pipelines/[id]`: 4–8 queries; a principal (`deals` + 3 joins) **sem `.limit()`** → pipeline grande trunca em silêncio.
- Inbox `/api/crm/inbox/threads`: `count:"exact"` na paginação **em rota de polling de 30 s** + não-lidas somadas em JS sobre 500 linhas (idem `unread-count`, outro poll).
- Enviar mensagem: ~6–9 queries + provedor externo.

**Webhooks (por evento recebido):** WhatsApp Cloud/Evolution = enqueue + claim (bom), mas o processamento faz **~12–15 queries/mensagem**, incluindo `count:"exact"` da thread inteira só para saber se é a 1ª mensagem, e `crm-trigger-dispatcher` carrega **todas** as automations ativas da org por evento. Instagram: ~10–14 queries, inline no handler. `n8n/email-copy`: **20–30 UPDATEs sequenciais** em `email_blocks` por callback (2 loops).

**Pesadas pontuais:** `/api/clients/export` (até 100 round-trips de 1.000 linhas), `/api/stores/control` (**GET que chama Klaviyo ao vivo** para lojas sem cache + upserts fire-and-forget), `/api/clients/[id]/performance` (`SELECT *` por loja em 3 tabelas de cache).

### 7.3 Browser, Realtime, SSE e polling

- **Realtime**: 11 tabelas na publication. Canais por aba: notificações **×5 (duplicados por bug de montagem — `sidebar.tsx` ×2, `sidebar-user.tsx` ×2, `mobile-top-bar.tsx`)**, inbox 1–2, pipeline 1 (UPDATE/DELETE de `deals` **sem filtro**), board 1 (3 tabelas sem filtro), revenue 1 (sem filtro). `deals` com `REPLICA IDENTITY FULL`.
- **Polling sempre ativo por aba**: sino 30 s (count direto do browser), reports 5–30 s, inbox unread 60 s. Por tela: inbox 30 s (10 s com realtime caído), detalhe 5–30 s, logs de geração 30 s, execuções de agentes 10 s, image-studio 4 s, etc. Safety refresh de 30–45 s **sempre ligado** em board/pipeline (o do inbox já desliga com realtime saudável).
- **SSE = polling server-side**: `/api/sse/stores/[id]/emails` consulta `email_status_events` **a cada 2 s por conexão aberta**; `/api/sse/admin/agents/runs` idem (2 s + overview 5 s). 1 viewer = ~0,5–1 query/s contínua.
- **Uploads**: 5 endpoints tentam `createBucket()` **a cada upload** (write em `storage.buckets` toda vez — a migration `20260714` existe justamente para matar isso, mas o código continua).

### 7.4 Triggers e cascatas (custo invisível por write)

- `crm_messages` INSERT → UPDATE em `crm_threads` (preview/unread) → evento realtime para todos os inbox da org abertos. **Cada mensagem = 2 writes + fan-out.**
- `deals` UPDATE de stage → SELECT em `pipeline_stages` **em todo update** (gate de "ganho") → INSERT em `events` quando won (fail-open, regra do incidente 20261066).
- `tasks` ↔ `client_onboarding_steps`: ciclo de sincronização com 2 triggers ordenados + histórico por update (`record_task_history`).
- `productivity_tasks` → replica para `tasks` (que está na publication realtime → acorda boards).
- `email_flow_emails` UPDATE de status → INSERT em `email_status_events` (+ subquery em `email_flows`) — é a tabela que o SSE varre a cada 2 s.
- `campaign_metrics` INSERT/UPDATE → avaliação de alertas **por linha** (dispara em lote nos syncs).
- ~90 triggers `updated_at` (desprezíveis).

### 7.5 Views (nenhuma materializada — recalculam a cada SELECT)

- **`unified_invoices`** (`invoices` ∪ `client_charges`): 8+ consumidores, incluindo **query direta do browser** (`client-overview.tsx:600`) e as rotas de funil/sales. Filtros fora de `client_id`/`due_date` varrem os dois lados.
- `v_email_generation_logs`: deriva sinais de `parsed_output` com funções JSONB **por linha** — 889 ms de média com polling de 30 s do workspace.
- `ai_usage_unified` (4 UNIONs), `refund_summaries`, + views legadas de relatórios Klaviyo.

---

## 8. RLS e CPU

- **139 policies** com `auth.uid()`/`auth.jwt()` reavaliados **por linha** (advisor `auth_rls_initplan`, WARN). Correção mecânica: `USING (user_id = (SELECT auth.uid()))` — o initplan roda 1× por query.
- **151 casos de múltiplas policies permissivas** para a mesma tabela/role/ação (cada uma é avaliada para cada linha; pior tabela: `client_portal_users` com 12).
- Evidência do custo: `profiles` **22,3 M seq scans** (246 M tuplas) e `org_members` **10,9 M** (122 M tuplas) — helpers de RLS + `resolveOrgId` sem cache. São tabelas minúsculas (seq scan é o plano correto), mas 33 M avaliações são CPU pura na instância que já satura.
- Auth server: **fixado em 10 conexões** (advisor `auth_db_connections_absolute`) — com 36 mil `auth.getUser()`/dia a 559 ms de média e 5xx nos picos, esse teto é o suspeito direto dos `AuthRetryableFetchError`. **O resize de hoje não muda isso sozinho** — precisa trocar para alocação percentual.

---

## 9. Guia prático: o que usar, como usar, em qual ocasião

| Ocasião | Use | Evite | Referência no código |
|---------|-----|-------|----------------------|
| **Números de dashboard/BI** | Tabelas de snapshot (`store_revenue_summary`, `store_daily_metrics`, `crm_*_snapshots`) preenchidas por cron; agregação SQL no snapshot | Agregar `deals`/`invoices`/`history` em runtime a cada GET | Bom: `/api/crm/reports/timeseries` · Ruim: `/api/crm/funnel`, `/api/crm/performance` |
| **Contar linhas para UI** | `count: 'planned'`/`'estimated'`, contador materializado, ou índice parcial que case exatamente com o filtro | `count: 'exact'` em polling ou tabela grande (vira seq scan) | O count de `dead` (37,8% do banco) e o `count exact` do inbox |
| **Fila de trabalho (cron)** | Claim atômico `UPDATE … WHERE status=… RETURNING` + **índice parcial cobrindo TODOS os status consultados** + payload enxuto (mídia no Storage, não base64 no JSONB) | `SELECT *` na fila (arrasta payload), contar a fila toda por tick, guardar eventos processados para sempre | Bom: `email_dispatch_jobs`, `events` (~1 ms/tick) · Ruim: `crm_webhook_events` |
| **Listas na UI** | `.range()`/`limit` explícito + keyset (`before`/cursor); prune da seleção | Query sem limit (o PostgREST trunca em 1.000 **em silêncio**) | Bom: mensagens do inbox (cursor) · Ruim: deals do kanban, `unified-metrics.service` |
| **Credenciais de lojas em lote** | `getMultipleStoreCredentials` (batch, 1 query) | `getStoreCredentials` (`SELECT *`) dentro de loop por loja | `credentials.service.ts:161` — o batch existe e não é usado nos syncs |
| **Tempo real na UI** | 1 canal por recurso por aba (singleton/context), filtro server-side (`org_id=eq.`), `REPLICA IDENTity DEFAULT` | Montar o mesmo hook em N componentes (5 canais de notificação hoje), tabela na publication sem filtro, `REPLICA IDENTITY FULL` sem consumir old record | `use-unified-notifications` ×5 · `deals` FULL |
| **Progresso de jobs para UI** | SSE com `pg_notify` (os triggers **já emitem** `email_status_event`!) ou poll adaptativo com backoff | `setInterval` de 2 s consultando o Postgres por conexão SSE aberta | `/api/sse/stores/[id]/emails/route.ts:132` |
| **Webhook de entrada** | Persistir referência leve + processar via claim; flag `is_first` na thread em vez de count | Processar inline com 12–15 queries; `count exact` da thread por mensagem; carregar todas as automations da org por evento | `webhook-processor.ts:326`, `crm-trigger-dispatcher.service.ts:36` |
| **Escrita em lote (callbacks)** | `upsert`/`in()` em lote | Loop `for` com UPDATE por item (20–30 statements por callback) | `webhooks/n8n/email-copy/route.ts:301-390` |
| **Policies RLS novas** | `TO authenticated` + `(SELECT auth.uid())` + 1 policy permissiva por ação (consolidar com `OR`) | `auth.uid()` cru (reavalia por linha), várias permissivas empilhadas | Advisors: 139 + 151 casos |
| **Identidade org do request** | Cachear `resolveOrgId` por request (React.cache / passar org adiante) | 1 SELECT `org_members` por rota + repetições inline | `resolve-org.ts:12` (33 mil hits/dia) |
| **Dados que só crescem** (runs, logs, eventos) | TTL + prune **em lotes com LIMIT** (várias transações curtas < 8 s) | DELETE único gigante (morre no statement_timeout de 8 s e faz rollback) | O prune quebrado da 6.2 |

---

## 10. Recomendações priorizadas

### P0 — resolve a maior parte do problema (disco + 40% do tempo de banco)

1. **Destravar o prune de `crm_webhook_events`**: limpeza única em lotes (`DELETE … WHERE id IN (SELECT id … WHERE status='done' AND processed_at < now()-'7d' LIMIT 500)` em loop até zerar — cada lote < 8 s) e mudar a RPC/cron para esse formato com LIMIT permanente. Depois avaliar `VACUUM` (autovacuum recupera o espaço para reuso; o tamanho físico só cai com rewrite — opcional).
2. **Matar o count de `dead` por minuto**: criar índice parcial `ON crm_webhook_events (received_at) WHERE status='dead'` **ou** trocar o count exato por `count: 'estimated'`/checagem diária. Junto com o item 1, remove ~38% do tempo total do banco.
3. **Reduzir o payload da fila**: parar de guardar mídia base64 do Evolution no `raw_payload` (extrair para Storage no enqueue ou truncar após processar). É o que fez 15 mil linhas ocuparem 932 MB.
4. **Garantir o deploy do fix do storm** (`e1c6c5d`) e **trocar a alocação de conexões do Auth para percentual** (advisor) — sem isso o resize não melhora o `auth.getUser()` de 559 ms.

### P1 — corta a carga contínua

5. **Deduplicar os 5 canais realtime de notificações** por aba (singleton/context em vez de hook por componente montado) e desligar os safety-refresh de board/pipeline quando o realtime está saudável (padrão já aplicado no inbox).
6. **`REPLICA IDENTITY DEFAULT` em `deals`** (os hooks só invalidam SWR, não usam old record) — corta WAL de linha inteira em todo update.
7. **SSE sem martelo**: usar o `pg_notify` que os triggers já emitem, ou subir o poll de 2 s para 5–10 s com backoff.
8. **Inbox**: `count exact` → `planned`; soma de não-lidas via agregação SQL; flag `is_first_inbound` na thread (elimina o count por mensagem nos webhooks).
9. **RLS**: aplicar `(SELECT auth.uid())` nas 139 policies e consolidar as 151 permissivas (script mecânico; advisors listam uma a uma).
10. **`resolveOrgId` com cache por request** + usar `getMultipleStoreCredentials` nos syncs (mata o N+1 de `SELECT *` em `client_stores`).
11. **Lotes nos callbacks do n8n** (`email-copy`: upsert único em vez de 20–30 updates) e no `conversion-dispatch` (revive só quando existir `processing`; buscar `crm_forms` com `.in()`).

### P2 — higiene e prevenção

12. Dropar os **8 índices duplicados**, revisar os **396 sem uso** (conferir janela de stats antes) e as **2 tabelas `*_backup`**.
13. **Limites explícitos em toda lista**: kanban (`deals` sem limit), `unified-metrics.service` (truncamento silencioso), `financial-summary` (varredura sem org).
14. **TTL/arquivamento de `notifications`** (98% não-lidas acumulando) e índice para a limpeza por `metadata->>thread_id`.
15. **Snapshot-first para funil/performance** (mesmo desenho do `crm-snapshot`/`timeseries`) — remove os `limit(10000)` por GET.
16. `crm-snapshot` com agregação SQL (`count/sum` no Postgres) em vez de 6 SELECTs de linhas cruas por pipeline.
17. Remover o `createBucket()` por upload (os buckets já existem via migration).
18. Monitoramento contínuo: alarme para statement timeout > N/h, tamanho de `crm_webhook_events`, e relatório mensal de `pg_stat_statements` (reset após grandes mudanças para janela limpa).

---

## Apêndice — método e ressalvas

- **Fontes**: `pg_stat_statements` (janela 15/07→26/08), `pg_stat_user_tables`/`pg_statio`/`pg_indexes`/catálogo, advisors do Supabase (830 achados), logs unificados (edge + postgres, 24h), leitura do código na branch principal (crons, 516 rotas, hooks de realtime/polling, migrations).
- **Dia atípico**: a medição de 24h inclui o storm de sessão expirada e o resize — as médias de latência do edge estão infladas por esses eventos; os rankings de `pg_stat_statements` (42 dias) são estáveis.
- **Counters cumulativos**: seq_scan/idx_scan acumulam desde o último reset de stats; usar como proporção, não como taxa diária.
- **PostgREST**: toda query do app tem teto de `statement_timeout=8s` (role `authenticator`) e teto de 1.000 linhas por resposta sem `range` — os dois aparecem como causa raiz em achados deste relatório.
