import { AccountSection } from "@/components/settings/sections/account"

/**
 * Rota preservada: renderiza a MESMA secao usada pelo SettingsModal.
 * Deep links, bookmarks e redirects legados continuam funcionais.
 */
export default function SettingsSectionPage() {
  return <AccountSection />
}
