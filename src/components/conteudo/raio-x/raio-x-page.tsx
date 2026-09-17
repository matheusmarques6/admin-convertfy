"use client"

/**
 * Raio-X do perfil — a varredura que responde "o que está travando o
 * conteúdo" e entrega a saída pronta para executar.
 *
 * Três diferenças deliberadas em relação à tela que isto copia:
 *
 * 1. **A nota mostra a CONTA.** Lá aparece um mostrador com "48 de 100" e
 *    nada mais. Aqui cada componente traz peso, evidência e a referência
 *    contra a qual foi medido — e o que não pôde ser medido aparece como
 *    NÃO MEDIDO, com o motivo, em vez de puxar a nota para baixo em
 *    silêncio.
 * 2. **"O que você posta" é MEDIDO.** Lá a tela afirma que "carrossel é o
 *    formato que mais salva e retém" — verdade de mercado que pode ser
 *    mentira neste perfil. Aqui a frase sai de `sends ÷ alcance` por
 *    formato, com a amostra declarada, e formato sem amostra não vira
 *    conselho.
 * 3. **Cada lacuna oferece o que resolve.** Lá todo card termina em "Gerar
 *    carrossel disso", inclusive onde o que falta é rotina ou classificação.
 *    Aqui a lacuna tem ação de sistema, pauta, ou as duas.
 */

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { AlertTriangle, ArrowRight, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { DateControl, defaultOpsPeriod, periodQuery, type OpsPeriodValue } from "@/components/dashboard/ops/date-control"
import { OpsCard, SectionTitle } from "@/components/dashboard/ops/primitives"
import { PerfilPicker } from "@/components/conteudo/dashboard/perfil-picker"
import { CtAvatar, CtBtn, CtEmpty, CtSkel, TNUM, fmtNum } from "@/components/conteudo/ui"
import { getRaioX } from "@/lib/conteudo/data"
import { PERFIL_CONSOLIDADO, type Kpi, type PerfilFiltro } from "@/lib/conteudo/types"
import type { Lacuna } from "@/lib/conteudo/raio-x/diagnostico"
import type { Componente, Faixa } from "@/lib/conteudo/raio-x/nota"
import { ROUTES } from "@/lib/routes"

const COR_FAIXA: Record<Faixa, string> = {
  critico: "var(--ops-neg)",
  atencao: "#D97706",
  bom: "#0EA5E9",
  excelente: "var(--ops-pos)",
}

const ROTULO_FAIXA: Record<Faixa, string> = {
  critico: "crítico",
  atencao: "atenção",
  bom: "bom",
  excelente: "excelente",
}

const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`

/**
 * Mostrador da nota. O arco vai de 0 a 100 e a cor sai da faixa — sem nota
 * ele fica cinza e escreve "—", nunca zero: zero se lê como "péssimo" e a
 * verdade é "não deu para medir".
 */
function Mostrador({ nota, faixa }: { nota: number | null; faixa: Faixa | null }) {
  const r = 52
  const circ = Math.PI * r
  const preenchido = nota == null ? 0 : (nota / 100) * circ
  const cor = faixa ? COR_FAIXA[faixa] : "var(--ops-mut)"
  return (
    <div className="relative flex w-[136px] shrink-0 flex-col items-center">
      <svg viewBox="0 0 128 72" className="w-[128px]" role="img" aria-label={nota == null ? "Nota indisponível" : `Nota ${nota} de 100`}>
        <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" stroke="var(--ops-track)" strokeWidth="11" strokeLinecap="round" />
        {nota != null && (
          <path
            d="M 12 64 A 52 52 0 0 1 116 64"
            fill="none"
            stroke={cor}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${preenchido} ${circ}`}
          />
        )}
      </svg>
      <div className="-mt-[34px] flex flex-col items-center">
        <span className="text-[30px] font-semibold leading-none text-[var(--ops-title)]" style={TNUM}>
          {nota ?? "—"}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ops-mut)]">de 100</span>
      </div>
      {faixa && (
        <span className="mt-1.5 text-[11px] font-semibold" style={{ color: cor }}>
          {ROTULO_FAIXA[faixa]}
        </span>
      )}
    </div>
  )
}

