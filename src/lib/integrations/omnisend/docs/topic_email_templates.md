# email_templates — Email templates and universal layouts

Endpoint `https://api.omnisend.com/api/email-templates`. Create, retrieve, delete, import templates. Hierarchy:

```
Template → Sections[] → Rows[] → Columns[] → Blocks[]
```

Every section, row, column, and block requires a unique 24-hex `id` within the template.

## Section types

`""` (plain) · `products_listing` (manually picked products) · `product_recommender` (needs `productRecommender` object; up to 12 product blocks) · `product_cart_recovery` (abandoned-cart automations; items injected at send time) · `product_back_in_stock` · `universal_layout` (`settings.universalLayoutID`) · `dynamic_list` · `preheader` (campaign templates only) · `badge`. Product sections only accept `product` blocks.

## Block types

`text` · `button` · `image` · `video` · `logo` · `menu` · `social` · `htmlCode` · `lineSpace` · `preheader` · `product` · `discount` · `staticDiscount` / `dynamicDiscount` (WooCommerce) · `orderSummary` · `orderProducts` · `orderTotal` · `orderAddresses`. (`html` is deprecated — use `htmlCode`.)

## Style presets

If you provide `buttonPresets`, include all three: `primary_button`, `secondary_button`, `tertiary_button`. If you provide `textPresets`, include all five: `heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote`. Blocks reference them via `stylePresetID`.

## generalSettings

`content` (width 300–2000px, backgroundColor, fontFamily, fontSize 3–100px, color) · `body` (backgroundColor, background image) · `buttonPresets` · `textPresets` · `logo` · `gmail`.

## Product recommender

`productRecommender`: `type` (`newest`, `popular`, `mostViewed`, `personalized`*, `recentlyViewed`*), `fallbackType` (`newest|popular|mostViewed`), `isOutOfStockIncluded`, `includeCategories`, `excludeCategories`, `excludeProducts`, `purchaseExclusionDays`, `recencyMonths`, `priceFrom`. *Pro plan — silently falls back otherwise.

## HTML import

`POST /api/email-templates/import` — `{ "name": "...", "html": "<html>...</html>" }` (≤ 1 MB). `<style>` from `<head>` goes to the style block; `<body>` becomes an HTML code block. **Easiest way to bring a ConvertIA-generated email into Omnisend.**

## Minimal create example

```json
{
  "name": "Welcome Email",
  "generalSettings": {
    "content": { "backgroundColor": "#FFFFFF", "width": "600px", "fontFamily": "Arial, sans-serif", "fontSize": "16px", "color": "#212121" },
    "body": { "backgroundColor": "#EDEEF0" },
    "buttonPresets": [
      { "id": "primary_button", "name": "Primary", "styles": { "backgroundColor": "#383838", "borderRadius": "4px", "fontFamily": "Arial, sans-serif", "fontSize": "16px", "color": "#FFFFFF", "paddingLeft": "24px", "paddingRight": "24px", "paddingTop": "12px", "paddingBottom": "12px" } },
      { "id": "secondary_button", "name": "Secondary", "styles": { "backgroundColor": "#FFFFFF", "border": "2px solid #383838", "borderRadius": "4px", "fontFamily": "Arial, sans-serif", "fontSize": "16px", "color": "#383838", "paddingLeft": "24px", "paddingRight": "24px", "paddingTop": "12px", "paddingBottom": "12px" } },
      { "id": "tertiary_button", "name": "Tertiary", "styles": { "backgroundColor": "transparent", "borderRadius": "0px", "fontFamily": "Arial, sans-serif", "fontSize": "16px", "textDecoration": "underline", "color": "#383838", "paddingLeft": "24px", "paddingRight": "24px", "paddingTop": "12px", "paddingBottom": "12px" } }
    ],
    "textPresets": [
      { "id": "heading_large", "name": "Heading Large", "styles": { "fontFamily": "Arial, sans-serif", "fontSize": "36px", "color": "#212121", "lineHeight": "125%" } },
      { "id": "heading_medium", "name": "Heading Medium", "styles": { "fontFamily": "Arial, sans-serif", "fontSize": "28px", "color": "#212121", "lineHeight": "130%" } },
      { "id": "heading_small", "name": "Heading Small", "styles": { "fontFamily": "Arial, sans-serif", "fontSize": "22px", "color": "#212121", "lineHeight": "135%" } },
      { "id": "paragraph", "name": "Paragraph", "styles": { "fontFamily": "Arial, sans-serif", "fontSize": "16px", "color": "#212121", "lineHeight": "150%" } },
      { "id": "footnote", "name": "Footnote", "styles": { "fontFamily": "Arial, sans-serif", "fontSize": "12px", "color": "#757575", "lineHeight": "150%" } }
    ]
  },
  "sections": [ { "id": "aaa000000000000000000001", "rows": [ { "id": "aaa000000000000000000002", "columns": [ { "id": "aaa000000000000000000003", "width": "600px", "blocks": [
    { "id": "aaa000000000000000000004", "type": "text", "text": "<p style=\"margin-top: 0px; margin-bottom: 0px;\">Welcome, [[contact.first_name]]!</p>", "stylePresetID": "paragraph", "styleProperties": { "padding": "16px" } }
  ] } ] } ], "styleProperties": { "backgroundColor": "#FFFFFF" } } ]
}
```

Text blocks: wrap every line in `<p>`; never `<h1>`–`<h6>` — a headline is a `<p>` with `stylePresetID: heading_large`.

Related: `get_email_templates` (GET /api/email-templates — `limit` 1–100, `nameContains`, `sort` createdAt|name), `get_email_templates_id`, `post_email_templates`, `post_email_templates_import`, `put_email_templates_id` (full replace), `post_email_templates_id_render`, `delete_email_templates_id`; universal layouts at `/api/email-universal-layouts`.
