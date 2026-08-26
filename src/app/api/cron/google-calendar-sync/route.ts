/**
 * Cron: Google Calendar Sync
 *
 * Periodic job that syncs RSVP status from Google Calendar for all users
 * with active Google connections, and retries meetings that failed to sync.
 *
 * Schedule: hourly (0 * * * *)
 * Lock: google_calendar_sync (TTL 5 min via acquire_sync_lock RPC)
 *
 * Story 42.12
 */

import { NextRequest, NextResponse } from "next/server"
import { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/api/cron-auth"
import {
  syncRsvpFromGoogle,
  syncMeetingToGoogle,
  importMeetingsFromGoogle,
  renewExpiringWatches,
} from "@/lib/services/google-calendar-sync.service"
import { GoogleTokenRevokedError } from "@/lib/services/google-auth.service"
import { logger } from "@/lib/logger"

const log = logger.child("GoogleCalendarCron")

export const maxDuration = 60
export const dynamic = "force-dynamic"

const LOCK_NAME = "google_calendar_sync"
const STALE_LOCK_MS = 5 * 60 * 1000 // 5 minutes
const MAX_DURATION_MS = 50_000 // 50s safety — stop before Vercel 60s timeout
const INTER_USER_DELAY_MS = 500 // 500ms between users
const RETRY_LOOKBACK_DAYS = 7

// ---------------------------------------------------------------------------
// Lock helpers (same pattern as sync-reports)
// ---------------------------------------------------------------------------

async function acquireLock(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("acquire_sync_lock", {
    p_lock_name: LOCK_NAME,
    p_stale_ms: STALE_LOCK_MS,
  })

  if (error) {
    log.error("Failed to acquire lock via RPC", { error: error.message })
    return false
  }

  return data === true
}

async function releaseLock(supabase: SupabaseClient): Promise<void> {
  await supabase
    .from("cron_locks")
    .update({
      is_running: false,
      finished_at: new Date().toISOString(),
    })
    .eq("lock_name", LOCK_NAME)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSyncResult {
  user_id: string
  org_id: string | null
  status: "ok" | "error" | "skipped"
  meetings_synced: number
  rsvp_updated: number
  error?: string
}

interface RetrySyncResult {
  meeting_id: string
  status: "ok" | "error"
  error?: string
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    // AC 42.12.1: Verify CRON_SECRET
    const authError = requireCronAuth(request)
    if (authError) return authError

    const supabase = createAdminClient()
    const startTime = Date.now()

    log.info("Starting google-calendar-sync cron")

    // AC 42.12.8: Lock/dedup
    const canRun = await acquireLock(supabase)
    if (!canRun) {
      // Dedup por design (execução anterior ainda rodando) — não é anomalia.
      // Como warn + 409, cada skip pintava âmbar no painel level:warn da
      // Vercel e parecia falha do cron.
      log.info("Lock active, skipping execution")
      return NextResponse.json({ skipped: true, reason: "lock_active" })
    }

    try {
      // AC 42.12.2: Fetch users with active Google Calendar connection
      const { data: activeTokens, error: tokensError } = await supabase
        .from("user_google_tokens")
        .select("user_id, user_type, org_id")
        .eq("is_active", true)

      if (tokensError) {
        log.error("Failed to fetch active tokens", { error: tokensError.message })
        return NextResponse.json(
          { error: "Failed to fetch active tokens" },
          { status: 500 }
        )
      }

      if (!activeTokens || activeTokens.length === 0) {
        log.info("No active Google Calendar connections, nothing to sync")
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        return NextResponse.json({
          users_processed: 0,
          meetings_synced: 0,
          rsvp_updated: 0,
          retries_attempted: 0,
          retries_succeeded: 0,
          errors: 0,
          duration_s: parseFloat(duration),
        })
      }

      log.info("Found active connections", { count: activeTokens.length })

      // -------------------------------------------------------------------
      // Phase 1: RSVP sync for each user (AC 42.12.3)
      // -------------------------------------------------------------------

      const userResults: UserSyncResult[] = []
      let totalMeetingsSynced = 0
      let totalRsvpUpdated = 0
      let totalErrors = 0

      for (const token of activeTokens) {
        // Timeout safety
        if (Date.now() - startTime > MAX_DURATION_MS) {
          log.warn("Timeout approaching, stopping user processing", {
            processed: userResults.length,
            remaining: activeTokens.length - userResults.length,
          })
          break
        }

        // Tokens da conta central (org) sao tratados na Fase 3 (import), nao
        // no RSVP-por-usuario.
        if (token.user_type === "org") continue

        const result: UserSyncResult = {
          user_id: token.user_id,
          org_id: token.org_id,
          status: "ok",
          meetings_synced: 0,
          rsvp_updated: 0,
        }

        try {
          const report = await syncRsvpFromGoogle(token.user_id)

          result.meetings_synced = report.synced_count
          result.rsvp_updated = report.details.reduce(
            (sum, d) => sum + d.updated_count,
            0
          )
          result.status = report.errors_count > 0 ? "error" : "ok"

          if (report.errors_count > 0) {
            const errorDetails = report.details
              .filter((d) => d.status === "error")
              .map((d) => d.error)
              .join("; ")
            result.error = errorDetails
            totalErrors += report.errors_count
          }

          totalMeetingsSynced += report.synced_count
          totalRsvpUpdated += result.rsvp_updated
        } catch (err) {
          // AC 42.12.4: If rate limited (429), skip user and continue
          if (err instanceof GoogleTokenRevokedError) {
            result.status = "skipped"
            result.error = "Token revoked"
            log.warn("Token revoked for user, skipping", {
              userId: token.user_id,
            })
          } else {
            result.status = "error"
            result.error = err instanceof Error ? err.message : String(err)
            totalErrors++
            log.error("Sync failed for user", {
              userId: token.user_id,
              error: result.error,
            })
          }
        }

        userResults.push(result)

        // AC 42.12.4: Rate limiting — delay between users
        if (activeTokens.indexOf(token) < activeTokens.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, INTER_USER_DELAY_MS))
        }
      }

      // -------------------------------------------------------------------
      // Phase 2: Retry failed meetings (AC 42.12.6)
      // -------------------------------------------------------------------

      const retryResults: RetrySyncResult[] = []
      let retriesSucceeded = 0

      // Only retry if we have time left
      if (Date.now() - startTime < MAX_DURATION_MS) {
        const lookbackDate = new Date(
          Date.now() - RETRY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
        ).toISOString()

        // Fetch meetings with sync errors (last 7 days, no google_event_id)
        const { data: failedMeetings, error: failedError } = await supabase
          .from("meetings")
          .select("id, user_id, title")
          .eq("google_sync_status", "error")
          .is("google_event_id", null)
          .gte("created_at", lookbackDate)
          .limit(20) // Cap retries to avoid timeout

        if (failedError) {
          log.warn("Failed to fetch error meetings for retry", {
            error: failedError.message,
          })
        } else if (failedMeetings && failedMeetings.length > 0) {
          log.info("Retrying failed meetings", { count: failedMeetings.length })

          for (const meeting of failedMeetings) {
            // Timeout safety
            if (Date.now() - startTime > MAX_DURATION_MS) {
              log.warn("Timeout approaching during retry phase, stopping")
              break
            }

            try {
              const syncResult = await syncMeetingToGoogle(
                meeting.id,
                meeting.user_id
              )

              if (syncResult.synced) {
                retryResults.push({ meeting_id: meeting.id, status: "ok" })
                retriesSucceeded++
                log.info("Retry succeeded", {
                  meetingId: meeting.id,
                  title: meeting.title,
                })
              } else {
                retryResults.push({
                  meeting_id: meeting.id,
                  status: "error",
                  error: syncResult.error || syncResult.reason,
                })
              }
            } catch (err) {
              if (err instanceof GoogleTokenRevokedError) {
                retryResults.push({
                  meeting_id: meeting.id,
                  status: "error",
                  error: "Token revoked",
                })
              } else {
                retryResults.push({
                  meeting_id: meeting.id,
                  status: "error",
                  error: err instanceof Error ? err.message : String(err),
                })
              }
            }

            // Delay between retries
            await new Promise((resolve) => setTimeout(resolve, INTER_USER_DELAY_MS))
          }
        }
      }

      // -------------------------------------------------------------------
      // Phase 3: Import bidirecional das contas centrais (Google -> admin)
      // -------------------------------------------------------------------

      let orgImported = 0
      let orgUpdated = 0

      if (Date.now() - startTime < MAX_DURATION_MS) {
        const orgTokens = activeTokens.filter((t) => t.user_type === "org")
        for (const token of orgTokens) {
          if (Date.now() - startTime > MAX_DURATION_MS) {
            log.warn("Timeout approaching during org import phase, stopping")
            break
          }
          if (!token.org_id) continue
          try {
            const res = await importMeetingsFromGoogle(token.org_id)
            orgImported += res.imported
            orgUpdated += res.updated
          } catch (err) {
            if (err instanceof GoogleTokenRevokedError) {
              log.warn("Org calendar token revoked, skipping import", { orgId: token.org_id })
            } else {
              totalErrors++
              log.error("Org import failed", {
                orgId: token.org_id,
                error: err instanceof Error ? err.message : String(err),
              })
            }
          }
          await new Promise((resolve) => setTimeout(resolve, INTER_USER_DELAY_MS))
        }
      }

      // -------------------------------------------------------------------
      // Phase 4: Renova watches de push perto de expirar (rede de seguranca)
      // -------------------------------------------------------------------
      let watchesRenewed = 0
      if (Date.now() - startTime < MAX_DURATION_MS) {
        try {
          watchesRenewed = await renewExpiringWatches()
        } catch (err) {
          log.warn("Falha ao renovar watches", {
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      // -------------------------------------------------------------------
      // AC 42.12.5: Log summary
      // -------------------------------------------------------------------

      const duration = ((Date.now() - startTime) / 1000).toFixed(1)

      log.info(
        `GoogleCalendarCron: completed. users=${userResults.length}, meetings_synced=${totalMeetingsSynced}, rsvp_updated=${totalRsvpUpdated}, retries=${retryResults.length}/${retriesSucceeded}, org_imported=${orgImported}, org_updated=${orgUpdated}, errors=${totalErrors}, duration=${duration}s`
      )

      return NextResponse.json({
        users_processed: userResults.length,
        meetings_synced: totalMeetingsSynced,
        rsvp_updated: totalRsvpUpdated,
        retries_attempted: retryResults.length,
        retries_succeeded: retriesSucceeded,
        org_imported: orgImported,
        org_updated: orgUpdated,
        watches_renewed: watchesRenewed,
        errors: totalErrors,
        duration_s: parseFloat(duration),
        user_details: userResults,
        retry_details: retryResults,
      })
    } finally {
      await releaseLock(supabase)
    }
  } catch (error) {
    log.error("Fatal error in google-calendar-sync cron", {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    )
  }
}
