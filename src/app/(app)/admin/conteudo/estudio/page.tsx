import { Suspense } from "react"
import { EstudioHome } from "@/components/conteudo/estudio/estudio-home"

export const dynamic = "force-dynamic"

/** /admin/conteudo/estudio — biblioteca de carrosséis + fluxo Novo carrossel. */
export default function ConteudoEstudioPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-[var(--ops-page)]" />}>
      <EstudioHome />
    </Suspense>
  )
}
