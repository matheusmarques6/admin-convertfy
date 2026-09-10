"use client"

/**
 * Iniciar uma conversa NOVA pelo inbox — puxar a primeira mensagem em
 * vez de só responder.
 *
 * O modal escolhe o CANAL e o NÚMERO e abre a conversa; quem envia é o
 * composer completo do inbox. A primeira versão pedia a mensagem aqui
 * dentro, numa caixa de texto, e isso limitava a primeira mensagem a
 * TEXTO — justamente a que costuma ser um áudio, uma foto do produto ou
 * um catálogo. Abrir a conversa entrega tudo o que o inbox já sabe
 * fazer: texto, imagem, áudio, arquivo, respostas rápidas e template.
 *
 * A janela de atendimento está FECHADA por definição (ninguém escreveu
 * ainda), e é isso que cada provedor faz com ela:
 *
 *  - `evolution` (Baileys): não tem janela. A conversa abre com o
 *    composer inteiro liberado.
 *  - `whatsapp_cloud`: fora da janela a Meta só aceita template. A
 *    conversa abre com o composer bloqueado e a barra de 24h oferecendo
 *    o template — é a regra da plataforma, e a tela avisa ANTES de
 *    abrir, senão parece defeito nosso.
 *  - `instagram`: tem janela e não tem template. Não aparece como opção,
 *    mas aparece na lista de bloqueados com o motivo. Canal que some sem
 *    explicação vira "o sistema está quebrado".
 *
 * **A conversa nasce ao abrir**, não ao enviar: é o preço de entregar o
 * composer completo, e é o mesmo comportamento de abrir um número no
 * WhatsApp Web. Abrir o mesmo número de novo reusa a conversa em vez de
 * criar outra (`resolve` procura antes de inserir).
 */

import { useMemo, useState } from "react"
import { Loader2, MessageSquarePlus, X } from "lucide-react"
import { normalizePhone } from "@/lib/whatsapp/phone"
import {
  estadoDaLista,
  explicacaoDoCaminho,
  separarCanais,
  type CanalParaAbertura,
} from "@/lib/crm/nova-conversa"

interface NovaConversaModalProps {
  channels: CanalParaAbertura[]
  /** Lista ainda chegando — sem isso a tela nega canal que existe. */
  carregando?: boolean
  onClose: () => void
  /** Conversa aberta no canal escolhido — a tela troca para ela. */
  onAberta: (threadId: string) => void
}

const CAMPO: React.CSSProperties = {
  borderColor: "var(--ops-border)",
  background: "var(--ops-card)",
  color: "var(--ops-title)",
}

