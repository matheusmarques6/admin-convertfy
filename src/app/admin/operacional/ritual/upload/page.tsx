import { RitualUploadClient } from "@/components/ritual/ritual-upload"

export const metadata = {
  title: "Upload Fathom · Ritual de Sexta · Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default function RitualUploadPage() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "auto", background: "#FAFBFC" }}>
      <RitualUploadClient />
    </div>
  )
}
