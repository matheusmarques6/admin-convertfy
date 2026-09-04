# patch_form_id

## Summary

Partially update an existing form: name, display type, content, targeting, double opt-in, tags, and the other optional settings. **Only the fields present in the request are changed** — omitted fields are left as they are. Editing a form that is already **`enabled`** takes effect for visitors immediately; there is no separate publish step.

**USE THIS TOOL WHEN:**
- The user wants to change copy, styling, fields, targeting rules, or tags on an existing form
- You need to edit one variant of a running A/B test (variant forms are edited here, never enabled/disabled directly)
- A form was created from a template and now needs brand-specific adjustments

**Not for** status changes — use **`post_forms_form_id_enable`** / **`post_forms_form_id_disable`**. `status` and the form's creation origin cannot be set through this tool.

## Agent workflow (recommended)

1. **Read first** — **`get_form_id`** to fetch the current `content` and `targeting`.
2. **Modify the copy you fetched**, keeping every field you want to preserve.
3. **Send each nested object complete.** Nested objects **replace** the stored value instead of merging into it, so a partial `content` loses whatever you left out — `generalSettings` **and** `steps` are required whenever `content` is present. The same applies to `targeting`, `doubleOptIn`, and `autoRedirect`.
4. **Verify** with **`get_form_id`**, and preview with **`post_forms_form_id_render`** when the change is visual.

`null` clears an optional field; `null` on a mandatory field is rejected with `400`.

## HTTP

- **Method**: `PATCH`
- **Path**: `/api/forms/{formID}`
- **Scope**: `forms.write` · **Rate limit**: 40 requests/minute

## MCP: `omnisend_tool_schema` and `omnisend_update`

Call **`omnisend_tool_schema`** for `operation: "patch_form_id"` for the full nested field types; **`omnisend_tool_schema`** appends a generated appendix from the live schema.

Use **`omnisend_update`** with `operation: "patch_form_id"` and a flat `payload` that holds the path parameter **`formID`** alongside the body fields.

## Request

| Field | Required | Description |
|-------|----------|-------------|
| `formID` | **Yes** | Path parameter — 24-char hex form ID |
| `name` | No | New internal form name (1–256 chars) |
| `displayType` | No | `popup`, `flyout`, `embedded`, `landingPage`, `fullscreen`. Changing it changes how existing content is presented — re-check styling and targeting afterwards, and note that leaving `popup`/`flyout`/`fullscreen` makes the form ineligible for A/B testing |
| `content` | No | Full content tree. When present it must contain `generalSettings` and `steps` (see **`post_forms`** for the structure, required presets, and block types) |
| `targeting` | No | Full targeting object — replaces the stored rules |
| `doubleOptIn` | No | Full double opt-in object |
| `contactTags` | No | Replaces the whole tag list (max 100) |
| `autoRedirect`, `socialMediaSharing`, `clickOutside`, `recaptcha` | No | Replace the corresponding stored object |

### Example: rename and retarget only

```json
{
  "formID": "000000000000000000000001",
  "name": "Newsletter Signup — EU",
  "targeting": {
    "display": { "afterSeconds": 10 },
    "location": { "includes": [{ "code": "DE", "name": "Germany" }, { "code": "FR", "name": "France" }] }
  }
}
```

### Example: switch the submit button copy

Fetch with **`get_form_id`**, change the one block, and send the whole `content` back:

```json
{
  "formID": "000000000000000000000001",
  "content": {
    "generalSettings": { "…": "unchanged copy of the fetched generalSettings" },
    "steps": [{ "sections": [{ "rows": [{ "columns": [{ "width": "100%", "blocks": [
      { "type": "button", "button": { "type": "submit", "text": "Get my 10% off", "isFullWidth": true }, "stylePresetID": "primary_button" }
    ] }] }] }] }]
  }
}
```

## Response (`200 Form`)

The full updated form — same shape as **`post_forms`** returns: `id`, `name`, `status`, `displayType`, `content`, `targeting`, `abSetupID`, `abStatus`, and the lifecycle timestamps. `updatedAt` moves; `status` is unchanged by this call.

## Errors

| Status | Meaning |
|--------|---------|
| `400` | Validation failure — `errors[]` gives the offending `field` dot path. Also returned when a mandatory field is set to `null`, or when a nested object is sent incomplete |
| `401` | Missing or invalid auth |
| `403` | Token lacks the `forms.write` scope |
| `404` | No form with this `formID` for the brand |
| `410` | The requested API version has been retired |
| `429` | Rate limit (40/min for writes) — back off using `retryAfter` |
| `500` | Unexpected server error |

## Related tools

- **`get_form_id`** — always read before patching; the response is the base for your edit
- **`post_forms`** — full field reference for `content`, `targeting`, and `doubleOptIn`
- **`post_forms_form_id_render`** — preview the edited form without publishing
- **`post_forms_form_id_enable`** / **`post_forms_form_id_disable`** — status changes
- **`post_form_ab_setups`**, **`get_ab_setup_id`** — variant forms of an A/B test are edited with this tool
- **`get_forms_form_id_report`** — check the impact of the change over time

## Text block markup

A `text` block's `text` is HTML for content, not for sizing. Wrap every line in `<p>` (inline `<a>`, `<strong>`, `<em>`, `<span>`, `<br>` and lists are fine inside it) and set the look through `stylePresetID` — `heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote` — or the block's `styleProperties`.

Never emit heading tags: `<h1>`, `<h2>`, `<h3>` (nor `<h4>`–`<h6>`). A heading tag takes its font size from the browser's default heading scale rather than the form presets, so it ignores the form's typography. A headline is a `<p>` with `stylePresetID: heading_large`.
