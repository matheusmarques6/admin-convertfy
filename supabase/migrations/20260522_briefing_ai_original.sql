-- Preserva a versão ORIGINAL do briefing gerado pela IA, sem as edições
-- inline que o cliente faz na tela de revisão. Permite consumir downstream
-- (ex: outras IAs, geração de copy) a versão IA pura, mesmo depois que o
-- cliente já confirmou o briefing com edições por cima.
--
-- Fluxo:
--   1. Cascata gera briefing → grava em AMBAS `briefing` e `briefing_ai_original`
--   2. Cliente edita inline + clica "Confirmar" → grava em `briefing` (com edições)
--      `briefing_ai_original` fica intocada
--   3. Cliente volta no form + altera respostas → IA regenera → atualiza ambas
--
-- Onboardings legados (pré-migration) ficam com briefing_ai_original NULL.

ALTER TABLE onboardings
  ADD COLUMN IF NOT EXISTS briefing_ai_original jsonb NULL;

COMMENT ON COLUMN onboardings.briefing_ai_original IS
  'Versão ORIGINAL do briefing gerada pela IA (T1/T2/T3 da cascata), sem edições do cliente. A coluna briefing pode ter edições/confirmação por cima — esta aqui preserva o output puro da IA pra consumo downstream.';
