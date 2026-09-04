# get_form_id — GET /api/forms/{formID}

One form with everything stored on it: content tree, styling, targeting rules, double opt-in, status, A/B linkage, lifecycle timestamps.

**USE WHEN:** you are about to `patch_form_id` — the response is the base you edit; you need to check `status`, `displayType`, or `abSetupID` before enabling, disabling, deleting, or A/B testing; the user asks how a form is configured. **No ID yet?** `get_forms`.

## Agent workflow

1. **Fetch** the form.
2. **Decide from `status`** — `draft` needs `post_forms_form_id_enable`; `enabled` is serving; `disabled` is paused.
3. **Check `abSetupID`** — when set, the form participates in an A/B test and must be managed through the A/B tools, not enable/disable.
4. **Edit** by sending the parts you changed back through `patch_form_id` (nested objects must be complete).

## Response (200 Form)

| Field | Description |
|-------|-------------|
| `id`, `name`, `status` (`draft`/`enabled`/`disabled`), `displayType` | Identity |
| `content` | `generalSettings` + `steps` (→ `sections` → `rows` → `columns` → `blocks`), plus optional `successStep`, `subscribedStep`, `unavailablePageStep`, `teaser`. Server-generated `id`s filled in |
| `targeting` | `url`, `display`, `frequency`, `device`, `scheduling`, `audience`, `segments`, `location`, `utm`, `source`, `isBackInStock` |
| `doubleOptIn`, `contactTags`, `autoRedirect`, `socialMediaSharing`, `clickOutside`, `recaptcha` | Behaviors |
| `abSetupID`, `abStatus` | A/B linkage (empty when standalone) |
| `createdAt`, `updatedAt`, `enabledAt`, `disabledAt`, `launchedAt` | Read-only |

## Errors

| Status | Meaning |
|--------|---------|
| 404 | No form with this ID for the brand (also after deletion) |
