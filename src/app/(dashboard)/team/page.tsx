import { Suspense } from "react"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { TeamTable } from "@/components/team/team-table"
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = "force-dynamic"

async function getTeamMembers() {
  const supabase = await createClient()

  const { data: members, error } = await supabase
    .from("org_members")
    .select(`
      *,
      organization:organizations(id, name, slug),
      profile:profiles(id, name, email, avatar_url, role)
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching team members:", error)
    return []
  }

  // For each member, get their features and store access count
  const membersWithDetails = await Promise.all(
    (members || []).map(async (member) => {
      const [featuresRes, accessRes] = await Promise.all([
        supabase
          .from("org_member_features")
          .select("feature_key")
          .eq("org_member_id", member.id)
          .eq("enabled", true),
        supabase
          .from("agent_store_access")
          .select("id")
          .eq("org_member_id", member.id)
          .eq("can_view", true),
      ])

      return {
        ...member,
        enabled_features: featuresRes.data?.map((f) => f.feature_key) || [],
        store_access_count: accessRes.data?.length || 0,
      }
    })
  )

  return membersWithDetails
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

  return stores || []
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">
            Gerencie os membros da sua equipe e suas permissões
          </p>
        </div>
        <Button id="add-member-trigger">
          <Plus className="mr-2 h-4 w-4" />
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
  )
}
