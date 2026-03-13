# QA Review: Epic 42 -- Google Calendar Integration Stories

**Reviewer:** Quinn (QA Agent)
**Date:** 2026-03-13
**Scope:** All 13 stories (42.1 - 42.13) + Epic index + PRD
**PRD:** `docs/prd/epic-41-google-calendar-integration.md`
**Discovery:** `docs/specs/google-calendar-integration-discovery.md`

---

## 1. QA Concern Traceability Matrix

| Concern | Severity | Target Story | Target AC | Status | Notes |
|---------|----------|-------------|-----------|--------|-------|
| C2 (OAuth CSRF nonce) | CRITICO | 42.3 | AC 42.3.2, AC 42.3.4 | PRESENT | Nonce generation and validation both specified |
| C3 (Token refresh interceptor) | CRITICO | 42.2 | AC 42.2.4 | PRESENT | 401 -> refresh -> retry pattern described |
| C4 (requestId UUID) | CRITICO | 42.4 | AC 42.4.3 | PRESENT | `crypto.randomUUID()` specified, line numbers referenced |
| C5 (RLS auth.uid not is_admin) | CRITICO | 42.1 | AC 42.1.4 | PRESENT | Explicit policy SQL provided |
| C6 (Missing refresh_token on reconnect) | MEDIO | 42.2 AC7 + 42.3 AC6 | AC 42.2.7, AC 42.3.6 | PRESENT | Both detection and prevention covered |
| C7 (deleteEvent fetchWithRetry) | MEDIO | 42.4 | AC 42.4.8 | PRESENT | Fix to use `this.request()` specified |
| C8 (Timezone from browser) | MEDIO | 42.5/42.6 | AC 42.4.11, AC 42.6.6 | PRESENT | Browser timezone in UI, field sent to Google |
| C9 (Unique constraint google_event_id) | MEDIO | 42.1 | AC 42.1.6 | PRESENT | Partial unique index SQL provided |
| C10 (Portal RSVP endpoint proprio) | MEDIO | 42.9 | AC 42.9.1 | PRESENT | `/api/portal/meetings/[id]/rsvp` specified |
| R3 (sendUpdates: "all") | RECOM | 42.4 | AC 42.4.4 | PRESENT | In both create and update |
| R5 (meeting_url + meeting_url_source) | RECOM | 42.4 | AC 42.4.5 | PRESENT | No separate `google_meet_link` column |
| R6 (Index google_sync_status) | RECOM | 42.1 + 42.12 | AC 42.1.7, AC 42.12.6 | PRESENT | Index creation + retry queries |
| R8 (No google_event_id in participants) | RECOM | 42.1 | AC 42.1.3 | PRESENT | Explicit "NAO criar" instruction |

**Traceability verdict: 13/13 concerns properly traced -- ALL PRESENT.**

---

## 2. Issues Found

### BLOCKER

*None.*

### HIGH

**H1. Story 42.5: C8 timezone not in story ACs**

Story 42.5 integrates sync into the meetings CRUD. The POST body should accept `timezone` from the frontend and pass it to `syncMeetingToGoogle`. However, no AC in 42.5 mentions receiving `timezone` from the request body or storing it on the meeting row. The PRD assigns C8 to 42.4 (AC11) and 42.6 (AC6), but 42.5 is the glue that connects them -- the POST handler needs to actually persist `body.timezone` into the `meetings` row.

**Recommendation:** Add an AC to 42.5 or extend AC 42.5.1: "POST body accepts optional `timezone` field (default: 'America/Sao_Paulo'). Persist to `meetings.timezone` on insert."

**H2. Story 42.4: `createEventWithMeet` does not pass `sendUpdates: "all"`**

The existing `createEventWithMeet` (line 181) calls `this.createEvent(eventWithConference, { conferenceDataVersion: 1 })` WITHOUT `sendUpdates: "all"`. The story says the sync service should use `sendUpdates: "all"` (AC 42.4.4), but the fix should be in the GoogleCalendarService itself (or explicitly in the sync service wrapper). Currently the story's technical notes only fix `requestId` and `deleteEvent` in `google-calendar.ts` but do NOT mention fixing `createEventWithMeet` to include `sendUpdates`.

