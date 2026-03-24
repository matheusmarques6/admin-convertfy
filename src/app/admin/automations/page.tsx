import { Zap } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { PagePermissionWrapper } from "@/components/page-permission-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { AutomationsPageClient } from "@/components/automations/automations-page-client"
import type { Automation } from "@/types"

export const dynamic = "force-dynamic"

async function getAutomations() {
  const supabase = await createClient()

  const { data: automations, error } = await supabase
    .from("automations")
    .select(`
      *,
      creator:profiles!automations_created_by_fkey (
        id,
        name
      ),
      logs:automation_logs (
        id,
        status,
        executed_at
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching automations:", error)
    return []
  }

  return (automations || []) as (Automation & {
    creator?: { id: string; name: string }
    logs?: { id: string; status: string; executed_at: string }[]
  })[]
}

export default async function AutomationsPage() {
  const automations = await getAutomations()

  const activeCount = automations.filter((a) => a.is_active).length

  return (
    <PagePermissionWrapper requiredFeatures={["campaign_control"]}>
      <div className="space-y-6">
        <PageHeader
          icon={Zap}
          title="Automações"
          badge={activeCount}
          description="Automatize tarefas e processos repetitivos"
        />

        <AutomationsPageClient automations={automations} />
      </div>
    </PagePermissionWrapper>
  )
}
