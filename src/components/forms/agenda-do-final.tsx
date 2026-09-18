"use client"

/**
 * O seletor de horário dentro da tela final.
 *
 * É a diferença entre "a gente te chama" e uma call marcada. Quem
 * acabou de ser pré-aprovado está com a mão no teclado; mandá-lo para
 * outro domínio custa exatamente esse instante — e um serviço de fora
 * não sabe que aquela pessoa é um lead nosso, com negócio e histórico.
 *
 * Três decisões que o desenho carrega:
 *
 * - **o dia é escolhido antes da hora.** Uma lista corrida com dez dias
 *   de meia em meia hora tem 180 botões, e o polegar não acha nada;
 * - **a falha não some a agenda.** Horário tomado entre a listagem e o
 *   clique é o caso comum, não o excepcional: a mensagem aparece, a
 *   lista é recarregada e a pessoa clica de novo;
 * - **na prévia do editor ela lista e não marca.** O operador precisa
 *   ver a agenda que o visitante vê; o que ele não pode é encher a
 *   agenda de verdade conferindo o formulário.
 */

import { useCallback, useEffect, useState } from "react"
import { Calendar, Check, Loader2, RefreshCw } from "lucide-react"

interface Slot {
  inicio: string
  fim: string
}

interface DiaComSlots {
  data: string
  rotulo: string
  slots: Slot[]
}

interface RespostaDaAgenda {
  disponivel: boolean
  fuso?: string
  duracaoMin?: number
  dias?: DiaComSlots[]
  fonte?: "google" | "somente_banco"
}

export interface CredenciaisDaSessao {
  session_id: string | null
  session_token: string | null
}

export interface EstiloDaAgenda {
  text: string
  subtitleColor: string
  fontSize: number
  buttonRadius: number
  buttonTextColor: string
  inputBg: string
  inputBorder: string
}

interface Marcada {
  inicio: string
  fuso: string
  meetLink: string | null
  remarcada: boolean
}

