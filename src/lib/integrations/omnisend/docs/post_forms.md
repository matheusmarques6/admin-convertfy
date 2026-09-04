# post_forms

## Summary

Create an Omnisend **signup form** (popup, flyout, embedded, landing page, or fullscreen) with its full content tree, styling, and targeting rules. A new form is created in **`draft`** status and is **not shown to any visitor** until it is enabled with **`post_forms_form_id_enable`**.

**USE THIS TOOL WHEN:**
- The user asks to build a signup form, popup, newsletter overlay, discount/wheel-of-fortune form, or landing page
- You already know the copy, fields, and where the form should appear
- You need a form to attach an A/B test to (create it here first, then **`post_form_ab_setups`**)

**Do not use this tool to** edit an existing form (**`patch_form_id`**), publish one (**`post_forms_form_id_enable`**), or preview one (**`post_forms_form_id_render`**). Sending customer events or contacts is unrelated (**`post_events`**, **`post_contacts`**).

Building the whole `content` tree by hand is expensive. Prefer starting from a brand template: **`get_form_templates`** → **`get_template_id`** → adapt the returned `content` → call this tool.

## Agent workflow (recommended)

1. **Pick a starting point** — **`get_form_templates`** (optionally filtered by `displayType`), then **`get_template_id`** for the full `content`. Only build `content` from scratch when no template fits.
2. **Resolve referenced resources** — image blocks and `backgroundImage` need an **image ID** from the Images API (**`get_images`** / **`post_images`**); segment targeting needs segment IDs from **`get_segments`**.
3. **Create the form** with this tool. Read `id` from the `201` response.
4. **Preview** with **`post_forms_form_id_render`** — it renders the stored content without publishing.
5. **Publish** with **`post_forms_form_id_enable`**. Confirm with **`get_form_id`** (`status` becomes `enabled`).
6. **Measure** with **`get_forms_form_id_report`** / **`get_forms_form_id_report_periodic`**, and read collected contacts with **`get_forms_form_id_contacts`**.

Do **not** call `post_forms` repeatedly to "try" variations — create once, then iterate with **`patch_form_id`**, or A/B test properly with **`post_form_ab_setups`**.

## HTTP

- **Method**: `POST`
- **Path**: `/api/forms`
- **Scope**: `forms.write` · **Rate limit**: 40 requests/minute

## MCP: `omnisend_tool_schema` and `omnisend_create`

The MCP **`inputSchema`** is the HTTP JSON body. Call **`omnisend_tool_schema`** with `operation: "post_forms"` for the full nested field types; the response includes this curated markdown plus a generated appendix from the live schema.

Use **`omnisend_create`** with `operation: "post_forms"` and `payload` equal to that body — no extra wrapper.

## Request

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | Internal form name (1–256 chars); not shown to visitors |
| `displayType` | **Yes** | How the form is presented — see table below |
| `content` | **Yes** | Content tree + shared presentation. Requires `generalSettings` and `steps` |
| `targeting` | No | When and to whom the form is shown. Omit to show it everywhere its display type allows |
| `doubleOptIn` | No | Confirmation-email flow before a contact is subscribed |
| `contactTags` | No | Tags applied to contacts who submit (max **100**) |
| `autoRedirect` | No | Post-submission redirect: `url`, `delayMs` (**1000–60000**), `countdownText`, `shouldOpenInNewTab`, `isEnabled` |
| `socialMediaSharing` | No | Preview metadata for shared landing pages — `title` and `description` are **required inside the object** (max 1000 each), optional `imageID` |
| `clickOutside` | No | `{ "isEnabled": true }` closes the form when the visitor clicks outside it |
| `recaptcha` | No | `{ "isEnabled": true }` enables reCAPTCHA spam protection |

### `displayType`

| Value | Use it for |
|-------|-----------|
| `popup` | Modal centered over a dimmed page. Highest visibility; launch offers, discounts, exit-intent capture |
| `flyout` | Compact panel anchored to a page corner; page stays usable. Always-on signup while browsing |
| `embedded` | Rendered inline in the host page (section, sidebar, footer). Permanent signup block |
| `landingPage` | Full standalone page hosted by Omnisend. Ad-, email-, or link-driven campaigns with no host site |
| `fullscreen` | Overlay covering the entire viewport. Maximum attention; high-value offers |

