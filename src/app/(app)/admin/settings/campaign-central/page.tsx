import type { Metadata } from "next"
import { CampaignCentralSettingsForm } from "@/components/campaign-central-settings/settings-form"

export const metadata: Metadata = {
  title: "Central de Campanhas — Configurações",
}

export default function CampaignCentralSettingsPage() {
  return <CampaignCentralSettingsForm />
}
