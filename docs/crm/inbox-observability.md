# Inbox — o que medir e as regras que não podem voltar

> Escrito depois do incidente de set/2026, em que o inbox sufocou um
> Postgres pequeno com 59 conversas e 238 mensagens. O problema nunca foi
> volume: era **relógio** (trabalho periódico que não dependia de haver
> mensagem) e **amplificação** (cada escrita acordava todas as abas, que
> reliam e escreviam de novo).

## O incidente em números

Medido em 05/09/2026 (`pg_stat_statements` desde 15/07):

| Sintoma | Antes | Causa |
|---|---|---|
| `count exact` de eventos `dead`, 1×/min | 916 ms, 74 mil chamadas, **372 min de CPU** | PostgREST manda `status = $1`; o plano genérico não prova o predicado do índice parcial → seq scan sobre 266 MB de bloat |
| `realtime.list_changes` (polling do WAL) | 2,86 M chamadas, **372 min de CPU** | 10 tabelas na publication + 20 bindings por aba (hook de notificação montado 5×) |
| Sino (`select *` de não lidas) | 2.408 linhas no pior usuário | 18.023 não lidas, 17.312 do cron de "onboarding travado" |
| Clear/dedup de alerta de canal | 516 ms, 2× por canal a cada 5 min | `metadata->>$k = $v` com chave parametrizada nunca usa índice |
| `crm_webhook_events` | 12 linhas, **266 MB** | payload cru com mídia base64 + prune que só apagava `done` |
| Ingestão | 13–17 statements e 3 versões da thread por mensagem | escritas incondicionais + `count exact` para "é a primeira?" |
| Lista do inbox | 9 statements (6 varreduras de `crm_threads`) + 12 no `after()` | count exact, 4 head counts, varredura de não-lidas, backfill de avatar |

## Regras que não podem voltar

