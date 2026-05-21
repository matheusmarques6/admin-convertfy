"use client"

/**
 * Builder de form CS — reusa o editor do comercial.
 *
 * O componente em /admin/comercial/forms/[id]/page.tsx detecta a area
 * via usePathname() e ajusta o link "Voltar" pra listagem correta
 * (operacional/forms ou comercial/forms). Toda logica de edicao
 * (fields, theme, publish, etc.) e identica.
 */

import FormEditorPage from "@/app/admin/comercial/forms/[id]/page"

export default function CsFormEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <FormEditorPage params={params} />
}
