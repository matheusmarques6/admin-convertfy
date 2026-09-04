# post_automations — POST /api/automations

Create an automation workflow. Required: `name`, `trigger`, `blocks` (≥ 1). Created workflows are disabled until `post_automations_id_enable` (POST /api/automations/{id}/enable).

## Content requirements (read before creating)

Some automation types only work when the email template they send contains a specific section/blocks (abandonment → `product_cart_recovery` section; order confirmation → `orderSummary` + `orderProducts` + `orderTotal` blocks; back in stock → `product_back_in_stock`; cross-sell/follow-up → `product_recommender`). Consult the reference topic **`automation_content`** (`omnisend_doc("automation_content")`), identify the type from the trigger, and make sure the template referenced by the **first/primary** send-email action (`templateID`) satisfies the rule — create/update the template first (`post_email_templates` / `put_email_templates_id`). Any email that offers a discount must use a `discount` block, never text naming a code.

## trigger (required)

```json
"trigger": {
  "condition": { "event": "started checkout", "origin": "shopify", "filterGroups": [] },
  "inactivitySettings": { "duration": { "amount": 1, "units": "h" } },
  "audienceFilterGroup": { "logicalOperator": "and", "filters": [ { "field": "segmentID", "operator": "eq", "value": "000000000000000000000001" } ] }
}
```

- `condition.event` — event system name (`placed order`, `started checkout`, `added product to cart`, `viewed product`, `subscribed to marketing`, `order fulfilled`, `order canceled`, `ordered product`, `entered segment`…) plus built-ins `birthday`, `product back in stock` (Shopify/BigCommerce/WooCommerce only). Look up names/origins/property paths with `post_event_metadata_query` (POST /api/event-metadata/query).
- `condition.origin` — required when the event exists under several origins (`shopify`, `omnisend`, `api`); omit for built-ins and for `subscribed to marketing`.
- `condition.filterGroups[]` — AND between groups; each `{ logicalOperator: and|or, filters: [{ field, operator, value }] }`. Operators: `eq neq gt gte lt lte contains notContains startsWith endsWith exists notExists in notIn`. **`value` JSON type must match the property type** (number for `total_price` — `"50"` as string returns 400).
- `inactivitySettings.duration` — fire only after the contact goes quiet: abandoned cart 30m after `added product to cart`, abandoned checkout 1h after `started checkout`, browse abandonment 30m after `viewed product`, win-back 7d.
- `audienceFilterGroup` — who may enter after the trigger fires. Fields: `segmentID`, `tag` (`eq`/`neq`); `dateAdded` (`eq neq gt lt`, YYYY-MM-DD); `firstName lastName country state city postalCode` (`eq neq contains notContains`); `gender` (`eq`, `m`/`f`). To trigger on segment entry use event `entered segment` with `origin: "omnisend"` and filter `segment_id`.

## blocks (required, ≥ 1)

Each block: `temporaryID` (unique in request), `type` ∈ `action | delay | split | abTesting`, plus exactly one matching object.

- **action** — `{ type: sendEmail|sendSms|sendPush|sendWebhook|addTag|removeTag, <type>: {...} }`. The config **must** be nested under a key equal to `type`.
  - `sendEmail` required: `templateID`, `subject`, `preheader`, `senderName`, `language` (`xx_XX`, e.g. `pt_BR`). Optional `senderEmail` (omit unless verified), `replyToEmail`, `isSkipAllowed`.
  - `sendSms` required: `message`, `compliance` (`stopKeywordText`, `unsubscribeLinkText` with `[[unsubscribe_link]]`).
  - `addTag`/`removeTag`: `{ value }` (lowercased).
  - `sendWebhook`: `callbackUrl` (HTTPS), `body`, `headers[]`.
- **delay** — `{ mode: duration|immediate|specificTime, duration: { amount, units: m|h|d|w|M }, time: "HH:MM", allowedWeekdays: [] }`. **A delay cannot be the last block** of a sequence (400).
- **split** — `{ filterGroup: { logicalOperator, filters: [{ type: event|contact|message, field, operator, value, urlMatch? }] }, trueBlocks: [], falseBlocks: [] }`. `message` filters: field `"blockID"`, operators `openedEmail clickedEmail clickedSms openedPush clickedPush`, value = ID/temporaryID of a message block above. Blocks after a split are shared by both branches.
- **abTesting** — `{ aBlocksPercentage, aBlocks: [], bBlocks: [] }`.

## exitConditions (optional)

`[{ event, origin?, filterGroup? }]` — OR logic; contact is removed immediately when any fires. Built-in events not allowed.

## settings (optional)

`frequencyLimiter` (`{ mode: once }` or `{ mode: interval, duration: { amount, units: h|d|w } }`), `overlapLimiter` (`{ mode: currentlyIn|recentlyIn, automationIDs: [], withinDays? }`), `sendingThresholds` (`{ email, sms }` ∈ `subscribed|nonSubscribed|all` — keep `sms: subscribed`).

## Example — abandoned checkout

```json
{
  "name": "Abandoned checkout",
  "trigger": {
    "condition": { "event": "started checkout", "origin": "shopify" },
    "inactivitySettings": { "duration": { "amount": 1, "units": "h" } }
  },
  "exitConditions": [ { "event": "placed order", "origin": "shopify" } ],
  "blocks": [
    { "temporaryID": "b1", "type": "action", "action": { "type": "sendEmail", "sendEmail": {
      "templateID": "000000000000000000000001", "subject": "Esqueceu algo?", "preheader": "Seu carrinho está esperando",
      "senderName": "Loja", "language": "pt_BR" } } },
    { "temporaryID": "b2", "type": "delay", "delay": { "mode": "duration", "duration": { "amount": 1, "units": "d" } } },
    { "temporaryID": "b3", "type": "action", "action": { "type": "sendEmail", "sendEmail": {
      "templateID": "000000000000000000000002", "subject": "Última chance", "preheader": "10% off hoje",
      "senderName": "Loja", "language": "pt_BR" } } }
  ],
  "settings": { "frequencyLimiter": { "mode": "interval", "duration": { "amount": 7, "units": "d" } } }
}
```

## Related

`get_automations` (GET /api/automations — filters `nameContains`, `isEnabled`, `updatedAtFrom`, `sort` createdAt|updatedAt) · `get_automations_id` · `patch_automations_id` (partial: updates existing blocks by `id`, cannot add/remove blocks; `delay` replaced whole; branches not changeable) · `put_automations_id_blocks` (replace the whole block list) · `post_automations_id_enable` / `_disable` / `_copy` · `post_automations_id_blocks_block_id_test_email`.

Text blocks in templates: wrap lines in `<p>`, set look via `stylePresetID`; never emit `<h1>`–`<h6>`.
