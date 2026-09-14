-- company_settings — 14/09/2026
--
-- A seção "Dados da empresa" (Configurações → Conta) lia e escrevia numa
-- tabela que NUNCA existiu: nenhuma migration a criava. O resultado eram
-- dois enganos na mesma tela — a leitura devolvia 404 com o erro engolido
-- (o `catch` nem dispara, porque o supabase-js devolve o erro em `error` em
-- vez de lançar), então o formulário aparecia VAZIO como se ninguém o
-- tivesse preenchido; e o Salvar falhava sempre, com um toast genérico.
--
-- Medido antes de criar: `company_name` já existe em dois lugares
-- (`organizations.name` e a tabela key/value `settings`), e os outros sete
-- campos não existem em lugar nenhum — `clients.cpf_cnpj`/`clients.address`
-- são dos CLIENTES, `store_brand_identity.logo_*` e
-- `store_onboarding_data.logo_url` são das lojas deles.
--
-- UNIQUE em org_id é o que torna o upsert idempotente: sem ele, cada clique
-- em Salvar inseria uma linha nova (o código fazia `onConflict: "id"` com um
-- payload que não carrega `id` — conflito que nunca acontece).

CREATE TABLE IF NOT EXISTS company_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  cnpj         TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  state        TEXT NOT NULL DEFAULT '',
  logo_url     TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE company_settings IS
  'Dados cadastrais da própria agência (razão social, CNPJ, endereço), uma linha por org.';

-- `clock_timestamp()`, não `now()`: `now()` é o início da TRANSAÇÃO e não
-- anda dentro dela. Regra da casa.
CREATE OR REPLACE FUNCTION company_settings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_settings_touch ON company_settings;
CREATE TRIGGER trg_company_settings_touch
  BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION company_settings_touch_updated_at();

-- RLS: a tabela NASCE fechada, na forma fixada nos rounds 5A/5B.
-- `TO authenticated` sozinho deixaria o usuário do PORTAL ler o cadastro da
-- agência — há contas de portal em `auth.users` que não são membros da org.
-- `is_org_member()` não escopa por org de propósito (há uma org só).
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_settings_select ON company_settings;
CREATE POLICY company_settings_select ON company_settings
  FOR SELECT TO authenticated USING (is_org_member());

DROP POLICY IF EXISTS company_settings_insert ON company_settings;
CREATE POLICY company_settings_insert ON company_settings
  FOR INSERT TO authenticated WITH CHECK (is_org_member());

DROP POLICY IF EXISTS company_settings_update ON company_settings;
CREATE POLICY company_settings_update ON company_settings
  FOR UPDATE TO authenticated USING (is_org_member()) WITH CHECK (is_org_member());

DROP POLICY IF EXISTS company_settings_delete ON company_settings;
CREATE POLICY company_settings_delete ON company_settings
  FOR DELETE TO authenticated USING (is_org_member());

-- Seed: a linha nasce com o nome que a org já tem, para a tela abrir
-- coerente com o que o sistema sabe em vez de pedir que alguém redigite.
INSERT INTO company_settings (org_id, company_name)
SELECT o.id, COALESCE(o.name, '')
FROM organizations o
WHERE o.is_active IS DISTINCT FROM false
ON CONFLICT (org_id) DO NOTHING;
