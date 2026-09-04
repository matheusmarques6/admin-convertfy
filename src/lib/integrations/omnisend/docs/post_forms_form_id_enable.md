# post_forms_form_id_enable — POST /api/forms/{formID}/enable

Publish a form: start serving it according to its targeting rules and move it to `enabled`. Makes a `draft` (or a `disabled`) form live. Idempotent. No body — path parameter only.

**Not for A/B tests:** a variant form cannot be enabled directly, and a form that owns an active A/B setup cannot be enabled either — start the test with `post_form_ab_setups_ab_setup_id_start` instead.

## Agent workflow

1. **Check what you are publishing** — `get_form_id`: confirm `status`, the `targeting` rules, and that `abSetupID` is absent.
2. **Preview** with `post_forms_form_id_render` if the content has not been reviewed.
3. **Enable** with this operation.
4. **Confirm** with `get_form_id` — `status` becomes `enabled`, `enabledAt` set (this call returns no body).
5. **Measure after traffic accumulates** — `get_forms_form_id_report` (totals + device split) or `get_forms_form_id_report_periodic` (time series).

An enabled form only appears where its targeting allows. "The form is live but nobody sees it" → inspect `targeting.url`, `targeting.scheduling`, `targeting.device`, `targeting.audience`, `targeting.display` rather than re-enabling.

## Response

`204 No Content`. Statuses: `draft` (never published) · `enabled` (serving) · `disabled` (paused, content preserved).

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Cannot be enabled in its current state — typically an A/B variant form, or a form owning an active A/B setup |
| 404 | No form with this `formID` for the brand |

## post_forms_form_id_disable — POST /api/forms/{formID}/disable

The inverse: stops serving without deleting. Same constraints for A/B.
