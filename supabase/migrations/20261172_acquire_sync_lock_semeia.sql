-- 20261172 — o lock nasce no primeiro pedido, em vez de depender de um seed.
--
-- `acquire_sync_lock` só fazia UPDATE. Cron cuja linha ninguém semeou em
-- migration tomava ROW_COUNT = 0 para sempre, e o chamador lê esse `false`
-- como "outra execução está rodando": responde
-- {skipped: true, reason: "lock_active"} em TODA invocação e nunca roda.
--
-- Medido em 18/09: `cron_locks` tem `sync_reports`, `campaign_suggestions_cycle`
-- e os `refresh_*`, e NÃO tem `google_calendar_sync` — o cron horário da agenda
-- nunca rodou uma vez. O token do Google venceu em 15/09 e nunca foi renovado
-- (o refresh só acontece dentro do sync), as 123 reuniões importadas têm todas
-- o mesmo `updated_at` ao microssegundo (a importação do callback do OAuth) e
-- o watch de push nunca foi registrado, porque vive na Fase 4. Nada disso
-- aparecia: o "Lock active" é `log.info`, rebaixado de propósito para não
-- pintar âmbar no painel.
--
-- A irmã `acquire_cron_lock` (refresh do dashboard) já inseria. Esta era a
-- exceção. Com o INSERT idempotente, a classe fecha por construção: cron novo
-- que use este lock funciona sem migration de seed.
--
-- Semântica inalterada para quem já tem linha: o ON CONFLICT DO NOTHING é
-- no-op e o UPDATE atômico segue sendo quem decide.
--
-- Rollback: recriar a função sem o bloco INSERT.

create or replace function public.acquire_sync_lock(
  p_lock_name text,
  p_stale_ms bigint default 600000
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_updated INT;
  v_was_stale BOOLEAN := false;
BEGIN
  -- A linha do lock nasce aqui (ver o cabeçalho da migration).
  INSERT INTO cron_locks (lock_name, is_running)
  VALUES (p_lock_name, false)
  ON CONFLICT (lock_name) DO NOTHING;

  -- Estava vencido antes do update? (só para o log)
  SELECT (is_running = true AND (started_at IS NULL OR started_at < now() - (p_stale_ms || ' milliseconds')::interval))
  INTO v_was_stale
  FROM cron_locks
  WHERE lock_name = p_lock_name;

  -- UPDATE atômico: adquire só se não estiver rodando OU estiver vencido.
  UPDATE cron_locks
  SET is_running = true,
      started_at = now()
  WHERE lock_name = p_lock_name
    AND (
      is_running = false
      OR started_at IS NULL
      OR started_at < now() - (p_stale_ms || ' milliseconds')::interval
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 AND v_was_stale THEN
    RAISE LOG '[Cron] Stale lock acquired for %', p_lock_name;
  END IF;

  RETURN v_updated > 0;
END;
$function$;

-- Semeia o que já deveria existir (no-op depois do primeiro pedido).
insert into public.cron_locks (lock_name, is_running)
values ('google_calendar_sync', false)
on conflict (lock_name) do nothing;
