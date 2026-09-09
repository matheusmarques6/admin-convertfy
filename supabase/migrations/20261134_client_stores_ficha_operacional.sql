-- Ficha operacional da loja (set/2026) — o dado que faltava para o e-mail
-- parecer autêntico: incentivo ativo + código, política de troca em texto
-- vivo, prazo de envio, garantia, nº de reviews e nota, pagamento/checkout,
-- canal de suporte. Toda referência do Figma tem esses fatos porque o
-- cliente os forneceu; sem eles o Seletor proíbe tudo e os selos ficam
-- vazios ("ICON 1 · ICON 2 · ICON 3", batch 644d86c5).
--
-- JSONB tipado em src/lib/stores/ficha-operacional.ts. Lida pelo
-- Catalogador (`lastro_operacional.verificado=true` + `incentivo` da
-- ficha vencem o modelo) e, via catálogo, pelo Seletor, dispatch e QA.
-- Coluna ausente → todo leitor degrada para null (42703/PGRST204).

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS ficha_operacional JSONB;

COMMENT ON COLUMN client_stores.ficha_operacional IS
  'Ficha operacional verificada pelo time (incentivo, troca, envio, garantia, prova, pagamento, suporte). Ver src/lib/stores/ficha-operacional.ts.';