Only **`popup`**, **`flyout`**, and **`fullscreen`** forms are eligible for A/B testing (**`post_form_ab_setups`**).

### `content` structure

```
content
├── generalSettings          (required — shared presentation)
├── steps[]                  (required — 1–2 screens)
│     └── sections[]
│           └── rows[]
│                 └── columns[]      (up to 4 per row; `width` required)
│                       └── blocks[] (`type` required)
├── successStep              (optional — screen after a successful submit)
├── subscribedStep           (optional — screen for already-subscribed visitors)
├── unavailablePageStep      (optional — screen when the form is unavailable)
└── teaser                   (optional — small persistent widget; `text`, `position`, `visibility`)
```

`successStep`, `subscribedStep`, and `unavailablePageStep` are **single step objects** (`{ "sections": [...] }`), not arrays. Each step requires `sections`; each section requires `rows`; each row requires `columns`; each column requires `width` and `blocks`. Server-generated `id` values on sections, rows, columns, and blocks are assigned on create — **omit them from the request**.

#### `generalSettings` (all required unless noted)

| Field | Description |
|-------|-------------|
| `content` | `width` (form container, 300px–1000px) and `color` (overlay behind the form) |
| `body` | Form body `backgroundColor`, `borderRadius`, `borderStyle` (`dotted`/`solid`/`dashed`), `borderWidth`, `borderColor` |
| `link` | `color` used for links in text blocks |
| `buttonPresets` | Reusable button styles — **must** contain `primary_button`, `secondary_button`, `tertiary_button` |
| `textPresets` | Reusable text styles — **must** contain `heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote` |
| `fieldStyles` | Shared input styling: `fontFamily`, `fontSize` (8–96px), `errorColor`, `label.color`, `placeholder.color`, `field` (`color`, `borderColor`, `borderRadius` 0–50, `borderStyle`, `borderWidth`) |
| `closeButton` *(optional)* | `color` (required in the object), `backgroundColor`, `isVisible` |
| `backgroundImage` *(optional)* | `id` of an image in the Images API, plus `fit` (`cover`/`contain`), `position` (`left`/`right`/`top`/`back`), `size`, `padding` |
| `position` *(optional)* | `topLeft`…`bottomRight` (9 values) — where the form sits on the page |

A block applies a preset by setting `stylePresetID` to that preset's `id` (e.g. `"heading_large"`). Presets keep the form visually consistent; per-block `styleProperties` override them.

#### Block types (`blocks[].type`)

| Type | Configuration object | Notes |
|------|----------------------|-------|
| `text` | `text` (HTML string) | e.g. `"<p>Subscribe</p>"`; pair with a `stylePresetID` |
| `image` | `image` | `id` (Images API, required), `link`, `altText` (≤200), `resizeWidth` (≤2000) |
| `button` | `button` | `type`: `link` \| `submit` \| `close` \| `nextStep`; `text` (≤200), `link` (required for `link`), `isFullWidth` |
| `lineSpace` | `lineSpace` | `type`: `line` \| `space`; `width` 1–100 (line only), `height` |
| `emailField` | `emailField` | `errorMessage` required in the object; `label`, `placeholder`, `isRequired`, `requiredMessage` |
| `phoneNumberField` | `phoneNumberField` | + `defaultCountryCode` (ISO 3166-1 alpha-2) |
| `inputField` | `inputField` | `profileField` required: `firstName`, `lastName`, `address`, `city`, `state`, `zipCode`, `custom` (+ `customProfileField`) |
| `dateField` | `dateField` | `profileField` (`birthdate`/`custom`), `format` (`YYYY/MM/DD`, `MM/DD/YYYY`, `DD/MM/YYYY`), `errorMessage` — all required |
| `dropdownField` | `dropdownField` | `profileField` (`country`/`gender`/`custom`) required; `options[]` (`value`/`label`) |
| `radioField` | `radioField` | `profileField` (`gender`/`custom`) required; `options[]` |
| `checkboxField` | `checkboxField` | `profileField` (`custom`) required; `options[]` |
| `legal` | `legal` | `type`: `gdpr` \| `tcpa`; `label`, `description`, `link` (privacy policy), `requiredMessage` |
| `discount` | `discount` | `type`: `static` (needs `code`) \| `wheelOfFortune` |
| `countdownTimer` | `countdownTimer` | `endsAt` (RFC 3339) |
| `wheelOfFortune` | `wheelOfFortune` | `slices` (3–20: `text`, `discountCode`, `probability`, `isLosing`, colors) and `pointerColor` required; `width` 30–100 |

