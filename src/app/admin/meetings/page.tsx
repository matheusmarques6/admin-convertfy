import { Calendar } from "lucide-react"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const log = logger.child("MeetingsPage")
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { MeetingsPageClient } from "@/components/meetings/meetings-page-client"

export const dynamic = "force-dynamic"

export default async function MeetingsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Resolve org_id for multi-tenant scoping
  const { data: currentMember } = await adminClient
    .from("org_members")
    .select("org_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single()

  if (!currentMember?.org_id) return null

  // Fetch meetings with relations scoped to org
  const { data: meetings, error: meetingsError } = await adminClient
    .from("meetings")
    .select(`
      *,
      client:clients (id, name, company, client_stores(id, store_name)),
      user:profiles!meetings_user_id_fkey (id, name, email, avatar_url),
      participants:meeting_participants(
        id,
        participant_id,
        participant_type,
        is_organizer,
        response_status,
        google_rsvp_status
      )
    `)
    .eq("org_id", currentMember.org_id)
    .order("scheduled_at", { ascending: true })

  if (meetingsError) {
    log.error("Error fetching meetings:", meetingsError)
  }

  // Fetch profiles for participants separately (polymorphic participant_id has no FK)
  const participantProfileIds = new Set<string>()
  const participantOrgMemberIds = new Set<string>()
  ;(meetings || []).forEach((m: Record<string, unknown>) => {
    const parts = (m.participants || []) as Array<{ participant_type: string; participant_id: string }>
    parts.forEach((p) => {
      if (p.participant_type === "profile" && p.participant_id) {
        participantProfileIds.add(p.participant_id)
      } else if (p.participant_type === "org_member" && p.participant_id) {
        participantOrgMemberIds.add(p.participant_id)
      }
    })
  })

  const profilesMap = new Map<string, { id: string; name: string; email: string; avatar_url: string | null }>()

  if (participantProfileIds.size > 0) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, name, email, avatar_url")
      .in("id", Array.from(participantProfileIds))
    ;(profiles || []).forEach((p) => profilesMap.set(p.id, p))
  }

  // For org_member participants, resolve their profile via org_members table
  if (participantOrgMemberIds.size > 0) {
    const { data: orgMembersData } = await adminClient
      .from("org_members")
      .select("id, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)")
      .in("id", Array.from(participantOrgMemberIds))
    ;(orgMembersData || []).forEach((om) => {
      const prof = Array.isArray(om.profile) ? om.profile[0] : om.profile
      if (prof) profilesMap.set(om.id, prof)
    })
  }

  // Fetch clients for the dialog (with stores for display)
  const { data: clientsRaw } = await adminClient
    .from("clients")
    .select("id, name, company, client_stores(id, store_name)")
    .in("status", ["active", "onboarding", "prospect"])
    .order("name")

  const clients = (clientsRaw || []).map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    stores: (Array.isArray(c.client_stores) ? c.client_stores : [])
      .map((s: { id: string; store_name: string }) => s.store_name)
      .filter(Boolean),
  }))

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
      .select("id, role, profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url)")
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

  // Check if user has Google Calendar connected
  const { data: googleToken } = await adminClient
    .from("user_google_tokens")
    .select("id, last_synced_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  const hasGoogleCalendar = !!googleToken
  const lastSyncedAt = googleToken?.last_synced_at || null

  // Transform meetings for client component
  const transformedMeetings = (meetings || []).map((m) => {
    const clientRaw = Array.isArray(m.client) ? m.client[0] : m.client
    return {
      ...m,
      client: clientRaw ? {
        id: clientRaw.id,
        name: clientRaw.name,
        company: clientRaw.company,
        stores: (Array.isArray(clientRaw.client_stores) ? clientRaw.client_stores : [])
          .map((s: { store_name: string }) => s.store_name)
          .filter(Boolean),
      } : null,
      user: Array.isArray(m.user) ? m.user[0] : m.user,
      participants: (m.participants || []).map((p: Record<string, unknown>) => ({
        ...p,
        profile: profilesMap.get(p.participant_id as string) || null,
      })),
    }
  })

  const meetingCount = transformedMeetings.filter(
    (m) => m.status === "scheduled"
  ).length

  return (
    <PagePermissionWrapper requiredFeatures={["calendar_control"]}>
      <div className="space-y-6">
        <PageHeader
          icon={Calendar}
          title="Reuniões"
          badge={meetingCount}
          description="Agende e acompanhe reuniões com clientes e equipe"
        />

        <MeetingsPageClient
          meetings={transformedMeetings}
          clients={clients}
          members={members}
          hasGoogleCalendar={hasGoogleCalendar}
          lastSyncedAt={lastSyncedAt}
        />
      </div>
    </PagePermissionWrapper>
  )
}