/** Uma linha da composição: peso, barra, evidência e a referência no title. */
function LinhaDoComponente({ c }: { c: Componente }) {
  const medido = c.valor != null
  return (
    <div className="py-[9px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-[var(--ops-title)]">
          {c.rotulo}
          <span className="ml-1.5 text-[10.5px] font-normal text-[var(--ops-mut)]" style={TNUM}>
            peso {c.peso}
          </span>
        </span>
        <span className={cn("shrink-0 text-[11px]", medido ? "text-[var(--ops-sec)]" : "text-[var(--ops-mut)]")} style={TNUM}>
          {medido ? `${Math.round((c.valor as number) * 100)}%` : "não medido"}
        </span>
      </div>
      {/* Barra TRACEJADA no não medido: trilho vazio se lê como zero, que é
          exatamente o que a nota existe para não dizer. O gradiente vai
          inline porque em classe arbitrária do Tailwind ele não aplica — e
          o defeito só apareceu renderizando. */}
      <div
        className="mt-1.5 h-[6px] w-full overflow-hidden rounded-full"
        style={
          medido
            ? { background: "var(--ops-track)" }
            : { background: "repeating-linear-gradient(90deg, var(--ops-track) 0 6px, transparent 6px 11px)" }
        }
      >
        {medido && <div className="h-full rounded-full bg-[var(--ops-title)]" style={{ width: `${Math.max(2, Math.round((c.valor as number) * 100))}%` }} />}
      </div>
      <div className="mt-1.5 text-[11px] leading-[1.45] text-[var(--ops-mut)]" title={c.referencia}>
        {medido ? c.evidencia : c.motivo}
      </div>
    </div>
  )
}

function CardKpi({ kpi }: { kpi: Kpi }) {
  const neg = kpi.delta?.startsWith("-") || kpi.delta?.startsWith("−")
  return (
    <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] px-[15px] py-[13px]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">{kpi.label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[19px] font-semibold leading-none text-[var(--ops-title)]" style={TNUM}>
          {kpi.valor}
        </span>
        {kpi.delta && (
          <span className={cn("text-[11px] font-semibold", neg ? "text-[var(--ops-neg)]" : "text-[var(--ops-pos)]")} style={TNUM}>
            {kpi.delta}
          </span>
        )}
      </div>
      {kpi.nota && <div className="mt-1 truncate text-[10.5px] text-[var(--ops-mut)]" title={kpi.nota}>{kpi.nota}</div>}
    </div>
  )
}

