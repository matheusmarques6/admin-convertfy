-- =============================================================
-- Régua de Welcome da Mavietto — sequência de blocos (JÁ EXECUTADO).
--
-- Leva para a aba "Arquitetura dos Emails" as 8 sequências da análise do
-- Figma `HgLtZ9fb0txrxzIsG1YCQK`. SOMENTE a sequência: intenção, diretriz,
-- restrições, assunto, tom, cupom, "somente texto" e a régua ficam como
-- estavam.
--
--   #1  header · hero · body · body · products · reviews · footer   (7)
--   #2  header · hero · body · offer · products · footer            (6)
--   #3  header · hero · body · products · footer                    (5)
--   #4  header · hero · cta · body · reviews · cta · footer         (7)
--   #5  header · hero · body · offer · products · footer            (6)
--   #6  hero · offer · reviews · offer · footer                     (5)
--   #7  header · offer · footer                                     (3)
--   #8  body                                                        (1)
--
-- 40 blocos, contra os 61 do legado que estava no lugar.
--
-- #6 não tem header de propósito: a foto começa no topo do e-mail.
-- #8 é a carta plain-text ("não usa a biblioteca de blocos" na análise) —
-- um `body` é a tradução mínima e fiel, e o e-mail já é text_only, então o
-- Montador é pulado de qualquer forma.
--
-- DUAS colunas porque a tela lê as duas: `email_blueprints.blocks` é a
-- sequência com forma, e `email_outline_templates.suggested_blocks` é a
-- mesma sequência em categorias. Gravar só uma faria a tela acusar
-- divergência em `outline_extras`.
--
-- Gerado pelo `splitRow` REAL (src/lib/email-architecture/merge.ts), não à
-- mão: é o mesmo código que o PUT da rota usa, então o formato é por
-- construção o que a tela produziria.
--
-- Efeito colateral registrado: substituir a sequência apaga os `purpose`
-- das linhas antigas do welcome — descreviam blocos que deixaram de
-- existir. Estão em `email_blueprints_bkp_20260829`.
--
-- `needs_image` segue a regra do seed (hero → sim). A análise diz que a
-- hero do #5 é texto puro ("Sem imagem de cena"); ficou marcada com imagem
-- e precisa de um ajuste à parte se isso importar.
-- =============================================================

UPDATE email_blueprints SET blocks = '[{"type":"header","label":"Header","purpose":"","needs_image":false,"image_brief":null},{"type":"hero","label":"Hero","purpose":"","needs_image":true,"image_brief":null},{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null},{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null},{"type":"products","label":"Produtos","purpose":"","needs_image":false,"image_brief":null},{"type":"reviews","label":"Prova Social","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=1;
UPDATE email_outline_templates SET suggested_blocks = '["header","hero","body","body","products","reviews","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=1;
UPDATE email_blueprints SET blocks = '[{"type":"header","label":"Header","purpose":"","needs_image":false,"image_brief":null},{"type":"hero","label":"Hero","purpose":"","needs_image":true,"image_brief":null},{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null},{"type":"offer","label":"Oferta","purpose":"","needs_image":false,"image_brief":null},{"type":"products","label":"Produtos","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=2;
UPDATE email_outline_templates SET suggested_blocks = '["header","hero","body","offer","products","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=2;
UPDATE email_blueprints SET blocks = '[{"type":"header","label":"Header","purpose":"","needs_image":false,"image_brief":null},{"type":"hero","label":"Hero","purpose":"","needs_image":true,"image_brief":null},{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null},{"type":"products","label":"Produtos","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=3;
UPDATE email_outline_templates SET suggested_blocks = '["header","hero","body","products","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=3;
UPDATE email_blueprints SET blocks = '[{"type":"header","label":"Header","purpose":"","needs_image":false,"image_brief":null},{"type":"hero","label":"Hero","purpose":"","needs_image":true,"image_brief":null},{"type":"cta","label":"CTA","purpose":"","needs_image":false,"image_brief":null},{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null},{"type":"reviews","label":"Prova Social","purpose":"","needs_image":false,"image_brief":null},{"type":"cta","label":"CTA","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=4;
UPDATE email_outline_templates SET suggested_blocks = '["header","hero","cta","body","reviews","cta","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=4;
UPDATE email_blueprints SET blocks = '[{"type":"header","label":"Header","purpose":"","needs_image":false,"image_brief":null},{"type":"hero","label":"Hero","purpose":"","needs_image":true,"image_brief":null},{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null},{"type":"offer","label":"Oferta","purpose":"","needs_image":false,"image_brief":null},{"type":"products","label":"Produtos","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=5;
UPDATE email_outline_templates SET suggested_blocks = '["header","hero","body","offer","products","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=5;
UPDATE email_blueprints SET blocks = '[{"type":"hero","label":"Hero","purpose":"","needs_image":true,"image_brief":null},{"type":"offer","label":"Oferta","purpose":"","needs_image":false,"image_brief":null},{"type":"reviews","label":"Prova Social","purpose":"","needs_image":false,"image_brief":null},{"type":"offer","label":"Oferta","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=6;
UPDATE email_outline_templates SET suggested_blocks = '["hero","offer","reviews","offer","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=6;
UPDATE email_blueprints SET blocks = '[{"type":"header","label":"Header","purpose":"","needs_image":false,"image_brief":null},{"type":"offer","label":"Oferta","purpose":"","needs_image":false,"image_brief":null},{"type":"footer","label":"Footer","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=7;
UPDATE email_outline_templates SET suggested_blocks = '["header","offer","footer"]'::jsonb WHERE flow_type='welcome' AND email_number=7;
UPDATE email_blueprints SET blocks = '[{"type":"body","label":"Body","purpose":"","needs_image":false,"image_brief":null}]'::jsonb WHERE flow_type='welcome' AND email_number=8;
UPDATE email_outline_templates SET suggested_blocks = '["body"]'::jsonb WHERE flow_type='welcome' AND email_number=8;
