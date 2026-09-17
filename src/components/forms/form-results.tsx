"use client"

/**
 * Aba Resultados: o funil do formulário, pergunta a pergunta.
 *
 * A tela existe para responder duas coisas que hoje não têm resposta:
 * **onde as pessoas desistem** e **quais respostas disparam o evento de
 * conversão**. A segunda vem antes da primeira na ordem da tela, porque
 * é a que precisa estar certa ANTES de subir verba — descobrir depois
 * que a regra nunca casou custa a campanha inteira.
 *
 * Nada aqui inventa número. Sem sessão no período, a tela diz que não há
 * sessão — não mostra zeros que se leem como "ninguém desistiu".
 */

import useSWR from "swr"
import { AlertTriangle, CheckCircle2, TrendingDown, Users } from "lucide-react"

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = (body as { error?: unknown })?.error
    throw new Error(typeof e === "string" && e ? e : `Erro ${res.status}`)
  }
  return body
}

interface Totais {
  visitas: number
  comecaram: number
  deram_contato: number
  concluiram: number
  desqualificados: number
  abandonaram: number
  abandono_com_contato: number
  recuperados: number
  viraram_lead: number
  mediana_segundos: number
}

interface PorPergunta {
  field_ref: string
  viram: number
  responderam: number
  mediana_ms: number | null
  pararam: number
}

interface Auditoria {
  auditavel: boolean
  avisos: string[]
  respostas_que_disparam: Array<{ campo: string; opcao: string }>
  respostas_que_nao_disparam: Array<{ campo: string; opcao: string }>
}

interface Payload {
  form: { name: string; display_mode: string; views_count: number; submissions_count: number }
  funil: { totais: Totais; por_pergunta: PorPergunta[] } | null
  funil_erro: string | null
  rotulos: Record<string, { label: string; required: boolean }>
  auditoria: Auditoria
  evento: { habilitado: boolean; nome: string }
}

