import { CustomizeSection } from "@/components/settings/sections/customize"

/**
 * Rota preservada: renderiza a MESMA secao usada pelo SettingsModal.
 * Deep links, bookmarks e redirects legados continuam funcionais.
 */
export default function SettingsSectionPage() {
  return <CustomizeSection />
}
