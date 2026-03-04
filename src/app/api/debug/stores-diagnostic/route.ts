import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import { resolveOrgId } from "@/lib/api/resolve-org"

/**
 * TEMPORARY diagnostic endpoint to debug why stores appear in Clients tab but not in Stores page.
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // 1. Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated", authError }, { status: 401 })
    }

    // 2. Resolve org
    let orgId: string | null = null
    let orgError: string | null = null
    try {
      orgId = await resolveOrgId(user.id)
    } catch (e) {
      orgError = e instanceof Error ? e.message : String(e)
    }

    // 3. Query ALL stores via admin (bypass RLS) - see raw data
    const { data: allStoresAdmin, error: adminError } = await adminClient
      .from("client_stores")
      .select("id, store_name, client_id, org_id, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(50)

    // 4. Query stores via RLS client with org_id filter (what /stores page does)
    const { data: storesWithOrgFilter, error: orgFilterError } = await supabase
      .from("client_stores")
      .select("id, store_name, client_id, org_id, is_active")
      .eq("org_id", orgId || "")
      .eq("is_active", true)
      .order("store_name")

    // 5. Query stores via RLS client WITHOUT org_id filter (just RLS)
    const { data: storesRlsOnly, error: rlsOnlyError } = await supabase
      .from("client_stores")
      .select("id, store_name, client_id, org_id, is_active")
      .order("store_name")

    // 6. Query stores via RLS with client_id filter (what Clients tab does)
    // Get first client to test
    const { data: firstClient } = await supabase
      .from("clients")
      .select("id, name, org_id")
      .limit(1)
      .single()

    let storesViaClientId = null
    let clientIdError = null
    if (firstClient) {
      const { data, error } = await supabase
        .from("client_stores")
        .select("id, store_name, client_id, org_id, is_active")
        .eq("client_id", firstClient.id)
      storesViaClientId = data
      clientIdError = error
    }

    // 7. Check clients table org_id
    const { data: clientsOrgCheck } = await adminClient
      .from("clients")
      .select("id, name, org_id")
      .limit(20)

    // 8. Check org_members for current user
    const { data: orgMembership } = await adminClient
      .from("org_members")
      .select("id, org_id, role, is_active, profile_id")
      .eq("profile_id", user.id)

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      orgId,
      orgError,
      orgMembership,
      counts: {
        allStoresAdmin: allStoresAdmin?.length || 0,
        storesWithOrgFilter: storesWithOrgFilter?.length || 0,
        storesRlsOnly: storesRlsOnly?.length || 0,
        storesViaClientId: storesViaClientId?.length || 0,
      },
      allStoresAdmin: allStoresAdmin?.map(s => ({
        id: s.id,
        name: s.store_name,
        client_id: s.client_id,
        org_id: s.org_id,
        is_active: s.is_active,
      })),
      storesWithOrgFilter: {
        data: storesWithOrgFilter,
        error: orgFilterError?.message,
        query: `client_stores WHERE org_id = '${orgId}' AND is_active = true`,
      },
      storesRlsOnly: {
        data: storesRlsOnly,
        error: rlsOnlyError?.message,
        query: "client_stores (RLS only, no explicit filter)",
      },
      storesViaClientId: {
        client: firstClient,
        data: storesViaClientId,
        error: clientIdError?.message,
        query: `client_stores WHERE client_id = '${firstClient?.id}'`,
      },
      clientsOrgCheck: clientsOrgCheck?.map(c => ({
        id: c.id,
        name: c.name,
        org_id: c.org_id,
      })),
    })
  } catch (error) {
    return NextResponse.json({
      error: "Diagnostic failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
