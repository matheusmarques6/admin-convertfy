import { Suspense } from "react"
import { Plus, Users } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { TeamTable } from "@/components/team/team-table"
import { Skeleton } from "@/components/ui/skeleton"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
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

  // Batch: fetch all features and store access in 2 queries instead of 2*N
  const [featuresRes, accessRes] = await Promise.all([
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

  return (members || []).map((member) => ({
    ...member,
    enabled_features: featuresByMember.get(member.id) || [],
    store_access_count: accessCountByMember.get(member.id) || 0,
  }))
}

async function getFeaturesCatalog() {
  const supabase = await createClient()

  const { data: features } = await supabase
    .from("features_catalog")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  return features || []
}

async function getOrganizations() {
  const supabase = await createClient()

  const { data: orgs } = await supabase
    .from("organizations")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true })

  return orgs || []
}

async function getStores() {
  const supabase = await createClient()

  const { data: stores } = await supabase
    .from("client_stores")
    .select(`
      id,
      store_name,
      store_url,
      platform,
      client:clients(id, name)
    `)
    .eq("is_active", true)
    .order("store_name", { ascending: true })

  // Transform client from array to single object (Supabase quirk)
  return (stores || []).map(s => ({
    ...s,
    client: Array.isArray(s.client) ? s.client[0] : s.client
  }))
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}

export default async function TeamPage() {
  const [members, features, organizations, stores] = await Promise.all([
    getTeamMembers(),
    getFeaturesCatalog(),
    getOrganizations(),
    getStores(),
  ])

  return (
    <PagePermissionWrapper requiredFeatures={["team_control", "team_view"]}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-[8px] bg-primary/10">
            <Icon icon={Users} size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Equipe</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Gerencie os membros da sua equipe e suas permissões</p>
          </div>
        </div>
        <Button id="add-member-trigger" className="self-end sm:self-auto">
          <Icon icon={Plus} size={16} className="mr-2" />
          Novo Membro
        </Button>
      </div>

      {/* Table */}
      <Suspense fallback={<TableSkeleton />}>
        <TeamTable
          members={members}
          features={features}
          organizations={organizations}
          stores={stores}
        />
      </Suspense>
    </div>
    </PagePermissionWrapper>
  )
}
