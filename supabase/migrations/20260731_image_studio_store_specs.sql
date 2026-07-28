-- Estúdio de Imagens: especificação de geração POR LOJA dentro do lote.
--
-- O lote tem um brief único para todas as lojas; casos reais pedem um
-- adendo por loja ("nesta usar a caixa de presente", "nesta o fundo é
-- escuro"). Sem isto, a saída era um lote por loja — o que anula a razão
-- de existir do lote.
--
-- Formato: { "<store_id>": { "instruction": "texto" } } — só as lojas que
-- TÊM adendo entram no mapa (lote de 137 lojas com 3 adendos guarda 3
-- chaves). O adendo ACRESCENTA ao brief base (não substitui) e vale para
-- todas as variações daquela loja.
--
-- O objeto por loja é aberto de propósito: campos futuros (imagem-base
-- própria, modo substituir) entram sem nova migration.
--
-- FORMATO: um comando por LINHA (statement multilinha quebra quando o
-- SQL editor executa um recorte parcial).

ALTER TABLE image_studio_batches ADD COLUMN IF NOT EXISTS store_specs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN image_studio_batches.store_specs IS 'Adendos de geração por loja: {store_id: {instruction}}. Acrescentam ao brief base do lote; chaves de lojas fora de store_ids são ignoradas na geração.';