export function AgendaDoFinal({
  slug,
  credenciais,
  preview,
  t,
  buttonFill,
}: {
  slug: string
  credenciais: () => CredenciaisDaSessao
  preview: boolean
  t: EstiloDaAgenda
  buttonFill: string
}) {
  const [carregando, setCarregando] = useState(true)
  const [agenda, setAgenda] = useState<RespostaDaAgenda | null>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [marcando, setMarcando] = useState<string | null>(null)
  const [marcada, setMarcada] = useState<Marcada | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/agenda`, {
        headers: { Accept: "application/json" },
      })
      const json = (await r.json()) as { data?: RespostaDaAgenda } & RespostaDaAgenda
      const dados = (json.data ?? json) as RespostaDaAgenda
      setAgenda(dados)
      // Abre o primeiro dia COM horário: abrir um dia vazio faz a agenda
      // parecer indisponível quando ela só está cheia hoje.
      const primeiro = (dados.dias ?? []).find((d) => d.slots.length > 0)
      setDiaAberto((atual) => atual ?? primeiro?.data ?? null)
    } catch {
      setAgenda({ disponivel: false })
    } finally {
      setCarregando(false)
    }
  }, [slug])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const marcar = useCallback(
    async (slot: Slot) => {
      if (preview) return
      const cred = credenciais()
      if (!cred.session_id || !cred.session_token) {
        setErro("Não consegui identificar a sua aplicação. Recarregue a página.")
        return
      }
      setMarcando(slot.inicio)
      setErro(null)
      try {
        const r = await fetch(`/api/public/forms/${encodeURIComponent(slug)}/agenda`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: cred.session_id,
            token: cred.session_token,
            inicio: slot.inicio,
          }),
        })
        const json = (await r.json()) as {
          data?: Record<string, unknown>
        } & Record<string, unknown>
        const d = (json.data ?? json) as Record<string, unknown>
        if (d.agendado === true) {
          setMarcada({
            inicio: String(d.inicio ?? slot.inicio),
            fuso: String(d.fuso ?? agenda?.fuso ?? "America/Sao_Paulo"),
            meetLink: (d.meetLink as string | null) ?? null,
            remarcada: d.remarcada === true,
          })
          return
        }
        setErro(String(d.mensagem ?? "Não consegui marcar esse horário. Escolha outro."))
        // Recarrega: o motivo mais comum é alguém ter pegado o horário, e
        // deixar a lista velha na tela faria a pessoa clicar nele de novo.
        await carregar()
      } catch {
        setErro("A conexão caiu no meio. Tente de novo.")
      } finally {
        setMarcando(null)
      }
    },
    [preview, credenciais, slug, agenda?.fuso, carregar],
  )

  if (carregando) {
    return (
      <p style={{ marginTop: 26, fontSize: t.fontSize, opacity: 0.7, display: "flex", gap: 8, alignItems: "center" }}>
        <Loader2 size={15} className="cfy-girando" /> Buscando os horários…
      </p>
    )
  }

  // Agenda indisponível não vira erro na tela: o texto do final já diz o
  // que acontece a seguir, e um aviso vermelho num desfecho de aprovação
  // estraga justamente a tela que tinha de dar confiança.
  if (!agenda?.disponivel) return null

  if (marcada) {
    return <Confirmacao marcada={marcada} t={t} buttonFill={buttonFill} />
  }

  const dias = (agenda.dias ?? []).filter((d) => d.slots.length > 0)
  if (dias.length === 0) {
    return (
      <div style={{ marginTop: 26 }}>
        <p style={{ fontSize: t.fontSize, opacity: 0.72, margin: 0 }}>
          A agenda dos próximos dias está cheia. Eu te chamo no WhatsApp para achar um horário.
        </p>
        <button type="button" onClick={() => void carregar()} style={botaoDiscreto(t)}>
          <RefreshCw size={13} /> Ver de novo
        </button>
      </div>
    )
  }

  const aberto = dias.find((d) => d.data === diaAberto) ?? dias[0]

  return (
    <div style={{ marginTop: 28 }}>
      <p
        style={{
          margin: 0,
          fontSize: t.fontSize,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <Calendar size={15} /> Escolha o seu horário
        {agenda.duracaoMin ? (
          <span style={{ fontWeight: 400, opacity: 0.6 }}>· {agenda.duracaoMin} min</span>
        ) : null}
      </p>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 14, paddingBottom: 4 }}>
        {dias.map((d) => {
          const ativo = d.data === aberto.data
          return (
            <button
              key={d.data}
              type="button"
              onClick={() => setDiaAberto(d.data)}
              style={{
                flex: "0 0 auto",
                padding: "9px 14px",
                borderRadius: t.buttonRadius,
                border: `1px solid ${ativo ? "transparent" : t.inputBorder}`,
                background: ativo ? buttonFill : t.inputBg,
                color: ativo ? t.buttonTextColor : t.text,
                fontSize: t.fontSize - 1,
                fontWeight: ativo ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {d.rotulo}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        {aberto.slots.map((s) => (
          <button
            key={s.inicio}
            type="button"
            disabled={marcando !== null || preview}
            onClick={() => void marcar(s)}
            style={{
              padding: "11px 8px",
              borderRadius: t.buttonRadius,
              border: `1px solid ${t.inputBorder}`,
              background: t.inputBg,
              color: t.text,
              fontSize: t.fontSize,
              fontWeight: 600,
              cursor: preview ? "default" : "pointer",
              opacity: marcando && marcando !== s.inicio ? 0.45 : 1,
            }}
          >
            {marcando === s.inicio ? (
              <Loader2 size={14} className="cfy-girando" />
            ) : (
              horaLocal(s.inicio, agenda.fuso)
            )}
          </button>
        ))}
      </div>

      {preview && (
        <p style={{ marginTop: 12, fontSize: t.fontSize - 2, opacity: 0.6 }}>
          Estes são os horários de verdade. Na prévia o clique não marca nada.
        </p>
      )}

      {erro && (
        <p role="alert" style={{ marginTop: 12, fontSize: t.fontSize - 1, color: "#F87171" }}>
          {erro}
        </p>
      )}

      {agenda.fonte === "somente_banco" && (
        // A honestidade aqui é barata e o erro caro: sem o freeBusy a
        // lista pode conter um horário que existe só na agenda pessoal
        // de quem vai atender.
        <p style={{ marginTop: 10, fontSize: t.fontSize - 2, opacity: 0.55 }}>
          Confirmo o horário por e-mail em seguida.
        </p>
      )}
    </div>
  )
}

function Confirmacao({
  marcada,
  t,
  buttonFill,
}: {
  marcada: Marcada
  t: EstiloDaAgenda
  buttonFill: string
}) {
  return (
    <div
      style={{
        marginTop: 26,
        padding: 18,
        borderRadius: t.buttonRadius,
        border: `1px solid ${t.inputBorder}`,
        background: t.inputBg,
      }}
    >
      <p style={{ margin: 0, fontSize: t.fontSize + 1, fontWeight: 600, display: "flex", gap: 8 }}>
        <Check size={17} color={buttonFill} strokeWidth={3} />
        {marcada.remarcada ? "Horário remarcado" : "Horário confirmado"}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: t.fontSize + 1, color: t.subtitleColor }}>
        {dataPorExtenso(marcada.inicio, marcada.fuso)}, às {horaLocal(marcada.inicio, marcada.fuso)}{" "}
        <span style={{ opacity: 0.6 }}>({siglaDoFuso(marcada.inicio, marcada.fuso)})</span>
      </p>
      <p style={{ margin: "10px 0 0", fontSize: t.fontSize - 1, opacity: 0.7 }}>
        O convite já está indo para o seu e-mail.
        {marcada.meetLink ? " O link da chamada vai nele." : ""}
      </p>
    </div>
  )
}

function botaoDiscreto(t: EstiloDaAgenda) {
  return {
    marginTop: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: t.buttonRadius,
    border: `1px solid ${t.inputBorder}`,
    background: "transparent",
    color: t.text,
    fontSize: t.fontSize - 1,
    cursor: "pointer",
  } as const
}

/**
 * Formatação no fuso da AGENDA, não no do visitante.
 *
 * O horário mostrado tem de ser o mesmo que vai no convite e no
 * lembrete; formatar no fuso do navegador faria a tela dizer 14:00 para
 * quem está em Lisboa e o e-mail dizer 10:00, sem erro em lugar nenhum.
 * A sigla aparece do lado justamente para o de fora saber qual é.
 */
function horaLocal(iso: string, fuso = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

function dataPorExtenso(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso))
}

function siglaDoFuso(iso: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    timeZoneName: "short",
  }).formatToParts(new Date(iso))
  return partes.find((p) => p.type === "timeZoneName")?.value ?? ""
}