1. **Nenhuma contagem em caminho quente pelo PostgREST.** `count: "exact"`
   e `head: true` escondem até `statement timeout` (supabase-js#1661).
   Contagem vira RPC com **literal** (aí os índices parciais valem) ou
   `EXISTS`/`LIMIT 1`.
2. **Índice parcial não serve a query parametrizada.** O PostgREST usa
   prepared statements; a partir da 6ª execução o plano genérico não
   consegue provar `status = $1 ⊆ WHERE status = 'dead'`. Ou o predicado é
   literal (dentro de função), ou o índice não é parcial.
3. **Chave de JSONB tem de ser literal.** `metadata->>$1 = $2` não usa
   índice, e `->>` não é LEAKPROOF. Toda leitura por `metadata->>` mora em
   RPC (`clear_crm_thread_notifications`, `has_open_channel_alert`,
   `has_open_crm_thread_notification`, `clear_channel_alerts`).
4. **Escrita evitada = evento de realtime evitado × número de abas.**
   `crm_threads` está na publication: todo UPDATE acorda todas as abas da
   org, e cada uma relista. Por isso `unread_count = 0` só quando há
   não-lida, `contact_name` só quando mudou, e o GET de mídia não persiste
   URL assinada.
5. **GET não escreve.** O backfill de avatar saiu do `after()` da lista
   para o cron `crm-avatar-backfill` — ele escrevia na tabela que o
   realtime observa, e o evento fazia a lista rodar de novo.
6. **Fila não é histórico.** Retenção: `done` 24 h, `failed`/`dead` 14 d.
   Lease do claim ≥ `maxDuration` da rota + margem. `processing` com lease
   vencido volta para a fila (era buraco: 8 eventos presos desde 15/07).
7. **Notificação de cron é coalescida por chave.** Uma linha aberta por
   (usuário, entidade), atualizada no lugar. Sem isso o backlog volta:
   eram 15.465 linhas de "onboarding travado" com mais de 7 dias.
8. **Realtime fail-closed.** Sem `org_id` resolvido não se assina
   `crm_threads` — assinar sem filtro entrega a atividade de todas as
   organizações e faz o banco saturado aumentar o próprio raio de
   explosão.

## Queries de acompanhamento

```sql
-- 1. Os maiores consumidores. Depois do deploy: pg_stat_statements_reset()
--    e reler 24h depois. `realtime.list_changes` e qualquer count de fila
--    NÃO podem estar no top-20.
SELECT calls, round(total_exec_time::numeric/1000/60, 1) AS total_min,
       round(mean_exec_time::numeric, 1) AS mean_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS q
  FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

-- 2. Saúde da fila (o cron já loga; isto é para inspeção manual).
SELECT * FROM crm_webhook_queue_stats();
SELECT pg_size_pretty(pg_total_relation_size('crm_webhook_events')) AS fila;
--    Alvo: < 5 MB. Acima disso, procurar payload com binário.

-- 3. Varredura sequencial nas tabelas quentes.
SELECT relname, seq_scan, seq_tup_read, idx_scan, n_dead_tup, last_autovacuum
  FROM pg_stat_user_tables
 WHERE relname IN ('crm_webhook_events','crm_threads','crm_messages',
                   'notifications','profiles','org_members');

-- 4. Quem está na publication do realtime — cada tabela aqui custa
--    polling do WAL mesmo sem assinante.
SELECT tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' ORDER BY 1;

-- 5. Notificações: o backlog voltou?
SELECT type, count(*) FILTER (WHERE NOT read) AS nao_lidas, count(*) AS total
  FROM notifications GROUP BY type ORDER BY nao_lidas DESC;
--    Alvo: nenhum tipo com milhares de não lidas.

-- 6. Custo da lista (deve ser um statement).
EXPLAIN (ANALYZE, BUFFERS)
SELECT crm_inbox_list_threads('<org_id>', 'open', NULL, NULL, NULL, NULL, NULL, NULL, 50, 0);
--    Alvo: < 15 ms.
```

## Ao religar o número do WhatsApp

O número (Evolution) está `close` desde 04/08 — reconectar é operação, não
código. Antes do QR:

1. Confirmar as fases 0–3 em produção (migrations 20261120–20261122).
2. Na Evolution: `EVOLUTION_WEBHOOK_BASE64=false`, e o webhook assinando
   **só** `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE`,
   `CONNECTION_UPDATE` — nunca `MESSAGES_SET` (um POST único com o
   histórico inteiro estoura o limite de 4,5 MB da Vercel e toma 413
   antes do nosso código, sem log nem retry).
3. `syncFullHistory=false` na instância. Histórico entra depois, pelo pull
   paginado com cursor (`crm_history_import_jobs`), um canal por vez.
4. `SELECT pg_stat_statements_reset();` para medir do zero.
5. Ligar QStash (`ENABLE_ASYNC_WEBHOOK=true` + as duas signing keys — sem
   elas o worker rejeita tudo em produção).

Nas primeiras horas, a cada 5 min: queries 1, 2 e 5 acima, logs de
`/api/workers/whatsapp-webhook` e o painel do QStash.

Rollback, em ordem: (a) desligar `ENABLE_ASYNC_WEBHOOK` (o cron de 5 min
drena a fila); (b) pausar o endpoint no QStash — os eventos ficam
`pending` com payload pequeno; (c) `logout` da instância — a fila preserva
tudo, nada se perde.

## O que ficou de fora (e por quê)

**Broadcast from Database.** O caminho recomendado pela Supabase é
substituir `postgres_changes` por `realtime.send()` em trigger, com canal
privado por org e a RLS avaliada uma vez no join — o custo deixa de
crescer com o número de abas. As funções já existem no projeto
(`realtime.send`, `realtime.broadcast_changes`, `realtime.topic`). Não foi
feito agora porque exige policy nova em `realtime.messages` (e a falha é
SILENCIOSA se ela faltar — supabase/discussions#39091), mudança no
cliente para aplicar o payload no cache, e uma janela de validação em
staging com duas abas. As fases 0–3 já cortaram o custo por evento; esta é
a próxima, não um pré-requisito para religar o número.

**Reescrita das policies de RLS** (`(select is_admin())`, `TO
authenticated`, uma policy por ação). `profiles` levou 24,7 milhões de seq
scans por helpers chamados por linha. A correção é conhecida e medida
(11.000 ms → 7 ms nos benchmarks oficiais), mas deve entrar **depois** do
Broadcast: com `postgres_changes` ativo, endurecer as policies aumenta o
custo por assinante. Hoje as policies em produção ainda são
`USING (true)` — o `APPLY_MANUALLY_fix_rls_round4` não foi aplicado.
