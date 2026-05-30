-- ============================================================
-- Epic AE-Image Niche-Adaptive
-- Story AE-14: substitui os placeholders <<E1..E6>> do
-- user_template no email_agent_configs.image v1 pelos 6 prompts
-- mestres reais do documento niche-adaptive.
--
-- Mantem v1 ativa (decisao AE-14.3): UPDATE direto na row ativa
-- e mais simples; AE-8 versionamento serve pra mudancas FUTURAS.
--
-- Idempotente — UPDATE com mesmo conteudo nao tem efeito; pode
-- rodar 2x sem regressao.
--
-- IMPORTANTE: as variaveis {{X}} sao preservadas literalmente
-- gracas ao dollar-quoted string ($USER$...$USER$). Elas sao
-- interpoladas pelo template-renderer.ts em runtime.
-- ============================================================

UPDATE email_agent_configs
SET user_template = $USER$Generate a hero image for an e-commerce email.

{{#case flow_type}}
  {{#when "welcome"}}
    {{#case email_number}}
      {{#when 1}}Hero de boas-vindas para email de marca. Fotografia editorial de {{PRODUTO_HEROI}} em uso/destaque dentro de {{CENARIO}}, transmitindo {{MOOD}}. Atmosfera aspiracional do universo de {{PUBLICO}}. Luz natural suave e direcional, profundidade de campo cinematografica, paleta dominada por {{PALETA_1}} e {{NEUTRO}} com acentos de {{PALETA_2}}. Enquadramento vertical 4:5, produto/cena no terco superior-central.{{/when}}
      {{#when 2}}Still de produto premium para campanha de marketing. {{PRODUTO_HEROI}} como heroi absoluto, fotografia de produto profissional sobre {{NEUTRO}}, dentro do contexto de {{CENARIO}}. Iluminacao dramatica de estudio, leve fumaca/atmosfera, reflexos controlados, sensacao tatil de qualidade. Paleta {{PALETA_1}}/{{PALETA_2}}. Produto ocupando os 2/3 superiores; metade inferior escurecida em degrade para overlay de selo de desconto.{{/when}}
      {{#when 3}}Imagem vertical de prova de uso (3:5). {{PRODUTO_HEROI}} sendo usado no {{CENARIO}} real, mostrando claramente o beneficio do {{NICHO}}. Fotografia autentica e nitida, luz natural, foco no produto/resultado. Paleta coerente com {{PALETA_1}}/{{NEUTRO}}. Sem overlay de texto. Composicao que cabe num card vertical estreito.{{/when}}
      {{#when 4}}Hero aspiracional premium. {{PRODUTO_HEROI}}/{{CENARIO}} retratado no nivel mais sofisticado possivel do {{NICHO}} — sensacao de status, conquista e exclusividade, para {{PUBLICO}}. Iluminacao cinematografica, contraste rico, materiais nobres (couro, metal, vidro, tecido fino conforme o nicho). Paleta {{PALETA_1}}/{{PALETA_2}}, fundo elegante. Vertical 4:5, terco inferior escurecido para overlay.{{/when}}
      {{#when 5}}Fachada de loja fisica de rua, fotografia arquitetonica realista, vitrine que sugere {{NICHO}}, estilo condizente com {{MOOD}} (showroom clean / boutique elegante / loja tech conforme aplicavel). Placa/letreiro acima da entrada DEIXADA EM BRANCO e lisa, pronta para receber o logo "{{LOGO_STYLE}}" na edicao downstream. Luz de dia, perspectiva frontal levemente angulada, paleta {{PALETA_1}}/{{NEUTRO}}. Horizontal 4:3 ou quadrada.{{/when}}
      {{#when 6}}Hero de fechamento de alto impacto. {{PRODUTO_HEROI}} na sua versao mais marcante dentro de {{CENARIO}}, contraste alto, iluminacao dramatica, energia de "ultima chamada". Destaque visual maximo, paleta {{PALETA_1}} com acento forte de {{PALETA_2}}. Vertical 4:5, area inferior escurecida para overlay grande de desconto.{{/when}}
    {{/case}}
  {{/when}}
  {{#when "abandoned_cart"}}Generic fallback for abandoned_cart: studio product shot of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}, language context {{IDIOMA}}, currency {{MOEDA}}.{{/when}}
  {{#when "browse_abandonment"}}Generic fallback for browse_abandonment: lifestyle product of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.{{/when}}
  {{#when "win_back"}}Generic fallback for win_back: aspirational lifestyle of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.{{/when}}
  {{#when "upsell"}}Generic fallback for upsell: premium product shot of {{PRODUTO_HEROI}}, palette {{PALETA_1}}+{{PALETA_2}}, neutral {{NEUTRO}}, mood {{MOOD}}.{{/when}}
  {{#when "post_purchase"}}Generic fallback for post_purchase: warm product-in-use of {{PRODUTO_HEROI}} in {{CENARIO}}, mood warm.{{/when}}
{{/case}}

UNIVERSAL RESTRICTIONS:
- Photographic realism, campaign quality.
- No text, letters, numbers, logos or watermarks rendered in the image (text is added in the design layer downstream).
- No distorted faces, no deformed hands, no frame, no watermark.
- Brand identity for {{MARCA}}: logo style {{LOGO_STYLE}}, palette {{PALETA_1}}/{{PALETA_2}}, neutral {{NEUTRO}}, mood {{MOOD}}.
- Target audience: {{PUBLICO}}. Cultural context: {{IDIOMA}}, currency hint {{MOEDA}}.

{{#if INSTRUCAO_ADICIONAL}}
ADDITIONAL BLOCK-SPECIFIC INSTRUCTIONS:
{{INSTRUCAO_ADICIONAL}}
{{/if}}$USER$
WHERE agent_type = 'image' AND is_active = true;
