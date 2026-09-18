"use client"

/**
 * A prévia em tela cheia (handoff §10): véu escuro, barra com
 * Desktop/Celular e "Fechar · esc", e o formulário DE PRODUÇÃO dentro —
 * o mesmo componente que o visitante recebe, com o mesmo schema que a
 * publicação monta. Não é uma segunda renderização "de prévia": se
 * fosse, ela discordaria do ar no primeiro ajuste.
 *
 * O Esc é tratado pelo editor (que já escuta o teclado para ⌘S/⌘D) —
 * dois ouvintes para a mesma tecla fechariam duas coisas.
 */

import { useState } from "react"
import { Monitor, Smartphone, X } from "lucide-react"
import { ConversationalFormView } from "./conversational-form-view"
import { PublicFormView } from "./public-form-view"
import type { FormSchema } from "@/types/forms-conversational"

export function PreviaDoFormulario({
  aberta,
  onFechar,
  modo,
  conversacional,
  classico,
}: {
  aberta: boolean
  onFechar: () => void
  modo: "classic" | "conversational"
  conversacional: {
    slug: string
    schema: FormSchema
    form: React.ComponentProps<typeof ConversationalFormView>["form"]
  }
  classico: {
    slug: string
    payload: React.ComponentProps<typeof PublicFormView>["payload"]
  }
}) {
  const [aparelho, setAparelho] = useState<"desktop" | "mobile">("desktop")
  if (!aberta) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: "rgba(9,10,14,0.88)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Prévia do formulário"
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-4 text-white">
        <div className="inline-flex items-center gap-0.5 rounded-[7px] bg-white/10 p-0.5">
          {(
            [
              { key: "desktop", label: "Desktop", icon: Monitor },
              { key: "mobile", label: "Celular", icon: Smartphone },
            ] as const
          ).map((m) => {
            const Icon = m.icon
            const ativo = aparelho === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setAparelho(m.key)}
                aria-pressed={ativo}
                className={
                  "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium transition-colors " +
                  (ativo ? "bg-white text-slate-900" : "text-white/70 hover:text-white")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
          Fechar <kbd className="rounded border border-white/30 px-1 text-[10px]">esc</kbd>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4 pb-8">
        <div
          className={
            "overflow-hidden bg-white shadow-[0_28px_70px_rgba(0,0,0,0.35)] " +
            (aparelho === "mobile"
              ? "h-[760px] max-h-full w-[390px] max-w-full rounded-[28px] border-[8px] border-[#1F2937]"
              : "h-full min-h-[560px] w-full max-w-[1100px] rounded-[12px]")
          }
        >
          {modo === "conversational" ? (
            <ConversationalFormView
              key={aparelho}
              slug={conversacional.slug}
              schema={conversacional.schema}
              form={conversacional.form}
              preview
              moldura
            />
          ) : (
            <div className="h-full overflow-auto">
              <PublicFormView
                slug={classico.slug}
                payload={classico.payload}
                utm={{
                  utm_source: null,
                  utm_medium: null,
                  utm_campaign: null,
                  utm_term: null,
                  utm_content: null,
                  gclid: null,
                  fbclid: null,
                }}
                preview
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