**Recommendation:** Add explicit instruction in 42.4 to also fix `createEventWithMeet` to pass `sendUpdates: "all"` in the options, or have the sync service call `createEvent` directly (not `createEventWithMeet`) with both `conferenceDataVersion: 1` and `sendUpdates: "all"`.

**H3. Story 42.6: MeetingDialog file path incorrect**

Story 42.6 File List says `src/components/meetings/meeting-dialog.tsx` -- this file does NOT exist. The actual MeetingDialog lives at `src/components/board/meeting-dialog.tsx`. If the dev follows the story's file list literally, they will create a duplicate component.

**Recommendation:** Fix File List in 42.6 to reference `src/components/board/meeting-dialog.tsx`.

**H4. Story 42.1: RLS `auth.uid() = user_id` will not work for portal users**

The `user_id` column stores either `profiles.id` or `client_portal_users.id`. For admin users (`user_type = 'profile'`), `auth.uid()` matches `profiles.id` (which is `auth.users.id`). But for portal users (`user_type = 'portal_user'`), `client_portal_users.id` is a separate UUID -- it is NOT `auth.uid()`. This means portal users will NEVER be able to SELECT their own tokens via RLS.

The `service_role` bypass covers cron/backend, and the code uses `createAdminClient()` for writes (AC 42.2.2 notes). But any future client-side reads for portal users will fail silently.

**Recommendation:** Document this limitation explicitly in 42.1 AC4: "RLS SELECT `auth.uid() = user_id` applies to admin users only. Portal user token access is always via `createAdminClient()`. Consider adding a separate RLS policy for portal users using `auth.uid()` matched against `client_portal_users.auth_user_id` if direct client access is ever needed."

### MEDIUM

**M1. Story 42.3: `org_id` lookup for portal users is not addressed**

AC 42.3.2 shows the state includes `org_id: orgMember.org_id` fetched from `org_members`. But portal users are NOT in `org_members` -- they are in `client_portal_users`. The technical notes only show the `org_members` query. There is no fallback for `context=portal`.

**Recommendation:** Add to AC 42.3.2 or a new AC: "When `context=portal`, resolve `org_id` via `client_portal_users.client_id -> clients.org_id`."

**M2. Story 42.8: Migration date collision**

Story 42.8 creates `supabase/migrations/20260313_google_calendar_settings.sql` with the same date prefix `20260313` as story 42.1's migration `20260313_google_calendar_integration.sql`. Supabase orders migrations alphabetically, so this would work (the settings migration comes after integration alphabetically), but it is fragile and confusing.

**Recommendation:** Use a different date for 42.8's migration or a sequence number: `20260313b_google_calendar_settings.sql` or add the column to the 42.1 migration since 42.8 depends on 42.7 which depends on 42.3 which depends on 42.1.

**M3. Story 42.5: PUT route fetch of existing meeting is too narrow**

The current PUT handler (line 131-136) only fetches `SELECT "id"` from the existing meeting. Story 42.5 needs `google_event_id`, `user_id`, and `scheduled_at` from the existing meeting to decide whether to create vs update and to detect rescheduling. The story's technical notes reference `existingMeeting.google_event_id` and `existingMeeting.user_id` but the code only selects `id`.

**Recommendation:** Add to AC 42.5.2 or technical notes: "Expand existing meeting SELECT to include `google_event_id, user_id, scheduled_at` for sync decision logic."

**M4. Story 42.9: How to find the portal user's participant record is ambiguous**

AC 42.9.3 says "Busca participant pelo `participant_id` (portal_user.id ou user_id mapeado) e `meeting_id`". But `meeting_participants.participant_type` for portal users could be `'profile'` or `'org_member'` -- neither of which maps to `portal_user`. The portal user's `participant_id` in `meeting_participants` is likely their email or a mapped profile ID. This needs clarification.

**Recommendation:** Add guidance on how portal client participants are identified in `meeting_participants`. Are they added by email? By a profile ID? This affects the join logic.

