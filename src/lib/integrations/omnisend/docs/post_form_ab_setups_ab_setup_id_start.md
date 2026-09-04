# post_form_ab_setups_ab_setup_id_start — POST /api/form-ab-setups/{abSetupID}/start

Launch a form A/B test: the setup moves from `draft` to `enabled` and its two variant forms start being served to visitors by weight. Idempotent. This is the **only** way to put A/B variants in front of traffic — `post_forms_form_id_enable` does not work on variant forms or on a form that owns an active setup.

## Agent workflow

1. **Differentiate the variants first** — `get_ab_setup_id`, then `patch_form_id` on each `versions[].formID`. Starting a test whose variants are identical copies wastes the traffic.
2. **Check the split** — `versions[].weight` (each ≥ 1, summing to 100). Weights cannot be changed once running; delete the draft (`delete_ab_setup_id`) and recreate if wrong.
3. **Start** with this operation (no body — path param only).
4. **Confirm** — `get_ab_setup_id` shows `status: "enabled"` and `launchedAt` set.
5. **Wait for a meaningful sample**, then read `get_forms_form_id_ab_setup_reports` for the main form.
6. **Conclude** with `post_form_ab_setups_ab_setup_id_winner`.

## Response

`204 No Content`.

## Errors

| Status | Meaning |
|--------|---------|
| 404 | No A/B setup with this ID for the brand |
| 409 | Already started or cannot be started in its current state |
