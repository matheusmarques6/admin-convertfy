-- Indice para o caminho quente do Kanban de onboarding:
-- onboarding-effective-status.service consulta contracts com
-- .in('client_id', ...) + .order('start_date') — sem indice, seq scan.
CREATE INDEX IF NOT EXISTS idx_contracts_client_id_start_date
  ON contracts (client_id, start_date DESC);
