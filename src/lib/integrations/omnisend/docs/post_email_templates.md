# post_email_templates

## Summary

Create a **structured** email template — a hierarchy of sections → rows → columns → blocks that stays editable in the Omnisend builder. If the user already has finished HTML and just wants it stored, use `post_email_templates_import` instead.

The API generates and returns the template `id`; do not send one on create.

## Required

Send the complete template as a single document — all three top-level fields are mandatory:

- `name` (1–255 chars)
- `generalSettings` (full object: `content` plus the required `buttonPresets`/`textPresets` sets — see **Required style presets**)
- `sections` (at least one)

Omitting any of them fails with a `400`, e.g. `"generalSettings is a required field"`. This is a full payload, not a partial one — do not drop `generalSettings` or `sections`.

## Automation content requirements

If this template is for an automation (e.g. cart/product abandonment or order
confirmation), it may need a specific section or blocks to work correctly.
Consult the **`automation_content`** reference topic (`omnisend_reference` with
`topic_id: automation_content`) and include the
required section/blocks before referencing this template from the automation's
send-email action.

## Unsubscribe link

Creating a template does **not** require `[[unsubscribe_link]]` — the template (and a campaign created from it) saves without it. The requirement is enforced later, when the campaign's content is saved via `put_email_content_id`, which returns `400 "sections must have a valid unsubscribe link"`.

So include `[[unsubscribe_link]]` in at least one `text` or `htmlCode` block for **campaign / marketing** templates. It is **not** required for **transactional / automation** emails (e.g. order or shipping confirmations). A typical footer block:

```json
{
  "id": "<unique-24-hex-id>",
  "type": "text",
  "text": "<p style=\"text-align: center; margin: 0px;\"><a href=\"[[unsubscribe_link]]\" target=\"_blank\">Unsubscribe</a></p>",
  "stylePresetID": "footnote",
  "styleProperties": { "padding": "12px" }
}
```

## Hierarchy

```
Template
 ├── name (1–255 chars)
 ├── generalSettings { content, body, buttonPresets, textPresets, logo, gmail }
 └── sections[]
      ├── id, type, settings, productRecommender, visibility, styleProperties
      └── rows[]
           └── columns[]  (id, width, styleProperties)
                └── blocks[]  (id, type, role, stylePresetID, styleProperties, <type payload>)
```

## Section column layout

Within a section, **every row must have the same number of columns**. The first row defines the section's column grid. If the email needs a different column count, start a new section instead of adding a differently shaped row to the existing section. **Exception:** a section with `type: dynamic_list` is exempt — its rows form a wrapping grid, so the final row may contain fewer columns for leftover items.

## Required style presets

`generalSettings.buttonPresets` and `generalSettings.textPresets` back every block's `stylePresetID`, so the minimum sets must exist or the template won't render right. Always include all of them even if some go unused:

- **buttonPresets**: `primary_button`, `secondary_button`, `tertiary_button`
- **textPresets**: `heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote`

You may add named presets beyond these minimums; you just can't omit any of them.

## Constraints

| Constraint | Limit |
|---|---|
| `id` on every section/row/column/block | 24-character hex, unique within the template |
| Rows within a section | Same number of columns in every row (except `type: dynamic_list`, whose final wrapping-grid row may have fewer columns for leftover items) |
| Content width | 300–2000 px |
| Font size | 3–100 px |
| Template name | 1–255 chars |

Generate a fresh 24-char hex id (12 random bytes hex-encoded, e.g. `secrets.token_hex(12)`) for every section, row, column, and block. They only need to be unique within the template you submit.

## Blocks

Each block carries the common fields `id`, `type`, `role`, `stylePresetID`, `secondaryStylePresetId`, `styleProperties`, plus a type-specific payload under a key matching the type name (a `text` block under `text`, an `image` block under `image`, etc.).

- **Content**: `text`, `button`, `image`, `video`, `logo`, `social`, `htmlCode`, `lineSpace`, `preheader` (campaigns only)
- **Commerce**: `product` (`productRecommender` is configured on the *section* via `section.productRecommender`, not as a block)
- **Promotions**: `discount`, `staticDiscount`, `dynamicDiscount`
- **Transactional**: `orderSummary`, `orderProducts`, `orderTotal`, `orderAddresses`
- **System**: `badge` (read-only, Omnisend-managed)

### Field notes that trip people up

- **`image`** blocks reference an uploaded asset with **`image.imageID`** (the Image API ID) — **not** `image.id`. Put the image URL in `image.source`.
- **`htmlCode`** blocks write raw markup to **`htmlCode.body`** (and CSS to `htmlCode.style`) — not the deprecated, read-only `html`.
- **`preheader`** is campaigns-only; it is invalid in transactional or generic templates.
- **`badge`** is system-managed — readable in responses but never authored.

## Text block markup

A `text` block's `text` is HTML for content, not for sizing. Wrap every line in `<p>` (inline `<a>`, `<strong>`, `<em>`, `<span>`, `<br>` and lists are fine inside it) and set the look through `stylePresetID` — `heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote` — or the block's `styleProperties` (`fontSize`, `fontFamily`, `color`, `lineHeight`).

Never emit heading tags: `<h1>`, `<h2>`, `<h3>` (nor `<h4>`–`<h6>`). A heading tag takes its font size from the email client's default heading scale rather than the template presets, so it ignores the template's typography and its line height no longer matches the size it actually renders at. A headline is a `<p>` with `stylePresetID: heading_large`.

## Universal layouts (shared header/footer)

A reusable header/footer is a *universal layout* referenced from a section: set `section.settings.universalLayoutID` to the layout's id. That section's own `rows` are ignored on write — the layout content is the source of truth — and resolved inline on read. Manage layouts via `post_email_universal_layouts`.

## After creating

Use `post_email_templates_id_render` to render the template to HTML and sanity-check the JSON you produced before referencing it in a campaign.
