-- ============================================================
-- html_pre_refiner: o HTML do AGENTE HTML antes do Refinador.
--
-- Desde que o Refinador virou repintor (20261031), ele SOBRESCREVE
-- email_flow_emails.html com o HTML refinado. Sem guardar o intermediário,
-- não dá pra comparar "HTML agent" × "Refinador". Esta coluna guarda o
-- output do HTML agent (gravado no mesmo ponto em que o html é salvo, ANTES
-- do Refinador) para o compare de 3 vias (Montador / HTML agent / Refinador).
-- ============================================================

ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS html_pre_refiner TEXT;

COMMENT ON COLUMN email_flow_emails.html_pre_refiner IS
  'HTML do agente HTML ANTES do Refinador (que sobrescreve .html). Usado no compare de 3 vias.';
