-- ============================================================
-- Default seeds pro Welcome Flow:
--   - 5 emails com nomes padrão
--   - Blocks default por email (Hero / Texto / Cupom / Produtos / Rodapé)
--   - QA checklist por email (10 items)
--
-- Roda DEPOIS de 20260607_email_production_workspace.sql.
-- Idempotente: usa NOT EXISTS pra nao duplicar.
-- ============================================================

-- ── 1. Cria os 5 emails padrão do Welcome Flow ──────────────
WITH welcome_flows AS (
  SELECT id, store_id FROM email_flows WHERE flow_type = 'welcome'
)
INSERT INTO email_flow_emails (flow_id, number, name, from_name, from_email, subject, preheader, delay_hours, status)
SELECT
  wf.id,
  t.number,
  t.name,
  COALESCE(cs.store_name, 'Loja'),
  COALESCE('atendimento@' || regexp_replace(cs.store_url, '^https?://(www\.)?', ''), 'noreply@email.com'),
  t.subject,
  t.preheader,
  t.delay_hours,
  CASE WHEN t.number = 1 THEN 'in_progress' ELSE 'draft' END
FROM welcome_flows wf
JOIN client_stores cs ON cs.id = wf.store_id
CROSS JOIN (VALUES
  (1, 'Bem-vindo',          'Bem-vindo a bordo · ganhe 10% off',                 'Seu cupom de boas-vindas está disponível', 0),
  (2, 'História da marca',  'De um sonho à revolução no esporte',                'Conheça a história por trás da marca e ganhe 10% off', 24),
  (3, 'Tênis favoritos',    'Os modelos mais vendidos da semana',                'Selecionados pra você que está começando', 48),
  (4, 'Ainda quer 10% OFF?','Seu cupom expira em 24h',                           'Última chance de usar seu desconto de boas-vindas', 96),
  (5, 'Última chance',      'O desconto sai do ar hoje',                         'Encerramento das ofertas exclusivas pra novos clientes', 120)
) AS t(number, name, subject, preheader, delay_hours)
WHERE NOT EXISTS (
  SELECT 1 FROM email_flow_emails efe
  WHERE efe.flow_id = wf.id AND efe.number = t.number
);

-- ── 2. Cria blocks default para CADA email do Welcome Flow ──
-- Template basico: Hero / Texto / Cupom / Produtos / Rodapé.
-- Conteudo placeholder em PT-BR; será personalizado pelo time.

-- Email #1 - Bem-vindo: Hero + Cupom + Rodapé
WITH e1 AS (
  SELECT efe.id, cs.store_name, cs.store_url
  FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  JOIN client_stores cs ON cs.id = ef.store_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 1
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e1.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e1
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'BEM-VINDO',
    'headline', 'SUA JORNADA COMECA AQUI',
    'body', 'Estamos felizes em ter voce com a gente. Como agradecimento, ganhe 10% off na sua primeira compra.',
    'cta_text', 'APROVEITAR DESCONTO',
    'image_url', '',
    'image_alt', 'Boas vindas'
  )::text),
  ('coupon', 2, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'VALIDO POR 48H',
    'cta_text', 'COPIAR CUPOM'
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(
      jsonb_build_object('links', jsonb_build_array(
        jsonb_build_object('label', 'LANÇAMENTOS', 'url', '#'),
        jsonb_build_object('label', 'MASCULINO',   'url', '#'),
        jsonb_build_object('label', 'FEMININO',    'url', '#'),
        jsonb_build_object('label', 'INFANTIL',    'url', '#')
      ))
    ),
    'copyright', '© 2026 LOJA · TODOS OS DIREITOS RESERVADOS'
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e1.id
);

-- Email #2 - História da marca: Hero + Texto + Cupom + Produtos + Rodapé
WITH e2 AS (
  SELECT efe.id, cs.store_name FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  JOIN client_stores cs ON cs.id = ef.store_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 2
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e2.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e2
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'NOSSA HISTÓRIA',
    'headline', 'DE UM SONHO À REVOLUÇÃO NO MERCADO',
    'body', 'Em 2021, percebi uma realidade frustrante: talentos incriveis ficavam de fora por falta de acesso. Decidi mudar isso.',
    'cta_text', 'DESCOBRIR NOSSA JORNADA',
    'image_url', '',
    'image_alt', 'Fundador'
  )::text),
  ('text', 2, 'Texto', jsonb_build_object(
    'headline', 'POR QUE SOMOS DIFERENTES',
    'body', 'Cada produto e selecionado pensando em quem ama o que faz. Qualidade premium a preco acessivel.'
  )::text),
  ('coupon', 3, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'POR TEMPO LIMITADO',
    'cta_text', 'APROVEITAR 10%OFF'
  )::text),
  ('products', 4, 'Produtos', jsonb_build_object(
    'title', 'CONHEÇA NOSSOS TÊNIS FAVORITOS',
    'products', jsonb_build_array(
      jsonb_build_object('name', 'Modelo Pro Court',  'price', '49,95', 'image_url', '', 'cta_text', 'BUY NOW'),
      jsonb_build_object('name', 'Modelo Rosa Air',   'price', '49,95', 'image_url', '', 'cta_text', 'BUY NOW'),
      jsonb_build_object('name', 'Modelo Black',      'price', '69,95', 'image_url', '', 'cta_text', 'BUY NOW'),
      jsonb_build_object('name', 'Modelo Galaxy',     'price', '49,95', 'image_url', '', 'cta_text', 'BUY NOW')
    )
  )::text),
  ('footer', 5, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(
      jsonb_build_object('links', jsonb_build_array(
        jsonb_build_object('label', 'LANÇAMENTOS', 'url', '#'),
        jsonb_build_object('label', 'MASCULINO',   'url', '#'),
        jsonb_build_object('label', 'FEMININO',    'url', '#'),
        jsonb_build_object('label', 'INFANTIL',    'url', '#')
      ))
    ),
    'copyright', '© 2026 ' || UPPER(e2.store_name) || ' · TODOS OS DIREITOS RESERVADOS'
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e2.id
);

