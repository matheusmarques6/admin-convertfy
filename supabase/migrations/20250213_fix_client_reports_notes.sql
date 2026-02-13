-- Migration: Fix client_reports missing columns
-- This migration ensures all required columns exist in client_reports table
-- Run this if you see error PGRST204: Could not find the 'notes' column

-- Add notes column
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add status column for workflow management
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'
CHECK (status IN ('draft', 'published', 'sent', 'archived'));

-- Add user_id to track who created the report (optional)
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);

-- Add document_url for PDF storage (optional)
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS document_url TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_client_reports_status ON client_reports(status);
CREATE INDEX IF NOT EXISTS idx_client_reports_user_id ON client_reports(user_id);
