-- ============================================================
-- Epic AE-Image Niche-Adaptive
-- Story AE-14: Welcome blueprints com image_brief, image_aspect,
-- image_mode, image_overlay_reserve_bottom.
--
-- Data-only — sem mudanca de schema. As 4 colunas image_* foram
-- criadas na AE-10 (20260601_image_agent_niche_adaptive.sql).
--
-- Idempotente:
--   - E1-E5 sao UPDATEs (rows ja existem em prod via seed legado /
--     UI). UPDATE com mesmo conteudo nao tem efeito.
--   - E6 usa ON CONFLICT (flow_type, email_number) DO UPDATE pra
--     cobrir os 2 cenarios (row ja existe OU ainda nao foi seedada).
--     A UNIQUE constraint (flow_type, email_number) existe desde
--     20260621_email_generation_infra.sql.
-- ============================================================

-- E1 — Boas-vindas (lifestyle hero, 4:5, product_ref)
UPDATE email_blueprints
SET
  image_brief = 'Hero lifestyle do PRODUTO_HEROI no CENARIO da loja. Aspiracional, transmite o universo do publico.',
  image_aspect = '4:5',
  image_mode = 'product_ref',
  image_overlay_reserve_bottom = true
WHERE flow_type = 'welcome' AND email_number = 1;

-- E2 — Prova social + urgencia (produto destaque, 4:5, product_ref)
UPDATE email_blueprints
SET
  image_brief = 'Studio still de produto premium com area inferior reservada para overlay 10%OFF + selo de prova social.',
  image_aspect = '4:5',
  image_mode = 'product_ref',
  image_overlay_reserve_bottom = true
WHERE flow_type = 'welcome' AND email_number = 2;

-- E3 — Comparacao "nao somos loja comum" (vertical 3:5, sem overlay, product_ref)
UPDATE email_blueprints
SET
  image_brief = 'Imagem central vertical do PRODUTO_HEROI em uso real, sem area reservada para overlay (fica entre a tabela "outras vs nos").',
  image_aspect = '3:5',
  image_mode = 'product_ref',
  image_overlay_reserve_bottom = false
WHERE flow_type = 'welcome' AND email_number = 3;

-- E4 — Re-lembrete (aspiracional, 4:5, text2img)
UPDATE email_blueprints
SET
  image_brief = 'Hero aspiracional do nicho elevado a versao premium. Sensacao de status, conquista e exclusividade.',
  image_aspect = '4:5',
  image_mode = 'text2img',
  image_overlay_reserve_bottom = true
WHERE flow_type = 'welcome' AND email_number = 4;

-- E5 — Historia da marca (fachada 4:3, text2img, placa em branco)
UPDATE email_blueprints
SET
  image_brief = 'Fachada de loja fisica com vitrine que sugere o nicho. Placa acima da entrada em branco para receber o logo na edicao.',
  image_aspect = '4:3',
  image_mode = 'text2img',
  image_overlay_reserve_bottom = false
WHERE flow_type = 'welcome' AND email_number = 5;

-- E6 — Ultima oportunidade (high-impact, 4:5, product_ref)
-- UPSERT: cria se nao existe, atualiza image_* se ja existe.
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging,
  image_brief, image_aspect, image_mode, image_overlay_reserve_bottom
)
VALUES (
  'welcome', 6,
  'Ultima chamada do flow de boas-vindas: cupom expira hoje, recapitulacao dos 5 motivos pra comprar.',
  'Tom urgente mas elegante. Recapitula valor sem repetir as mensagens anteriores. CTA forte e direto.',
  'Hero de alto impacto do PRODUTO_HEROI na versao mais marcante do nicho. Energia "ultima chamada", contraste alto.',
  '4:5', 'product_ref', true
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  image_brief = EXCLUDED.image_brief,
  image_aspect = EXCLUDED.image_aspect,
  image_mode = EXCLUDED.image_mode,
  image_overlay_reserve_bottom = EXCLUDED.image_overlay_reserve_bottom;
