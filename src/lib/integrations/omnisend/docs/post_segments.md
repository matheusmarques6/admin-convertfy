# post_segments — POST /api/segments

Create an audience segment. **Required:** `name` (≤ 256), `conditionGroups[]`. After create/update, segments rebuild when conditions change (`status: building` → `ready`). Limits: 10 condition groups per segment, 9 filters per condition.

## Structure

```
Segment
└── conditionGroups[]   ← OR between groups
    └── conditions[]    ← AND within group
        └── filters[]   ← matching rules; `junction` (and|or) combines the filters of ONE condition
```

## Entities

- `contact` — properties, tags, subscription, custom fields.
- `event` — behaviors (`has` / `hasNot`), counts, periods, nested property filters.

## Operators

`anyOf`, `noneOf` (lists, text) · `equals`, `notEquals` · `moreThan`, `lessThan`, `between` (`valueFrom`/`valueTo`) · `after`, `before`, `inTheLast`, `notInTheLast`, `anniversaryIsInTheNext` (dates; units `days|weeks|months|years`) · `contains`, `doesNotContains`, `startsWith`, `endsWith` · `exists`, `doesNotExist`.

## Contact filter properties

Text: `email phoneNumber firstName lastName gender country state city address postalCode lastDetectedCity lastDetectedCountry customerLifecycleStage` · List: **`tags`** (plural!), `consent` · Number: `averageOrderValue totalSpent` · Date: `dateAdded` · `subscriptionStatus` (with `channels: [email|sms|browserPush]`, value `subscribed|unsubscribed|nonSubscribed`) · `birthday` (`valueType` date|text) · `custom` (needs `name` + `valueType` text|number|bool|date).

## Event filter fields

`name` (e.g. `placed order`, `opened message`, `clicked message`, `viewed page`), `operator` (`has`|`hasNot`), `count` (`atLeast`|`equals`), `value` (integer), optional `origin` (`shopify`, `omnisend`… — needed only when the event exists under several origins), optional `period` (`{operator: inTheLast|notInTheLast, unit, value}` or `{operator: equals|before|after, value: "YYYY-MM-DD"}` or `{operator: between, valueFrom, valueTo}`), optional nested `filters[]` on the event payload (Shopify paths like `raw._total_price`, `raw.line_items.[].title`; API origin: `totalPrice`, `lineItems.[].productTitle`; `[]` = any element) with `junction`.

## Examples

Engaged subscribers (US/CA, subscribed to email, opened in last 7 days):

```json
{
  "name": "Engaged — 7d",
  "conditionGroups": [ { "conditions": [
    { "entity": "contact", "junction": "and", "filters": [
      { "operator": "anyOf", "property": "country", "value": ["US", "Canada"] },
      { "channels": ["email"], "operator": "equals", "property": "subscriptionStatus", "value": "subscribed" } ] },
    { "entity": "event", "junction": "and", "filters": [
      { "count": "atLeast", "name": "opened message", "operator": "has",
        "period": { "operator": "inTheLast", "unit": "days", "value": 7 }, "value": 1 } ] }
  ] } ]
}
```

Buyers of a product (Shopify, last 30 days):

```json
{
  "name": "Comprou Summer T-Shirt — 30d",
  "conditionGroups": [ { "conditions": [ { "entity": "event", "junction": "and", "filters": [
    { "count": "atLeast", "name": "placed order", "operator": "has", "origin": "shopify", "value": 1,
      "period": { "operator": "inTheLast", "unit": "days", "value": 30 },
      "filters": [ { "operator": "contains", "property": "raw.line_items.[].title", "value": ["Summer T-Shirt"], "valueType": "text" } ],
      "junction": "and" } ] } ] } ]
}
```

VIP tag OR high spenders (two groups = OR):

```json
{
  "name": "VIP ou alto ticket",
  "conditionGroups": [
    { "conditions": [ { "entity": "contact", "junction": "and", "filters": [ { "operator": "anyOf", "property": "tags", "value": ["vip"] } ] } ] },
    { "conditions": [ { "entity": "contact", "junction": "and", "filters": [ { "operator": "moreThan", "property": "totalSpent", "value": 500 } ] } ] }
  ]
}
```

Lifecycle stages: `customerLifecycleStage` `anyOf` `["champions", "loyalists", "highPotential", ...]`.

## Related

`get_segments` (GET /api/segments — `limit` 1–50, `sort` createdAt|name) · `get_segment_id` · `get_segments_segment_id_statistics` · `put_segment_id` (full replace) · `delete_segment_id`. Avoid update/delete while `building`.
