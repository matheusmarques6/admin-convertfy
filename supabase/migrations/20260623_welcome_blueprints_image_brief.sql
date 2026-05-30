-- ============================================================
-- Epic AE-Image Niche-Adaptive
-- Story AE-14: Welcome blueprints com image_brief, image_aspect,
-- image_mode, image_overlay_reserve_bottom.
--
-- Data-only — sem mudanca de schema. As 4 colunas image_* foram
-- criadas na AE-10 (20260601_image_agent_niche_adaptive.sql).
--
-- Idempotente: TODOS os 6 emails usam UPSERT (ON CONFLICT DO UPDATE)
-- garantindo que o blueprint seja criado em ambiente novo (CI / db
-- reset) e tenha os campos image_* atualizados em prod (onde rows
-- podem ter sido criadas via UI / seed manual).
--
-- AE-14 review fix (commit 31f4b4f -> aplicado em fix posterior):
-- antes UPDATE pra E1-E5; em ambiente novo email_blueprints estaria
-- vazia (APPLY_ALL_EMAIL_GENERATION.sql seeda email_flow_emails mas
-- nao email_blueprints) e UPDATEs no-op deixariam blueprints sem
-- image_*. UPSERT cobre os 2 cenarios.
-- ============================================================

-- E1 — Boas-vindas (lifestyle hero, 4:5, product_ref)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging,
  image_brief, image_aspect, image_mode, image_overlay_reserve_bottom
)
VALUES (
  'welcome', 1,
  'Boas-vindas + apresentacao da marca. Cria pertencimento e desejo no primeiro contato.',
  'Tom aspiracional, foco no universo do publico. Apresenta marca + produto-heroi.',
  'Hero lifestyle do PRODUTO_HEROI no CENARIO da loja. Aspiracional, transmite o universo do publico.',
  '4:5', 'product_ref', true
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  image_brief = EXCLUDED.image_brief,
  image_aspect = EXCLUDED.image_aspect,
  image_mode = EXCLUDED.image_mode,
  image_overlay_reserve_bottom = EXCLUDED.image_overlay_reserve_bottom;

-- E2 — Prova social + urgencia (produto destaque, 4:5, product_ref)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging,
  image_brief, image_aspect, image_mode, image_overlay_reserve_bottom
)
VALUES (
  'welcome', 2,
  'Prova social + urgencia: X pessoas compraram, cupom 10%OFF expira em 24h.',
  'Manada + escassez. Selo de prova social + countdown. Foco no produto-heroi.',
  'Studio still de produto premium com area inferior reservada para overlay 10%OFF + selo de prova social.',
  '4:5', 'product_ref', true
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  image_brief = EXCLUDED.image_brief,
  image_aspect = EXCLUDED.image_aspect,
  image_mode = EXCLUDED.image_mode,
  image_overlay_reserve_bottom = EXCLUDED.image_overlay_reserve_bottom;

-- E3 — Comparacao "nao somos loja comum" (vertical 3:5, sem overlay, product_ref)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging,
  image_brief, image_aspect, image_mode, image_overlay_reserve_bottom
)
VALUES (
  'welcome', 3,
  'Diferenciacao: tabela "outras lojas vs nos" com imagem central de prova de uso.',
  'Autoridade + diferencial. Imagem do produto em uso ancora os checkmarks da tabela.',
  'Imagem central vertical do PRODUTO_HEROI em uso real, sem area reservada para overlay (fica entre a tabela "outras vs nos").',
  '3:5', 'product_ref', false
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  image_brief = EXCLUDED.image_brief,
  image_aspect = EXCLUDED.image_aspect,
  image_mode = EXCLUDED.image_mode,
  image_overlay_reserve_bottom = EXCLUDED.image_overlay_reserve_bottom;

-- E4 — Re-lembrete (aspiracional, 4:5, text2img)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging,
  image_brief, image_aspect, image_mode, image_overlay_reserve_bottom
)
VALUES (
  'welcome', 4,
  'Re-lembrete pro lead que ainda nao usou o cupom. Aspiracional, leve FOMO.',
  'Eleva o nicho ao patamar premium. "Ainda quer seu 10%OFF?".',
  'Hero aspiracional do nicho elevado a versao premium. Sensacao de status, conquista e exclusividade.',
  '4:5', 'text2img', true
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  image_brief = EXCLUDED.image_brief,
  image_aspect = EXCLUDED.image_aspect,
  image_mode = EXCLUDED.image_mode,
  image_overlay_reserve_bottom = EXCLUDED.image_overlay_reserve_bottom;

-- E5 — Historia da marca (fachada 4:3, text2img, placa em branco)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging,
  image_brief, image_aspect, image_mode, image_overlay_reserve_bottom
)
VALUES (
  'welcome', 5,
  'Storytelling de fundacao da marca. Constroi confianca e humaniza.',
  'Origem da marca em 1-2 paragrafos. Fachada de loja sinaliza marca real.',
  'Fachada de loja fisica com vitrine que sugere o nicho. Placa acima da entrada em branco para receber o logo na edicao.',
  '4:3', 'text2img', false
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  image_brief = EXCLUDED.image_brief,
  image_aspect = EXCLUDED.image_aspect,
  image_mode = EXCLUDED.image_mode,
  image_overlay_reserve_bottom = EXCLUDED.image_overlay_reserve_bottom;

-- E6 — Ultima oportunidade (high-impact, 4:5, product_ref)
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
