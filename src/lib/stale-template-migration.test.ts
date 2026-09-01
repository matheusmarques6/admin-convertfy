import { test, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

test("casts stale template age after the RPC that it replaces", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261100_fix_stale_pending_templates_age_type.sql"),
    "utf8"
  )

  expect(sql).toContain("::double precision AS age_minutes")
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION stale_pending_crm_templates(INTEGER) TO service_role")
})
