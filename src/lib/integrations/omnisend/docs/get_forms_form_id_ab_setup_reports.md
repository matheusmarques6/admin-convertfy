# get_forms_form_id_ab_setup_reports — GET /api/forms/{formID}/ab-setup/reports

Results of the A/B tests of a form. Each report covers one A/B setup: the period it ran, the winning version once picked, and per-version statistics with the traffic split applied. **Both running (`enabled`) and finished (`completed`) setups are returned.**

## Agent workflow

1. **Use the MAIN form's ID** — the form the setup was created from, not a variant ID.
2. **Compare rates, never raw counts** — `splitValue` is the % of traffic each version received. With a 70/30 split the larger version wins on raw `submits` almost by construction. Use `submits / views` and `signups / views`.
3. **Check the sample size** before calling a difference real; for an `enabled` setup the numbers are still moving — treat as provisional.
4. **Act** — conclude with `post_form_ab_setups_ab_setup_id_winner`, or start a follow-up with `post_form_ab_setups`.

## Response (200)

| Field | Description |
|-------|-------------|
| `reports[]` | Running and completed; **empty when the form has none** (still 200) |
| `reports[].abSetupID`, `.status` (`enabled`/`completed`), `.startedAt`, `.completedAt`, `.winner` | Lifecycle |
| `reports[].versionStatistics[]` | `versionName`, `splitValue`, `statistics` = `views`, `interactions`, `submits`, `signups` |
