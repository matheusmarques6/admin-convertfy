-- ============================================================
-- Migration: 20260924_payment_proof
-- Purpose: Guardar o caminho (storage) do comprovante de pagamento
--          anexado ao marcar uma fatura como paga.
-- Bucket:  "payment-proofs" (criado on-demand pela rota de upload).
-- Idempotente.
-- ============================================================

ALTER TABLE client_charges
  ADD COLUMN IF NOT EXISTS payment_proof_path text;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_proof_path text;

COMMENT ON COLUMN client_charges.payment_proof_path IS
  'Caminho no storage (bucket payment-proofs) do comprovante de pagamento anexado ao marcar como pago.';

COMMENT ON COLUMN invoices.payment_proof_path IS
  'Caminho no storage (bucket payment-proofs) do comprovante de pagamento anexado ao marcar como pago.';
