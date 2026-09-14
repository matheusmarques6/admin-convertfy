-- Políticas PÚBLICAS da loja (Passo 16, 14/09) — troca/devolução e frete
-- lidos das páginas públicas (`/policies/refund-policy`,
-- `/policies/shipping-policy`), com a URL de origem de cada fato.
--
-- Coluna SEPARADA de `ficha_operacional`, de propósito: a ficha é
-- VERIFICADA pelo time e carimba `lastro_operacional.verificado = true` no
-- catálogo; captura automática não pode ganhar esse selo. Precedência de
-- leitura: ficha > politicas. JSONB tipado em src/lib/stores/politicas.ts.
--
-- Escrita: `capturarPoliticas` (callback pesquisa-completa, antes do
-- Catalogador; botão "Reler políticas" na aba Pesquisa). Leitura: Seletor
-- (insumos_permitidos com a URL), Catalogador (<politicas_publicas>), gate
-- de prontidão (aviso politica_sem_pagina) e a tela.
-- Coluna ausente → todo leitor degrada para null; a captura loga
-- `politicas.coluna_ausente` e não grava.

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS politicas JSONB;

COMMENT ON COLUMN client_stores.politicas IS
  'Políticas públicas lidas das páginas da loja (troca/frete com URL). NÃO verificado pelo time — ver src/lib/stores/politicas.ts. Passo 16, 14/09.';
