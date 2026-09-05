-- ============================================================
-- Notificação de "onboarding travado": uma linha por par, não uma por dia
-- ============================================================
-- O cron diário criava uma notificação NOVA por onboarding travado, por
-- membro, todo dia — e ninguém marcava como lida, porque não há ação a
-- tomar num aviso repetido. Resultado medido em 05/09: 17.611 linhas não
-- lidas de `onboarding_stuck`, 15.465 delas com mais de 7 dias. Isso
-- fazia o sino carregar 2.408 linhas por poll no pior usuário e inchava
-- a tabela inteira.
--
-- Correção estrutural (o padrão de Discourse/Mastodon/GitHub): coalescer
-- por chave — uma linha ABERTA por (usuário, onboarding), atualizada no
-- lugar. "Travado há 3 dias" vira "travado há 4 dias" na mesma linha, que
-- sobe no sino pelo bump de `created_at`. Depois de lida, um novo
-- travamento cria linha nova.
--
-- Sem índice único: o cron roda 1x/dia e não concorre consigo mesmo (ao
-- contrário do inbox, onde webhooks simultâneos exigiam ON CONFLICT).
-- Um índice único aqui poderia colidir com outros usos de `dedup_key`.
--
-- Idempotente.
-- ============================================================

-- Lookup do par (onboarding, usuário) entre as notificações abertas.
CREATE INDEX IF NOT EXISTS idx_notifications_onboarding_open
  ON notifications ((metadata->>'onboarding_id'), user_id)
  WHERE read = FALSE AND type = 'onboarding_stuck';

CREATE OR REPLACE FUNCTION upsert_onboarding_stuck_notifications(
  p_user_ids UUID[],
  p_onboarding_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_link TEXT,
  p_days_stuck INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_touched INTEGER := 0;
  v_updated INTEGER;
  uid UUID;
BEGIN
  FOREACH uid IN ARRAY COALESCE(p_user_ids, ARRAY[]::UUID[]) LOOP
    UPDATE notifications
       SET title = p_title,
           body = p_body,
           link = p_link,
           created_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb)
                   || jsonb_build_object('days_stuck', p_days_stuck)
     WHERE user_id = uid
       AND read = FALSE
       AND type = 'onboarding_stuck'
       AND (metadata->>'onboarding_id') = p_onboarding_id::text;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      INSERT INTO notifications (user_id, title, body, type, link, metadata, read)
      VALUES (uid, p_title, p_body, 'onboarding_stuck', p_link,
              jsonb_build_object('onboarding_id', p_onboarding_id::text,
                                 'days_stuck', p_days_stuck),
              FALSE);
      v_updated := 1;
    END IF;

    v_touched := v_touched + v_updated;
  END LOOP;

  RETURN v_touched;
END;
$$;

REVOKE ALL ON FUNCTION upsert_onboarding_stuck_notifications(UUID[], UUID, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
