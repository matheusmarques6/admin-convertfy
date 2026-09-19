import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <SettingsBreadcrumb />
      {children}
    </div>
  )
}
