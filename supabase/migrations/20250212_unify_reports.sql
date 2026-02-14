-- Migration: Unify reports system
-- Expands client_reports to be the single source of truth for all reports

-- =============================================
-- 1. Add missing columns to client_reports
-- =============================================

-- Add user_id to track who created the report
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

-- Add document_url for PDF storage
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS document_url TEXT;

-- Add notes field
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add status for workflow management
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'
CHECK (status IN ('draft', 'published', 'sent', 'archived'));

-- =============================================
-- 2. Create indexes for new columns
-- =============================================

CREATE INDEX IF NOT EXISTS idx_client_reports_user_id ON client_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_status ON client_reports(status);

-- =============================================
-- 3. Migrate data from old reports table
-- =============================================

-- Insert data from reports table into client_reports (if any exists)
-- Note: reports table doesn't have store_id, so we'll leave it null
INSERT INTO client_reports (
    client_id,
    user_id,
    store_name,
    report_type,
    period,
    date_range,
    report_data,
    document_url,
    notes,
    status,
    created_at
)
SELECT
    r.client_id,
    r.user_id,
    COALESCE(c.name, 'Manual Report') as store_name,
    'manual' as report_type,
    r.month as period,
    jsonb_build_object(
        'start', (r.month || '-01')::text,
        'end', (r.month || '-01')::date + interval '1 month' - interval '1 day'
    ) as date_range,
    COALESCE(r.metrics, '{}') as report_data,
    r.document_url,
    r.notes,
    'published' as status,
    r.created_at
FROM reports r
LEFT JOIN clients c ON r.client_id = c.id
WHERE NOT EXISTS (
    -- Avoid duplicates if migration runs multiple times
    SELECT 1 FROM client_reports cr
    WHERE cr.client_id = r.client_id
    AND cr.report_type = 'manual'
    AND cr.period = r.month
);

-- =============================================
-- 4. Add RLS policy for update (was missing)
-- =============================================

-- Drop existing policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Users can update client reports" ON client_reports;

-- Policy for authenticated users to update reports
CREATE POLICY "Users can update client reports"
    ON client_reports
    FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 5. Create view for backwards compatibility
-- =============================================

-- Create a view that mimics the old reports table structure
CREATE OR REPLACE VIEW reports_legacy AS
SELECT
    id,
    client_id,
    user_id,
    CASE
        WHEN report_type = 'manual' THEN period
        ELSE to_char((date_range->>'start')::date, 'YYYY-MM')
    END as month,
    document_url,
    CASE
        WHEN report_type = 'manual' THEN report_data
        ELSE jsonb_build_object(
            'revenue', (report_data->'revenue'->>'totalRevenue')::numeric,
            'orders', (report_data->'revenue'->>'totalOrders')::integer,
            'email_revenue', (report_data->'revenue'->>'klaviyoAttributedRevenue')::numeric
        )
    END as metrics,
    notes,
    created_at
FROM client_reports;

-- =============================================
-- 6. Add comments for documentation
-- =============================================

COMMENT ON TABLE client_reports IS 'Unified reports table - stores both manual and auto-generated (Klaviyo/Shopify) reports';
COMMENT ON COLUMN client_reports.user_id IS 'User who created the report (nullable for auto-generated)';
COMMENT ON COLUMN client_reports.store_id IS 'Associated store (nullable for manual reports)';
COMMENT ON COLUMN client_reports.report_type IS 'Type of report: manual, klaviyo, shopify, combined';
COMMENT ON COLUMN client_reports.period IS 'Period identifier: 7d, 30d, 90d, YYYY-MM, or custom';
COMMENT ON COLUMN client_reports.date_range IS 'JSON with start and end dates';
COMMENT ON COLUMN client_reports.report_data IS 'Full report data (metrics for manual, API response for auto)';
COMMENT ON COLUMN client_reports.status IS 'Report workflow status: draft, published, sent, archived';
