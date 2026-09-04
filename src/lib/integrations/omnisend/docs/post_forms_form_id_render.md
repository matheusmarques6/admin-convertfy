# post_forms_form_id_render — POST /api/forms/{formID}/render

Render a stored form to HTML — one entry per form step — **without** enabling it or serving it to visitors. Despite the `POST` method this is a read-only preview: nothing about the form changes. No body — path parameter only.

**USE WHEN:** the user wants to see how a form looks before it goes live; you just created or patched a form and want to sanity-check; you need to review both variants of an A/B test before starting it.

To preview a library template that has not been turned into a form yet, use `post_form_templates_template_id_render` (POST /api/form-templates/{templateID}/render).

## Agent workflow

1. **Create or edit** the form — `post_forms` / `patch_form_id`.
2. **Render** with this operation and inspect the returned HTML per step.
3. **Fix** anything wrong with `patch_form_id` and render again.
4. **Publish** with `post_forms_form_id_enable` once it looks right.

## Response (200)

`steps[]` — one entry per rendered step: `steps[].name` (includes post-submit screens such as the success step), `steps[].html`. Preview artifact only — do not store or re-submit it (`get_form_id` holds the source of truth).

## Errors

| Status | Meaning |
|--------|---------|
| 403 | Token lacks `forms.write` (rendering requires the write scope even though it changes nothing) |
| 404 | No form with this ID |
