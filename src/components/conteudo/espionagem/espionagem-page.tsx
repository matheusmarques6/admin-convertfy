"use client"

/**
 * Espionagem — varrer o perfil público de um concorrente e achar o TEMA que
 * performou.
 *
 * Três diferenças deliberadas em relação à tela que isto copia:
 *
 * 1. **A ordem padrão é DESTAQUE, não "mais quente".** Ordenar por curtidas
 *    + comentários num perfil de 68 mil seguidores ranqueia o tamanho da
 *    conta; o que decide se vale escrever sobre o assunto é quanto o post
 *    passou da MEDIANA do próprio perfil.
 * 2. **A fórmula parcial é DITA.** `business_discovery` não entrega alcance,
 *    salvos nem compartilhamentos — comparar essa taxa com a nossa (que tem
 *    a fórmula inteira) sem declarar a diferença seria comparar coisas
 *    distintas. A comparação com o nosso perfil roda na mesma fórmula
 *    parcial dos dois lados.
 * 3. **"Usar este tema" não leva a copy alheia.** A pauta carrega o assunto
 *    e a instrução de escrever do nosso ângulo.
 */

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ExternalLink, RefreshCw, Search, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { OpsCard } from "@/components/dashboard/ops/primitives"
import { CtBtn, CtEmpty, CtSkel, TNUM, fmtNum, inputCls } from "@/components/conteudo/ui"
import { ConteudoApiError, getEspionagem } from "@/lib/conteudo/data"
import { ordenarPosts, pautaDoTema, type FiltroFmt, type Ordem, type PostAnalisado } from "@/lib/conteudo/espionagem/analise"
import type { EspionagemResultado } from "@/lib/conteudo/espionagem/tipos"
import { ROUTES } from "@/lib/routes"

const ORDENS: Array<[Ordem, string, string]> = [
  ["destaque", "Destaque", "quanto o post passou da mediana do próprio perfil"],
  ["quente", "Mais quentes", "curtidas + comentários, o absoluto"],
  ["recentes", "Recentes", "do mais novo para o mais antigo"],
]

const FORMATOS: FiltroFmt[] = ["Todos", "Carrossel", "Reels", "Imagem", "Vídeo"]

