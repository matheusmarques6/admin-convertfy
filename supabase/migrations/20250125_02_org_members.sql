-- =============================================
-- FASE 1.2: MEMBROS DA ORGANIZAÇÃO
-- =============================================
-- Vincula profiles a organizações com papéis específicos
-- Um profile pode ser membro de múltiplas orgs (futuro)

-- Enum de papéis dentro de uma organização
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    CREATE TYPE org_role AS ENUM (
      'owner',        -- Dono/Admin da org (acesso total)
      'manager',      -- Gerente de equipe
      'coordinator',  -- Coordenador de área
      'copywriter',   -- Redator/Copy
      'designer',     -- Designer
      'developer',    -- Desenvolvedor
      'support',      -- Suporte/CS
      'analyst'       -- Analista
    );
  END IF;
END$$;

-- Tabela de membros
CREATE TABLE IF NOT EXISTS org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamentos
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Papel na organização
  role org_role NOT NULL DEFAULT 'support',
  job_title TEXT, -- Título customizado: "Designer Sênior", "Copy Pleno"

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Convite
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  invite_accepted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: um profile só pode estar uma vez em cada org
  UNIQUE(org_id, profile_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_profile ON org_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON org_members(role);
CREATE INDEX IF NOT EXISTS idx_org_members_active ON org_members(org_id, is_active) WHERE is_active = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_org_members_updated_at ON org_members;
CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- MIGRAR USUÁRIOS EXISTENTES PARA ORG_MEMBERS
-- =============================================
-- Todos os profiles com role='admin' viram 'owner' da Convertfy
-- Todos os outros viram 'support' (podem ser ajustados depois)

DO $$
DECLARE
  v_convertfy_id UUID;
BEGIN
  -- Buscar ID da Convertfy
  SELECT id INTO v_convertfy_id FROM organizations WHERE slug = 'convertfy';

  -- Se encontrou a org, migrar usuários
  IF v_convertfy_id IS NOT NULL THEN
    -- Migrar admins como owners
    INSERT INTO org_members (org_id, profile_id, role, job_title, invite_accepted_at)
    SELECT
      v_convertfy_id,
      p.id,
      'owner'::org_role,
      'Administrador',
      NOW()
    FROM profiles p
    WHERE p.role = 'admin'
    ON CONFLICT (org_id, profile_id) DO NOTHING;

    -- Migrar outros como support (serão ajustados pelo admin)
    INSERT INTO org_members (org_id, profile_id, role, invite_accepted_at)
    SELECT
      v_convertfy_id,
      p.id,
      CASE p.role
        WHEN 'manager' THEN 'manager'::org_role
        WHEN 'cs' THEN 'support'::org_role
        ELSE 'support'::org_role
      END,
      NOW()
    FROM profiles p
    WHERE p.role != 'admin'
    ON CONFLICT (org_id, profile_id) DO NOTHING;
  END IF;
END$$;

-- Comentários
COMMENT ON TABLE org_members IS 'Membros de cada organização com seus papéis';
COMMENT ON COLUMN org_members.role IS 'Papel do membro na organização';
COMMENT ON COLUMN org_members.job_title IS 'Título customizado para exibição';
