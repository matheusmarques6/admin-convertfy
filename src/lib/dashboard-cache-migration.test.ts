import fs from "node:fs"
import path from "node:path"

test("keeps the dashboard cache RLS reconciliation at the end of the migration sequence", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261095_dashboard_cache_org_id_reconcile.sql"),
    "utf8"
  )

  expect(sql).toContain("ADD COLUMN IF NOT EXISTS org_id")
  expect(sql).toContain('CREATE POLICY "org_dashboard_cache_select"')
  expect(sql).toContain('CREATE POLICY "dashboard_cache_service_all"')
})