const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`
const vezes = (n: number) => `${n.toFixed(1).replace(".", ",")}×`
/** "1 comentário", "35 comentários" — o render mostrava "1 comentários". */
const contagem = (n: number, um: string, muitos: string) => `${fmtNum(n)} ${n === 1 ? um : muitos}`

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—")

/**
 * Cabeçalho do rival. Exportado porque é ele que carrega os NÚMEROS da
 * comparação, e é ele que a verificação por render precisa desenhar — o
 * estado cheio desta tela vive em `useState` e não sai num render estático
 * sem um componente próprio para receber os dados.
 */
export function CabecalhoDoRival({ dados }: { dados: EspionagemResultado }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {dados.analise.perfil.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dados.analise.perfil.avatar} alt="" width={44} height={44} className="h-[44px] w-[44px] shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-[var(--ops-track)] text-[15px] font-bold text-[var(--ops-sec)]">
            {dados.analise.perfil.handle.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-[var(--ops-title)]">{dados.analise.perfil.nome ?? dados.analise.perfil.handle}</div>
          <div className="truncate text-[12px] text-[var(--ops-mut)]" style={TNUM}>
            @{dados.analise.perfil.handle}
            {dados.analise.perfil.seguidores != null && ` · ${contagem(dados.analise.perfil.seguidores, "seguidor", "seguidores")}`}
            {dados.analise.perfil.posts != null && ` · ${contagem(dados.analise.perfil.posts, "publicação", "publicações")}`}
          </div>
          {dados.analise.perfil.bio && <p className="mt-1.5 line-clamp-2 max-w-[520px] text-[12px] leading-[1.5] text-[var(--ops-sec)]">{dados.analise.perfil.bio}</p>}
        </div>
      </div>

      {/* A comparação com o NOSSO perfil — o número que a referência não
          tem, e o único que diz se vale copiar o caminho deles. */}
      <div className="shrink-0 md:max-w-[290px] md:text-right">
        {dados.comparacao ? (
          <>
            <div
              className={cn("text-[19px] font-semibold leading-none", dados.comparacao.quem === "deles" ? "text-[var(--ops-neg)]" : dados.comparacao.quem === "nosso" ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")}
              style={TNUM}
            >
              {dados.comparacao.quem === "empate" ? "≈" : vezes(dados.comparacao.vezes)}
            </div>
            <p className="mt-1 text-[11px] leading-[1.45] text-[var(--ops-mut)]">{dados.comparacao.nota}</p>
          </>
        ) : (
          <p className="text-[11px] leading-[1.45] text-[var(--ops-mut)]">
            Sem comparação com o seu perfil: falta snapshot de seguidores ou post sincronizado nos últimos 90 dias.
          </p>
        )}
        {dados.analise.taxaMediana != null && (
          <p className="mt-1.5 text-[11px] text-[var(--ops-mut)]" style={TNUM}>
            mediana deles {pct(dados.analise.taxaMediana)}
            {dados.taxaNossaParcial != null && ` · sua ${pct(dados.taxaNossaParcial)}`}
          </p>
        )}
      </div>
    </div>
  )
}

export function CardPost({ p, i, handle, ordem, ir }: { p: PostAnalisado; i: number; handle: string; ordem: Ordem; ir: (href: string) => void }) {
  const forte = p.destaque != null && p.destaque >= 1.5
  return (
    <div className="flex flex-col rounded-[10px] border border-[var(--ops-border)] bg-[var(--ops-card)] p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--ops-sec)]">
          {ordem === "recentes" ? p.fmt : `${i + 1}º · ${p.fmt}`}
        </span>
        <span className="text-[10.5px] text-[var(--ops-mut)]" style={TNUM}>
          {dataCurta(p.publicadoEm)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* O DESTAQUE vem primeiro: é ele que diz se o tema puxou audiência. */}
        {p.destaque != null && (
          <span className={cn("text-[17px] font-semibold leading-none", forte ? "text-[var(--ops-pos)]" : "text-[var(--ops-title)]")} style={TNUM}>
            {vezes(p.destaque)}
            <span className="ml-1 text-[10.5px] font-normal text-[var(--ops-mut)]">a mediana dele</span>
          </span>
        )}
        <span className="text-[11.5px] text-[var(--ops-sec)]" style={TNUM}>
          {contagem(p.curtidas ?? 0, "curtida", "curtidas")} · {contagem(p.comentarios ?? 0, "comentário", "comentários")}
          {p.taxa != null && ` · ${pct(p.taxa)} dos seguidores`}
        </span>
      </div>

      <p className="mt-2.5 line-clamp-3 flex-1 text-[12.5px] leading-[1.5] text-[var(--ops-title)]">{p.head}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CtBtn kind="primary" size="sm" icon={Sparkles} onClick={() => ir(`${ROUTES.ADMIN.CONTEUDO.ESTUDIO}?novo=ia&pauta=${encodeURIComponent(pautaDoTema(p, handle))}`)}>
          Usar este tema
        </CtBtn>
        {p.permalink && (
          <a
            href={p.permalink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--ops-sec)] underline-offset-2 hover:underline"
          >
            <Icon icon={ExternalLink} customSize={12} />
            Ver original
          </a>
        )}
      </div>
    </div>
  )
}

export function EspionagemPage() {
  const router = useRouter()
  const [campo, setCampo] = useState("")
  const [dados, setDados] = useState<EspionagemResultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [ordem, setOrdem] = useState<Ordem>("destaque")
  const [fmt, setFmt] = useState<FiltroFmt>("Todos")

  async function varrer(forcar = false) {
    const alvo = forcar ? (dados?.analise.perfil.handle ?? campo) : campo
    if (!alvo.trim()) return
    setCarregando(true)
    setErro(null)
    try {
      setDados(await getEspionagem(alvo, { forcar }))
    } catch (e) {
      setErro(e instanceof ConteudoApiError ? e.message : e instanceof Error ? e.message : "Falha ao varrer o perfil.")
      setDados(null)
    } finally {
      setCarregando(false)
    }
  }

  const lista = useMemo(() => (dados ? ordenarPosts(dados.analise.posts, ordem, fmt) : []), [dados, ordem, fmt])
  const semDestaque = Boolean(dados) && dados!.analise.medianaQuente == null

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-6 md:px-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-[var(--ops-title)]">Espionagem</h1>
        <p className="mt-1 max-w-[680px] text-[12.5px] leading-[1.5] text-[var(--ops-sec)]">
          Veja o que performou no perfil de um concorrente e transforme o TEMA num carrossel com a sua voz. Leitura pela API oficial do
          Instagram — só perfis Business ou Creator públicos.
        </p>
      </div>

      <OpsCard>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Icon icon={Search} customSize={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ops-mut)]" />
            <input
              value={campo}
              onChange={(e) => setCampo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && varrer()}
              placeholder="@perfil.do.concorrente"
              aria-label="@ do perfil"
              className={cn(inputCls, "w-full pl-8")}
            />
          </div>
          <CtBtn kind="primary" onClick={() => varrer()} disabled={carregando || !campo.trim()} icon={Search}>
            {carregando ? "Varrendo…" : "Analisar perfil"}
          </CtBtn>
        </div>
        <p className="mt-2 text-[11px] leading-[1.5] text-[var(--ops-mut)]">
          A varredura usa o token de um canal Instagram conectado e vale por 6 horas — reabrir o mesmo perfil não gasta chamada nova. A API
          oficial entrega <strong className="font-semibold">curtidas e comentários</strong> de terceiro, e mais nada: não há alcance, salvos
          nem compartilhamentos do lado de lá.
        </p>
      </OpsCard>

      {erro && (
        <OpsCard>
          <CtEmpty icon={AlertTriangle} title="Não deu para varrer esse perfil" desc={erro} />
        </OpsCard>
      )}

      {carregando && !dados && (
        <OpsCard>
          <div className="flex flex-col gap-3">
            <CtSkel h={60} />
            <CtSkel h={120} />
          </div>
        </OpsCard>
      )}

      {dados && (
        <>
          <OpsCard>
            <CabecalhoDoRival dados={dados} />
          </OpsCard>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {ORDENS.map(([k, rotulo, hint]) => (
                <button
                  key={k}
                  type="button"
                  title={hint}
                  onClick={() => setOrdem(k)}
                  disabled={k === "destaque" && semDestaque}
                  className={cn(
                    "h-[28px] rounded-lg border px-[11px] text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    ordem === k
                      ? "border-transparent bg-[var(--ops-title)] text-[var(--ops-card)]"
                      : "border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-sec)]",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <span className="text-[var(--ops-border)]">|</span>
            <div className="flex flex-wrap gap-1.5">
              {FORMATOS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFmt(f)}
                  className={cn(
                    "h-[28px] rounded-lg border px-[11px] text-[11.5px] font-medium transition-colors",
                    fmt === f ? "border-transparent bg-[var(--ops-track)] text-[var(--ops-title)]" : "border-[var(--ops-border)] bg-[var(--ops-card)] text-[var(--ops-mut)]",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-[var(--ops-mut)]">
                {lista.length} de {dados.analise.amostra} · varrido em {new Date(dados.varridoEm).toLocaleString("pt-BR")}
                {dados.doCache && " (cache)"}
              </span>
              <CtBtn size="sm" icon={RefreshCw} onClick={() => varrer(true)} disabled={carregando} title="Gasta uma chamada nova da Graph API">
                Varrer de novo
              </CtBtn>
            </div>
          </div>

          {semDestaque && (
            <p className="-mt-2 px-0.5 text-[11px] text-[var(--ops-mut)]">
              Menos de 5 publicações lidas: sem mediana confiável, “destaque” não é calculado e a ordem cai para o absoluto.
            </p>
          )}

          {lista.length === 0 ? (
            <OpsCard>
              <CtEmpty icon={Search} title="Nenhuma publicação nesse formato" desc="Troque o filtro de formato para ver o restante da varredura." />
            </OpsCard>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
              {lista.map((p, i) => (
                <CardPost key={p.id} p={p} i={i} handle={dados.analise.perfil.handle} ordem={ordem} ir={(href) => router.push(href)} />
              ))}
            </div>
          )}

          <p className="px-0.5 text-[11px] leading-[1.5] text-[var(--ops-mut)]">
            Fórmula da taxa: {dados.analise.formula} — <strong className="font-semibold">parcial</strong>, porque a API oficial não entrega
            alcance, salvos nem compartilhamentos de terceiros. “Usar este tema” leva só o assunto e a instrução de escrever do seu ângulo: a
            legenda do concorrente não vai junto.
          </p>
        </>
      )}

      {!dados && !carregando && !erro && (
        <OpsCard>
          <CtEmpty
            icon={Search}
            title="Digite o @ de um concorrente"
            desc="A varredura devolve as últimas publicações com curtidas e comentários, ordenadas pelo quanto cada uma passou da mediana do próprio perfil."
          />
        </OpsCard>
      )}
    </div>
  )
}
