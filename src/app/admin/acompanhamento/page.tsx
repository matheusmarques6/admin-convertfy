import { AcompanhamentoKanban } from "@/components/acompanhamento/kanban"

export const metadata = {
  title: "Acompanhamento Semanal · Convertfy Admin",
}

export const dynamic = "force-dynamic"

export default function AcompanhamentoPage() {
  return <AcompanhamentoKanban />
}
