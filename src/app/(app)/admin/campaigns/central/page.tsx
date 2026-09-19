import type { Metadata } from "next"
import { CampaignCentralShell } from "@/components/campaign-central/campaign-central-shell"

export const metadata: Metadata = {
  title: "Central de Campanhas",
}

export default function CampaignCentralPage() {
  return <CampaignCentralShell />
}
