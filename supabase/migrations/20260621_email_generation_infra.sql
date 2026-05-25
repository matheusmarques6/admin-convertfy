-- Migration: Email Generation Infrastructure
-- Tables for blueprint definitions, agent configs, generation settings, run logs, and reference templates.

-- 1. email_blueprints — model for each email in a flow
CREATE TABLE IF NOT EXISTS email_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type TEXT NOT NULL,
  email_number INT NOT NULL,
  objective TEXT NOT NULL,
  messaging TEXT NOT NULL,
  subject_hint TEXT,
  blocks JSONB NOT NULL DEFAULT '[]',
  tone_override TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE(flow_type, email_number)
);

-- 2. email_agent_configs — prompts + model per agent (versioned)
CREATE TABLE IF NOT EXISTS email_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('copy','image','html')),
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  system_prompt TEXT NOT NULL,
  user_template TEXT NOT NULL,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INT DEFAULT 2048,
  output_schema JSONB,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_config_active ON email_agent_configs(agent_type) WHERE is_active = true;

-- 3. email_generation_settings — general configs per org
CREATE TABLE IF NOT EXISTS email_generation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  auto_trigger BOOLEAN DEFAULT false,
  max_parallel INT DEFAULT 3,
  generate_images BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  notify_on_success BOOLEAN DEFAULT false,
  notify_emails TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  UNIQUE(org_id)
);

-- 4. email_generation_runs — detailed run log
CREATE TABLE IF NOT EXISTS email_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id),
  flow_id UUID REFERENCES email_flows(id),
  email_id UUID REFERENCES email_flow_emails(id),
  triggered_by UUID REFERENCES profiles(id),
  batch_id UUID,
  agent TEXT NOT NULL CHECK (agent IN ('seed','copy','image','html')),
  agent_config_id UUID REFERENCES email_agent_configs(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error','skipped')),
  input_vars JSONB,
  rendered_prompt TEXT,
  raw_output TEXT,
  parsed_output JSONB,
  model TEXT,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_cents NUMERIC(10,4) DEFAULT 0,
  duration_ms INT DEFAULT 0,
  error_message TEXT,
  error_stack TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gen_runs_email ON email_generation_runs(email_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_runs_store ON email_generation_runs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_runs_batch ON email_generation_runs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_runs_errors ON email_generation_runs(status) WHERE status = 'error';

-- 5. email_reference_templates — reference gallery
CREATE TABLE IF NOT EXISTS email_reference_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type TEXT,
  name TEXT NOT NULL,
  html TEXT,
  thumbnail TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);
