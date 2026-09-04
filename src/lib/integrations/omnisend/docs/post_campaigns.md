# post_campaigns — POST /api/campaigns

Create a new campaign (starts in `draft`). Pick the campaign **type** and **channel** first, then build the payload from the matching recipe — most rejected create calls are a missing `type`/`channel`/`content`, a `content` object that does not match `channel`, a missing `templateID`, incomplete SMS compliance text, or a guessed `language`.

## Choose type and channel first

| Kind | `type` | `channel` | Content |
|------|--------|-----------|---------|
| Regular email | `regular` | `email` | `content.email` — `subject`, `senderName`, and a valid existing `templateID` are required at creation |
| Regular SMS | `regular` | `sms` | `content.sms` — `message` plus the complete nested `compliance` object |
| A/B email | `abTest` | `email` | **Omit top-level `content`**; put both variants under `abTest.variants.a.content.email` and `.b.content.email` |
| Booster | `booster` | choose deliberately | `boosterSettings` required. Draft parent → `boosterSettings.delay`; sent parent → `sendingSettings` |

**Invariant:** `channel: "email"` pairs with `content.email`, `channel: "sms"` pairs with `content.sms`. Never put channel fields (`subject`, `message`, …) directly under `content`.

## Required top-level shape

- `type` — `regular`, `abTest`, or `booster`
- `channel` — `email` or `sms`
- `name` — required for `regular` and `abTest`; not for `booster`
- `content.<channel>` — required for `regular`; omitted for `abTest`; optional for email boosters, required (`content.sms`) for SMS boosters

## Recipes

### Regular email

```json
{
  "name": "Example product announcement",
  "type": "regular",
  "channel": "email",
  "content": {
    "email": {
      "subject": "A new product is here",
      "senderName": "Example Store",
      "preheader": "See what is new",
      "templateID": "000000000000000000000001"
    }
  }
}
```

`templateID`, `subject`, and `senderName` must be complete at creation even though the result is a draft. There is no "save an incomplete draft now, finish later" path. **Template-first:** choose or create the email template first (`get_email_templates` / `post_email_templates`), then pass its ID. After creation you edit the design via `contentID` (Email Content API) — `templateID` itself cannot be changed via PATCH.

### Regular SMS

```json
{
  "name": "Example SMS announcement",
  "type": "regular",
  "channel": "sms",
  "content": {
    "sms": {
      "message": "New arrivals are available now.",
      "compliance": {
        "stopKeywordText": "Reply STOP to opt out",
        "unsubscribeLinkText": "Unsubscribe [[unsubscribe_link]]"
      },
      "isLinkShorteningEnabled": true
    }
  }
}
```

`stopKeywordText` must contain `STOP`; `unsubscribeLinkText` must contain the literal `[[unsubscribe_link]]`. Message + compliance text must fit 9 SMS segments.

### A/B email

```json
{
  "name": "Example subject line test",
  "type": "abTest",
  "channel": "email",
  "abTest": {
    "settings": { "testSizePercent": 30, "winningMetric": "openRate", "decisionTime": { "amount": 4, "unit": "h" } },
    "variants": {
      "a": { "content": { "email": { "subject": "See our latest arrivals", "templateID": "000000000000000000000001" } } },
      "b": { "content": { "email": { "subject": "New arrivals picked for you", "templateID": "000000000000000000000002" } } }
    }
  }
}
```

Both `a` and `b` required; each needs its own `subject` and `templateID`. Top-level `content` must be omitted. A/B is email-only. When `testSizePercent` is 100 (send-all mode), `winningMetric` and `decisionTime` may be omitted.

### Email booster (draft parent)

```json
{
  "type": "booster",
  "channel": "email",
  "boosterSettings": { "campaignID": "000000000000000000000010", "sendTo": "nonOpeners", "delay": { "amount": 48, "unit": "h" } }
}
```

Omit `sendingSettings` for a draft-parent booster. Inherits the parent's content; scheduled at `parent.sentAt + delay` once the parent sends.

### Email booster (sent parent)

```json
{
  "type": "booster",
  "channel": "email",
  "content": { "email": { "subject": "A reminder about our latest arrivals" } },
  "boosterSettings": { "campaignID": "000000000000000000000011", "sendTo": "nonOpeners" },
  "sendingSettings": { "strategy": "scheduled", "scheduledAt": "2026-09-05T10:00:00Z" }
}
```

Omit `boosterSettings.delay` for a sent parent; `scheduledAt` within 10 days. Still has to be sent with `post_campaigns_id_send`.

**Before creating a booster:** fetch the parent (`get_campaigns_id`) and check `type`/`channel`/`status`; list existing boosters with `get_campaigns?type=booster&parentCampaignID=<id>` — if one exists, do not create another (409 `booster-already-exists`); never `post_campaigns_id_copy` a booster (422); never delete an existing booster unless explicitly asked.

## Language

**Omit `language`** unless the user specified one — defaults to `en_US`. If specified, use an exact supported code (case-sensitive): `da_DK nl_NL en_US et_EE fi_FI fr_FR de_DE it_IT lv_LV lt_LT nn_NO pl_PL pt_BR pt_PT ru_RU be_BY sl_SL es_LA es_ES sv_SE`. Never guess or shorten (`en`, `en_us` are rejected).

## Sender and reply-to

**Omit both by default** — Omnisend uses the brand's configured campaign sender. Send them only when the user gives an exact address for this campaign; never invent one, infer it from the website domain, or copy one from another campaign. If a supplied address is rejected, report the validation error and ask. `422 sender-email-not-available` → the brand has no verified sender to fall back to: stop and ask the user (repeating cannot succeed).

## Audience & sending

- `audience.includedSegmentIDs` (empty/omitted = all subscribers), `audience.excludedSegmentIDs` (must not overlap).
- `sendingSettings`: `strategy` (`immediate` / `scheduled` / `personalized`), `scheduledAt` (future, ≤ 1 year), `isTZOptimizationEnabled`, `optimizeFor` (`opens`/`clicks`/`orders`, required for `personalized`). New campaigns are **draft** until `post_campaigns_id_send`.
- `personalized` = send time optimization (regular email only; cannot combine with TZ optimization). `scheduledAt` selects the STO **start date** in the brand timezone, not an exact time.

## Statuses

`draft` (editable) · `scheduled` · `started` · `paused` (often automated verification on a subset, ~60 min; also first send after 90+ days idle) · `sent` · `onHold` (failed content verification) · `error` · `canceled` · `stopped` / `expired`.

## Troubleshooting (fix the payload, make a NEW call — never retry unchanged)

- 400 missing `type`/`channel`/`content` · channel/content mismatch · `content.email.templateID: required` · SMS compliance · `language`.
- Sender/reply-to rejected (`sender_email`, `sender_email_incompatible_domain`, `reply_to_email_not_verified`) → report, ask; retry without the field only if you added it yourself.
- 409 booster errors (`booster-already-exists`, `invalid-parent-status`, `sending-settings-not-allowed`).
- 409 on later edit/send: only `draft` can be edited/sent — for a resend use `post_campaigns_id_copy` to clone into a new draft.

On **201**, preserve the response's top-level `id` as the campaign ID. Do **not** use `content.email.contentID` or `templateID` as the campaign ID.

## Text block markup (templates)

A `text` block's `text` is HTML for content only: wrap every line in `<p>` and set the look through `stylePresetID` (`heading_large`, `heading_medium`, `heading_small`, `paragraph`, `footnote`) or `styleProperties`. **Never emit `<h1>`–`<h6>`** — a headline is a `<p>` with `stylePresetID: heading_large`.
