"use client"

/**
 * Iniciar uma conversa NOVA pelo inbox — puxar a primeira mensagem em
 * vez de só responder.
 *
 * O que muda em relação a responder: a janela de atendimento está
 * FECHADA por definição (ninguém escreveu ainda), e cada provedor reage
 * a isso de um jeito. `lib/crm/nova-conversa.ts` guarda a regra; aqui
 * ela vira tela:
 *
 *  - `evolution` → caixa de texto. A thread nasce no primeiro envio.
 *  - `whatsapp_cloud` → só template aprovado. A caixa de texto NÃO é
 *    oferecida: a Meta recusaria (131047) e o atendente ficaria sem
 *    entender por quê.
 *  - `instagram` → fora da lista de canais, mas presente na de
 *    bloqueados com o motivo. Canal que some sem explicação vira "o
 *    sistema está quebrado".
 *
 * A thread só é criada no ENVIO (`resolve` com `create: true`), nunca ao
 * abrir o modal: fechar sem mandar nada não pode deixar conversa
 * fantasma na caixa de ninguém.
 */

import { useMemo, useState } from "react"
import { Loader2, MessageSquarePlus, Send, X } from "lucide-react"
import { normalizePhone } from "@/lib/whatsapp/phone"
import {
  estadoDaLista,
  explicacaoDoCaminho,
  separarCanais,
  type CanalParaAbertura,
} from "@/lib/crm/nova-conversa"
import { TemplatePickerModal } from "./template-picker-modal"

