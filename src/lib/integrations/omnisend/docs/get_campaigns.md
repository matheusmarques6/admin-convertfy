# get_campaigns — GET /api/campaigns

List campaigns with filtering, sorting, and cursor pagination. Default ordering is `createdAt` descending — **for newest-first send no parameters**. **Already have the ID?** `get_campaigns_id` (GET /api/campaigns/{id}).

## Query parameters (only these — anything else returns 400)

| Field | Description |
|-------|-------------|
| `nameContains` | Case-insensitive substring match on the name (max 200) |
| `status[]` | `error`, `onHold`, `sent`, `paused`, `started`, `stopped`, `expired`, `draft`, `scheduled`, `canceled` |
| `type` | `regular`, `booster`, `abTest` |
| `channel[]` | `email`, `sms`, `push` |
| `parentCampaignID` | Boosters/splits of the given parent |
| `createdAtFrom` / `createdAtTo` / `updatedAtFrom` / `updatedAtTo` | RFC 3339 |
| `sort` | `createdAt`, `updatedAt`, or `name` — single field |
| `direction` | `asc` / `desc` — **only valid together with `sort`** |
| `limit` | 1–250 |
| `after` / `before` | Opaque cursors; never both; cursor-only follow-up is preferred |

## Invalid patterns (400)

`sort=-createdAt`, `sort=createdAt:desc`, `sortBy`/`order`/`sortOrder`, `direction` without `sort`, multiple sort fields, `sentAt`/`scheduledAt` as sort (not supported — say so instead of substituting), `search` (use `nameContains`), `cursor` (use `after`/`before`), changing filters while reusing a cursor.

## Examples

```
GET /api/campaigns?nameContains=black%20friday
GET /api/campaigns?sort=updatedAt&direction=desc&limit=25
GET /api/campaigns?type=booster&parentCampaignID=000000000000000000000010
```

## IDs

Use each result's top-level `id` for lifecycle operations — not `content.email.contentID` or `templateID`.
