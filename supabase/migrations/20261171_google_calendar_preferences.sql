-- 20261171 — as duas colunas de preferência do Google Calendar que só existiam no código.
--
-- `/api/integrations/google/calendar/settings` LÊ e ESCREVE as duas desde sempre;
-- elas nunca foram criadas. O supabase-js devolve o 42703 em `error`, então:
--   • o PUT da tela de configuração falhava em todo clique;
--   • pior, o select do sync incremental pede `calendar_sync_token` JUNTO de
--     `selected_calendar_id` — o erro derruba o select inteiro, o sync token
--     gravado no banco nunca é lido e cada rodada do cron varre a agenda
--     completa em vez do delta;
--   • e `startCalendarWatch` lê `calendar_channel_id`/`calendar_resource_id`
--     no mesmo select, então o canal anterior nunca é encerrado.
--
-- Os defaults reproduzem o fallback que o código já aplicava (`|| "primary"`,
-- `?? true`), então nada muda de comportamento no dia em que ela roda.
--
-- Rollback:
--   alter table public.user_google_tokens
--     drop column if exists selected_calendar_id,
--     drop column if exists auto_meet;

alter table public.user_google_tokens
  add column if not exists selected_calendar_id text,
  add column if not exists auto_meet boolean not null default true;

comment on column public.user_google_tokens.selected_calendar_id is
  'Calendário do Google onde as reuniões da org são criadas. NULL = "primary".';
comment on column public.user_google_tokens.auto_meet is
  'Criar link do Meet automaticamente nas reuniões sincronizadas. Default true = comportamento histórico.';
