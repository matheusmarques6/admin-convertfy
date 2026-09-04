# post_form_ab_setups — POST /api/form-ab-setups

Create a **draft A/B setup** from an existing form. The source form becomes the setup's **main form**, and two **variant forms** are created as identical copies of it that can then be edited independently. The setup is created in `draft` status and serves no traffic until started with `post_form_ab_setups_ab_setup_id_start`.

**Eligibility:** only `popup`, `flyout`, and `fullscreen` forms can be A/B tested. A form can own **one** setup at a time — a second attempt returns `409`.

## Agent workflow

1. **Pick the main form** — `get_forms` / `get_form_id`; check `displayType` is eligible and `abSetupID` is empty. If the challenger does not exist yet (e.g. a wheel-of-fortune variant), create the setup from the current popup and then EDIT variant B with `patch_form_id` — you do not create a second standalone form.
2. **Create the setup** with this operation, optionally naming the two variants and setting their traffic weights.
3. **Differentiate the variants** — read the setup with `get_ab_setup_id` (GET /api/form-ab-setups/{abSetupID}) to get both `versions[].formID`, then edit each with `patch_form_id`. Two identical variants produce no learning.
4. **Preview each variant** with `post_forms_form_id_render`.
5. **Start the test** — `post_form_ab_setups_ab_setup_id_start`. The setup moves to `enabled` and variants start serving by weight.
6. **Let it run** long enough for a meaningful sample, then compare with `get_forms_form_id_ab_setup_reports` (rates derived from `views`, not raw counts).
7. **Conclude** — `post_form_ab_setups_ab_setup_id_winner` with the winning `versionFormID`.

While a setup exists, the main form cannot be enabled or disabled directly, and variant forms cannot be enabled, disabled, or deleted directly — manage everything through the setup.

## Request

| Field | Required | Description |
|-------|----------|-------------|
| `formID` | **Yes** | ID of the existing `popup`, `flyout`, or `fullscreen` form that becomes the main form |
| `versions` | No | Exactly **two** variant descriptors. When omitted both variants get `weight: 50` |
| `versions[].name` | No | Variant form name |
| `versions[].weight` | No | Percentage of eligible traffic. Each weight ≥ 1, the two must sum to 100 |

```json
{ "formID": "000000000000000000000001" }
```

```json
{
  "formID": "000000000000000000000001",
  "versions": [
    { "name": "Control — 10% off", "weight": 50 },
    { "name": "Challenger — wheel of fortune", "weight": 50 }
  ]
}
```

## Response (201)

`id` (A/B setup ID — used by start/winner/get/delete), `status` (`draft`), `mainForm` `{formID,name,status}`, `versions[]` `{formID,name,weight}` — **patch these `formID`s to differentiate the variants**.

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Ineligible `displayType`, wrong number of versions, weight < 1, or weights not summing to 100 |
| 409 | **The form already has an A/B setup.** Fetch it via `get_form_ab_setups` (GET /api/form-ab-setups) and reuse it, or delete the draft with `delete_ab_setup_id` |
| 429 | Rate limit (40/min for writes) |
