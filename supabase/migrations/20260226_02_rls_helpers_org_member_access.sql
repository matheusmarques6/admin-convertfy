-- =============================================
-- RLS HELPERS UPDATE - Story 3.2
-- =============================================
-- All active org members can view all stores and clients in their org.
-- The agent_store_access table is now for granular permissions (edit, manage)
-- rather than basic view access.

-- Update can_access_store: any active org member can view
CREATE OR REPLACE FUNCTION can_access_store(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin acessa tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Owner acessa tudo
  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Any active org member can view stores in their org
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN client_stores cs ON cs.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND cs.id = p_store_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update can_access_client: any active org member can view
CREATE OR REPLACE FUNCTION can_access_client(p_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin acessa tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Owner acessa tudo
  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Any active org member can view clients in their org
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN clients c ON c.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND c.id = p_client_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update accessible_store_ids: return all stores in org for active members
CREATE OR REPLACE FUNCTION accessible_store_ids()
RETURNS SETOF UUID AS $$
BEGIN
  -- Admin: all stores
  IF is_admin() THEN
    RETURN QUERY SELECT id FROM client_stores;
    RETURN;
  END IF;

  -- Org member: all stores in their org
  RETURN QUERY
    SELECT cs.id FROM client_stores cs
    JOIN org_members om ON om.org_id = cs.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update accessible_client_ids: return all clients in org for active members
CREATE OR REPLACE FUNCTION accessible_client_ids()
RETURNS SETOF UUID AS $$
BEGIN
  -- Admin: all clients
  IF is_admin() THEN
    RETURN QUERY SELECT id FROM clients;
    RETURN;
  END IF;

  -- Org member: all clients in their org
  RETURN QUERY
    SELECT c.id FROM clients c
    JOIN org_members om ON om.org_id = c.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_store(UUID) IS 'Any active org member can view stores in their org. Updated in Story 3.2.';
COMMENT ON FUNCTION can_access_client(UUID) IS 'Any active org member can view clients in their org. Updated in Story 3.2.';
