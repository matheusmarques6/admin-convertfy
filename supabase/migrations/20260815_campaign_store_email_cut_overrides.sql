-- ─────────────────────────────────────────────────────────────────────
-- Ajuste fino de cortes POR LOJA (Tela 2 "Subir Campanha por Loja")
--
-- A escala por largura acerta quando o layout da loja é idêntico ao do
-- modelo; quando uma seção tem altura diferente (ex.: logo sobreposto no
-- hero em vez de faixa própria), o implementador arrasta as linhas no
-- modal e o ajuste fica salvo aqui.
--
-- Shape: mesma lista de portas do mapa ([{ id, label, type, y0, y1 }]),
-- porém com y0/y1 em FRAÇÕES DA IMAGEM DA LOJA (não do modelo). Os ids
-- são os MESMOS do campaign_cut_maps.portas — copy e downloaded_ports
-- continuam casando. NULL = sem ajuste (usa a escala por largura).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE campaign_store_emails
  ADD COLUMN IF NOT EXISTS cut_ports_override JSONB;
