import { WhatsAppQrSection } from "@/components/settings/sections/whatsapp-qr"

/**
 * Rota preservada: renderiza a MESMA secao usada pelo SettingsModal.
 * Deep links, bookmarks e redirects legados continuam funcionais.
 */
export default function SettingsSectionPage() {
  return <WhatsAppQrSection />
}
