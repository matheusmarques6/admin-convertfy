-- ============================================================
-- CRM Inbox: notificações de mensagem recebida (sino do admin)
--
-- Cada mensagem inbound do inbox comercial gera/atualiza UMA
-- notificação por (thread, usuário) na tabela `notifications` —
-- coalescida ("3 novas mensagens de João"). Ela é marcada como
-- lida (some do sino) quando qualquer agente abre a conversa ou
-- responde (clear GLOBAL, consistente com crm_threads.unread_count
-- que também é global).
--
-- Por que a coalescência vive em SQL e não no service TS:
-- webhooks concorrentes da mesma thread (Meta reenvia eventos,
-- rajadas de mensagens) fariam SELECT-depois-INSERT criar
-- notificações duplicadas. O unique partial index + ON CONFLICT
-- garante atomicidade: no máximo 1 notificação ABERTA por
-- (thread, user), sob qualquer concorrência.
--
-- O índice GIN existente (idx_notifications_dedup_key) NÃO cobre
-- lookup por metadata->>'thread_id' (é parcial em ? 'dedup_key');
-- o índice abaixo serve tanto o ON CONFLICT quanto o UPDATE de
-- clear (leading column = thread_id).
--
-- Contrato de metadata (estável — consumido pelo futuro push mobile):
--   { source: 'crm_inbox', thread_id, org_id, message_count,
--     last_message_id }
--
-- Referência: docs/crm/inbox-notifications.md
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_crm_inbox_open
  ON notifications ((metadata->>'thread_id'), user_id)
  WHERE read = FALSE AND metadata->>'source' = 'crm_inbox';

COMMENT ON INDEX uniq_notifications_crm_inbox_open IS
  'CRM inbox: no máximo 1 notificação aberta por (thread, user). '
  'Alvo do ON CONFLICT de upsert_crm_inbox_notification e do UPDATE '
  'de clear (read=true) por thread_id.';

-- Upsert coalescido: INSERT para cada destinatário; se já existe
-- notificação aberta da mesma thread para o usuário, atualiza
-- título/preview, incrementa message_count e dá bump em created_at
-- (sobe no sino; o realtime UPDATE revalida o badge — o hook
-- use-unified-notifications assina INSERT e UPDATE).
CREATE OR REPLACE FUNCTION upsert_crm_inbox_notification(
  p_user_ids UUID[],
  p_thread_id UUID,
  p_org_id UUID,
  p_contact_label TEXT,
  p_preview TEXT,
  p_link TEXT,
  p_message_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO notifications (user_id, title, body, type, link, metadata)
  SELECT
    uid,
    'Nova mensagem de ' || p_contact_label,
    p_preview,
    'info',
    p_link,
    jsonb_build_object(
      'source', 'crm_inbox',
      'thread_id', p_thread_id::text,
      'org_id', p_org_id::text,
      'message_count', 1,
      'last_message_id', p_message_id::text
    )
  FROM unnest(p_user_ids) AS uid
  ON CONFLICT ((metadata->>'thread_id'), user_id)
    WHERE read = FALSE AND metadata->>'source' = 'crm_inbox'
  DO UPDATE SET
    title = (COALESCE((notifications.metadata->>'message_count')::int, 1) + 1)::text
            || ' novas mensagens de ' || p_contact_label,
    body = EXCLUDED.body,
    link = EXCLUDED.link,
    created_at = NOW(),
    metadata = notifications.metadata || jsonb_build_object(
      'message_count', COALESCE((notifications.metadata->>'message_count')::int, 1) + 1,
      'last_message_id', p_message_id::text
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Só o service role (webhook processors) chama — nunca o browser.
REVOKE ALL ON FUNCTION upsert_crm_inbox_notification(UUID[], UUID, UUID, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION upsert_crm_inbox_notification(UUID[], UUID, UUID, TEXT, TEXT, TEXT, UUID) IS
  'CRM inbox: cria/coalesce a notificação de mensagem recebida para '
  'cada destinatário. Chamada pelos webhook processors via service '
  'role (crm-inbox-notification.service.ts).';