**M5. Story 42.12: No lock/dedup mechanism for cron**

The cron endpoint has no protection against concurrent execution (e.g., if the previous run hasn't finished when the next hourly trigger fires). The project already has a cron lock pattern (story 33.5 addressed this for Klaviyo sync).

**Recommendation:** Add an AC to 42.12: "Use `sync_status` lock pattern or similar dedup to prevent concurrent cron executions."

**M6. Story 42.4: `deleteEvent` void response will break `this.request()`**

The story notes this risk but does not have a clear AC for the fix. `this.request()` calls `response.json()` which will fail on a 204 No Content (DELETE returns 204). The fix needs to be in `GoogleCalendarService.request()` to handle void responses.

**Recommendation:** Add an AC to 42.4: "Modify `GoogleCalendarService.request()` to handle 204 No Content responses (do not call `response.json()` when status is 204)."

### LOW

**L1. Epic index references PRD as "Epic 41" in the note section**

The epic index has a note explaining the renumber from 41 to 42, which is good. But the actual stories still reference "PRD Epic 41" in their Change Log. This is cosmetic but could confuse.

**L2. Story 42.6: Missing `meeting-dialog.tsx` in meetings components**

There is no `src/components/meetings/meeting-dialog.tsx`. The dialog is at `src/components/board/meeting-dialog.tsx`. Story 42.6 references "MeetingDialog" but the component name in the codebase might be different. Dev should verify the actual export name.

**L3. Story 42.11: `syncRsvpFromGoogle` queries by `user_id` but meetings are created by any org member**

The function filters `meetings.user_id = organizerUserId`. This is correct for meetings created by that user, but if a different admin created the meeting and this user is a participant, their RSVP won't be synced. This is acceptable for MVP since the sync iterates all connected users.

**L4. Story 42.10: Missing `PortalMeeting` type update details**

AC 42.10.5 says to add `meeting_url_source` and `participants` to `PortalMeeting`, but `PortalMeeting` currently has camelCase fields (`scheduledAt`, `meetingUrl`) while the DB uses snake_case. The new fields should follow the existing convention (`meetingUrlSource`, not `meeting_url_source`).

**L5. Story 42.5: No mention of `google_meet` checkbox in POST body**

Story 42.6 AC6 adds a checkbox "Criar Google Meet automaticamente" to MeetingDialog, but story 42.5 POST handler does not mention receiving a `create_meet` boolean from the body. The sync service needs to know whether to create Meet or not.

**Recommendation:** Add to 42.5 AC1: "POST body accepts optional `create_meet: boolean` (default true if user has Calendar connected). Pass to `syncMeetingToGoogle` options."

---

## 3. Consistency Check

### Dependency Graph Validation

| Story | Declared Deps | Correct? | Notes |
|-------|--------------|----------|-------|
| 42.1 | None | OK | First story |
| 42.2 | 42.1 | OK | Needs table |
| 42.3 | 42.1, 42.2 | OK | Needs table + saveTokens |
| 42.4 | 42.2, 42.3 | OK | Needs auth service + tokens in new table |
| 42.5 | 42.4 | OK | Needs sync service |
| 42.6 | 42.5 | OK | Needs status populated |
| 42.7 | 42.3 | OK | Needs authorize route with scope=calendar |
| 42.8 | 42.7 | OK | Needs connect UI to exist |
| 42.9 | 42.5 | OK | Needs sync service for propagation |
| 42.10 | 42.6 | OK | Needs types with meeting_url_source |
| 42.11 | 42.4 | OK | Needs sync service base |
| 42.12 | 42.11 | OK | Needs syncRsvpFromGoogle |
| 42.13 | 42.11 | OK | Needs google_rsvp_status populated |

**Dependency graph is consistent. No cycles. No orphans.**

### PRD Coverage Gaps

| PRD Requirement | Covered by Story | Gap? |
|----------------|-----------------|------|
| RF01 (Connection per-user) | 42.1, 42.2, 42.3 | No |
| RF02 (OAuth secure) | 42.3 | No |
| RF03 (Token refresh) | 42.2 | No |
| RF04 (Create event + Meet) | 42.4, 42.5 | No |
| RF05 (Edit event) | 42.4, 42.5 | No |
| RF06 (Delete event) | 42.4, 42.5 | No |
| RF07 (Timezone) | 42.4, 42.6 | Minor: 42.5 missing tz handling |
| RF08 (Portal RSVP) | 42.9 | No |
| RF09 (Reverse sync) | 42.11 | No |
| RF10 (Retry with error) | 42.12 | No |
| RNF01 (Security) | 42.1, 42.2, 42.3 | No |
| RNF02 (Performance) | 42.5, 42.12 | No |
| RNF03 (Resilience) | 42.2, 42.4, 42.5 | No |
| RNF04 (Observability) | 42.6, 42.13 | No |

**No coverage gaps found. All PRD requirements mapped to stories.**

### Overlap Check

No significant overlap detected. Each story has a clear responsibility boundary:
- 42.4 owns the sync logic, 42.5 owns the route integration
- 42.6 owns admin UI, 42.10 owns portal UI
- 42.11 owns reverse sync logic, 42.12 owns the cron wrapper, 42.13 owns RSVP display

---

## 4. Code Validation

### Files Referenced vs Actual Codebase

| Story | File Referenced | Exists? | Notes |
|-------|----------------|---------|-------|
| 42.1 | `supabase/migrations/20260313_google_calendar_integration.sql` | TO CREATE | OK |
| 42.2 | `src/lib/services/google-auth.service.ts` | TO CREATE | OK |
| 42.3 | `src/app/api/integrations/google/authorize/route.ts` | EXISTS | Confirmed code matches story's "before" |
| 42.3 | `src/app/api/integrations/google/callback/route.ts` | EXISTS | Confirmed code matches story's "before" |
| 42.4 | `src/lib/integrations/google-calendar.ts` | EXISTS | `requestId` line 175 uses `Date.now()` -- CONFIRMED |
| 42.4 | `src/lib/integrations/google-calendar.ts` | EXISTS | `deleteEvent` line 134 uses raw `fetch` -- CONFIRMED |
| 42.5 | `src/app/api/meetings/route.ts` | EXISTS | POST handler confirmed |
| 42.5 | `src/app/api/meetings/[id]/route.ts` | EXISTS | PUT/DELETE handlers confirmed |
| 42.6 | `src/types/meeting.ts` | EXISTS | Types confirmed, need new fields |
| 42.6 | `src/components/meetings/meetings-page-client.tsx` | EXISTS | Confirmed |
| 42.6 | `src/components/meetings/meeting-dialog.tsx` | DOES NOT EXIST | **H3 -- actual path: `src/components/board/meeting-dialog.tsx`** |
| 42.7 | `src/components/settings/google-calendar-card.tsx` | TO CREATE | OK |
| 42.9 | `src/app/client/dashboard/meetings-section.tsx` | EXISTS | Confirmed |
| 42.9 | `src/app/client/dashboard/types.ts` | EXISTS | `PortalMeeting` type confirmed |
| 42.10 | `src/app/client/dashboard/next-meeting-card.tsx` | EXISTS | Confirmed |
| 42.12 | `vercel.json` | EXISTS | Confirmed |
| 42.13 | `src/components/meetings/participant-rsvp-status.tsx` | TO CREATE | OK |

### Premise Validation

| Premise | Valid? | Notes |
|---------|--------|-------|
| `google_event_id` already exists on meetings | YES | `supabase/migrations/00001_initial_schema.sql` line 119 |
| `GoogleCalendarService` has `getCalendarList()` | YES | Line 60 |
| `GoogleCalendarService` has `getEvent()` | YES | Line 97 |
| `fetchWithRetry` imported and available | YES | `src/lib/utils/retry.ts` exists |
| `@/lib/crypto` with encrypt/decrypt | YES | `src/lib/crypto.ts` exists |
| `getPortalUser()` in portal auth | YES | `src/lib/portal/auth.ts` exists |
| OAuth callback saves to `client_stores` | YES | Callback line 96-108 confirmed |
| State uses `timestamp` but no nonce | YES | Authorize line 41-48 confirmed -- no `crypto.randomUUID()` |
| `prompt: 'consent'` already in authorize | YES | Line 59 confirmed |
| `createEventWithMeet` uses `Date.now()` for requestId | YES | Line 175 confirmed |
| `deleteEvent` uses raw `fetch` | YES | Line 134 confirmed |

---

## 5. Quality Assessment per Story

| Story | ACs Testable? | Tasks Granular? | Effort Reasonable? | Score |
|-------|---------------|-----------------|-------------------|-------|
| 42.1 | YES -- SQL verifiable | YES | LOW -- correct | 9/10 |
| 42.2 | YES -- function signatures + behavior | YES | MEDIUM -- correct | 9/10 |
| 42.3 | YES -- specific code changes | YES | MEDIUM -- correct | 8/10 |
| 42.4 | YES -- detailed behavior | YES | HIGH -- correct | 8/10 |
| 42.5 | YES -- route behavior | YES | MEDIUM -- correct | 7/10 |
| 42.6 | YES -- UI elements described | YES | LOW -- correct | 7/10 |
| 42.7 | YES -- endpoints + UI | YES | MEDIUM -- correct | 9/10 |
| 42.8 | YES -- migration + endpoints | YES | LOW -- correct | 8/10 |
| 42.9 | YES -- endpoint + validation | YES | MEDIUM -- correct | 8/10 |
| 42.10 | YES -- UI elements | YES | LOW -- correct | 8/10 |
| 42.11 | YES -- sync behavior | YES | HIGH -- correct | 8/10 |
| 42.12 | YES -- cron + stats | YES | MEDIUM -- correct | 7/10 |
| 42.13 | YES -- UI components | YES | LOW -- correct | 9/10 |

---

## 6. Recommendations Summary

### Must-fix before dev starts (HIGH):

1. **H1** -- Add `timezone` field handling to 42.5 POST/PUT ACs
2. **H2** -- Clarify `sendUpdates: "all"` fix location in 42.4 (createEventWithMeet or sync wrapper)
3. **H3** -- Fix MeetingDialog file path in 42.6 File List: `src/components/board/meeting-dialog.tsx`
4. **H4** -- Document RLS limitation for portal users in 42.1 AC4

### Should-fix (MEDIUM):

5. **M1** -- Add org_id lookup for portal users in 42.3
6. **M2** -- Fix migration date collision in 42.8
7. **M3** -- Expand existing meeting SELECT in 42.5 PUT handler
8. **M4** -- Clarify portal user participant matching in 42.9
9. **M5** -- Add cron lock/dedup in 42.12
10. **M6** -- Handle 204 No Content in `this.request()` for deleteEvent

### Nice-to-have (LOW):

11. **L4** -- Follow camelCase convention in PortalMeeting type updates
12. **L5** -- Add `create_meet` boolean to 42.5 POST body handling

---

## 7. Gate Decision

### PASS WITH CONCERNS

**Rationale:**

The 13 stories as a set provide excellent coverage of the PRD requirements. All 13 QA concerns (C2-C10, R3, R5, R6, R8) are properly traced to specific ACs in the correct stories. The dependency graph is consistent and acyclic. Effort estimates are reasonable. ACs are specific and testable with Given-When-Then patterns implicit in the descriptions.

The 4 HIGH issues are real but addressable with minor story edits -- none require architectural rethinking. The MEDIUM issues are defensive improvements that reduce implementation risk.

**Conditions for PASS:**
- [ ] Fix H1-H4 before dev starts on the affected stories
- [ ] Address M1-M6 before or during implementation
- [ ] Dev should validate H4 (portal user RLS) early in 42.1 implementation

**Overall quality:** Stories are among the best-structured I have reviewed in this project. Clear context sections, explicit code references with line numbers, and consistent formatting across all 13 stories.

---

-- Quinn, guardiao da qualidade