export function NovaConversaModal({
  channels,
  carregando = false,
  onClose,
  onAberta,
}: NovaConversaModalProps) {
  const separados = useMemo(() => separarCanais(channels), [channels])
  const { disponiveis, bloqueados } = separados
  const estado = estadoDaLista(separados, carregando)
  const semCanal = estado.tipo === "ok" ? null : estado.texto

  const [channelId, setChannelId] = useState(disponiveis[0]?.canal.id ?? "")
  const escolhido = disponiveis.find((d) => d.canal.id === channelId) ?? disponiveis[0]

  const [phone, setPhone] = useState("")
  const [nome, setNome] = useState("")
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const telefoneNormalizado = normalizePhone(phone)
  const podeAbrir = Boolean(escolhido && telefoneNormalizado) && !abrindo

  const abrir = async () => {
    if (!podeAbrir) return
    setAbrindo(true)
    setErro(null)
    try {
      const res = await fetch("/api/crm/inbox/threads/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          channel_id: escolhido?.canal.id,
          contact_name: nome.trim() || undefined,
          create: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(msgDeErro(data) || "Falha ao abrir a conversa")
      if (!data.thread_id) {
        throw new Error(
          data.reason === "no_channel"
            ? "Nenhum canal WhatsApp ativo nesta organização."
            : "Falha ao abrir a conversa",
        )
      }
      onAberta(data.thread_id as string)
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao abrir a conversa")
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden"
        style={{
          maxHeight: "85vh",
          background: "var(--ops-card)",
          borderRadius: "8px",
          border: "1px solid var(--ops-border)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Nova conversa"
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--ops-border)" }}
        >
          <h3
            className="m-0 flex items-center gap-2 text-[13.5px] font-[620]"
            style={{ color: "var(--ops-title)" }}
          >
            <MessageSquarePlus className="h-4 w-4" />
            Nova conversa
          </h3>
          <button
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded"
            style={{ background: "transparent", border: "none", color: "var(--ops-mut)" }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          {semCanal ? (
            <p className="text-[12px] leading-snug" style={{ color: "var(--ops-sec)" }}>
              {semCanal}
            </p>
          ) : (
            <>
              <Campo rotulo="Enviar por">
                <select
                  value={escolhido?.canal.id ?? ""}
                  onChange={(e) => {
                    setChannelId(e.target.value)
                    setErro(null)
                  }}
                  aria-label="Canal de envio"
                  className="h-[32px] w-full rounded-[6px] border px-2 text-[12.5px] outline-none"
                  style={CAMPO}
                >
                  {disponiveis.map((d) => (
                    <option key={d.canal.id} value={d.canal.id}>
                      {d.canal.display_name}
                    </option>
                  ))}
                </select>
                {escolhido?.caminho && (
                  <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--ops-mut)" }}>
                    {explicacaoDoCaminho(escolhido.caminho)}
                  </p>
                )}
              </Campo>

              <Campo rotulo="Telefone">
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    setErro(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      abrir()
                    }
                  }}
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  aria-label="Telefone do contato"
                  autoFocus
                  className="h-[32px] w-full rounded-[6px] border px-2 text-[12.5px] outline-none"
                  style={CAMPO}
                />
                {/* O número final à vista: com DDI e com o nono dígito
                    resolvido, é ele que a plataforma vai receber. */}
                <p className="mt-1 text-[11px]" style={{ color: "var(--ops-mut)" }}>
                  {phone.trim() === ""
                    ? "Com DDD. Sem o +, assumimos Brasil."
                    : telefoneNormalizado
                      ? `Vai para +${telefoneNormalizado}`
                      : "Número curto demais — confira o DDD."}
                </p>
              </Campo>

              <Campo rotulo="Nome (opcional)">
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      abrir()
                    }
                  }}
                  placeholder="Como aparece na lista"
                  aria-label="Nome do contato"
                  className="h-[32px] w-full rounded-[6px] border px-2 text-[12.5px] outline-none"
                  style={CAMPO}
                />
              </Campo>

              {erro && (
                <p
                  className="text-[11.5px] leading-snug"
                  style={{ color: "var(--crm-danger-fg, #b42318)" }}
                >
                  {erro}
                </p>
              )}

              {bloqueados.length > 0 && (
                <div
                  className="rounded-[6px] border p-2"
                  style={{ borderColor: "var(--ops-border)", background: "var(--ops-page)" }}
                >
                  <p className="mb-1 text-[11px] font-[600]" style={{ color: "var(--ops-sec)" }}>
                    Não dá para iniciar por:
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {bloqueados.map((b) => (
                      <li
                        key={b.canal.id}
                        className="text-[11px] leading-snug"
                        style={{ color: "var(--ops-mut)" }}
                      >
                        <strong style={{ fontWeight: 600 }}>{b.canal.display_name}</strong> —{" "}
                        {b.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {!semCanal && (
          <div
            className="flex items-center justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: "var(--ops-border)" }}
          >
            <button
              onClick={onClose}
              className="h-[30px] cursor-pointer rounded-[7px] border px-3 text-[11.5px] font-medium"
              style={{
                borderColor: "var(--ops-border)",
                background: "transparent",
                color: "var(--ops-sec)",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={abrir}
              disabled={!podeAbrir}
              className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--ops-title)", color: "var(--ops-page)", border: "none" }}
            >
              {abrindo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-3.5 w-3.5" />
              )}
              Abrir conversa
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-[600]" style={{ color: "var(--ops-sec)" }}>
        {rotulo}
      </span>
      {children}
    </label>
  )
}

/** A mensagem real do servidor — `errorResponse` manda ora string, ora objeto. */
function msgDeErro(data: unknown): string | null {
  const e = (data as { error?: unknown } | null)?.error
  if (typeof e === "string" && e) return e
  const m = (e as { message?: unknown } | null)?.message
  return typeof m === "string" && m ? m : null
}
