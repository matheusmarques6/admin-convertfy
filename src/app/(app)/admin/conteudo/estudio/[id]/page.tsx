import { Suspense } from "react"
import { EditorPage } from "@/components/conteudo/estudio/editor-page"

export const dynamic = "force-dynamic"

/** /admin/conteudo/estudio/[id] — editor do carrossel. */
export default async function ConteudoEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<div className="min-h-full bg-[var(--ops-page)]" />}>
      <EditorPage id={id} />
    </Suspense>
  )
}
