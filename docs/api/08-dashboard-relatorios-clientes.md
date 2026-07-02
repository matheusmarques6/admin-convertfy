# API — Dashboard, Relatórios, Clientes, Financeiro, Stores e IA

> Parte da [documentação de API](./README.md). Salvo indicação contrária, **Auth = sessão Supabase** e **Rate limit = nenhum**.

## Dashboard (todos GET, sessão Supabase)

| Endpoint | Ação | O que faz | Params |
|---|---|---|---|
| `/api/dashboard/email-performance` | Performance de email | Agrega métricas do cache (`klaviyo_*_metrics`, `omnisend_*_metrics`, `store_revenue_summary`); rates ponderados por volume | `period` (7d/15d/30d/90d, default 30d) |
| `/api/dashboard/total-revenue` | Receita total | Lê `store_revenue_summary`; total + atribuída, top/bottom stores, staleness, multi-moeda (→BRL) | `period`, `store_ids` (csv) |
| `/api/dashboard/kpi-series` | Séries de KPI | Receita e % atribuição p/ 4 períodos; sparklines + deltas vs média 90d | `period` |
| `/api/dashboard/flows-aggregate` | Flows por categoria | Categoriza (cart_recovery, browse_abandon, winback, welcome); top 3 c/ benchmark | `period` |
| `/api/dashboard/weekly-perf` | Performance semanal | open/click/conversion por semana ISO | `weeks` (1-12, default 4) |
| `/api/dashboard/health-monitor` | Saúde de email | Score 0-100 por loja (deliverability, open, click, unsub, bounce) + issues | `period` |
| `/api/dashboard/list-hygiene` | Higiene de lista | Lojas com desengajados (engagement <30%, bounce >2%, spam >0.1%); economia estimada | `period` |
| `/api/dashboard/insights` | Insights por IA | 4 insights acionáveis via GPT-4o-mini (requer `OPENAI_API_KEY`) | `period` |
| `/api/dashboard/stores-overview` | Overview por loja | Receita total/email/SMS, campanhas, flows, recovery rate, audiência | `period` |
| `/api/dashboard/financial-summary` | Resumo financeiro | Receita 6 meses (Asaas), cobranças 7d, novos deals do mês | — |
| `POST /api/dashboard/refresh-revenue` | Refresh de receita | Sync Klaviyo+Omnisend de todas as lojas do período; **lock distribuído**; timeout 270s | Body: `period` |

## Report jobs (relatórios sob demanda)

| Endpoint | Métodos | Ação | Auth | Params |
|---|---|---|---|---|
| `/api/reports` | GET | Listar jobs | Sessão + RLS org | `status` (active/notifications/all/…), `limit` (max 100), `cursor` |
| `/api/reports/[id]` | GET, PATCH | Job / cancelar ou marcar visto | Sessão + RLS | PATCH: `{status: "cancelled"}` (só queued/paused) ou `{viewed_at}` |
| `/api/reports/generate` | POST | Criar job | Sessão | Body: `store_ids[]`, `period`, `start_date?`, `end_date?`. Dedup por unique index; dispara processor fire-and-forget |
| `/api/reports/process` | POST | Processar job | **CRON_SECRET** | Query: `job_id`. Busca Klaviyo/Omnisend, progress via RPC, pause por rate limit externo. `maxDuration` 300s |
| `/api/reports/export` | GET | Exportar CSV | Sessão + RLS | `jobId` (query) |
| `/api/reports/cleanup` | POST | Limpar expirados | **CRON_SECRET** (cron diário 3h) | — |

## Clients

| Endpoint | Métodos | Ação | Auth | Params |
|---|---|---|---|---|
| `/api/clients/search` | GET | Buscar clientes | Sessão (org-scoped) | `q` (min 2 chars) ou `id` |
| `/api/clients/manage` | DELETE | Deletar cliente | **role admin** | `id` (query) |
| `/api/clients/contracts` | POST | Criar contrato | Sessão | `client_id`, `plan_name`, `monthly_value`, `start_date`, `status` (active/expired/cancelled/pending), `end_date?`, `notes?`, `document_url?` |
| `/api/clients/[id]/performance` | GET | Performance agregada | Sessão + acesso ao cliente | `period` (default 30d), `start_date?`, `end_date?` — Klaviyo+Omnisend+Shopify de todas as lojas + billing |

## Client stores

| Endpoint | Métodos | Ação | Auth extra | Params / Notas |
|---|---|---|---|---|
| `/api/client-stores` | POST | Criar loja | — | `client_id`, `store_name` obrig. + `store_url`, `platform` (default other). Valida duplicata por nome |
| `/api/client-stores/search` | GET | Buscar lojas | — | `q` (min 2), `limit` (max 50). Match em nome/URL/cliente |
| `/api/client-stores/[id]` | GET, DELETE | Loja completa / deletar | store access; DELETE exige `can_edit` | DELETE cascateia satélites (ON DELETE CASCADE) |
| `/api/client-stores/credentials` | GET, DELETE | Credenciais mascaradas / remover | store access | GET: `store_id` — últimos 4 chars + status por integração (nunca plaintext). DELETE: `store_id`, `integration` (shopify/klaviyo/omnisend/ga4/meta) |
| `/api/client-stores/credentials/test` | POST | Testar 1 integração live | store access | `store_id`, `integration`, `payload?` (dry-run pré-save). `maxDuration` 30s |
| `/api/client-stores/credentials/revalidate` | POST | Revalidar server-side | store access | `store_id` — persiste `validation_tested_at` + erros |
| `/api/client-stores/[id]/sync-email` | POST | Sync manual Klaviyo/Omnisend | `can_edit` | Body: `period?` (default 30d). `maxDuration` 120s |
| `/api/client-stores/[id]/force-resync` | POST | Limpar cache + sync | `can_edit` | Atualmente só Omnisend. `maxDuration` 120s |
| `/api/client-stores/[id]/link` | PATCH | Vincular a cliente | admin OU `can_edit` | Body: `client_id?`. Cascateia em alerts/onboarding; auditoria |
| `/api/client-stores/[id]/transfer` | POST | Transferir de cliente | `can_edit` | Body: `targetClientId`, `reason?`. RPC `transfer_store_to_client` com auditoria; bloqueia cross-org |

