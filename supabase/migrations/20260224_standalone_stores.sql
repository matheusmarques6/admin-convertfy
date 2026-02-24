-- Migration: Standalone Stores (Lojas Avulsas)
-- Story 1.1: Schema e RLS - Tornar client_id Nullable
-- Permite cadastro de lojas sem vinculo com cliente (client_id nullable)

-- =============================================================================
-- Parte 1: Novos valores no enum activity_type (FORA de transaction)
-- NOTA: ALTER TYPE ADD VALUE nao pode rodar dentro de BEGIN/COMMIT no PostgreSQL
-- =============================================================================

ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'store_created';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'store_linked';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'store_unlinked';

-- =============================================================================
-- Parte 2: Schema changes (em transaction para atomicidade)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 2.1: Tornar client_id nullable nas tabelas principais e satelites
-- FK REFERENCES clients(id) ON DELETE CASCADE permanece intacta
-- Lojas existentes NAO sao afetadas (todas mantem client_id atual)
-- -----------------------------------------------------------------------------

-- client_stores: tabela principal
ALTER TABLE client_stores ALTER COLUMN client_id DROP NOT NULL;

-- store_alerts: lojas avulsas precisam gerar alertas (ARCH-C2)
ALTER TABLE store_alerts ALTER COLUMN client_id DROP NOT NULL;

-- store_onboarding_data: lojas avulsas precisam de onboarding (ARCH-C3)
ALTER TABLE store_onboarding_data ALTER COLUMN client_id DROP NOT NULL;

-- client_onboardings: lojas avulsas podem ter onboarding ativo (GAP-G3)
ALTER TABLE client_onboardings ALTER COLUMN client_id DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 2.2: Indice parcial para lojas avulsas (otimiza queries de lojas sem cliente)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_client_stores_orphan
  ON client_stores(org_id) WHERE client_id IS NULL;

-- -----------------------------------------------------------------------------
-- 2.3: Trigger para preencher org_id automaticamente (AD1)
-- Garante consistencia a nivel de banco: qualquer INSERT tera org_id preenchido
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_store_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := current_org_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_store_org_id
  BEFORE INSERT ON client_stores
  FOR EACH ROW EXECUTE FUNCTION set_store_org_id();

-- -----------------------------------------------------------------------------
-- 2.4: Atualizar RLS INSERT policy para aceitar client_id IS NULL
-- Permite: admins, lojas avulsas (client_id NULL), ou usuarios com acesso ao cliente
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can insert client_stores" ON client_stores;
CREATE POLICY "Users can insert client_stores"
  ON client_stores FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR client_id IS NULL
    OR can_access_client(client_id)
  );

COMMIT;
