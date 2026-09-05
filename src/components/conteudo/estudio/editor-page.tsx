"use client"

/**
 * Casca do editor: carrega o documento pelo id, trata "não encontrado" e
 * entrega ao Editor com modal/aba iniciais vindos da URL (`?modal=`,
 * `?aba=ia`, `?modo=template`). Referências visuais do fluxo IA chegam
 * pelo sessionStorage e abrem no chat.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/lib/hooks/use-toast"
import { novoId } from "@/lib/conteudo/documento"
import { getTemplate } from "@/lib/conteudo/templates"
import type { Documento } from "@/lib/conteudo/types"
import { ROUTES } from "@/lib/routes"
import { CtEmpty, CtSkel } from "../ui"
import { Editor } from "./editor"
import type { ModalEditor } from "./editor-types"
import { ANEXOS_KEY } from "./estudio-home"
import { useBrandKits, useDocumentos, useMeusTemplates } from "./use-estudio-data"

const MODAIS: ModalEditor[] = ["preview", "exportar", "agendar", "brandkit"]

export function EditorPage({ id }: { id: string }) {
  const params = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { docs, salvar, recarregar } = useDocumentos()
  const { kits, salvar: salvarKit } = useBrandKits()
  const { salvar: salvarMeuTemplate } = useMeusTemplates()
  const [anexos, setAnexos] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ANEXOS_KEY(id))
      if (raw) {
        setAnexos(JSON.parse(raw) as string[])
        sessionStorage.removeItem(ANEXOS_KEY(id))
      }
    } catch {
      /* sem sessionStorage */
    }
  }, [id])

  const doc = useMemo(() => docs?.find((d) => d.id === id) ?? null, [docs, id])
  const modal = params.get("modal")
  const modalInicial = MODAIS.includes(modal as ModalEditor) ? (modal as ModalEditor) : null
  const abaInicial = params.get("aba") === "ia" ? "ia" : params.get("aba") === "ajustes" ? "ajustes" : undefined
  const modoTemplate = params.get("modo") === "template"

  if (docs === null) {
    return (
      <div className="-m-4 flex h-[100dvh] flex-col bg-[var(--ops-page)] md:-m-6 lg:-m-8">
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
      <div className="-m-4 min-h-[100dvh] bg-[var(--ops-page)] md:-m-6 lg:-m-8">
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

  const salvarTemplate = async (d: Documento) => {
    await salvar(d)
    await salvarMeuTemplate({
      id: novoId("meu-"),
      nome: d.nome,
      origem: "inspiração",
      frames: d.frames.length,
      usos: 0,
      seed: `meutpl${Date.now()}`,
      templateId: getTemplate(d.templateId).id,
      criadoEm: new Date().toISOString(),
    })
    toast({ title: "Template salvo", description: `"${d.nome}" entrou em Meus templates.` })
    router.push(ROUTES.ADMIN.CONTEUDO.ESTUDIO)
  }

  return (
    <Editor
      key={doc.id}
      doc={doc}
      brandKits={kits}
      onSalvarBrandKit={salvarKit}
      modalInicial={modalInicial}
      abaInicial={abaInicial}
      modoTemplate={modoTemplate}
      onSalvarTemplate={modoTemplate ? salvarTemplate : undefined}
      anexosIniciais={anexos}
      onSalvo={() => void recarregar()}
    />
  )
}
