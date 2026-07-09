-- ============================================================
-- HTML Agent — Formatting Hard Rules (append ao prompt ativo)
--
-- Defeitos observados em prod (loja Radiantlyhers, 09/07/2026) no
-- HTML final dos emails de flow:
--
-- (a) LINKS QUEBRADOS: href sem protocolo ("radiantlyhers.com") e
--     URLs de produto com ESPACO no meio ("radiantlyhers.com
--     /products/slug") — clique morto em qualquer client de email.
--
-- (b) FEED DE PRODUTOS DESALINHADO: <img> dos cards sem atributo
--     width (Outlook ignora CSS e estoura a imagem no tamanho
--     original) e fotos do Shopify CDN em proporcoes originais
--     diferentes — cada card sai de um tamanho e o grid desalinha.
--
-- (c) PRODUTOS DUPLICADOS: o bloco de recomendacao ("you might also
--     like") repetia os mesmos produtos do bloco de carrinho.
--
-- Em vez de substituir o prompt (que pode ter sido ajustado pela UI
-- em /admin/settings/email-generation?tab=agents), APENDA um bloco
-- <formatting_hard_rules> ao system_prompt ATIVO. Idempotente via
-- sentinela: re-run e' no-op se o bloco ja existe.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULES$

<formatting_hard_rules>
Non-negotiable output-formatting rules. They override any conflicting habit and apply to EVERY email you emit. Violating any of them ships a broken email.

1. LINKS — every href must be one absolute, well-formed URL:
   - Always start with `https://`. A bare domain like `href="store.com"` is FORBIDDEN — emit `href="https://store.com"`.
   - A URL must contain ZERO whitespace. When you join a domain with a path (e.g. store domain + `/products/slug`), concatenate them directly: `https://store.com/products/slug`. Never `store.com /products/slug`.
   - If a payload URL already includes `https://`, use it as-is; if it lacks the protocol, prefix `https://`; if it contains spaces, remove them.

2. PRODUCT GRID IMAGES — cards must align perfectly:
   - Every product `<img>` carries BOTH the HTML `width` attribute (the real rendered px width of the card image) AND the inline style. Outlook ignores CSS width; without the attribute the image explodes to its original size.
   - Normalize aspect ratio: when the image src is a Shopify CDN URL (`cdn.shopify.com`), append the crop params `width=520&height=650&crop=center` to the existing query string (keep the `v=` param). All cards in the same grid must use the SAME ratio so their heights match.
   - Grid columns must sum to 100%: use `33.33%` for 3 columns and `50%` for 2 — never `33%`.

3. NO DUPLICATE PRODUCTS — a product may appear ONCE in the whole email. If a recommendations/cross-sell block would repeat a product already shown in a cart/reserved-items block, pick different products from top_products. If there are not enough distinct products, render fewer cards instead of repeating one.
</formatting_hard_rules>$RULES$
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt NOT LIKE '%<formatting_hard_rules>%';
