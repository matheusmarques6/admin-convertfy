-- Create client_reports table for storing generated reports
CREATE TABLE IF NOT EXISTS client_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,
    store_name TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'klaviyo',
    period TEXT NOT NULL DEFAULT '30d',
    date_range JSONB NOT NULL DEFAULT '{}',
    report_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_client_reports_client_id ON client_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_store_id ON client_reports(store_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_created_at ON client_reports(created_at DESC);

-- Add RLS policies
ALTER TABLE client_reports ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to select their client reports
CREATE POLICY "Users can view client reports"
    ON client_reports
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert reports
CREATE POLICY "Users can create client reports"
    ON client_reports
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Policy for authenticated users to delete reports
CREATE POLICY "Users can delete client reports"
    ON client_reports
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_client_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_client_reports_updated_at
    BEFORE UPDATE ON client_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_client_reports_updated_at();
