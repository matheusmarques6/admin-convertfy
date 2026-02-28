-- Backfill missing org_id on clients and client_stores
-- Fixes: stores created via Clients tab have org_id = NULL, making them invisible on /stores page

-- Step 1: Backfill clients.org_id from owner's org membership
UPDATE clients c
SET org_id = om.org_id
FROM org_members om
WHERE c.owner_id = om.profile_id
  AND om.is_active = true
  AND c.org_id IS NULL;

-- Step 2: Backfill client_stores.org_id from their parent client
UPDATE client_stores cs
SET org_id = cl.org_id
FROM clients cl
WHERE cs.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND cs.org_id IS NULL;

-- Step 3: Handle orphan standalone stores (no client, no org) - assign to default org
UPDATE client_stores cs
SET org_id = (SELECT id FROM organizations WHERE is_active = true ORDER BY created_at ASC LIMIT 1)
WHERE cs.org_id IS NULL
  AND cs.client_id IS NULL;
