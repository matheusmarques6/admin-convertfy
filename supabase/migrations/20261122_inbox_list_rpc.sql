-- ============================================================
-- Inbox — recuperação, FASE 2: a lista em UM statement
-- ============================================================
-- `GET /api/crm/inbox/threads` custava NOVE round-trips, seis deles
-- varrendo `crm_threads` na mesma chamada:
--
--   1. auth (GoTrue)            2. org_members
--   3. crm_channels do tipo     4. crm_channels (todos)
--   5. página + `count: exact`  6. varredura de unread (limit 500)
--   7-10. QUATRO `count exact, head:true` para os contadores das abas
--   + até 12 statements no after() do backfill de avatar
--
-- E a rota é chamada por poll, por evento de realtime (em TODAS as abas
-- da org) e depois de cada mutação. Uma mensagem recebida custava
-- ~20 statements por aba aberta.
--
-- Aqui os seis viram um: a mesma CTE alimenta página, total, contadores
-- por canal e não-lidas. Os contadores usam `COUNT(*) FILTER`, que é uma
-- passada só — e ficam SEM o filtro de canal de propósito (senão o
-- contador do outro canal zera quando um está selecionado), exatamente
-- como o código que substituem.
--
-- Paginação segue offset/limit: com 59 conversas o gargalo nunca foi a
-- paginação, e trocar por keyset mudaria o contrato do cliente sem ganho
-- mensurável hoje.
--
-- Idempotente.
-- ============================================================

-- Não-lidas da org: `unread_count > 0` é filtro pós-índice no
-- idx_crm_threads_org_status, então percorria todas as conversas
-- open/pending. Como o predicado aqui é LITERAL (mora dentro da função),
-- o índice parcial é elegível — o mesmo não valeria via PostgREST.
CREATE INDEX IF NOT EXISTS idx_crm_threads_org_unread_open
  ON crm_threads (org_id)
  WHERE status IN ('open', 'pending') AND unread_count > 0;