function CardLacuna({ l, i, ir }: { l: Lacuna; i: number; ir: (href: string) => void }) {
  const alta = l.gravidade === "alta"
  return (
    <div className="rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-[16px]">
      <div className="flex items-start gap-3">
        <span
          className="mt-[2px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ color: alta ? "var(--ops-neg)" : "#D97706", background: alta ? "rgba(220,38,38,0.12)" : "rgba(217,119,6,0.12)" }}
        >
          {i + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-[1.35] text-[var(--ops-title)]">{l.titulo}</div>
          <div className="mt-1 text-[11.5px] font-medium text-[var(--ops-sec)]" style={TNUM}>
            {l.evidencia}
          </div>
          <p className="mt-2 text-[12px] leading-[1.5]" style={{ color: alta ? "var(--ops-neg)" : "#B45309" }}>
            {l.custo}
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.5] text-[var(--ops-sec)]">
            <span className="font-semibold text-[var(--ops-title)]">Saída: </span>
            {l.saida}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {l.pauta && (
              // O Estúdio já sabe abrir com a pauta escrita (`?novo=ia&pauta=`)
              // — é o mesmo caminho do Banco de Ideias, sem encanamento novo.
              <CtBtn kind="primary" size="sm" icon={Sparkles} onClick={() => ir(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=ia&pauta=${encodeURIComponent(l.pauta as string)}`)}>
                Gerar carrossel disso
              </CtBtn>
            )}
            {l.acao && (
              <CtBtn size="sm" icon={ArrowRight} onClick={() => ir(l.acao!.href)}>
                {l.acao.rotulo}
              </CtBtn>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RaioXPage() {
  const router = useRouter()
  const [perfil, setPerfil] = useState<PerfilFiltro>(PERFIL_CONSOLIDADO)
  const [period, setPeriod] = useState<OpsPeriodValue>(() => defaultOpsPeriod())
  // `periodQuery` devolve a querystring; o par start/end sai dela, como o
  // Dashboard Social já faz — duas leituras do mesmo período têm de usar a
  // mesma conversão.
  const pq = periodQuery(period)
  const janela = useMemo(() => {
    const p = new URLSearchParams(pq)
    return { start: p.get("start") ?? "", end: p.get("end") ?? "" }
  }, [pq])

  const { data, error, isLoading } = useSWR(["conteudo-raio-x", perfil, pq], () => getRaioX(perfil, janela), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const perfilAtual = useMemo(() => data?.perfis.find((p) => p.id === data.perfil) ?? null, [data])

  // A frase do mix sai do DADO: sem dois formatos com amostra suficiente ela
  // simplesmente não existe — afirmar "carrossel retém mais" sem ter medido
  // aqui é o que esta tela recusa fazer.
  const comparaveis = (data?.formatos ?? []).filter((f) => f.amostra >= 3 && f.retencao != null)
  const campeao = comparaveis.length >= 2 ? comparaveis.reduce((a, b) => ((b.retencao as number) > (a.retencao as number) ? b : a)) : null

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ops-title)]">
            Raio-X do perfil
          </h1>
          <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.5] text-[var(--ops-sec)]">
            A nota, o que está travando o crescimento e a saída pronta para executar. Tudo sai do que já foi medido no seu Instagram — número
            sem fonte aparece como “—”, nunca inventado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PerfilPicker val={perfil} onChange={setPerfil} perfis={data?.perfis ?? null} />
          <DateControl value={period} onChange={setPeriod} />
        </div>
      </div>

      {error && (
        <OpsCard>
          <CtEmpty icon={AlertTriangle} title="Não deu para montar o Raio-X" desc={error instanceof Error ? error.message : "Erro ao consultar a API."} />
        </OpsCard>
      )}

      {isLoading && !data && (
        <OpsCard>
          <div className="flex flex-col gap-3 p-1">
            <CtSkel h={90} />
            <CtSkel h={140} />
          </div>
        </OpsCard>
      )}

      {data && (
        <>
          {/* Perfil + nota + composição */}
          <OpsCard noPad>
            <div className="flex flex-col gap-5 p-[18px] md:flex-row md:items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <div className="flex items-center gap-3">
                  <CtAvatar perfil={perfilAtual ?? { nome: "Consolidado", handle: null, cor: "", avatar: null }} size={44} />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-[var(--ops-title)]">{perfilAtual?.nome ?? "Todos os perfis"}</div>
                    <div className="truncate text-[12px] text-[var(--ops-mut)]" style={TNUM}>
                      {[
                        perfilAtual?.handle ? `@${perfilAtual.handle.replace(/^@/, "")}` : null,
                        data.seguidores != null ? `${fmtNum(data.seguidores)} seguidores` : "sem snapshot de seguidores",
                        `${fmtNum(data.cobertura.totalPosts)} posts sincronizados`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-[var(--ops-border)]">
                  {data.nota.componentes.map((c) => (
                    <LinhaDoComponente key={c.id} c={c} />
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-2 md:w-[180px] md:border-l md:border-[var(--ops-border)] md:pl-5">
                <Mostrador nota={data.nota.nota} faixa={data.nota.faixa} />
                <p className="text-center text-[11px] leading-[1.45] text-[var(--ops-mut)]">
                  {data.nota.medidos} de {data.nota.total} {data.nota.medidos === 1 ? "componente medido" : "componentes medidos"}.
                  {data.nota.medidos < data.nota.total && " O que não foi medido saiu do cálculo — não conta como zero."}
                </p>
              </div>
            </div>
          </OpsCard>

          {/* Os mesmos KPIs do dashboard — uma régua só para as duas telas */}
          <div>
            <SectionTitle title="Números do período" hint="a mesma medição do Dashboard Social" />
            <div className="mt-2 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {data.kpis.slice(0, 8).map((k) => (
                <CardKpi key={k.label} kpi={k} />
              ))}
            </div>
          </div>

          {/* O que você posta — medido, nunca afirmado */}
          <OpsCard title="O que você posta" hint="retenção medida por formato neste perfil">
            {data.formatos.length === 0 ? (
              <CtEmpty icon={Target} title="Nenhum post no período" desc="Escolha um período com publicações para o formato ser medido." />
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.formatos.map((f) => (
                  <div key={f.fmt} className="flex items-center gap-3">
                    <span className="w-[76px] shrink-0 text-[12px] font-medium text-[var(--ops-title)]">{f.fmt}</span>
                    <div className="h-[8px] flex-1 overflow-hidden rounded-full bg-[var(--ops-track)]">
                      <div className="h-full rounded-full bg-[var(--ops-title)]" style={{ width: `${Math.max(2, Math.round(f.share * 100))}%` }} />
                    </div>
                    <span className="w-[42px] shrink-0 text-right text-[11.5px] text-[var(--ops-sec)]" style={TNUM}>
                      {Math.round(f.share * 100)}%
                    </span>
                    <span className="w-[150px] shrink-0 text-right text-[11px] text-[var(--ops-mut)]" style={TNUM}>
                      {f.retencao == null
                        ? "sem alcance medido"
                        : `${pct(f.retencao)} sends ÷ alc · ${f.amostra} ${f.amostra === 1 ? "post" : "posts"}`}
                    </span>
                  </div>
                ))}
                <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ops-mut)]">
                  {campeao
                    ? `Neste perfil quem mais retém é ${campeao.fmt} (${pct(campeao.retencao as number)} de sends ÷ alcance em ${campeao.amostra} posts) e ele é ${Math.round(campeao.share * 100)}% do feed.`
                    : "Ainda não dá para dizer qual formato retém mais: é preciso pelo menos dois formatos com 3 posts com alcance cada."}
                </p>
              </div>
            )}
          </OpsCard>

          {/* Diagnóstico */}
          <div>
            <SectionTitle title="Diagnóstico" hint="cada lacuna já vem com a saída — e com o número que a produziu" />
            <div className="mt-2 flex flex-col gap-2.5">
              {data.lacunas.length === 0 ? (
                <OpsCard>
                  <CtEmpty
                    icon={Target}
                    title="Nenhuma lacuna medida neste período"
                    desc="Cadência, classificação, formato, comment gate, alcance, referência e kit de marca estão em dia pelo que foi medido."
                  />
                </OpsCard>
              ) : (
                data.lacunas.map((l, i) => <CardLacuna key={l.id} l={l} i={i} ir={(href) => router.push(href)} />)
              )}
            </div>
          </div>

          {data.avisos.length > 0 && (
            <OpsCard title="Avisos da coleta">
              <ul className="flex flex-col gap-1.5">
                {data.avisos.map((a) => (
                  <li key={a} className="flex gap-2 text-[11.5px] leading-[1.5] text-[var(--ops-sec)]">
                    <Icon icon={AlertTriangle} customSize={13} className="mt-[2px] shrink-0 text-[var(--ops-neg)]" />
                    {a}
                  </li>
                ))}
              </ul>
            </OpsCard>
          )}

          <p className="px-0.5 text-[11px] text-[var(--ops-mut)]">
            Período de {data.periodo.start.split("-").reverse().join("/")} a {data.periodo.end.split("-").reverse().join("/")}.{" "}
            {data.sincronizadoEm ? `Sincronizado em ${new Date(data.sincronizadoEm).toLocaleString("pt-BR")}.` : "Ainda não sincronizado."}{" "}
            A nota compara contra medianas publicadas com fonte, a meta do próprio canal e o teto que este perfil já provou — nunca contra um
            alvo inventado.
          </p>
        </>
      )}
    </div>
  )
}
