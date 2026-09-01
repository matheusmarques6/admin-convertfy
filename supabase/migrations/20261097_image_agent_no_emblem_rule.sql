-- 20261097 — regra própria contra selo, brasão e chancela inventada
--
-- Em 01/09 o gerador devolveu a hero da Innova Bay com um selo do
-- "U.S. DEPARTMENT of ENERGY" desenhado na arte. O órgão existe; a chancela
-- é invenção do modelo. Isso não é problema de estética: é alegação de
-- endosso regulatório num email comercial, e quem responde por ela é o
-- cliente.
--
-- A CFY_NO_TEXT_RULE (20261057) não cobre o caso. Um selo é GRÁFICO — um
-- círculo, um brasão, uma águia, uma fita — e o modelo o desenha sem
-- escrever uma palavra sequer. "Não escreva texto" e "não invente uma
-- chancela oficial" são duas proibições diferentes, e só a primeira estava
-- escrita.
--
-- Idempotente pela marca CFY_NO_EMBLEM_RULE, no padrão da 20261057: só
-- prepend, sem tocar no que já existe. A ordem com as migrations de
-- user_template é indiferente (elas não mexem no system_prompt).

UPDATE email_agent_configs
   SET system_prompt =
'CFY_NO_EMBLEM_RULE — ABSOLUTE, sits alongside CFY_NO_TEXT_RULE.
Never draw a seal, crest, coat of arms, medallion, certification badge, approval mark, award ribbon, quality stamp, compliance mark or the logo of any government body, ministry, agency, regulator, standards organisation or certification authority. Not a real one, not an invented one, not one that merely looks official.
This is not a matter of taste. A seal asserts that some authority endorsed, certified or approved the product. On 01/09 an invented "U.S. DEPARTMENT of ENERGY" seal was rendered into a marketing email — a claim of regulatory endorsement that the merchant, not you, would have to answer for.
A seal is a GRAPHIC, so the no-text rule does not cover it: you can draw one without writing a single word. Where a composition seems to call for a badge of trust, use light, material and framing instead — never a stamp.
Genuine certifications belong in the HTML, placed by a human who can prove them.

' || system_prompt
 WHERE agent_type = 'image'
   AND is_active = true
   AND system_prompt NOT LIKE '%CFY_NO_EMBLEM_RULE%';

-- Confere: as duas regras convivendo.
SELECT agent_type,
       system_prompt LIKE '%CFY_NO_EMBLEM_RULE%' AS tem_regra_selo,
       system_prompt LIKE '%CFY_NO_TEXT_RULE%'   AS tem_regra_texto
  FROM email_agent_configs
 WHERE agent_type = 'image' AND is_active = true;
