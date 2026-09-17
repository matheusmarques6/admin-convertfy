-- Fechar as RPCs para `anon` (16/09)
--
-- Os rounds 5A e 5B fecharam as TABELAS; ninguém tinha olhado as
-- FUNÇÕES. Medido em 16/09: **78 funções `SECURITY DEFINER` no schema
-- `public` executáveis por `anon`** — a chave pública que vai no JS do
-- browser. `SECURITY DEFINER` roda como o dono, então RLS não protege
-- nada do que elas fazem por dentro; e o PostgREST expõe toda função do
-- schema `public` em `/rest/v1/rpc/<nome>`.
--
-- O que dava para fazer com a chave pública, sem sessão:
--   rate_limit_clear(...)          → anular o rate limit do login/reset
--   acquire_cron_lock('sync_reports', 86400, …)
--                                  → travar a sincronização por um dia
--   upsert_custom_range_cache(...) → FALSIFICAR a receita do dashboard
--   audit_cleanup(0)               → apagar a trilha de auditoria
--   audit_password_reset(...)      → injetar evento de auditoria falso
--   increment_email_attempts(…)    → queimar as tentativas de geração
--   search_agent_chunks(…)         → ler o conteúdo indexado dos agentes
--
-- ── Por que fechar é seguro (medido, não suposto) ────────────────────
--
-- NENHUMA rota chama RPC com a chave `anon`. Levantamento do código:
--   * as 51 RPCs chamadas pelo app usam `createAdminClient` (service
--     role) ou `createClient` do servidor (sessão do usuário);
--   * os dois únicos arquivos que chamam `.rpc` com o cliente do BROWSER
--     são `notification.service.ts` (`unread_notifications_count`, que
--     exige usuário logado) e `rate-limit.service.ts`, que é código MORTO
--     — só é reexportado por `lib/services/index.ts`, sem consumidor (o
--     rate limit em uso é `lib/rate-limit.ts`);
--   * todas as rotas públicas (`/api/public/*`, `/api/tracking/*`) usam
--     `createAdminClient`, inclusive `increment_form_views`.
--
-- ── A forma do REVOKE importa ────────────────────────────────────────
--
-- No Postgres, função nasce com `EXECUTE` para **PUBLIC**, e `anon`
-- herda dali. `REVOKE ... FROM anon` sozinho NÃO tira nada — remove
-- apenas um grant direto que quase nunca existe. Por isso a revogação é
-- de PUBLIC, e por isso `authenticated` e `service_role` recebem o grant
-- explícito ANTES: sem eles, tirar PUBLIC derrubaria também quem está
-- logado (o `unread_notifications_count` do sino, por exemplo).
--
-- Idempotente. Rodar inteiro.

do $$
declare
  f record;
  -- Exceções: funções que PRECISAM continuar abertas a `anon`.
  -- Hoje está vazia, e isso foi medido — não é descuido. Se um fluxo
  -- público passar a chamar RPC com a anon key, o nome entra aqui COM
  -- o motivo, em vez de alguém reabrir tudo.
  excecoes text[] := array[]::text[];
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not (p.proname = any(excecoes))
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    n := n + 1;
  end loop;
  raise notice 'RPCs fechadas para anon: %', n;
end $$;

-- ── As INVOKER que ESCREVEM ──────────────────────────────────────────
--
-- Função `SECURITY INVOKER` roda com os privilégios de quem chama, então
-- a RLS de `anon` (fechada nos rounds 5A/5B) já barra o efeito. Fechar
-- ainda assim é barato e tira a função da superfície — uma policy nova
-- escrita errada amanhã volta a expor o caminho.
--
-- As funções de EXTENSÃO ficam de fora (`pg_depend.deptype = 'e'`):
-- pgvector e pg_trgm precisam delas para os índices, o Supabase as
-- gerencia, e revogá-las quebraria a busca semântica.
do $$
declare
  f record;
  n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where ns.nspname = 'public'
      and not p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prorettype <> 'trigger'::regtype
      and p.provolatile = 'v'
      and d.objid is null
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    n := n + 1;
  end loop;
  raise notice 'INVOKER voláteis fechadas para anon: %', n;
end $$;

-- Verificação: as três linhas têm de sair com `anon_pode = 0`, e
-- `authenticated_pode` igual ao total (ninguém logado perdeu acesso).
--
-- Medido em 16/09, depois de aplicar: secdef_total 102, anon_pode **0**
-- (era 78), authenticated_pode 78, service_pode 102. E 2 INVOKER
-- voláteis do app fechadas; as 8 que sobram abertas a `anon` são todas
-- de extensão.
select
  count(*) filter (where p.prosecdef) as secdef_total,
  count(*) filter (where p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_pode,
  count(*) filter (where p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')) as authenticated_pode
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public';

-- ── O advisor `function_search_path_mutable` foi medido e DISPENSADO ──
--
-- 45 das 102 `SECURITY DEFINER` não fixam `search_path`, e o advisor
-- aponta isso como risco de sequestro de resolução de nomes. Para
-- sequestrar, o atacante precisa CRIAR um objeto num schema que venha
-- antes no `search_path` — e medido em 16/09, **nenhum papel da API pode
-- criar nada**: `anon`, `authenticated`, `service_role` e `authenticator`
-- têm CREATE negado tanto em `public` quanto no banco (não podem sequer
-- criar schema).
--
--   select r.rolname,
--     has_schema_privilege(r.rolname,'public','CREATE')            as cria_em_public,
--     has_database_privilege(r.rolname, current_database(),'CREATE') as cria_schema
--   from pg_roles r
--   where r.rolname in ('anon','authenticated','service_role','authenticator');
--
-- Com o vetor fechado, um `ALTER FUNCTION ... SET search_path` em 45
-- funções de produção é risco puro: função que dependa de `extensions`
-- (pgcrypto, pgvector) ou de `auth` passa a não resolver, e a quebra
-- aparece em runtime. Se algum dia um papel ganhar CREATE, a conta
-- inverte e o certo é fixar — com `public, extensions, pg_temp`, não só
-- `public`.
--
-- ── Rollback ─────────────────────────────────────────────────────────
-- Se algum fluxo público quebrar, o nome da função aparece no erro do
-- PostgREST ("permission denied for function X"). Reabra SÓ ela, e
-- acrescente-a a `excecoes` acima com o motivo:
--   grant execute on function public.<nome>(<args>) to anon;
