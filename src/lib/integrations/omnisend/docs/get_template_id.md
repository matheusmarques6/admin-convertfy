# get_template_id — GET /api/form-templates/{templateID}

One form template by ID, including its full `content` tree, suggested `targeting`, and `contactTags` — the material you copy into `post_forms` to create a real form.

**USE WHEN:** you picked a template from `get_form_templates` and need its complete `content`; you want a known-valid `content` example for a given `displayType` before authoring your own.

## Agent workflow

1. **Find the template** — `get_form_templates` (GET /api/form-templates), optionally filtered by `displayType`.
2. **Fetch it** with this operation.
3. **Preview** with `post_form_templates_template_id_render` (POST /api/form-templates/{templateID}/render) if the user should see it first.
4. **Adapt and create** — pass the (edited) `content`, a `name`, and the `displayType` to `post_forms`, then `post_forms_form_id_enable`.

Templates are read-only library entries: they cannot be patched, enabled, or deleted.

## Response (200)

`id`, `name`, `displayType` (`popup`, `flyout`, `embedded`, `landingPage`, `fullscreen`), `content` (`generalSettings`, `steps`, optional post-submit steps and `teaser`, brand assets applied), `targeting`, `contactTags`. See `post_forms` for what each part of `content` means and which fields are required when you submit it back.

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Malformed `templateID` |
| 404 | No template with this ID in the brand's library |