export function FormResults({ formId }: { formId: string }) {
  const { data, error, isLoading } = useSWR<Payload>(
    `/api/crm/forms/${formId}/resultados?dias=30`,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading) {
    return <div className="p-4 text-[12px] text-slate-500 dark:text-white/45">Carregando…</div>
  }
  if (error) {
    return (
      <div className="p-4">
        <Aviso tom="erro">{(error as Error).message}</Aviso>
      </div>
    )
  }
  if (!data) return null

  const t = data.funil?.totais
  const perguntas = (data.funil?.por_pergunta ?? [])
    .map((p) => ({
      ...p,
      label: data.rotulos[p.field_ref]?.label ?? p.field_ref,
      opcional: data.rotulos[p.field_ref]?.required === false,
    }))
    .sort((a, b) => b.viram - a.viram)

  // A pergunta que mais faz desistir: maior queda entre ver e responder.
  // Só conta a que teve pelo menos 3 visualizações — com uma ou duas, a
  // "queda de 100%" é ruído e apontá-la mandaria mexer no lugar errado.
  const gargalo = perguntas
    .filter((p) => !p.opcional && p.viram >= 3 && p.viram > p.responderam)
    .sort((a, b) => (b.viram - b.responderam) / b.viram - (a.viram - a.responderam) / a.viram)[0]

  return (
    <div className="p-4 space-y-5">
      {/* ── 1. A regra do evento: o que precisa estar certo antes da verba ── */}
      <section>
        <Titulo>Evento de conversão</Titulo>
        {!data.evento.habilitado ? (
          <p className="text-[12px] text-slate-500 dark:text-white/45">
            O evento de lead qualificado está desligado neste formulário.
          </p>
        ) : !data.auditoria.auditavel ? (
          <Aviso tom="alerta">
            O evento <strong>{data.evento.nome}</strong> está ligado, mas não há condição montada — então
            ele nunca dispara.
          </Aviso>
        ) : (
          <div className="space-y-2.5">
            {data.auditoria.avisos.map((a, i) => (
              <Aviso key={i} tom="erro">
                {a}
              </Aviso>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <ListaDeRespostas
                titulo={`Dispara "${data.evento.nome}"`}
                tom="ok"
                itens={data.auditoria.respostas_que_disparam}
                vazio="Nenhuma resposta sozinha dispara — a condição exige mais de um campo."
              />
              <ListaDeRespostas
                titulo="Não dispara"
                tom="neutro"
                itens={data.auditoria.respostas_que_nao_disparam}
                vazio="Toda resposta dispara o evento."
              />
            </div>
          </div>
        )}
      </section>

      {/* ── 2. O funil ── */}
      <section>
        <Titulo>Últimos 30 dias</Titulo>
        {data.funil_erro ? (
          <Aviso tom="alerta">
            As sessões ainda não estão disponíveis neste ambiente ({data.funil_erro}). Os números de
            visita e envio abaixo vêm do contador do formulário.
          </Aviso>
        ) : null}

        {t && t.visitas === 0 ? (
          <p className="text-[12px] text-slate-500 dark:text-white/45">
            Nenhuma sessão registrada nos últimos 30 dias. Assim que alguém abrir o formulário, o
            caminho dela aparece aqui.
          </p>
        ) : t ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kpi rotulo="Abriram" valor={t.visitas} icone={Users} />
              <Kpi rotulo="Começaram" valor={t.comecaram} sub={pct(t.comecaram, t.visitas)} />
              <Kpi rotulo="Deixaram contato" valor={t.deram_contato} sub={pct(t.deram_contato, t.visitas)} />
              <Kpi rotulo="Concluíram" valor={t.concluiram} sub={pct(t.concluiram, t.visitas)} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <Kpi rotulo="Abandonaram" valor={t.abandonaram} />
              <Kpi
                rotulo="Abandono com contato"
                valor={t.abandono_com_contato}
                sub="viraram lead no CRM"
              />
              <Kpi rotulo="Voltaram pelo link" valor={t.recuperados} />
              <Kpi
                rotulo="Tempo até concluir"
                valor={t.mediana_segundos > 0 ? formatarDuracao(t.mediana_segundos) : "—"}
                sub={t.mediana_segundos > 0 ? "mediana" : "ninguém concluiu ainda"}
              />
            </div>
            {t.desqualificados > 0 && (
              <p className="mt-2 text-[11px] text-slate-500 dark:text-white/45">
                {t.desqualificados} {t.desqualificados === 1 ? "pessoa terminou" : "pessoas terminaram"} num
                final de desqualificação — isso não é abandono.
              </p>
            )}
          </>
        ) : null}
      </section>

      {/* ── 3. Pergunta a pergunta ── */}
      {perguntas.length > 0 && (
        <section>
          <Titulo>Pergunta a pergunta</Titulo>
          {gargalo && (
            <div className="mb-2.5 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[0.07] px-2.5 py-2">
              <TrendingDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[11.5px] leading-relaxed text-amber-900 dark:text-amber-200">
                A pergunta que mais faz desistir é <strong>{gargalo.label}</strong>:{" "}
                {gargalo.viram - gargalo.responderam} de {gargalo.viram} que a viram não responderam.
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left text-slate-500 dark:text-white/45 border-b border-black/[0.06] dark:border-white/[0.08]">
                  <th className="py-1.5 pr-2 font-medium">Pergunta</th>
                  <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap">Viram</th>
                  <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap">Responderam</th>
                  <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap">Queda</th>
                  <th className="py-1.5 pl-2 font-medium text-right whitespace-nowrap">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {perguntas.map((p) => {
                  const queda = p.viram > 0 ? (p.viram - p.responderam) / p.viram : 0
                  return (
                    <tr
                      key={p.field_ref}
                      className="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0"
                    >
                      <td className="py-1.5 pr-2 text-slate-900 dark:text-white/90">
                        {p.label}
                        {p.opcional && (
                          <span className="ml-1.5 text-[10px] text-slate-400 dark:text-white/35">opcional</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{p.viram}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{p.responderam}</td>
                      <td
                        className={
                          "py-1.5 px-2 text-right tabular-nums " +
                          // Campo opcional nunca é pintado de alerta: pular
                          // o que é opcional é escolha, não desistência.
                          (p.opcional
                            ? "text-slate-400 dark:text-white/35"
                            : queda >= 0.4
                              ? "text-red-600 dark:text-red-400"
                              : queda >= 0.2
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-slate-500 dark:text-white/45")
                        }
                      >
                        {/* Sem quem viu, não existe taxa de queda — e 0% se
                            leria como "ninguém desistiu aqui". */}
                        {p.viram > 0 ? `${Math.round(queda * 100)}%` : "—"}
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-slate-500 dark:text-white/45">
                        {p.mediana_ms ? formatarDuracao(Math.round(p.mediana_ms / 1000)) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// ──────────────────────────── pedaços ───────────────────────────────────

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45 mb-2">
      {children}
    </h3>
  )
}

function Kpi({
  rotulo,
  valor,
  sub,
  icone: Icone,
}: {
  rotulo: string
  valor: number | string
  sub?: string | null
  icone?: typeof Users
}) {
  return (
    <div className="rounded-md border border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2">
      {/* `min-h` de duas linhas: sem isso o card cujo rótulo quebra fica
          mais alto que os vizinhos e a fileira sai torta. */}
      <div className="flex items-start gap-1.5 text-[10.5px] leading-[1.35] min-h-[28px] text-slate-500 dark:text-white/45">
        {Icone && <Icone className="h-3 w-3 mt-px shrink-0" />}
        <span>{rotulo}</span>
      </div>
      <div className="mt-0.5 text-[17px] font-semibold tabular-nums text-slate-900 dark:text-white">
        {valor}
      </div>
      {sub && <div className="text-[10.5px] text-slate-500 dark:text-white/45">{sub}</div>}
    </div>
  )
}

function Aviso({ tom, children }: { tom: "erro" | "alerta"; children: React.ReactNode }) {
  const cls =
    tom === "erro"
      ? "border-red-300/60 bg-red-50 text-red-900 dark:border-red-400/25 dark:bg-red-400/[0.07] dark:text-red-200"
      : "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/[0.07] dark:text-amber-200"
  return (
    <div className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${cls}`}>
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <p className="text-[11.5px] leading-relaxed">{children}</p>
    </div>
  )
}

function ListaDeRespostas({
  titulo,
  tom,
  itens,
  vazio,
}: {
  titulo: string
  tom: "ok" | "neutro"
  itens: Array<{ campo: string; opcao: string }>
  vazio: string
}) {
  return (
    <div className="rounded-md border border-black/[0.06] dark:border-white/[0.08] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-500 dark:text-white/45">
        {tom === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
        {titulo}
      </div>
      {itens.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-white/45">{vazio}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {itens.map((x, i) => (
            <li key={i} className="text-[11.5px] text-slate-900 dark:text-white/85">
              {x.opcao}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const pct = (parte: number, total: number): string | null =>
  total > 0 ? `${Math.round((parte / total) * 100)}% de quem abriu` : null

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${segundos}s`
  const min = Math.floor(segundos / 60)
  const s = segundos % 60
  if (min < 60) return s > 0 ? `${min}min ${s}s` : `${min}min`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}
