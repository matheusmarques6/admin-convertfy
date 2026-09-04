# post_form_ab_setups_ab_setup_id_winner — POST /api/form-ab-setups/{abSetupID}/winner

Conclude a running A/B test by declaring one variant the winner. The test stops splitting traffic and the chosen variant becomes the form that is served. Only for an **enabled (started)** setup. **One-way** — the split cannot be resumed afterwards.

## Agent workflow

1. **Read the results** — `get_forms_form_id_ab_setup_reports` for the main form. Compare **rates** (`submits / views`, `signups / views`), not raw counts: an uneven `splitValue` gives versions different traffic volumes.
2. **Sanity-check the sample** — a few dozen views per version is not a decision. Say so instead of concluding prematurely.
3. **Resolve the variant's form ID** — `get_ab_setup_id` → `versions[].formID`. The payload takes the **version form ID**, not the setup ID and not the main form ID.
4. **Select the winner** with this operation.
5. **Verify** — the concluded test appears in `get_forms_form_id_ab_setup_reports` with `completedAt` and `winner` set.

## Request

| Field | Required | Description |
|-------|----------|-------------|
| `abSetupID` | **Yes** | Path parameter |
| `versionFormID` | **Yes** | Body — form ID of the winning **variant** (one of `versions[].formID`) |

```json
{ "versionFormID": "000000000000000000000002" }
```

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Malformed IDs, or `versionFormID` is not one of this setup's variants |
| 409 | Setup not running (still `draft`, or already concluded) — start it first |
