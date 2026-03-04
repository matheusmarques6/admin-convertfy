-- Backfill: populate shopify_validated_at for stores that have credentials
-- but were never validated (went through legacy portal save flow).
-- Uses integration_status JSON connected_at when available, otherwise NOW().
UPDATE client_stores
SET shopify_validated_at = COALESCE(
  (integration_status->'shopify'->>'connected_at')::timestamptz,
  NOW()
)
WHERE shopify_access_token IS NOT NULL
  AND shopify_validated_at IS NULL
  AND shopify_validation_error IS NULL;

-- Backfill: populate klaviyo_validated_at for stores that have credentials
UPDATE client_stores
SET
  klaviyo_validated_at = COALESCE(
    (integration_status->'klaviyo'->>'connected_at')::timestamptz,
    NOW()
  ),
  klaviyo_has_reporting_access = TRUE
WHERE (klaviyo_private_key IS NOT NULL OR klaviyo_api_key IS NOT NULL)
  AND klaviyo_validated_at IS NULL
  AND klaviyo_validation_error IS NULL;
