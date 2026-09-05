"use client"

/**
 * Casca do editor: carrega o documento pelo id, trata "não encontrado" e
 * entrega ao StEditor com o modal/aba iniciais vindos da URL.
 */

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { ROUTES } from "@/lib/routes"
import { CtEmpty, CtSkel } from "../ui"
import { useDocumentos } from "./use-estudio-data"

export function EditorPage({ id }: { id: string }) {
  const params = useSearchParams()
  const { docs } = useDocumentos()
  const doc = docs?.find((d) => d.id === id) ?? null

  if (docs === null) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--ops-page)]">
        <div className="flex h-[52px] items-center gap-3 border-b border-[var(--ops-border)] bg-[var(--ops-card)] px-4">
          <CtSkel h={28} w={28} r={7} />
          <CtSkel h={14} w={220} />
        </div>
        <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--ops-mut)]">Abrindo o carrossel…</div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="min-h-full bg-[var(--ops-page)]">
        <div className="mx-auto max-w-[720px] px-6 pt-16">
          <CtEmpty
            title="Carrossel não encontrado"
            desc="Ele pode ter sido excluído ou criado em outro navegador (os carrosséis ficam salvos localmente até a sincronização com o servidor)."
            action={
              <Link href={ROUTES.ADMIN.CONTEUDO.ESTUDIO} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ops-accent)] px-3 text-[12px] font-semibold text-[var(--ops-on-accent)]">
                <Icon icon={ChevronLeft} customSize={13} />
                Voltar ao Estúdio
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  const modalInicial = params.get("modal")
  const abaInicial = params.get("aba")
  const modoTemplate = params.get("modo") === "template"

  return (
    <div className="flex min-h-full flex-col bg-[var(--ops-page)]">
      <div className="flex h-[52px] items-center gap-2 border-b border-[var(--ops-border)] bg-[var(--ops-card)] px-4">
        <Link href={ROUTES.ADMIN.CONTEUDO.ESTUDIO} aria-label="Voltar à biblioteca" className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--ops-border)] text-[var(--ops-sec)] hover:bg-[var(--ops-hover)]">
          <Icon icon={ChevronLeft} customSize={14} />
        </Link>
        <span className="text-[12px] font-semibold text-[var(--ops-title)]">{doc.nome}</span>
        <span className="text-[10.5px] text-[var(--ops-mut)]">
          {doc.frames.length} frames · {doc.proporcaoExport}
          {modoTemplate ? " · modo template" : ""}
          {modalInicial ? ` · abrir ${modalInicial}` : ""}
          {abaInicial ? ` · aba ${abaInicial}` : ""}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <CtEmpty title="Editor em construção nesta etapa" desc="O canvas, o painel de frames, os ajustes e a ConvertIA entram na próxima etapa do módulo." />
      </div>
    </div>
  )
}
