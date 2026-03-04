-- ============================================================================
-- Migration: Cleanup Duplicate Stores + Unique Constraint
-- Date: 2026-03-03
-- Description:
--   1. Move Almira credentials from orphan to linked version
--   2. Clean FK references (agent_store_access, store_alerts)
--   3. Delete 21 duplicate stores (19 orphans + Toysland orphan + Garauto old)
--   4. Normalize store_name (trim whitespace)
--   5. Add unique partial index to prevent future duplicates
-- ============================================================================

-- Step 1: Move Almira credentials from orphan (e4d31895) to linked (f22f5a20)
UPDATE client_stores AS target
SET
  klaviyo_api_key = source.klaviyo_api_key,
  klaviyo_private_key = source.klaviyo_private_key,
  klaviyo_public_key = source.klaviyo_public_key,
  klaviyo_list_id = source.klaviyo_list_id,
  klaviyo_validated_at = source.klaviyo_validated_at,
  klaviyo_validation_error = source.klaviyo_validation_error,
  klaviyo_missing_scopes = source.klaviyo_missing_scopes,
  klaviyo_has_reporting_access = source.klaviyo_has_reporting_access
FROM client_stores AS source
WHERE target.id = 'f22f5a20-f148-4f93-b340-172ca0b591cb'  -- Almira linked (has client_id)
  AND source.id = 'e4d31895-7173-41fa-be55-6732e6463c31'  -- Almira orphan (has klaviyo creds)
  AND source.klaviyo_private_key IS NOT NULL;

-- Step 2: Clean FK references for all 21 duplicate stores
DELETE FROM agent_store_access
WHERE store_id IN (
  'f42b69c9-8145-42a0-a1f4-499579dec09e',  -- Almira (orphan 1)
  'e4d31895-7173-41fa-be55-6732e6463c31',  -- Almira (orphan 2, has klaviyo)
  '55f526b2-3134-402b-b9df-82f918924c9d',  -- Blessed Choice
  '06aa424d-b3ce-4081-8a4d-a91ec79b81a3',  -- Clube Rock
  '7a5f5d6a-c642-4af2-9b67-fe3a7dc0dfd5',  -- Corvine
  'bc933a43-2bd5-4b81-ae48-b69028a7edcd',  -- LensEVO
  '45ecfa04-15f5-42ad-8601-a266e08befe5',  -- Moisfine
  'cab1efbf-202f-4381-9a87-b79cfe6df259',  -- Momi Jewel
  '673e1826-62f7-405f-8b7f-e348424f615b',  -- Montrel
  '9be0c4f4-5730-4c6a-ad72-9046eb822696',  -- Nivale
  '0be4b69e-9a7c-4a50-8707-25b93bf8579c',  -- Nuvellor
  '00ec1566-86ea-42bd-8a70-bde005b6482d',  -- Revivair
  '8e806391-eb53-4b92-8cab-4e583cc6bd72',  -- Saint Doux
  'ca10f0cb-b16a-42ba-80fa-2afae516b05c',  -- Teste
  '2a90cc3e-adaa-44cf-938b-7b79ad0d15a1',  -- Velavie
  '8653ee3c-9767-4f60-ace6-99fb189f86c9',  -- Veldune
  '581bf3e0-7717-469c-ad91-920c00b25cda',  -- Vivazz
  '685a89b3-67c3-4238-ab4f-61ffddc117db',  -- Westmore
  'cd1d2fa7-20a8-4c08-8f8b-ec3f9fcc7d03',  -- Zarcora
  '09150f4b-3df4-4cbd-9d07-74b501af7982',  -- Toysland (orphan)
  'f28bec28-88b5-4367-a041-eb4524be1ab1'   -- Garauto (older duplicate, same client_id)
);

