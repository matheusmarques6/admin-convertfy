-- ─────────────────────────────────────────────────────────────────────
-- Bucket público para os PDFs dos relatórios mensais de cliente.
--
-- A rota POST /api/admin/stores/reports/[reportId]/pdf agora gera o PDF
-- DE VERDADE (Chromium headless renderiza a página /print) e salva aqui;
-- client_monthly_reports.pdf_url passa a apontar pro ARQUIVO (antes
-- apontava pra própria página /print — o "Abrir PDF" abria o sistema).
--
-- Público: o PDF é cliente-facing (mesmo conteúdo que é apresentado/
-- enviado ao cliente); upload só via service role (rota autenticada).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-reports',
  'client-reports',
  true,
  26214400, -- 25MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
