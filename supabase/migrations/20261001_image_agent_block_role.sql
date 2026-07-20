-- ============================================================
-- Image Agent — cena por PAPEL DO BLOCO (não mais hero pra tudo)
--
-- Bug provado (Luxe Lift welcome#1, 20/jul): o user_template abria com
-- "Generate a hero image for an e-commerce email." HARDCODED e a cena vinha
-- de um switch por flow/email_number — TODAS as cenas descrevem hero. O
-- bloco de products recebia "Hero de boas-vindas..." e a ART DIRECTION
-- (image_brief por bloco, correta) BRIGAVA com a cena genérica no mesmo
-- prompt. As vars block_type/block_label/blueprint_purpose já existiam no
-- contrato (buildImagePromptVars) mas o template não usava nenhuma.
--
-- Novo template:
--   - Header declara o BLOCO alvo (type + label + purpose)
--   - Switch externo por block_type: hero mantém as cenas por flow/email
--     (texto inalterado das migrations 20260624/20260707); products/
--     testimonials/text/features ganham cenas próprias
--   - block_type sem cena mapeada → só ART DIRECTION + restrições (o
--     image_brief do Blueprint é autoritativo e cobre o caso)
--
-- Idempotente: UPDATE com o mesmo conteúdo não tem efeito.
-- ============================================================

UPDATE email_agent_configs
SET user_template = $USER$
{{#if IMAGE_BRIEF}}ART DIRECTION (authoritative — overrides the generic scene below):
{{IMAGE_BRIEF}}

{{/if}}Generate the image for the "{{block_type}}" block ("{{block_label}}") of an e-commerce marketing email.
{{#if blueprint_purpose}}Purpose of this block: {{blueprint_purpose}}{{/if}}

{{#case block_type}}
  {{#when "hero"}}
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
      {{#when "abandoned_cart"}}Hero de carrinho abandonado: studio product shot of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}, language context {{IDIOMA}}, currency hint {{MOEDA}}.{{/when}}
      {{#when "browse_abandonment"}}Hero de navegacao abandonada: lifestyle product of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.{{/when}}
      {{#when "win_back"}}Hero de win-back: aspirational lifestyle of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.{{/when}}
      {{#when "upsell"}}Hero de upsell: premium product shot of {{PRODUTO_HEROI}}, palette {{PALETA_1}}+{{PALETA_2}}, neutral {{NEUTRO}}, mood {{MOOD}}.{{/when}}
      {{#when "post_purchase"}}Hero pos-compra: warm product-in-use of {{PRODUTO_HEROI}} in {{CENARIO}}, mood warm.{{/when}}
    {{/case}}
  {{/when}}
  {{#when "products"}}Fotografia de PRODUTO para a secao de produtos do email: {{PRODUTO_HEROI}} como sujeito absoluto, fotografia de e-commerce profissional sobre {{NEUTRO}}, contexto de {{CENARIO}}, mood {{MOOD}}. Enquadramento limpo e centrado, cores fieis ({{PALETA_1}}), foco nitido em textura e construcao do produto. SEM degrade escuro, SEM area reservada para texto — esta imagem convive com texto AO LADO/ABAIXO no layout, nao sobreposto.{{/when}}
  {{#when "testimonials"}}Imagem de apoio de PROVA SOCIAL: cena autentica de uso cotidiano do produto no universo de {{NICHO}} (produto em contexto real, luz natural quente, composicao crivel e nao-encenada), mood {{MOOD}}. Sem rostos identificaveis salvo se a ART DIRECTION pedir. SEM texto, SEM screenshots de interface.{{/when}}
  {{#when "text"}}Imagem editorial de apoio para secao de storytelling: {{PRODUTO_HEROI}} ou cena do universo da marca dentro de {{CENARIO}}, luz natural suave, composicao calma com espaco negativo generoso, paleta {{PALETA_1}}/{{NEUTRO}}, mood {{MOOD}}.{{/when}}
  {{#when "features"}}Visual QUADRADO pequeno para card de beneficio: detalhe minimalista ou estudo de objeto ligado a {{NICHO}}, fundo liso {{NEUTRO}}, sujeito centralizado, composicao limpa e iconica. Renderiza PEQUENO (~120px) — simples e legivel em tamanho de miniatura.{{/when}}
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
