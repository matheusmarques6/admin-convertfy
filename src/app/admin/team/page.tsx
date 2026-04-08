import { Users } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { TeamPageClient } from "@/components/team/team-page-client"
import { logger } from "@/lib/logger"

const log = logger.child("TeamPage")

export const dynamic = "force-dynamic"

async function getTeamMembers() {
  const supabase = await createClient()

  const { data: members, error } = await supabase
    .from("org_members")
    .select(`
      *,
      organization:organizations(id, name, slug),
      profile:profiles!org_members_profile_id_fkey(id, name, email, avatar_url, role, last_sign_in_at)
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    log.error("Error fetching team members:", error)
    return []
  }

  const memberIds = (members || []).map((m) => m.id)
  if (memberIds.length === 0) return []

  // Batch: fetch features, store access, and client assignments
  const [featuresRes, accessRes, clientsRes] = await Promise.all([
    supabase
      .from("org_member_features")
      .select("org_member_id, feature_key")
      .in("org_member_id", memberIds)
      .eq("enabled", true),
    supabase
      .from("agent_store_access")
      .select("org_member_id, id")
      .in("org_member_id", memberIds)
      .eq("can_view", true),
    supabase
      .from("clients")
      .select("id, account_manager_id")
      .in("account_manager_id", memberIds),
  ])

  // Group features by member
  const featuresByMember = new Map<string, string[]>()
  featuresRes.data?.forEach((f) => {
    const list = featuresByMember.get(f.org_member_id) || []
    list.push(f.feature_key)
    featuresByMember.set(f.org_member_id, list)
  })

  // Count store access by member
  const accessCountByMember = new Map<string, number>()
  accessRes.data?.forEach((a) => {
    accessCountByMember.set(a.org_member_id, (accessCountByMember.get(a.org_member_id) || 0) + 1)
  })

  // Count clients by member
  const clientCountByMember = new Map<string, number>()
  clientsRes.data?.forEach((c) => {
    if (c.account_manager_id) {
      clientCountByMember.set(c.account_manager_id, (clientCountByMember.get(c.account_manager_id) || 0) + 1)
    }
  })

  return (members || []).map((member) => ({
    ...member,
    enabled_features: featuresByMember.get(member.id) || [],
    store_access_count: accessCountByMember.get(member.id) || 0,
    client_count: clientCountByMember.get(member.id) || 0,
  }))
}

export default async function TeamPage() {
  const members = await getTeamMembers()

  return (
    <PagePermissionWrapper requiredFeatures={["team_control", "team_view"]}>
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          title="Equipe"
          badge={members.length}
          description="Visão operacional da equipe — carga de trabalho e atribuições"
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/settings/team">
                Gerenciar Permissões
              </Link>
            </Button>
          }
        />

        <TeamPageClient members={members} />
      </div>
    </PagePermissionWrapper>
  )
}