## Financeiro (cobranças, assinaturas, reembolsos)

Auth: sessão + feature `view_financial` (exceto refunds, que exigem apenas sessão).

| Endpoint | Métodos | Ação | Params |
|---|---|---|---|
| `/api/client-charges` | POST, PUT, PATCH, DELETE | CRUD de cobranças | POST: `client_id`, `description`, `value`, `due_date`, `payment_method` (default pix_direto), `status` (default pending), `subscription_id?`, `notes?`. PATCH = cancelar. DELETE: `id` (query) |
| `/api/client-subscriptions` | GET, POST, PATCH, DELETE | Assinaturas (local + Asaas merged) | GET: `client_id` (obrig.). POST: `client_id`, `name`, `value`, `cycle` (default MONTHLY), `payment_method`, `status`, `start_date`, `next_due_date`, `notes` |
| `/api/client-reports` | GET, POST, PUT, DELETE | Relatórios de cliente | Feature `view_reports`. GET: `store_id?`, `client_id?`, `latest?`, `limit` (max 100). POST: `report_type`, `period`, `date_range`, `report_data` (JSONB) |
| `/api/financial/refund` | POST | Reembolso manual | `charge_id`, `amount?`, `reason` (3-500 chars) |
| `/api/financial/refunds` | GET | Listar reembolsos | `client_id?`, `status?` (requested/processed/failed), `page`, `limit` (max 100) |

## Stores (visão operacional)

| Endpoint | Métodos | Ação | Notas |
|---|---|---|---|
| `/api/stores` | OPTIONS, GET | Listar lojas | Sanitiza credenciais (bool flags); filtro por acesso a loja. Query: `client_id?`, `active?` |
| `/api/stores/control` | GET | Controle operacional | Revenue (cache + fallback live), status de feedback, última call, paginação. Query: `page`, `per_page`, `search`, `status` (on_track/due_soon/overdue/never), `active_only` |
| `/api/stores/feedback` | POST, GET, PATCH | Feedbacks de loja | Registro e revisão de feedbacks |
| `/api/stores/currency-audit` | GET | Auditoria de moedas | |
| `/api/stores/alerts` | GET | Listar alertas | |
| `/api/stores/alerts/[id]` | PATCH | Atualizar alerta | |
| `/api/stores/alerts/check` | POST | Rodar verificação de alertas | |
| `/api/stores/alerts/summary` | GET | Resumo (contagens/severidade) | |
| `/api/stores/[id]/acompanhamento` | OPTIONS, GET | Dados de acompanhamento | |
| `/api/stores/[id]/alerts` | GET | Alertas da loja | |
| `/api/stores/[id]/alerts/[alertId]` | PATCH | Atualizar alerta da loja | |
| `/api/stores/[id]/calls` | OPTIONS, GET, POST | Calls da loja | |
| `/api/stores/[id]/onboarding-status` | OPTIONS, GET | Status do onboarding | |
| `/api/stores/[id]/requests` | OPTIONS, GET, POST | Solicitações da loja | |
| `/api/stores/[id]/requests/[requestId]` | OPTIONS, PATCH, DELETE | Solicitação individual | |
| `/api/stores/[id]/tracking-config` | GET, PUT | Config de rastreio | |
| `/api/stores/[id]/utm-templates` | GET, POST | UTM templates | |
| `/api/stores/[id]/utm-templates/[templateId]` | PATCH, DELETE | UTM template individual | |
| `/api/stores/[id]/weekly-report` | GET, POST, PATCH | Relatório semanal | |
| `/api/stores/[id]/weekly-report/pending-count` | GET | Pendências do semanal | |
| `/api/stores/[id]/weekly-report/review` | POST | Revisar relatório semanal | |

## IA (assistente interno)

| Endpoint | Métodos | Ação | Notas |
|---|---|---|---|
| `/api/ai/chat` | POST | Chat streaming (Claude Sonnet) | Body: `messages[]` ({role, content}), `context?` ({store_id, client_id}), `conversation_id?`. Persiste em `ai_chat_messages`. **Rate limit próprio: 15 msgs/min por usuário (in-memory)**. Requer `ANTHROPIC_API_KEY` |
| `/api/ai/conversations` | GET, POST | Conversas | |
| `/api/ai/conversations/[id]` | GET, PATCH, DELETE | Conversa individual | |
| `/api/ai/generate` | POST | Gerar conteúdo | |
| `/api/ai/templates` | GET, POST | Templates de IA | |
| `/api/ai/templates/[id]` | PATCH, DELETE | Template individual | |

## Debug / Dev / Setup (não usar em integrações)

| Endpoint | Métodos | Notas |
|---|---|---|
| `/api/debug/omnisend-discovery` | GET | Descoberta Omnisend (debug) |
| `/api/debug/stores-diagnostic` | GET | Diagnóstico de lojas |
| `/api/dev/omnisend-discovery-r7` … `r11` | GET | Variações de R&D (5 rotas) — candidatas a remoção |
| `/api/setup/database` | GET, POST | Verificação/init de banco. **Rate limit: chama `checkRateLimit`** |