Every form that collects subscribers needs at least one input block (usually `emailField`) and a `button` with `type: "submit"` in the same step.

### `targeting`

| Rule | Description |
|------|-------------|
| `url` | `includes[]` / `excludes[]` of `{ type: "exact"\|"contains", value }` |
| `display` | Trigger: `afterSeconds` (0–3600), `afterScrollDown` (0–100 %), `afterViewedPageCount` (0–100), `isExitIntentEnabled`, `customTrigger: "only"` |
| `frequency` | Repeat interval: `type` (`second`/`minute`/`hour`/`day`) + `value` (≥1) |
| `device` | `desktop` or `mobile` (omit for both) |
| `scheduling` | `startsAt` / `endsAt` (RFC 3339); `endsAt` must be later |
| `audience` | `{ "type": "subscribers" \| "notSubscribers" }` |
| `segments` | `includes[]` / `excludes[]` of segment IDs (**`get_segments`**) |
| `location` | `includes[]` / `excludes[]` of `{ code (ISO 3166-1 alpha-2), name, states[] }` |
| `utm` | `includes[]` of `{ type: id\|source\|medium\|campaign\|term\|content, value }` |
| `source` | `includes[]` / `excludes[]` of `googleAds`, `organic`, `direct`, `facebook`, `instagram`, `omnisendCommunication` |
| `isBackInStock` | Limit to back-in-stock visitors |

### `doubleOptIn`

`isEnabled` plus `email` (all of `subject`, `headline`, `content`, `confirmationButton`, `sendersName` required) and **either** `confirmationPage` (`title` + `content` required; optional `buttonText`, `isButtonVisible`, `url`, `isAutoRedirectEnabled`, `autoRedirectText`) **or** `confirmationRedirect` (`isEnabled`, `url`). With double opt-in on, a submit produces a contact only after the visitor confirms — expect `signups` to trail `submits` in reports.

### Example: minimal single-step popup

```json
{
  "name": "Newsletter Signup",
  "displayType": "popup",
  "content": {
    "generalSettings": {
      "content": { "width": "600px", "color": "#000000" },
      "body": { "backgroundColor": "#ffffff", "borderRadius": "8px", "borderWidth": "1px", "borderStyle": "solid", "borderColor": "#cccccc" },
      "link": { "color": "#0000ee" },
      "buttonPresets": [
        { "id": "primary_button", "name": "Primary", "styles": { "backgroundColor": "#000000", "color": "#ffffff", "borderRadius": "8px", "borderStyle": "solid", "borderWidth": "1px", "fontFamily": "Arial", "fontSize": "16px", "fontStyle": "normal", "fontWeight": "bold", "textDecoration": "none" } },
        { "id": "secondary_button", "name": "Secondary", "styles": { "backgroundColor": "#ffffff", "color": "#000000", "borderRadius": "8px", "borderStyle": "solid", "borderWidth": "1px", "fontFamily": "Arial", "fontSize": "16px", "fontStyle": "normal", "fontWeight": "normal", "textDecoration": "none" } },
        { "id": "tertiary_button", "name": "Tertiary", "styles": { "backgroundColor": "transparent", "color": "#000000", "borderRadius": "0px", "borderStyle": "solid", "borderWidth": "0px", "fontFamily": "Arial", "fontSize": "16px", "fontStyle": "normal", "fontWeight": "normal", "textDecoration": "underline" } }
      ],
      "textPresets": [
        { "id": "heading_large", "name": "Heading Large", "styles": { "fontFamily": "Arial", "fontSize": "32px", "color": "#000000", "lineHeight": "125%" } },
        { "id": "heading_medium", "name": "Heading Medium", "styles": { "fontFamily": "Arial", "fontSize": "24px", "color": "#000000", "lineHeight": "125%" } },
        { "id": "heading_small", "name": "Heading Small", "styles": { "fontFamily": "Arial", "fontSize": "20px", "color": "#000000", "lineHeight": "125%" } },
        { "id": "paragraph", "name": "Paragraph", "styles": { "fontFamily": "Arial", "fontSize": "16px", "color": "#000000", "lineHeight": "150%" } },
        { "id": "footnote", "name": "Footnote", "styles": { "fontFamily": "Arial", "fontSize": "12px", "color": "#757575", "lineHeight": "150%" } }
      ],
      "fieldStyles": {
        "fontFamily": "Arial",
        "fontSize": "14px",
        "errorColor": "#ff0000",
        "label": { "color": "#000000" },
        "placeholder": { "color": "#999999" },
        "field": { "color": "#000000", "backgroundColor": "#ffffff", "borderRadius": "4px", "borderStyle": "solid", "borderColor": "#cccccc", "borderWidth": "1px" }
      }
    },
    "steps": [
      {
        "sections": [
          {
            "rows": [
              {
                "columns": [
                  {
                    "width": "100%",
                    "blocks": [
                      { "type": "text", "text": "<p>Subscribe and get 10% off</p>", "stylePresetID": "heading_large" },
                      { "type": "emailField", "emailField": { "label": "Email", "placeholder": "you@example.com", "isRequired": true, "requiredMessage": "Email is required", "errorMessage": "Enter a valid email address" } },
                      { "type": "button", "button": { "type": "submit", "text": "Subscribe", "isFullWidth": true }, "stylePresetID": "primary_button" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "targeting": { "display": { "afterSeconds": 5 }, "device": "desktop" },
  "contactTags": ["newsletter"]
}
```

