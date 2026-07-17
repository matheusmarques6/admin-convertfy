-- ============================================================
-- Montador (Component Assembler) — preservar as tags CANÔNICAS
--
-- Causa raiz das 2.490 tags distintas em 412 references: o prompt mandava
-- usar "placeholders curtos (ex.: {{HEADLINE}}, {{BODY}}, {{CTA_LABEL}})" —
-- 3 exemplos, nenhuma lista — e o LLM batizava tags novas a cada geração.
--
-- A biblioteca (email_component_variants) agora usa o vocabulário canônico
-- (docs/email-reference-tags.md / tag-registry.ts). Esta regra faz o
-- Montador PRESERVAR essas tags exatamente como autoradas ao reusar os HTMLs
-- das variantes — nunca renomear, nunca inventar. É o que permite ao
-- extractor determinístico (reference-structure.ts) substituir a extração de
-- estrutura do Blueprint agent.
--
-- Append idempotente ao prompt ativo (agent_type='assembler').
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULE$

REGRA DAS TAGS CANÔNICAS: os HTMLs das variantes usam placeholders padronizados no formato {{TAG_MAIUSCULA}} (ex.: {{HERO_HEADLINE}}, {{PRODUCT_1_NAME}}, {{COUPON_CODE}}). PRESERVE cada placeholder EXATAMENTE como está no HTML da variante — NUNCA renomeie, traduza, abrevie ou invente tags novas. Se precisar de um placeholder num trecho que não tem (bloco criado do zero), use SOMENTE tags no padrão SECAO_CAMPO já presente nas outras variantes do documento (ex.: {{BODY_TITLE}}, {{BODY_TEXT}}, {{CTA_LABEL}}) — jamais um nome novo fora desse padrão. A correlação downstream (estrutura, copy e orçamento de caracteres) depende desses nomes exatos.$RULE$
WHERE agent_type = 'assembler'
  AND is_active = true
  AND system_prompt NOT LIKE '%REGRA DAS TAGS CANÔNICAS%';
