-- ─────────────────────────────────────────────────────────────────────
-- AI Chat — persistencia de conversas
--
-- Cada conversa pertence a um user (org_id pra escopo). Mensagens
-- sao linkadas via conversation_id. RLS so deixa o owner ler/escrever.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_chat_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  context JSONB DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_chat_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_chat_messages(conversation_id, created_at);

ALTER TABLE ai_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_conversations_owner" ON ai_chat_conversations;
CREATE POLICY "ai_conversations_owner" ON ai_chat_conversations
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_messages_via_conversation" ON ai_chat_messages;
CREATE POLICY "ai_messages_via_conversation" ON ai_chat_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM ai_chat_conversations WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION ai_conv_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ai_conv_updated ON ai_chat_conversations;
CREATE TRIGGER trg_ai_conv_updated
  BEFORE UPDATE ON ai_chat_conversations
  FOR EACH ROW EXECUTE FUNCTION ai_conv_set_updated_at();