-- Email #3 - Tênis favoritos: Hero + Produtos + Rodapé
WITH e3 AS (
  SELECT efe.id, cs.store_name FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  JOIN client_stores cs ON cs.id = ef.store_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 3
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e3.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e3
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'SELECAO DA CASA',
    'headline', 'OS MAIS VENDIDOS DA SEMANA',
    'body', 'Curadoria especial dos produtos que estao saindo mais. Tudo com 10% off pra voce.',
    'cta_text', 'VER COLEÇÃO COMPLETA'
  )::text),
  ('products', 2, 'Produtos', jsonb_build_object(
    'title', 'TOP 4',
    'products', jsonb_build_array(
      jsonb_build_object('name', 'Produto #1', 'price', '99,90', 'image_url', '', 'cta_text', 'COMPRAR'),
      jsonb_build_object('name', 'Produto #2', 'price', '129,90','image_url', '', 'cta_text', 'COMPRAR'),
      jsonb_build_object('name', 'Produto #3', 'price', '79,90', 'image_url', '', 'cta_text', 'COMPRAR'),
      jsonb_build_object('name', 'Produto #4', 'price', '149,90','image_url', '', 'cta_text', 'COMPRAR')
    )
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(jsonb_build_object('links', jsonb_build_array(
      jsonb_build_object('label', 'EXPLORAR LOJA',  'url', '#'),
      jsonb_build_object('label', 'CENTRAL DE AJUDA','url', '#'),
      jsonb_build_object('label', 'FAQ',             'url', '#')
    )))
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e3.id
);

-- Email #4 - Ainda quer 10% OFF? (urgência): Hero + Cupom + Rodapé
WITH e4 AS (
  SELECT efe.id FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 4
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e4.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e4
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'ULTIMOS DIAS',
    'headline', 'SEU CUPOM EXPIRA EM 24H',
    'body', 'Voce ainda nao usou seu 10% off. Aproveite antes que o tempo acabe.',
    'cta_text', 'USAR AGORA'
  )::text),
  ('coupon', 2, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'EXPIRA EM 24H',
    'cta_text', 'USAR ANTES QUE ACABE'
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(jsonb_build_object('links', jsonb_build_array(
      jsonb_build_object('label', 'COMPRAR AGORA', 'url', '#')
    )))
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e4.id
);

-- Email #5 - Última chance: Hero + Cupom
WITH e5 AS (
  SELECT efe.id FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 5
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e5.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e5
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'AGORA OU NUNCA',
    'headline', 'A OFERTA SAI DO AR HOJE',
    'body', 'Sua chance de comprar com 10% off termina hoje. Depois disso, volta ao preco normal.',
    'cta_text', 'COMPRAR ANTES QUE ACABE'
  )::text),
  ('coupon', 2, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'TERMINA HOJE',
    'cta_text', 'GARANTIR DESCONTO'
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(jsonb_build_object('links', jsonb_build_array(
      jsonb_build_object('label', 'EXPLORAR LOJA', 'url', '#')
    )))
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e5.id
);

-- ── 3. QA checklist default por email (mesmos itens em todos os 5) ─
WITH welcome_emails AS (
  SELECT efe.id
  FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE ef.flow_type = 'welcome'
)
INSERT INTO email_qa_checklist (email_id, position, label, category)
SELECT we.id, t.position, t.label, t.category
FROM welcome_emails we
CROSS JOIN (VALUES
  (1,  'Assunto tem entre 30 e 50 caracteres',              'content'),
  (2,  'Pré-cabeçalho não repete o assunto',                'content'),
  (3,  'Todas as imagens tem alt text descritivo',          'tech'),
  (4,  'Links principais foram testados e funcionam',       'tech'),
  (5,  'CTA primário aparece acima da dobra',               'design'),
  (6,  'Render OK no Gmail / Outlook / Apple Mail',         'tech'),
  (7,  'Render OK no modo escuro (dark mode)',              'design'),
  (8,  'Cupom inclui prazo de validade visível',            'content'),
  (9,  'Texto de unsubscribe presente no rodapé',           'compliance'),
  (10, 'Footer com endereço físico (CAN-SPAM / LGPD)',      'compliance')
) AS t(position, label, category)
WHERE NOT EXISTS (
  SELECT 1 FROM email_qa_checklist q WHERE q.email_id = we.id
);

-- ── 4. Recalcula progress_percent dos emails (trigger ja faria mas
-- garante consistencia agora) ───────────────────────────────
UPDATE email_flow_emails efe
SET progress_percent = COALESCE((
  SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE applied) / NULLIF(COUNT(*), 0))
  FROM email_blocks WHERE email_id = efe.id
), 0)
WHERE EXISTS (SELECT 1 FROM email_blocks WHERE email_id = efe.id);

-- Recalcula flows
UPDATE email_flows ef
SET progress_percent = COALESCE((
  SELECT ROUND(AVG(progress_percent)) FROM email_flow_emails WHERE flow_id = ef.id
), 0)
WHERE EXISTS (SELECT 1 FROM email_flow_emails WHERE flow_id = ef.id);
