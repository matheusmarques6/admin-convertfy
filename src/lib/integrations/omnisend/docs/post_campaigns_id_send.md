# post_campaigns_id_send — POST /api/campaigns/{id}/send

**Irreversible:** delivers messages to the campaign audience. Messages cannot be recalled. Verify content, audience segments, and sending settings before calling — and confirm with the user, naming the campaign. Success is often `204 No Content` — poll `get_campaigns_id` for the latest `status`.

## Before calling

1. `get_campaigns_id` — read `status` and `type`.
2. **Send only when `status` is `draft`.** Anything else → **409 `invalid-campaign-status`**.
3. Not draft → do not send; report the status. A **resend** is a new campaign: `post_campaigns_id_copy` once (non-booster types only), then send that draft.
4. `type` is `booster` → cannot be copied; cannot be sent before its parent (`parent-not-sent`).
5. **Never retry the same send unchanged** after a 409.

## Behavior

- `sendingSettings.strategy`: `immediate` · `scheduled` (`scheduledAt` future, ≤ 1 year) · `personalized` (STO, regular email only).
- After send, status moves toward `started` (immediate) or `scheduled` (future). First send or first after ~90 days idle may verify on a subset first → status `paused` (~60 min).

## Errors

| Status / `type` | Meaning | What to do |
|-----------------|---------|------------|
| 402 | Audience exceeds billing tier limits | Plan upgrade needed |
| 409 `invalid-campaign-status` | Only a `draft` can be sent | Report status; copy + send only for intentional resend |
| 409 `audience-too-small` | A/B test needs ≥ 10 contacts | Choose a valid audience; do not copy |
| 409 `invalid-email-content` | Email content failed validation (no field-level detail) | Stop and report; ask the user to review content in Omnisend |
| 409 `invalid-audience` | A referenced segment no longer exists | Re-select with `get_segments`, patch the draft |
| 409 `invalid-scheduled-date` | `scheduledAt` not in the future | Patch `sendingSettings` |
| 409 `ab-test-requires-two-variants` | A/B needs exactly 2 variants | Fix the A/B setup |
| 409 `sender_domain_unverified` | Email booster sender domain unverified | Verify domain in Omnisend |
| 404 | Stale ID | `get_campaigns` once; stop if absent |

Related: `post_campaigns_id_cancel` (POST /api/campaigns/{id}/cancel — scheduled/started/paused; best-effort for started), `post_campaigns_id_test_email` (POST /api/campaigns/{id}/test-email — `{ "emails": ["a@b.com"] }` — prefer this before the real send).