interface NovaConversaModalProps {
  channels: CanalParaAbertura[]
  /** Lista ainda chegando — sem isso a tela nega canal que existe. */
  carregando?: boolean
  onClose: () => void
  /** Thread criada e primeira mensagem enviada — abre a conversa. */
  onCriada: (threadId: string) => void
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
  onCriada,
}: NovaConversaModalProps) {
  const separados = useMemo(() => separarCanais(channels), [channels])
  const { disponiveis, bloqueados } = separados
  const estado = estadoDaLista(separados, carregando)
  const semCanal = estado.tipo === "ok" ? null : estado.texto

  const [channelId, setChannelId] = useState(disponiveis[0]?.canal.id ?? "")
  const escolhido = disponiveis.find((d) => d.canal.id === channelId) ?? disponiveis[0]

  const [phone, setPhone] = useState("")
  const [nome, setNome] = useState("")
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pickerAberto, setPickerAberto] = useState(false)
  /**
   * Thread já criada num envio que falhou DEPOIS (o provedor recusou).
   * Reusa no retry — criar outra deixaria duas conversas do mesmo número
   * na caixa — e permite abrir a conversa mesmo assim.
   */
  const [threadCriada, setThreadCriada] = useState<string | null>(null)

  const telefoneNormalizado = normalizePhone(phone)
  const podeEnviar = Boolean(escolhido && telefoneNormalizado)

  /** Cria (ou reusa) a thread no canal ESCOLHIDO. */
  const garantirThread = async (): Promise<string> => {
    if (threadCriada) return threadCriada
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
    setThreadCriada(data.thread_id as string)
    return data.thread_id as string
  }

  const enviarTexto = async () => {
    const body = texto.trim()
    if (!body || !podeEnviar || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const threadId = await garantirThread()
      const res = await fetch(`/api/crm/inbox/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", body }),
      })
      const data = await res.json().catch(() => ({}))
      // A rota devolve 200 com sent:false quando o provedor recusa — os
      // dois caminhos são erro para quem está na tela.
      if (!res.ok || data.sent === false) throw new Error(msgDeErro(data) || "Falha no envio")
      onCriada(threadId)
    } catch (err) {
      // Mantém o texto digitado para a re-tentativa.
      setErro(err instanceof Error ? err.message : "Falha no envio")
    } finally {
      setEnviando(false)
    }
  }

  /**
   * Reconfirma o template ANTES de a thread nascer.
   *
   * A rota de mensagens valida o template (existe? aprovado? variáveis
   * batem?) e responde 422 ANTES de gravar a mensagem local — então uma
   * thread já criada ficaria vazia no topo do inbox, sem prévia e sem
   * nada que a explique. O picker só lista aprovados e monta os params
   * pelo `body_variables`, então a única janela que sobra é a Meta
   * reprovar o template entre carregar a tela e enviar. É essa que esta
   * releitura fecha; o resíduo (reprovar entre a releitura e o POST) é
   * milissegundos e aparece como erro na tela.
   */
  const templateAindaVale = async (args: {
    templateName: string
    language: string
    params: string[]
  }): Promise<void> => {
    const res = await fetch(
      `/api/crm/whatsapp/templates?channel_id=${escolhido?.canal.id}&approved=1`,
    )
    const data = await res.json().catch(() => ({}))
    // Falha ao reconferir não vira recusa: a lista pode cair por rede e
    // recusar aqui bloquearia um envio que a rota aceitaria.
    if (!res.ok) return
    const lista = Array.isArray(data.templates) ? data.templates : []
    const achado = lista.find(
      (t: { name?: string; language?: string; body_variables?: number }) =>
        t.name === args.templateName && t.language === args.language,
    )
    if (!achado) {
      throw new Error(
        `O template "${args.templateName}" não está mais aprovado na Meta. Clique em Sincronizar e escolha outro.`,
      )
    }
    if ((achado.body_variables ?? 0) !== args.params.length) {
      throw new Error(
        `O template "${args.templateName}" mudou de variáveis na Meta. Clique em Sincronizar e preencha de novo.`,
      )
    }
  }

  const enviarTemplate = async (args: {
    templateName: string
    language: string
    params: string[]
  }) => {
    await templateAindaVale(args)
    const threadId = await garantirThread()
    const res = await fetch(`/api/crm/inbox/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "template",
        template_name: args.templateName,
        template_language: args.language,
        template_params: args.params,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.sent === false) throw new Error(msgDeErro(data) || "Falha no envio")
    setPickerAberto(false)
    onCriada(threadId)
  }

  /** Trocar canal ou número invalida a thread já criada pelo anterior. */
  const reiniciarDestino = () => {
    setThreadCriada(null)
    setErro(null)
  }

  return (
    <>
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
                      reiniciarDestino()
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
                      reiniciarDestino()
                    }}
                    inputMode="tel"
                    placeholder="(11) 99999-9999"
                    aria-label="Telefone do contato"
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
                    placeholder="Como aparece na lista"
                    aria-label="Nome do contato"
                    className="h-[32px] w-full rounded-[6px] border px-2 text-[12.5px] outline-none"
                    style={CAMPO}
                  />
                </Campo>

                {escolhido?.caminho === "texto_livre" && (
                  <Campo rotulo="Primeira mensagem">
                    <textarea
                      rows={3}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault()
                          enviarTexto()
                        }
                      }}
                      placeholder="Escreva a primeira mensagem…"
                      aria-label="Primeira mensagem"
                      disabled={enviando}
                      className="w-full resize-none rounded-[6px] border p-2 text-[12.5px] outline-none"
                      style={CAMPO}
                    />
                  </Campo>
                )}

                {erro && (
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="text-[11.5px] leading-snug"
                      style={{ color: "var(--crm-danger-fg, #b42318)" }}
                    >
                      {erro}
                    </p>
                    {/* A thread existe mesmo com o envio recusado — abrir
                        dá acesso ao composer completo (mídia, template). */}
                    {threadCriada && (
                      <button
                        onClick={() => onCriada(threadCriada)}
                        className="shrink-0 cursor-pointer text-[11.5px] underline"
                        style={{ background: "none", border: "none", color: "var(--ops-sec)" }}
                      >
                        Abrir conversa
                      </button>
                    )}
                  </div>
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
              {escolhido?.caminho === "template" ? (
                <button
                  onClick={() => {
                    setErro(null)
                    setPickerAberto(true)
                  }}
                  disabled={!podeEnviar}
                  className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--ops-title)", color: "var(--ops-page)", border: "none" }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Escolher template
                </button>
              ) : (
                <button
                  onClick={enviarTexto}
                  disabled={!podeEnviar || !texto.trim() || enviando}
                  className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] px-3 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--ops-title)", color: "var(--ops-page)", border: "none" }}
                >
                  {enviando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Enviar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* IRMÃO do overlay, não filho: dentro dele, clicar no fundo do
          picker borbulharia para o `onClose` de cima e fecharia os dois —
          cancelar o template jogaria fora o que já foi digitado. */}
      {pickerAberto && escolhido && (
        <TemplatePickerModal
          channelId={escolhido.canal.id}
          onSend={enviarTemplate}
          onClose={() => setPickerAberto(false)}
        />
      )}
    </>
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
