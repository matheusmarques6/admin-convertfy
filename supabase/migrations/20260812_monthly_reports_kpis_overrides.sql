-- Edição manual de números do relatório mensal (overrides restauráveis).
--
-- Mesmo padrão de weekly_reports (20260521_weekly_reports_overrides.sql):
-- o snapshot NUNCA é reescrito com valores editados — kpis_overrides guarda
-- só os deltas manuais e o merge acontece NA LEITURA (preview, print,
-- ai-fill) via applyKpisOverrides (src/lib/services/report-overrides.service.ts).
-- Resync sobrescreve snapshot sem tocar kpis_overrides → edições sobrevivem.

ALTER TABLE client_monthly_reports
  ADD COLUMN IF NOT EXISTS kpis_overrides JSONB DEFAULT '{}'::jsonb;

ALTER TABLE client_monthly_reports
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES profiles(id);

ALTER TABLE client_monthly_reports
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN client_monthly_reports.kpis_overrides IS
  'Overrides manuais aplicados NA LEITURA sobre snapshot (nunca gravados nele). Shape: { kpis: { receita_total: N, atribuicao_pct: N(fração 0-1), ... }, email: { open_rate: N(0-100), ... }, campaigns: { "<row.id>": { revenue: N, name: S } }, flows: { ... } }. Restaurar campo = remover a chave. Ver ReportKpisOverrides em src/types/monthly-report.ts.';

COMMENT ON COLUMN client_monthly_reports.edited_by IS
  'Último usuário que editou números manualmente (kpis_overrides).';

COMMENT ON COLUMN client_monthly_reports.edited_at IS
  'Timestamp da última edição manual de números.';
