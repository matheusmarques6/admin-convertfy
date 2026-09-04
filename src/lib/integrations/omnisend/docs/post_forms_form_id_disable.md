# post_forms_form_id_disable — POST /api/forms/{formID}/disable

Stop serving a form without deleting it: status moves to `disabled`, content and targeting are preserved, and it can be re-enabled later with `post_forms_form_id_enable`. Idempotent. No body — path parameter only.

**Not for A/B tests:** a variant form cannot be disabled directly, and a form that owns an active A/B setup cannot be disabled either — conclude the test with `post_form_ab_setups_ab_setup_id_winner` (or delete a draft setup with `delete_ab_setup_id`) and manage the surviving form afterwards.

## Agent workflow

1. `get_form_id` — confirm `status: enabled` and that `abSetupID` is absent.
2. Disable with this operation.
3. Confirm with `get_form_id` — `status: disabled`, `disabledAt` set.

## Response

`204 No Content`.

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Cannot be disabled in its current state (A/B variant, or owns an active setup) |
| 404 | No form with this `formID` |
