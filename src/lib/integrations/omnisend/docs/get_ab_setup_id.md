# get_ab_setup_id — GET /api/form-ab-setups/{abSetupID}

Read one form A/B setup: `status` (`draft` / `enabled`), `mainForm` `{formID, name, status}`, `versions[]` `{formID, name, weight}`, and lifecycle timestamps (`createdAt`, `updatedAt`, `enabledAt`, `launchedAt`).

**USE WHEN:** you need the two **variant form IDs** (`versions[].formID`) to edit them with `patch_form_id` or preview them with `post_forms_form_id_render`; you want to confirm the setup started (`status: "enabled"`, `launchedAt` set); you need the version form ID to pass to `post_form_ab_setups_ab_setup_id_winner`.

**No setup ID?** `get_form_ab_setups` (GET /api/form-ab-setups, filterable by `draft` / `enabled`), or `get_form_id` → `abSetupID` on the main form.

## Errors

| Status | Meaning |
|--------|---------|
| 404 | No A/B setup with this ID for the brand |

Related: `post_form_ab_setups` (create), `post_form_ab_setups_ab_setup_id_start`, `post_form_ab_setups_ab_setup_id_winner`, `delete_ab_setup_id` (draft only), `get_forms_form_id_ab_setup_reports` (results — use the MAIN form ID).