### Example: exit-intent popup limited to one country and a schedule

```json
{
  "targeting": {
    "display": { "isExitIntentEnabled": true },
    "frequency": { "type": "day", "value": 7 },
    "location": { "includes": [{ "code": "US", "name": "United States" }] },
    "scheduling": { "startsAt": "2026-11-25T00:00:00Z", "endsAt": "2026-12-02T23:59:59Z" },
    "audience": { "type": "notSubscribers" }
  }
}
```

## Response (`201 Form`)

| Field | Description |
|-------|-------------|
| `id` | Form ID (24-char hex) — use it in every other forms tool |
| `status` | Always **`draft`** right after creation (`draft`, `enabled`, `disabled`) |
| `displayType`, `name`, `content`, `targeting`, … | Echo of the stored form, with server-generated IDs filled in |
| `abSetupID`, `abStatus` | Set only when the form belongs to an A/B setup |
| `createdAt`, `updatedAt`, `enabledAt`, `disabledAt`, `launchedAt` | Lifecycle timestamps (read-only) |

## Errors

| Status | Meaning |
|--------|---------|
| `400` | Validation failure — `errors[]` lists `field` (dot path), `code`, `message`. Most common: missing required presets, a column without `width`, a step without `sections` |
| `401` | Missing or invalid auth |
| `403` | Token lacks the `forms.write` scope |
| `410` | The requested API version has been retired |
| `429` | Rate limit (40/min for writes) — back off using `retryAfter` |
| `500` | Unexpected server error |

## Related tools

- **`get_form_templates`**, **`get_template_id`** — start from a brand template instead of building `content` by hand
- **`post_forms_form_id_render`** — preview the created form as HTML before publishing
- **`post_forms_form_id_enable`** / **`post_forms_form_id_disable`** — publish / stop serving
- **`patch_form_id`**, **`get_form_id`**, **`get_forms`**, **`delete_form_id`** — form lifecycle
- **`post_form_ab_setups`** — A/B test a `popup`, `flyout`, or `fullscreen` form
- **`get_forms_form_id_report`**, **`get_forms_form_id_report_periodic`**, **`get_forms_form_id_contacts`** — performance and collected contacts
- **`get_images`** / **`post_images`** (image blocks), **`get_segments`** (segment targeting)

## Text block markup

A `text` block's `text` is HTML for content, not for sizing. Wrap every line in `<p>` (inline `<a>`, `<strong>`, `<em>`, `<span>`, `<br>` and lists are fine inside it) and set the look through `stylePresetID` — `heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote` — or the block's `styleProperties`.

Never emit heading tags: `<h1>`, `<h2>`, `<h3>` (nor `<h4>`–`<h6>`). A heading tag takes its font size from the browser's default heading scale rather than the form presets, so it ignores the form's typography. A headline is a `<p>` with `stylePresetID: heading_large`.
