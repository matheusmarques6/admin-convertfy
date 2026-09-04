# campaigns — Campaigns API overview

Endpoint `https://api.omnisend.com/api/campaigns`. Email and SMS campaigns: create, configure audience and content, send now or schedule.

## Status

`draft` (editable) · `scheduled` · `started` · `paused` (verification, ~60 min automated check) · `sent` · `canceled` · `onHold` (failed content verification) · `error` · `stopped` (A/B winner selection halted) · `expired`. **Only `draft` can be edited** — anything else returns 409.

## Types

`regular` · `abTest` (two variants to a test group, winner to the rest; email-only; content per variant under `abTest.variants.{a,b}.content.email`) · `booster` (re-send to non-openers/non-clickers of a parent).

## Channels

`email` · `sms` — single, immutable per campaign. Content lives under `content.<channel>`.

## Email content (creation)

`subject` (req, ≤ 250) · `senderName` (req) · `templateID` (req — an existing email template; content copied at creation; edit afterwards via `contentID` + Email Content API) · `senderEmail` / `replyToEmail` (omit — brand default; `422 sender-email-not-available` if none) · `preheader`.

## SMS content

`message` (req; ≤ 9 segments incl. compliance) · `compliance.stopKeywordText` (req, contains STOP) · `compliance.unsubscribeLinkText` (req, contains `[[unsubscribe_link]]`) · `imageID` (MMS to US/CA) · `isLinkShorteningEnabled`.

## Sending strategies

`immediate` · `scheduled` (`scheduledAt` future ≤ 1 year; optional `isTZOptimizationEnabled`) · `personalized` (STO — `optimizeFor` + `scheduledAt` as start date; regular email only; not combinable with TZ optimization). `sendingSettings` is **full object replacement** on update.

## Audience

`includedSegmentIDs` (empty = all subscribers) · `excludedSegmentIDs` (no overlap).

## Lifecycle actions

`POST /api/campaigns/{id}/send` · `/cancel` (scheduled/started/paused; best-effort for started) · `/copy` (draft copy "Copy of: …") · `/ab-test/stop` · `/ab-test/resume` · `/ab-test/winner`. Send returns 402 when the audience exceeds the billing tier.

## Boosters

`type: "booster"`, `boosterSettings.campaignID` = parent, `sendTo` (`nonOpeners`|`nonClickers`). Parent **sent** → set `sendingSettings` (≤ 10 days) and call `/send`; parent **draft** → set `boosterSettings.delay` (≤ 240 h) and the booster schedules itself at `parent.sentAt + delay`. One active booster per parent (409 on duplicate). Email boosters inherit parent content (override e.g. `subject`); SMS boosters need `content.sms`. List: `GET /api/campaigns?type=booster&parentCampaignID={id}`.

## A/B settings

`testSizePercent` (10–100) · `winningMetric` (`openRate`|`clickRate`) · `decisionTime` (`{amount, unit: h|d}`). At 100% ("send-all") winner fields are not required. Manual winner: `POST /api/campaigns/{id}/ab-test/winner` with the variant `id` (`abTest.variants.a.id` / `.b.id`). `abTest` is full replacement on update.

## UTM

`GET/PUT /api/campaigns/{id}/utm` — `source` (default `omnisend`), `medium` (channel), `campaign` (`campaign: <name> (<id>)`); PUT only on drafts; A/B uses `variants.a`/`variants.b`.
