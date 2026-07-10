-- ============================================================
-- HTML Agent — Hero Overlay Hard Rule (append ao prompt ativo)
--
-- Defeito observado em prod (Radiantlyhers, Welcome 1, 10/07/2026):
-- a HERO sai como blocos empilhados (imagem em cima, headline/copy/
-- CTA embaixo) quando deveria ser TEXTO SOBRE A IMAGEM DE FUNDO.
--
-- Causa raiz: o <overlay_decision> do master prompt v3 e' uma dupla
-- condicao — so' constroi texto-sobre-imagem se a REFERENCE usar a
-- tecnica E overlay = "needs_html_overlay". Como a biblioteca de
-- componentes do Montador (email_component_variants) nao tem nenhuma
-- variante com background-image, a reference SEMPRE empilha e a regra
-- "Reference STACKS -> stack" vence — o flag needs_html_overlay e'
-- ignorado na pratica. Mas a imagem da hero e' GERADA para overlay
-- (overlayReserveBottom: area inferior reservada para o texto);
-- empilhar desperdica a area reservada e quebra a composicao.
--
-- Este bloco SOBREPOE a matriz APENAS para a hero. Escopo restrito
-- porque o `overlay` do image_map e' um valor global para todas as
-- imagens (build-vars.ts) — torna-lo autoritativo em qualquer bloco
-- colocaria texto sobre fotos de produto/depoimento.
--
-- Mesmo padrao da 20260817 (formatting_hard_rules): APPEND ao prompt
-- ATIVO, idempotente via sentinela.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULES$

<hero_overlay_hard_rule>
This rule OVERRIDES <overlay_decision> for the HERO block only.

When the hero block (block_type = "hero", or the first image-bearing block when block types are generic) has an image in the image_map with overlay = "needs_html_overlay":
- ALWAYS build it as TEXT-OVER-BACKGROUND-IMAGE — even if the reference stacks the image above the text. The generated hero image reserves its bottom area for this text; stacking wastes the reserved area and breaks the composition.
- Construction: a container div with `background-image: url(<the exact image_map URL>)`, `background-size: cover`, `background-position: center top`, and a height proportional to the image's aspect_ratio at 600px width (4:5 -> ~750px, 1:1 -> 600px, 16:9 -> ~338px).
- Legibility: add a gradient scrim between the image and the text (e.g. an inner wrapper with `background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 100%)`, or a tone matched to the text color) so headline/copy/CTA keep contrast on any photo.
- Content placement: headline + copy + CTA are HTML text ON TOP of the image, anchored to the BOTTOM portion of the container (the reserved area). Never duplicate them below the image.
- If the hero has NO image in the image_map (generation failed upstream): render the text-only hero exactly as before. NEVER invent a URL or reuse another block's image.
- overlay = "burned" keeps the existing rule: place the image only, no HTML text over it.
</hero_overlay_hard_rule>$RULES$
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt NOT LIKE '%<hero_overlay_hard_rule>%';