-- Backfill de avatar sai do caminho da resposta (ver fase 2 no código):
-- a tentativa passa a ser persistida em vez de viver num Map em memória
-- da lambda, que em serverless quase não segura nada.
ALTER TABLE crm_threads ADD COLUMN IF NOT EXISTS contact_avatar_checked_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION crm_inbox_list_threads(
  p_org_id UUID,
  p_status TEXT DEFAULT 'open',
  p_assigned_to UUID DEFAULT NULL,
  p_tag_variants TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_channel_type TEXT DEFAULT NULL,
  p_channel_id UUID DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  -- Filtros que valem para TUDO (página e contadores), menos canal/kind.
  SELECT t.id, t.status, t.contact_name, t.contact_external_id, t.contact_avatar_url,
         t.last_message_at, t.last_message_preview, t.last_message_direction,
         t.unread_count, t.tags, t.assigned_to, t.lead_id, t.deal_id, t.client_id,
         t.channel_id, t.is_window_open, t.window_expires_at, t.created_at, t.updated_at,
         c.type AS channel_type, c.provider AS channel_provider,
         c.display_name AS channel_display_name
    FROM crm_threads t
    JOIN crm_channels c ON c.id = t.channel_id
   WHERE t.org_id = p_org_id
     AND (p_status = 'all' OR t.status = p_status)
     AND (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
     AND (p_tag_variants IS NULL OR t.tags && p_tag_variants)
     AND (
       p_search IS NULL OR p_search = ''
       OR t.contact_name ILIKE '%' || p_search || '%'
       OR t.contact_external_id ILIKE '%' || p_search || '%'
     )
),
filtered AS (
  -- O recorte que a tela está vendo (canal + sub-aba do Instagram).
  SELECT * FROM base b
   WHERE (p_channel_id IS NOT NULL AND b.channel_id = p_channel_id)
      OR (p_channel_id IS NULL AND (p_channel_type IS NULL OR b.channel_type = p_channel_type))
),
kinded AS (
  SELECT * FROM filtered f
   WHERE p_kind IS NULL
      OR (p_kind = 'comment' AND f.contact_external_id LIKE 'comment:%')
      OR (p_kind = 'direct' AND f.contact_external_id NOT LIKE 'comment:%')
),
page AS (
  SELECT k.*,
         CASE WHEN pr.id IS NULL THEN NULL ELSE
           jsonb_build_object('id', pr.id, 'name', pr.name, 'avatar_url', pr.avatar_url)
         END AS assignee,
         jsonb_build_object(
           'id', k.channel_id, 'type', k.channel_type,
           'provider', k.channel_provider, 'display_name', k.channel_display_name
         ) AS channel
    FROM kinded k
    LEFT JOIN profiles pr ON pr.id = k.assigned_to
   ORDER BY k.last_message_at DESC NULLS LAST, k.id DESC
   LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0)
),
counts AS (
  SELECT
    count(*) FILTER (WHERE channel_type = 'whatsapp') AS wa,
    count(*) FILTER (WHERE channel_type = 'instagram') AS ig,
    count(*) FILTER (WHERE channel_type = 'instagram'
                       AND contact_external_id NOT LIKE 'comment:%') AS ig_direct,
    count(*) FILTER (WHERE channel_type = 'instagram'
                       AND contact_external_id LIKE 'comment:%') AS ig_comment
  FROM base
),
totals AS (SELECT count(*) AS total FROM kinded),
unread AS (
  SELECT COALESCE(sum(unread_count), 0) AS n
    FROM crm_threads
   WHERE org_id = p_org_id
     AND status IN ('open', 'pending')
     AND unread_count > 0
),
channels AS (
  -- A tela precisa saber se a org TEM canal daquele tipo: sem canal não
  -- é o mesmo que sem conversa, e a UI mostra mensagens diferentes.
  SELECT count(*) FILTER (WHERE type = 'whatsapp') AS wa,
         count(*) FILTER (WHERE type = 'instagram') AS ig
    FROM crm_channels WHERE org_id = p_org_id
)
SELECT jsonb_build_object(
  'org_id', p_org_id,
  'threads', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status,
      'contact_name', p.contact_name, 'contact_external_id', p.contact_external_id,
      'contact_avatar_url', p.contact_avatar_url,
      'last_message_at', p.last_message_at,
      'last_message_preview', p.last_message_preview,
      'last_message_direction', p.last_message_direction,
      'unread_count', p.unread_count, 'tags', p.tags,
      'assigned_to', p.assigned_to, 'lead_id', p.lead_id, 'deal_id', p.deal_id,
      'client_id', p.client_id, 'channel_id', p.channel_id,
      'is_window_open', p.is_window_open, 'window_expires_at', p.window_expires_at,
      'created_at', p.created_at, 'updated_at', p.updated_at,
      'assignee', p.assignee, 'channel', p.channel
    ) ORDER BY p.last_message_at DESC NULLS LAST, p.id DESC)
    FROM page p
  ), '[]'::jsonb),
  'total', (SELECT total FROM totals),
  'has_more', GREATEST(p_offset, 0) + (SELECT count(*) FROM page) < (SELECT total FROM totals),
  'total_unread', (SELECT n FROM unread),
  'channel_counts', jsonb_build_object(
    'whatsapp', (SELECT wa FROM counts),
    'instagram', (SELECT ig FROM counts),
    'instagram_direct', (SELECT ig_direct FROM counts),
    'instagram_comment', (SELECT ig_comment FROM counts)
  ),
  'has_whatsapp_channel', (SELECT wa FROM channels) > 0,
  'has_instagram_channel', (SELECT ig FROM channels) > 0
);
$$;

-- Badge da sidebar: mesma régua do total_unread, sem carregar a lista.
CREATE OR REPLACE FUNCTION crm_inbox_unread_total(p_org_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(unread_count), 0)::int
    FROM crm_threads
   WHERE org_id = p_org_id
     AND status IN ('open', 'pending')
     AND unread_count > 0;
$$;

REVOKE ALL ON FUNCTION crm_inbox_list_threads(UUID, TEXT, UUID, TEXT[], TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_inbox_unread_total(UUID) FROM PUBLIC, anon, authenticated;