DELETE FROM store_alerts
WHERE store_id IN (
  'f42b69c9-8145-42a0-a1f4-499579dec09e',
  'e4d31895-7173-41fa-be55-6732e6463c31',
  '55f526b2-3134-402b-b9df-82f918924c9d',
  '06aa424d-b3ce-4081-8a4d-a91ec79b81a3',
  '7a5f5d6a-c642-4af2-9b67-fe3a7dc0dfd5',
  'bc933a43-2bd5-4b81-ae48-b69028a7edcd',
  '45ecfa04-15f5-42ad-8601-a266e08befe5',
  'cab1efbf-202f-4381-9a87-b79cfe6df259',
  '673e1826-62f7-405f-8b7f-e348424f615b',
  '9be0c4f4-5730-4c6a-ad72-9046eb822696',
  '0be4b69e-9a7c-4a50-8707-25b93bf8579c',
  '00ec1566-86ea-42bd-8a70-bde005b6482d',
  '8e806391-eb53-4b92-8cab-4e583cc6bd72',
  'ca10f0cb-b16a-42ba-80fa-2afae516b05c',
  '2a90cc3e-adaa-44cf-938b-7b79ad0d15a1',
  '8653ee3c-9767-4f60-ace6-99fb189f86c9',
  '581bf3e0-7717-469c-ad91-920c00b25cda',
  '685a89b3-67c3-4238-ab4f-61ffddc117db',
  'cd1d2fa7-20a8-4c08-8f8b-ec3f9fcc7d03',
  '09150f4b-3df4-4cbd-9d07-74b501af7982',
  'f28bec28-88b5-4367-a041-eb4524be1ab1'
);

-- Step 3: Delete the 21 duplicate stores
DELETE FROM client_stores
WHERE id IN (
  'f42b69c9-8145-42a0-a1f4-499579dec09e',  -- Almira (orphan 1)
  'e4d31895-7173-41fa-be55-6732e6463c31',  -- Almira (orphan 2)
  '55f526b2-3134-402b-b9df-82f918924c9d',  -- Blessed Choice
  '06aa424d-b3ce-4081-8a4d-a91ec79b81a3',  -- Clube Rock
  '7a5f5d6a-c642-4af2-9b67-fe3a7dc0dfd5',  -- Corvine
  'bc933a43-2bd5-4b81-ae48-b69028a7edcd',  -- LensEVO
  '45ecfa04-15f5-42ad-8601-a266e08befe5',  -- Moisfine
  'cab1efbf-202f-4381-9a87-b79cfe6df259',  -- Momi Jewel
  '673e1826-62f7-405f-8b7f-e348424f615b',  -- Montrel
  '9be0c4f4-5730-4c6a-ad72-9046eb822696',  -- Nivale
  '0be4b69e-9a7c-4a50-8707-25b93bf8579c',  -- Nuvellor
  '00ec1566-86ea-42bd-8a70-bde005b6482d',  -- Revivair
  '8e806391-eb53-4b92-8cab-4e583cc6bd72',  -- Saint Doux
  'ca10f0cb-b16a-42ba-80fa-2afae516b05c',  -- Teste
  '2a90cc3e-adaa-44cf-938b-7b79ad0d15a1',  -- Velavie
  '8653ee3c-9767-4f60-ace6-99fb189f86c9',  -- Veldune
  '581bf3e0-7717-469c-ad91-920c00b25cda',  -- Vivazz
  '685a89b3-67c3-4238-ab4f-61ffddc117db',  -- Westmore
  'cd1d2fa7-20a8-4c08-8f8b-ec3f9fcc7d03',  -- Zarcora
  '09150f4b-3df4-4cbd-9d07-74b501af7982',  -- Toysland (orphan)
  'f28bec28-88b5-4367-a041-eb4524be1ab1'   -- Garauto (older duplicate)
);

-- Step 4: Normalize store_name (trim whitespace)
UPDATE client_stores
SET store_name = TRIM(store_name)
WHERE store_name != TRIM(store_name);

-- Step 5: Unique partial index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_store_per_org
ON client_stores (org_id, LOWER(TRIM(store_name)))
WHERE is_active = true;
