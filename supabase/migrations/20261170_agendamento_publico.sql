-- Agendamento público: a reunião que nasce do formulário.
--
-- Aditiva e reversível. Duas coisas:
--
-- 1. `meetings.source` passa a aceitar 'form'. O CHECK só conhecia
--    'admin' e 'google', e inserir com um terceiro valor morreria em
--    23514 — a mesma armadilha que já custou quatro dias no `copy_fit`
--    e que a migration do `statement` fechou semana passada. Sem o
--    valor próprio, a call marcada pelo lead ficaria indistinguível da
--    marcada por alguém do time, e é justamente ela que a gente vai
--    querer contar.
--
-- 2. `meetings.form_session_id`: a sessão do formulário que gerou a
--    reunião. É por ela que o POST público sabe de QUEM é a call sem
--    receber nenhum id no corpo (a sessão já carrega lead e negócio, e
--    o token dela já é conferido). O índice ÚNICO parcial é o que
--    impede o clique duplo virar duas calls na agenda: com ele o
--    segundo POST toma 23505 e o código REAPROVEITA a reunião em vez de
--    inserir — "checar antes sem tratar o conflito depois é o padrão
--    que duplica".
--
-- Rollback:
--   drop index if exists uniq_meetings_form_session;
--   alter table public.meetings drop column if exists form_session_id;
--   alter table public.meetings drop constraint if exists meetings_source_check;
--   alter table public.meetings add constraint meetings_source_check
--     check (source = any (array['admin'::text, 'google'::text]));

alter table public.meetings drop constraint if exists meetings_source_check;
alter table public.meetings add constraint meetings_source_check
  check (source = any (array['admin'::text, 'google'::text, 'form'::text]));

alter table public.meetings
  add column if not exists form_session_id uuid
    references public.form_sessions(id) on delete set null;

comment on column public.meetings.form_session_id is
  'Sessão do formulário conversacional que agendou esta reunião. Uma sessão agenda no máximo uma; reagendar atualiza a mesma linha.';

create unique index if not exists uniq_meetings_form_session
  on public.meetings (form_session_id)
  where form_session_id is not null;
