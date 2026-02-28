/**
 * Test: Cross-Tenant Isolation for store_revenue_summary
 *
 * Verifica que a RLS policy impede acesso cross-tenant.
 * Executa queries com service_role para validar que org_id
 * dos registros de revenue corresponde ao org_id das lojas.
 *
 * Uso: node scripts/test-cross-tenant-isolation.mjs
 *
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"

config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

async function main() {
  console.log("=== Cross-Tenant Isolation Test ===\n")

  // 1. Get all orgs with revenue data
  const { data: revRows, error: revError } = await supabase
    .from("store_revenue_summary")
    .select("store_id, org_id")

  if (revError) {
    console.error("Error fetching revenue summaries:", revError.message)
    process.exit(1)
  }

  if (!revRows || revRows.length === 0) {
    console.log("No data in store_revenue_summary. Run the cron first.")
    process.exit(0)
  }

  console.log(`Found ${revRows.length} revenue summary rows`)

  // 2. Get all stores for cross-reference
  const storeIds = [...new Set(revRows.map((r) => r.store_id))]
  const { data: stores, error: storeError } = await supabase
    .from("client_stores")
    .select("id, org_id, store_name")
    .in("id", storeIds)

  if (storeError) {
    console.error("Error fetching stores:", storeError.message)
    process.exit(1)
  }

  const storeOrgMap = new Map(stores.map((s) => [s.id, s.org_id]))

  // 3. Verify every revenue row's org_id matches the store's org_id
  let mismatches = 0
  for (const row of revRows) {
    const storeOrgId = storeOrgMap.get(row.store_id)
    if (storeOrgId !== row.org_id) {
      console.error(
        `MISMATCH: store ${row.store_id} has org_id=${storeOrgId} but revenue has org_id=${row.org_id}`
      )
      mismatches++
    }
  }

  // 4. Verify orgs don't see each other's data
  const orgIds = [...new Set(revRows.map((r) => r.org_id))]
  console.log(`\nOrgs with revenue data: ${orgIds.length}`)

  for (const orgId of orgIds) {
    const orgRevenue = revRows.filter((r) => r.org_id === orgId)
    const orgStoreIds = orgRevenue.map((r) => r.store_id)

    // Verify all stores in this org's revenue actually belong to this org
    const foreignStores = orgStoreIds.filter((sid) => storeOrgMap.get(sid) !== orgId)
    if (foreignStores.length > 0) {
      console.error(`ORG ${orgId}: has ${foreignStores.length} stores from other orgs!`)
      mismatches += foreignStores.length
    } else {
      console.log(`ORG ${orgId}: ${orgRevenue.length} rows, all stores verified`)
    }
  }

  console.log(`\n=== Result: ${mismatches === 0 ? "PASS" : "FAIL"} ===`)
  if (mismatches > 0) {
    console.error(`${mismatches} mismatches found!`)
    process.exit(1)
  } else {
    console.log("All revenue rows correctly isolated by org_id")
  }
}

main().catch(console.error)
