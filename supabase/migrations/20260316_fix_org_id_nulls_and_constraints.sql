-- Story 53.1: Fix org_id NULLs and add constraints to prevent recurrence
-- Problem: 5 client_stores and 3 clients have org_id = NULL, making them invisible

-- =============================================================================
-- STEP 1: Backfill clients.org_id from org_members (first active member's org)
-- NOTE: This assumes a single-org deployment. With multiple orgs, orphan clients
--       have no reliable way to determine their correct org — they all get assigned
--       to the oldest active org. If multi-org is needed, run a manual audit first.
-- =============================================================================
UPDATE clients c
SET org_id = sub.org_id
FROM (
  SELECT
    cl.id AS client_id,
    om.org_id
  FROM clients cl
  CROSS JOIN LATERAL (
    SELECT org_id
    FROM org_members
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1
  ) om
  WHERE cl.org_id IS NULL
) sub
WHERE c.id = sub.client_id
  AND c.org_id IS NULL;

-- =============================================================================
-- STEP 2: Backfill client_stores.org_id from clients.org_id
-- =============================================================================
UPDATE client_stores cs
SET org_id = c.org_id
FROM clients c
WHERE cs.client_id = c.id
  AND cs.org_id IS NULL
  AND c.org_id IS NOT NULL;

-- =============================================================================
-- STEP 3: For any remaining client_stores with NULL org_id (client also NULL),
--         use the first active organization as fallback
-- =============================================================================
UPDATE client_stores cs
SET org_id = (
  SELECT o.id FROM organizations o
  JOIN org_members om ON om.org_id = o.id AND om.is_active = true
  ORDER BY om.created_at ASC
  LIMIT 1
)
WHERE cs.org_id IS NULL;

-- Same for clients
UPDATE clients c
SET org_id = (
  SELECT o.id FROM organizations o
  JOIN org_members om ON om.org_id = o.id AND om.is_active = true
  ORDER BY om.created_at ASC
  LIMIT 1
)
WHERE c.org_id IS NULL;

-- =============================================================================
-- STEP 4: Add NOT NULL constraints (safe now that all NULLs are backfilled)
-- =============================================================================
ALTER TABLE client_stores ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE clients ALTER COLUMN org_id SET NOT NULL;

-- =============================================================================
-- STEP 5: Trigger to auto-populate org_id on new client_stores from client
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_set_store_org_id_from_client()
RETURNS TRIGGER AS $$
BEGIN
  -- If org_id not provided, inherit from the parent client
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM clients
    WHERE id = NEW.client_id;
  END IF;

  -- If still NULL after client lookup, raise an error
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'client_stores.org_id cannot be NULL — client % has no org_id', NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_store_org_id_from_client ON client_stores;
CREATE TRIGGER trg_set_store_org_id_from_client
  BEFORE INSERT ON client_stores
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_store_org_id_from_client();

-- =============================================================================
-- STEP 6: Backfill agent_store_access for stores that were created with NULL org_id
--         (the auto-assign trigger skipped them)
-- =============================================================================
INSERT INTO agent_store_access (org_member_id, store_id, can_view, can_edit, can_manage_onboarding, can_manage_campaigns, can_manage_reports)
SELECT om.id, cs.id, true, true, true, true, true
FROM client_stores cs
JOIN org_members om ON om.org_id = cs.org_id AND om.is_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM agent_store_access asa
  WHERE asa.org_member_id = om.id AND asa.store_id = cs.id
)
ON CONFLICT DO NOTHING;
