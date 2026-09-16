-- Central de Campanhas — por que 16 ciclos renderam ZERO sugestões (16/09)
--
-- NÃO é migration: é a medição que levou às correções de 16/09, para o
-- próximo leitor conferir se elas pegaram. Rodar item a item.
--
-- ── O retrato de partida (16/09, antes das correções) ────────────────
--   16 ciclos, 0 sugestões. 15 presos em `generating` PARA SEMPRE.
--   `campaign_ai_runs` sem uma linha `kind='suggestions'` desde 10/08.
--   20 runs `invalid_output` de trends com `tokens_output` = 4096 cravado.
--   Lock `campaign_suggestions_cycle` com `is_running` desde 14/09 e
--   `finished_at` ANTERIOR ao `started_at` — a marca de quem morreu no meio.
--   Média medida por cluster de trends: 81 s (máx. 199 s) × 7 países em
--   SÉRIE = ~568 s contra um cron de `maxDuration = 300`.

-- 1) Ciclos e o que cada um entregou. `generating` com mais de 15 min é
--    ciclo morto — depois de 16/09 a varredura os fecha na execução
--    seguinte, então esta lista deve ficar vazia ou quase.
select c.number, c.status, c.triggered_by, c.created_at, c.generated_at,
       left(coalesce(c.error, ''), 120) as erro,
       (select count(*) from campaign_suggestions s where s.cycle_id = c.id) as sugestoes,
       c.context->'trends_adiados' as trends_adiados,
       c.context->>'trends_aviso'  as trends_aviso
from campaign_cycles c
order by c.created_at desc
limit 10;

-- 2) O sintoma que importa: o gerador de sugestões chega a ser chamado?
--    Antes de 16/09 a resposta era "não desde 10/08" — a captura de
--    tendências comia a função inteira e o produto nunca saía.
select kind, status, count(*) as n, max(created_at) as ultimo
from campaign_ai_runs
group by kind, status
order by n desc;

-- 3) Truncamento no teto. `tokens_output` colado no `max_tokens` da
--    config é a assinatura: não é o modelo errando o JSON, é o orçamento
--    acabando. Depois da correção, `input_vars->>'tentativas'` mostra a
--    2ª chamada com teto MAIOR, e `max_tokens` o teto realmente usado.
select r.created_at, r.status, r.model,
       r.tokens_output,
       r.input_vars->>'tentativas' as tentativas,
       r.input_vars->>'max_tokens' as teto_usado,
       length(coalesce(r.raw_output, '')) as raw_len,
       left(coalesce(r.error_message, ''), 160) as erro
from campaign_ai_runs r
where r.kind = 'trends'
order by r.created_at desc
limit 20;

-- 4) O modelo gravado tem de ser o CHAMADO. A run gravava a constante
--    `TRENDS_MODEL` enquanto a chamada usava `email_agent_configs.model`
--    — com a config em `moonshotai/kimi-k3`, toda a telemetria dizia
--    `claude-sonnet-4-6`. Estas duas colunas devem concordar.
select distinct r.model as model_na_run,
       (select model from email_agent_configs where agent_type = 'campaign_trends' and is_active) as model_na_config
from campaign_ai_runs r
where r.kind = 'trends' and r.created_at > now() - interval '30 days';

-- 5) Rotação: quem esperou mais entra primeiro na próxima captura. Se o
--    orçamento cortar sempre o mesmo pedaço da fila, esta coluna denuncia
--    — país com `ultima_captura` muito antiga e nunca alcançado.
select upper(country) as pais, count(*) as tendencias, max(created_at) as ultima_captura
from campaign_trends
group by upper(country)
order by ultima_captura nulls first;

-- 6) Locks. `is_running` com `finished_at` anterior ao `started_at` é
--    processo morto pelo runtime. O TTL de 10 min já libera, mas a linha
--    suja engana quem lê.
select lock_name, is_running, started_at, finished_at,
       round(extract(epoch from (now() - started_at)) / 60) as min_desde_inicio
from cron_locks
where is_running
order by started_at;

-- ── Correções de dado aplicadas em 16/09 (já rodadas em produção) ────
-- update email_agent_configs set max_tokens = 8192
--  where agent_type = 'campaign_trends' and is_active;   -- era 4096
-- update campaign_cycles set status = 'failed',
--   error = 'a geração foi interrompida antes de terminar (o processo acabou sem fechar o ciclo)',
--   generated_at = now()
--  where status = 'generating' and created_at < now() - interval '15 minutes';
-- update cron_locks set is_running = false, finished_at = now()
--  where is_running and started_at < now() - interval '1 hour';
