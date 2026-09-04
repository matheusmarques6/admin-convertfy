# patch_campaigns_id — PATCH /api/campaigns/{id}

Update a campaign (**draft only**). Partial updates for `name`, `language`, `audience`, `content` (same nesting as create: `content.email` / `content.sms`).

## Before calling

1. **Know the current state** — `get_campaigns_id` (GET /api/campaigns/{id}); read `status` and `type`.
2. **Patch only when `status` is `draft`.** Anything else returns **409 `campaign-not-editable`**.
3. **Not draft:** explain it is no longer editable. If the user wants a separate new draft, `post_campaigns_id_copy` once, keep the new `id`, and patch that. Copy only when that is the intent, never as automatic 409 recovery.
4. **`type` is `booster`:** boosters cannot be copied (422). Report and ask.
5. **Never retry the same PATCH unchanged** after a 409 — the state rejected it, not the payload.

## Content

- Content patches **merge field-by-field** — send only the `content.email` fields to change; omitted fields keep their values.
- **`templateID` cannot be changed via PATCH.** To use a different template, clone with `post_campaigns_id_copy`; to edit the existing design, use `contentID` with the Email Content API (`get_email_content_id` / `put_email_content_id`).
- **Sender fields (`senderEmail`, `replyToEmail`): leave them out** unless the user gives an exact address. To clear a reply-to, send `"replyToEmail": ""`. A rejected address must be reported, not worked around.
- The endpoint re-validates the whole campaign after the patch: a regular email draft must keep `templateID`, `subject`, `senderName` — blanking a required field returns 400.

## sendingSettings — full object replacement

Include all fields applicable to the strategy, not just the one you change.

- `immediate` / `scheduled`: `strategy`, `scheduledAt` (for scheduled), `isTZOptimizationEnabled`.
- `personalized`: `strategy`, `scheduledAt`, `optimizeFor` (`opens`/`clicks`/`orders`); **omit** `isTZOptimizationEnabled`.

```json
{ "sendingSettings": { "strategy": "scheduled", "scheduledAt": "2026-09-15T10:00:00Z", "isTZOptimizationEnabled": true } }
```

## abTest — full replacement

When patching A/B settings or variant content, provide the full `abTest` block — omitted fields reset.

## Language

Exact supported locale codes only (see `post_campaigns`). Leave `language` out when unsure.

## Example

```json
{ "content": { "email": { "subject": "Updated Subject Line" } } }
```

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Required field blanked, bad `language`, bad `sendingSettings` combination |
| 404 | Stale ID — call `get_campaigns` once to obtain a current ID; do not retry the stale one |
| 409 `campaign-not-editable` | Not in `draft` |
