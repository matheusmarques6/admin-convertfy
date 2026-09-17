"use client"

/**
 * Configura para onde o lead vai quando termina.
 *
 * Vive fora do construtor de fluxo porque os DOIS formatos precisam
 * dele: no conversacional o destino é do FINAL (cada desfecho manda para
 * um lugar), no formato de página única ele é do formulário e vale só
 * para quem a régua de qualificação aprovou. Um segundo formulário para
 * a mesma configuração divergiria na primeira correção — e o sintoma
 * seria um campo que existe num editor e não no outro.
 *
 * Os rótulos são próprios, sem os átomos de nenhum dos dois editores,
 * senão o componente só serviria a um deles.
 */

import { AlertTriangle, CalendarClock, Link2, MessageCircle, Plus } from "lucide-react"
import { conferirDestino, MOTIVO_DO_DESTINO } from "@/lib/forms/destino"
import type { DestinoDoFinal, TipoDeDestino } from "@/types/forms-conversational"

const TIPOS: Array<{ tipo: TipoDeDestino; rotulo: string; Icone: typeof MessageCircle }> = [
  { tipo: "whatsapp", rotulo: "Chamar no WhatsApp", Icone: MessageCircle },
  { tipo: "calendly", rotulo: "Agendar no Calendly", Icone: CalendarClock },
  { tipo: "url", rotulo: "Levar para um link", Icone: Link2 },
]

export function DestinoEditor({
  destino,
  onChange,
  titulo = "Para onde o lead vai daqui",
  apoio,
}: {
  destino: DestinoDoFinal | null
  onChange: (d: DestinoDoFinal | null) => void
  titulo?: string
  apoio?: string
}) {
  const falha = conferirDestino(destino)
  const trocar = (patch: Partial<DestinoDoFinal>) =>
    onChange({ ...(destino ?? { tipo: "whatsapp" }), ...patch })

  return (
    <div className="rounded-[6px] border border-slate-200 bg-slate-50/60 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-slate-800 dark:text-white/85">{titulo}</p>
          {apoio && (
            <p className="mt-0.5 text-[10.5px] leading-snug text-slate-500 dark:text-white/50">
              {apoio}
            </p>
          )}
        </div>
        {destino && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-[10.5px] font-medium text-slate-500 hover:underline dark:text-white/50"
          >
            Remover
          </button>
        )}
      </div>

      {!destino ? (
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map(({ tipo, rotulo, Icone }) => (
            <button
              key={tipo}
              type="button"
              // Nasce automático: quem escolhe "chamar no WhatsApp" quer
              // que a conversa abra, não que apareça mais um botão.
              onClick={() => onChange({ tipo, automatico: true })}
              className="inline-flex items-center gap-1 rounded-[5px] border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-300 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white/75 dark:hover:border-white/20"
            >
              <Plus className="h-3 w-3" />
              <Icone className="h-3 w-3" />
              {rotulo}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Rotulo texto="Tipo">
            <select
              value={destino.tipo}
              onChange={(e) => trocar({ tipo: e.target.value as TipoDeDestino })}
              className="crm-input w-full"
            >
              {TIPOS.map(({ tipo, rotulo }) => (
                <option key={tipo} value={tipo}>
                  {rotulo}
                </option>
              ))}
            </select>
          </Rotulo>

          {destino.tipo === "whatsapp" ? (
            <>
              <Rotulo
                texto="Número que recebe"
                apoio="O NOSSO número, com DDI — não o telefone que o lead digitou."
              >
                <input
                  type="tel"
                  value={destino.numero ?? ""}
                  onChange={(e) => trocar({ numero: e.target.value || null })}
                  className="crm-input w-full"
                  placeholder="+55 11 99999-9999"
                />
              </Rotulo>
              <Rotulo
                texto="Mensagem já escrita"
                apoio="Aceita {{pergunta}}. É o que a pessoa envia com um toque."
              >
                <textarea
                  rows={2}
                  value={destino.mensagem ?? ""}
                  onChange={(e) => trocar({ mensagem: e.target.value || null })}
                  className="crm-input w-full"
                  placeholder="Oi! Acabei de responder o diagnóstico e quero falar com vocês."
                />
              </Rotulo>
            </>
          ) : (
            <Rotulo
              texto={destino.tipo === "calendly" ? "Link do Calendly" : "Endereço"}
              apoio={
                destino.tipo === "calendly"
                  ? "Nome, e-mail e as UTMs da visita vão pré-preenchidos."
                  : "Aceita {{pergunta}}. Só http:// e https://."
              }
            >
              <input
                type="url"
                value={destino.url ?? ""}
                onChange={(e) => trocar({ url: e.target.value || null })}
                className="crm-input w-full font-mono text-[11.5px]"
                placeholder={destino.tipo === "calendly" ? "https://calendly.com/…" : "https://"}
              />
            </Rotulo>
          )}

          <Rotulo texto="Texto do botão">
            <input
              type="text"
              value={destino.rotulo ?? ""}
              onChange={(e) => trocar({ rotulo: e.target.value || null })}
              className="crm-input w-full"
              placeholder={
                destino.tipo === "whatsapp" ? "Falar no WhatsApp agora" : "Escolher o meu horário"
              }
            />
          </Rotulo>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={Boolean(destino.automatico)}
              onChange={(e) => trocar({ automatico: e.target.checked })}
              className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-slate-900 dark:accent-white"
            />
            <span className="min-w-0">
              <span className="block text-[11.5px] font-medium text-slate-800 dark:text-white/85">
                Levar sozinho
              </span>
              <span className="block text-[10.5px] leading-snug text-slate-500 dark:text-white/50">
                Abre em ~1s, sem esperar clique. O botão fica na tela como reserva.
              </span>
            </span>
          </label>

          {falha && (
            <p className="flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
              {MOTIVO_DO_DESTINO[falha]}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Rotulo({
  texto,
  apoio,
  children,
}: {
  texto: string
  apoio?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-white/60">
        {texto}
      </span>
      {children}
      {apoio && (
        <span className="mt-1 block text-[10.5px] leading-snug text-slate-500 dark:text-white/45">
          {apoio}
        </span>
      )}
    </label>
  )
}
