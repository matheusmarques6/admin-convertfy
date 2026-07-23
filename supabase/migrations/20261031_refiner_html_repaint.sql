-- ============================================================
-- Refinador vira REPINTOR VISUAL: o output deixa de ser um delta JSON e
-- passa a ser o HTML COMPLETO modificado (só as 3 camadas visuais —
-- tipografia de display, border-radius, ritmo vertical — preservando copy/
-- imagens/estrutura/blocos). Mudança de código em refiner.chain.ts +
-- phase2-runner.service.ts (invoke → guard estrutural → fail-open).
--
-- O prompt mudou FUNDAMENTALMENTE (delta → HTML), então o system_prompt/
-- user_template ativos (formato delta) estão OBSOLETOS. Zeramos os dois para
-- FORÇAR o fallback in-code (DEFAULT_REFINER_SYSTEM_PROMPT / _USER_TEMPLATE,
-- já no formato HTML). Um prompt custom antigo (formato delta) quebraria o
-- novo fluxo — resetar é o correto.
--
-- max_tokens sobe pra 32.000: o HTML completo de saída (~13-16k tokens num
-- email grande) NÃO cabia no teto antigo (~2048) → truncava antes do
-- </html> (mesmo modo de falha do Montador). O guard estrutural
-- (refinedHtmlGuard) faz fail-open se ainda assim vier truncado/quebrado.
-- ============================================================

UPDATE email_agent_configs
SET
  system_prompt = '',
  user_template = '',
  max_tokens = 32000
WHERE agent_type = 'refiner'
  AND is_active = true;
