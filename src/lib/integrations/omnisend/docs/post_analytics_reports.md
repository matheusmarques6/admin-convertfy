# post_analytics_reports — POST /api/analytics/reports

Campaign and automation performance metrics **grouped by the date a message was SENT** — matches Omnisend in-app Reports. Use for: sent, open rate, click rate, revenue, unsubscribes, bounce rate per campaign/automation. For subscriber growth or event-date grouping use `post_analytics_statistics`.

**MIXING WARNING:** never combine attributed revenue from this API with total revenue from `post_analytics_statistics` in the same analysis — different grouping. Source both from the same API.

**Rate limits:** 10 requests/minute, 55 requests/day per brand. Plan queries (1–4 per request) accordingly.

## Request shape

```json
{
  "queries": [
    {
      "alias": "campaign-performance",
      "metrics": [ {"name": "sent"}, {"name": "openedUnique"}, {"name": "openRate"}, {"name": "clickedUnique"}, {"name": "clickRate"},
                   {"name": "attributedOrders"}, {"name": "attributedOrderRate"}, {"name": "attributedRevenue"}, {"name": "failRate"}, {"name": "unsubscribeRate"} ],
      "dimensions": [ {"name": "marketingActivityID"} ],
      "dateRange": { "interval": "last30Days" },
      "filters": [ { "name": "marketingActivityType", "operator": "in", "values": ["Campaign"] } ]
    }
  ]
}
```

Every query requires `alias` (unique, `^[a-zA-Z0-9 |_.-]+$`), `metrics` (≥ 1), `dateRange.interval`; `dimensions` and `filters` optional.

## Date range

`interval` ∈ `custom` (needs `from` + `to`, same tz offset on both, ≤ 12-month span, `from` ≥ 5 years ago) · `last7Days` · `last30Days` · `last90Days` · `thisWeek` · `lastWeek` · `thisMonth` · `lastMonth` · `thisYear` · `lastYear`. Named intervals resolve in the brand timezone. Year-over-year (> 12 months) = one request per ≤ 12-month window.

## Granularity by interval (`timestamp` dimension requires `granularity`)

`custom`: `hour` (≤ 7 days), `day` (≤ 60 days), `week` (≤ 52 weeks), `month` (≤ 12 months) — hard 400s, compute `to − from` first. `last7Days`/`thisWeek`/`lastWeek`: hour/day/week/month · `last30Days`/`thisMonth`/`lastMonth`: day/week/month · `last90Days`/`thisYear`/`lastYear`: week/month.

## Metrics (complete list)

Delivery: `sent failed failRate sentCost markedAsSpamUnique markedAsSpamRate unsubscribedUnique unsubscribeRate` · Engagement: `openedUnique opened openRate clickedUnique clicked clickRate` · Revenue: `attributedOrdersUnique attributedOrders attributedOrderRate attributedRevenue attributedRevenuePerOrder attributedRevenuePerSent` · Recipient sales (NOT store-wide): `totalOrders totalRevenue` (only `timestamp` dimension).

## Dimensions (the only 6, also the only valid filter names)

`timestamp` (needs `granularity`) · `marketingActivityID` (campaign/automation ID — resolve names via `get_campaigns`/`get_automations`) · `marketingActivityType` (`Campaign`, `Automation`) · `messageID` · `messageChannel` (`Email`, `SMS`, `Push`) · `segmentID` (breakdown only — never a filter). Max 2 non-timestamp dimensions. Filters: `{name, operator: in|notIn, values: [...]}`, AND between filters, max 100.

## Presentation

Do not dump the raw `reports` structure — summarize rows.

## post_analytics_statistics — POST /api/analytics/statistics (event date)

Same shape but **no `interval`** — `dateRange` is `{from, to}` only, `timestamp` dimension **required**, no rate metrics. Extra metrics: `totalOrders`/`totalRevenue` (**every order in the store**, timestamp only), `totalOrderedProductUnits`, `attributedOrderedProductUnits`, audience growth `subscribedEmail/Sms/Push`, `unsubscribedEmail/Sms/Push` (from 2024-08-01; dimensions `subscriptionMethod` / `unsubscribeReason` only). Extra dimensions: `marketingActivityName`, `messageTitle`, `messageFormat`, `senderDomain`, `emailDomain`, `phoneNumberCountry`, `bounceType`, `deliveryFailureReason`, `clientDeviceType`, `clientAppName`, `clientOperatingSystem`, `urlClicked`, `productID/Title/Sku/VariantID/VariantTitle`. Same 12-month span, 5-year lookback, granularity caps, and 10/min · 55/day limits. Use it for total store revenue, list growth, and "when did events happen" questions; tell the user the numbers will differ from the in-app Reports.
