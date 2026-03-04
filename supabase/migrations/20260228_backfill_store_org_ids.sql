-- Backfill missing org_id on clients and client_stores
-- ROOT CAUSE: clients.org_id is NULL, causing RLS to block the JOIN
-- from client_stores -> clients in the /api/stores/control endpoint.
-- Stores appear but show "Sem cliente" because client data is invisible via RLS.

-- =============================================
-- Step 1: Backfill clients.org_id from owner's org membership
-- (works for clients that have owner_id set)
-- =============================================
UPDATE clients c
SET org_id = om.org_id
FROM org_members om
WHERE c.owner_id = om.profile_id
  AND om.is_active = true
  AND c.org_id IS NULL;

-- =============================================
-- Step 2: Backfill clients.org_id from their linked stores
-- (works for clients whose stores already have org_id)
-- =============================================
UPDATE clients c
SET org_id = cs.org_id
FROM client_stores cs
WHERE cs.client_id = c.id
  AND cs.org_id IS NOT NULL
  AND c.org_id IS NULL;

-- =============================================
-- Step 3: Backfill remaining clients.org_id using the default org
-- (catches all remaining clients with no other way to resolve org)
-- =============================================
UPDATE clients
SET org_id = (SELECT id FROM organizations WHERE is_active = true ORDER BY created_at ASC LIMIT 1)
WHERE org_id IS NULL;

-- =============================================
-- Step 4: Backfill client_stores.org_id from their parent client
-- (now that all clients have org_id, this will resolve all linked stores)
-- =============================================
UPDATE client_stores cs
SET org_id = cl.org_id
FROM clients cl
WHERE cs.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND cs.org_id IS NULL;

-- =============================================
-- Step 5: Handle orphan standalone stores (no client, no org)
-- =============================================
UPDATE client_stores
SET org_id = (SELECT id FROM organizations WHERE is_active = true ORDER BY created_at ASC LIMIT 1)
WHERE org_id IS NULL;
