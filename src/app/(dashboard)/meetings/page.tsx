import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { MeetingsPageClient } from "@/components/meetings/meetings-page-client"

export const dynamic = "force-dynamic"

export default async function MeetingsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch meetings with relations
  const { data: meetings } = await adminClient
    .from("meetings")
    .select(`
      *,
      client:clients (id, name, company),
      user:profiles!meetings_user_id_fkey (id, name, email, avatar_url),
      meeting_participants (
        id, meeting_id, participant_id, participant_type,
        is_organizer, response_status, notes,
        created_at, updated_at,
        profile:profiles!meeting_participants_participant_id_fkey (id, name, email, avatar_url)
      )
    `)
    .order("scheduled_at", { ascending: true })

  // Fetch clients for the dialog
  const { data: clients } = await adminClient
    .from("clients")
    .select("id, name, company")
    .in("status", ["active", "onboarding", "prospect"])
    .order("name")

  // Fetch org members for participants selector
  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, org_id")
    .eq("id", user.id)
    .single()

  let members: { id: string; name: string; email?: string; avatar_url?: string; type: "org_member"; role?: string }[] = []

  if (profile?.org_id) {
    const { data: orgMembers } = await adminClient
      .from("org_members")
      .select("id, role, profile:profiles (id, name, email, avatar_url)")
      .eq("org_id", profile.org_id)

    members = (orgMembers || []).map((m) => {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      return {
        id: m.id,
        name: p?.name || "Membro",
        email: p?.email,
        avatar_url: p?.avatar_url,
        type: "org_member" as const,
        role: m.role,
      }
    })
  }

  // Transform meetings for client component
  const transformedMeetings = (meetings || []).map((m) => ({
    ...m,
    client: Array.isArray(m.client) ? m.client[0] : m.client,
    user: Array.isArray(m.user) ? m.user[0] : m.user,
    participants: m.meeting_participants?.map((p: Record<string, unknown>) => ({
      ...p,
      profile: Array.isArray(p.profile) ? (p.profile as Record<string, unknown>[])[0] : p.profile,
    })),
  }))

  return (
    <PagePermissionWrapper requiredFeatures={["calendar_control"]}>
      <MeetingsPageClient
        meetings={transformedMeetings}
        clients={clients || []}
        members={members}
      />
    </PagePermissionWrapper>
  )
}
