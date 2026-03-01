/**
 * Post-deployment validation for Epic 8 revenue cache.
 *
 * Checks:
 * 1. store_revenue_summary table exists and has rows
 * 2. All stores with Klaviyo have revenue summary entries
 * 3. Revenue numbers are non-zero for stores that had data before
 * 4. All 4 period labels are populated (7d, 15d, 30d, 90d) -- or at least 30d after seed
 * 5. No expired rows (expires_at > NOW())
 * 6. sync_status distribution (how many ok vs error vs pending)
 * 7. org_id consistency (all rows match their store's org_id)
 *
 * Usage: node scripts/validate-revenue-deployment.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

async function main() {
  console.log("=== Epic 8 Revenue Deployment Validation ===\n")
  let passed = 0
  let failed = 0

  // ── Check 1: Table exists and has rows ──────────────────────────
  const { data: rows, error } = await supabase
    .from("store_revenue_summary")
    .select(
      "store_id, period_label, sync_status, klaviyo_total_revenue, expires_at, org_id, fetched_at"
    )

  if (error) {
    console.error(
      "FAIL: store_revenue_summary not accessible:",
      error.message
    )
    process.exit(1)
  }

  console.log(`[PASS] Table exists: ${rows.length} rows found`)
  passed++

  if (rows.length === 0) {
    console.error("[FAIL] Table is empty -- seed SQL or cron hasn't run")
    failed++
  } else {
    passed++
  }

  // ── Check 2: Period distribution ────────────────────────────────
  const periodCounts = {}
  for (const r of rows) {
    periodCounts[r.period_label] = (periodCounts[r.period_label] || 0) + 1
  }
  console.log("\nPeriod distribution:")
  for (const [period, count] of Object.entries(periodCounts)) {
    console.log(`  ${period}: ${count} stores`)
  }

  if (periodCounts["30d"]) {
    console.log("[PASS] 30d period has data")
    passed++
  } else {
    console.error("[FAIL] 30d period has no data")
    failed++
  }

  const allFourPeriods = ["7d", "15d", "30d", "90d"].every(
    (p) => periodCounts[p] > 0
  )
  if (allFourPeriods) {
    console.log("[PASS] All 4 periods (7d, 15d, 30d, 90d) have data")
    passed++
  } else {
    const missing = ["7d", "15d", "30d", "90d"].filter(
      (p) => !periodCounts[p]
    )
    console.log(`[WARN] Missing periods: ${missing.join(", ")}`)
    // Not a hard fail -- seed only populates 30d
  }

  // ── Check 3: Sync status distribution ───────────────────────────
  const statusCounts = {}
  for (const r of rows) {
    statusCounts[r.sync_status] = (statusCounts[r.sync_status] || 0) + 1
  }
  console.log("\nSync status distribution:")
  for (const [status, count] of Object.entries(statusCounts)) {
    const icon =
      status === "ok" ? "[OK]" : status === "error" ? "[ERR]" : "[..]"
    console.log(`  ${icon} ${status}: ${count}`)
  }

  if (statusCounts["ok"] > 0) {
    console.log("[PASS] At least some rows synced successfully")
    passed++
  } else {
    console.error("[FAIL] No rows with sync_status = ok")
    failed++
  }

  // ── Check 4: Stores with Klaviyo but no summary ─────────────────
  const { data: klaviyoStores } = await supabase
    .from("client_stores")
    .select("id, store_name, org_id")
    .not("klaviyo_private_key", "is", null)

  const summaryStoreIds = new Set(
    rows.filter((r) => r.period_label === "30d").map((r) => r.store_id)
  )
  const missingStores = (klaviyoStores || []).filter(
    (s) => !summaryStoreIds.has(s.id)
  )

  if (missingStores.length === 0) {
    console.log(
      `\n[PASS] All ${klaviyoStores?.length || 0} Klaviyo stores have 30d summary`
    )
    passed++
  } else {
    console.log(
      `\n[WARN] ${missingStores.length} stores with Klaviyo but no 30d summary:`
    )
    for (const s of missingStores.slice(0, 5)) {
      console.log(`  - ${s.store_name} (${s.id})`)
    }
    if (missingStores.length > 5)
      console.log(`  ... and ${missingStores.length - 5} more`)
    failed++
  }

  // ── Check 5: Expired rows ──────────────────────────────────────
  const now = new Date().toISOString()
  const expiredRows = rows.filter((r) => r.expires_at && r.expires_at < now)
  if (expiredRows.length === 0) {
    console.log(`\n[PASS] No expired rows`)
    passed++
  } else {
    console.log(
      `\n[WARN] ${expiredRows.length} expired rows (invisible to endpoints)`
    )
    failed++
  }

  // ── Check 6: Revenue sanity ────────────────────────────────────
  const withRevenue = rows.filter(
    (r) => Number(r.klaviyo_total_revenue) > 0
  )
  console.log(
    `\n${withRevenue.length} of ${rows.length} rows have revenue > R$0`
  )

  if (withRevenue.length > 0) {
    const totalRevenue = withRevenue.reduce(
      (sum, r) => sum + Number(r.klaviyo_total_revenue),
      0
    )
    console.log(`Total cached revenue: R$${totalRevenue.toFixed(2)}`)
    console.log("[PASS] Revenue data present")
    passed++
  } else {
    console.log("[WARN] No rows with revenue > 0")
  }

  // ── Check 7: org_id consistency ────────────────────────────────
  const storeOrgMap = new Map(
    (klaviyoStores || []).map((s) => [s.id, s.org_id])
  )
  const inconsistent = rows.filter(
    (r) =>
      storeOrgMap.get(r.store_id) &&
      storeOrgMap.get(r.store_id) !== r.org_id
  )
  if (inconsistent.length === 0) {
    console.log(`\n[PASS] org_id consistency: all rows match their store`)
    passed++
  } else {
    console.error(
      `\n[FAIL] ${inconsistent.length} rows have mismatched org_id`
    )
    for (const r of inconsistent.slice(0, 3)) {
      console.error(
        `  store_id=${r.store_id} summary.org_id=${r.org_id} store.org_id=${storeOrgMap.get(r.store_id)}`
      )
    }
    failed++
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(50)}`)
  console.log(`Result: ${passed} passed, ${failed} failed`)
  console.log(
    `=== ${failed === 0 ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} ===`
  )

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
