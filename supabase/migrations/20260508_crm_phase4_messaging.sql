-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Fase 4: Multiatendimento (WhatsApp Cloud API)
--
-- Provider pattern: cada thread pertence a um channel + provider. Hoje
-- so WhatsApp Cloud API e suportado, mas o esquema esta pronto pra
-- email/Instagram DM/etc futuramente.
--
-- Threads agrupam mensagens por (channel, contact_external_id). Uma
-- conversa e o conjunto contiguo de mensagens com a mesma tupla.
-- ════════════════════════════════════════════════════════════════════

-- ── crm_channels (configuracao de provedores por org/loja) ─────────
CREATE TABLE IF NOT EXISTS crm_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'email', 'instagram', 'facebook')),
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp_cloud', 'gmail', 'instagram_basic', 'facebook_page')),

  display_name TEXT NOT NULL,
  external_id TEXT NOT NULL, -- whatsapp_phone_number_id, gmail address, etc
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- access_token (encrypted), webhook_secret etc

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_channels_org ON crm_channels(org_id) WHERE is_active = TRUE;

-- ── crm_threads (uma conversa = lista de mensagens contiguas) ──────
CREATE TABLE IF NOT EXISTS crm_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES crm_channels(id) ON DELETE CASCADE NOT NULL,

  -- Identificador externo do contato (telefone E.164 pra WhatsApp)
  contact_external_id TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar_url TEXT,

  -- Vinculo opcional com leads/deals/clients
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,

  -- Atribuicao
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Estado
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'archived')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  unread_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (channel_id, contact_external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_threads_org_status ON crm_threads(org_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_threads_assigned ON crm_threads(assigned_to, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_threads_lead ON crm_threads(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_threads_deal ON crm_threads(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_threads_client ON crm_threads(client_id) WHERE client_id IS NOT NULL;

-- ── crm_messages (mensagens individuais) ────────────────────────────
CREATE TABLE IF NOT EXISTS crm_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES crm_threads(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- ID externo do provedor (idempotencia em webhook)
  external_id TEXT,

  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'template', 'interactive', 'system')),

  body TEXT, -- texto / caption
  media_url TEXT,
  media_mime TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Quem enviou (user, automation, system, contact)
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_by_kind TEXT NOT NULL DEFAULT 'contact' CHECK (sent_by_kind IN ('contact', 'agent', 'automation', 'system')),

  -- Status do delivery (provedor)
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  status_updated_at TIMESTAMPTZ DEFAULT NOW(),
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (thread_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_messages_thread ON crm_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_messages_org ON crm_messages(org_id, created_at DESC);

-- ── Trigger: atualiza last_message_* na thread quando mensagem entra
CREATE OR REPLACE FUNCTION crm_messages_update_thread()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_threads
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.body, '[' || NEW.content_type || ']'), 200),
    last_message_direction = NEW.direction,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_messages_update_thread ON crm_messages;
CREATE TRIGGER trg_crm_messages_update_thread
AFTER INSERT ON crm_messages
FOR EACH ROW
EXECUTE FUNCTION crm_messages_update_thread();

-- ── Trigger: updated_at ────────────────────────────────────────────
CREATE TRIGGER crm_set_updated_at_channels BEFORE UPDATE ON crm_channels FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();
CREATE TRIGGER crm_set_updated_at_threads BEFORE UPDATE ON crm_threads FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── RLS (permissive — multi-tenant via org_id checks no servidor) ──
ALTER TABLE crm_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_channels_authenticated" ON crm_channels
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_threads_authenticated" ON crm_threads
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_messages_authenticated" ON crm_messages
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
