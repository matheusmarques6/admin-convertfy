"use client"

/**
 * ConvertIA · Saúde — o painel que faltava.
 *
 * Tudo que este card mostra foi descoberto por SQL em 07/09/2026, porque não
 * existia tela: saldo do OpenRouter zerado derrubando 4 de 20 turnos, 124
 * notas sem embedding pela mesma causa, sync do vault apontando para pasta
 * inexistente e reportando sucesso, advisor com o `kind` errado.
 *
 * Regra do card: número sem fonte não aparece. Quando um dado não pôde ser
 * lido, ele diz isso — nunca mostra zero no lugar.
 */

import { useState } from "react"
import useSWR from "swr"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  HelpCircle,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react"

type Situacao = "ok" | "baixo" | "esgotado" | "desconhecido"

interface Saude {
  saldo: {
    saldoUsd: number | null
    limiteUsd: number | null
    usadoUsd: number | null
    situacao: Situacao
    pisoUsd: number
    erro: string | null
    checadoEm: string
  } | null
  embeddings_configurados: boolean
  busca_web: { provedor: "tavily" | "brave" | "serper" | null }
  turnos: {
    janela_dias: number
    total: number
    falhas: number
    taxa_falha: number | null
    por_causa: Array<{
      codigo: string
      mensagem: string
      hint: string | null
      total: number
      ultima_em: string
      exemplo_cru: string
      modelos: string[]
    }>
  }
  vault: {
    repo: string | null
    branch: string | null
    base_path: string | null
    ultimo_commit: string | null
    sincronizado_em: string | null
    erro: string | null
    puladas: Array<{ path: string; motivo: string }>
  } | null
  base: {
    notas_ativas: number
    notas_sem_vetor: number
    advisors: Array<{ titulo: string; path: string }>
  }
  lacunas: Array<{
    id: string
    fonte: string
    consulta_normalizada: string
    consultas: string[]
    frequencia: number
    ultima_vez_em: string
  }>
  schema_missing: boolean
}

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return (j?.data ?? j) as Saude
  })

const TOM: Record<Situacao, { cor: string; rotulo: string }> = {
  ok: { cor: "text-emerald-600 dark:text-emerald-400", rotulo: "OK" },
  baixo: { cor: "text-amber-600 dark:text-amber-400", rotulo: "Baixo" },
  esgotado: { cor: "text-red-600 dark:text-red-400", rotulo: "Esgotado" },
  desconhecido: { cor: "text-slate-500 dark:text-white/50", rotulo: "Desconhecido" },
}

function quando(iso: string | null | undefined): string {
  if (!iso) return "nunca"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const min = Math.round((Date.now() - d.getTime()) / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export function ConvertiaHealthCard() {
  const { data, error, mutate } = useSWR<Saude>("/api/ai/convertia/health", fetcher, {
    refreshInterval: 120_000,
  })
  const [busy, setBusy] = useState<null | "saldo" | "vault" | "busca" | "embed" | "embedar">(null)
  const [msg, setMsg] = useState<string | null>(null)

  const acao = async (
    acaoNome: "checar_saldo" | "sincronizar_vault" | "testar_busca" | "testar_embeddings" | "embedar_pendentes",
  ) => {
    setBusy(
      acaoNome === "checar_saldo"
        ? "saldo"
        : acaoNome === "testar_busca"
          ? "busca"
          : acaoNome === "testar_embeddings"
            ? "embed"
            : acaoNome === "embedar_pendentes"
              ? "embedar"
              : "vault",
    )
    setMsg(null)
    try {
      const r = await fetch("/api/ai/convertia/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: acaoNome }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
      const payload = (j?.data ?? j) as Record<string, unknown>
      if (acaoNome === "sincronizar_vault") {
        const s = payload.sync as {
          status?: string
          filesTotal?: number
          upserted?: number
          embedded?: number
          embedPending?: number
          embedError?: string | null
          error?: string
        }
        setMsg(
          s?.status === "error"
            ? `Sync falhou: ${s.error}`
            : // "synced, 0 vetorizadas" era lido como sucesso; a falha do
              // embedding não aparecia em lugar nenhum.
              `Sync ${s?.status}: ${s?.filesTotal ?? 0} arquivos, ${s?.upserted ?? 0} gravadas, ${s?.embedded ?? 0} vetorizadas.` +
              (s?.embedError ? ` Embeddings pararam em ${s.embedded ?? 0}/${s.embedPending ?? 0}: ${s.embedError}` : ""),
        )
      } else if (acaoNome === "testar_busca") {
        const b = payload.busca as
          | { ok: true; provedor: string; total: number; amostra: Array<{ titulo: string }> }
          | { ok: false; motivo: string }
        setMsg(
          b.ok
            ? `Busca OK via ${b.provedor}: ${b.total} resultado(s). 1º — ${b.amostra[0]?.titulo ?? "sem título"}`
            : `Busca falhou: ${b.motivo}`,
        )
      } else if (acaoNome === "testar_embeddings") {
        const e = payload.embeddings as
          | { ok: true; modelo: string; dimensoes: number }
          | { ok: false; modelo: string; motivo: string | null; amigavel: string }
        setMsg(
          e.ok
            ? `Embeddings OK (${e.modelo}, ${e.dimensoes} dimensões). Pode vetorizar as notas.`
            : // O motivo CRU junto: é o que diz se é crédito, chave ou o
              // provedor recusando o modelo — três consertos diferentes.
              `Embeddings falharam: ${e.amigavel} — ${e.motivo ?? "sem detalhe"}`,
        )
      } else if (acaoNome === "embedar_pendentes") {
        const e = payload.embed as { embedded: number; pending: number; error: string | null; amigavel: string | null }
        setMsg(
          e.error
            ? `Vetorizou ${e.embedded} de ${e.pending} e parou: ${e.amigavel} — ${e.error}`
            : e.pending === 0
              ? "Nenhuma nota pendente: todas já têm vetor."
              : `Vetorizou ${e.embedded} de ${e.pending} notas.`,
        )
      } else {
        const s = payload.saldo as { situacao?: string; saldoUsd?: number | null; erro?: string | null }
        setMsg(
          s?.erro
            ? `Não deu para ler o saldo: ${s.erro}`
            : `Saldo: US$ ${s?.saldoUsd?.toFixed(2) ?? "?"} (${s?.situacao}).`,
        )
      }
      await mutate()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na ação")
    } finally {
      setBusy(null)
    }
  }

  if (error) {
    return (
      <div className="rounded-[6px] border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/[0.06] px-4 py-3">
        <p className="text-[12px] text-red-700 dark:text-red-300">
          Saúde da ConvertIA indisponível: {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-4">
        <p className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-white/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a saúde da ConvertIA…
        </p>
      </div>
    )
  }

  const s = data.saldo
  const tom = TOM[s?.situacao ?? "desconhecido"]

  return (
    <div className="rounded-[6px] border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-white">
          <Activity className="h-3.5 w-3.5" /> ConvertIA · Saúde
        </h3>
        <span className="flex-1" />
        <button
          onClick={() => void acao("checar_saldo")}
          disabled={busy !== null}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2.5 text-[11.5px] font-medium text-slate-700 dark:text-white/75 disabled:opacity-50"
        >
          {busy === "saldo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wallet className="h-3 w-3" />}
          Checar saldo
        </button>
        <button
          onClick={() => void acao("sincronizar_vault")}
          disabled={busy !== null}
          className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2.5 text-[11.5px] font-medium text-slate-700 dark:text-white/75 disabled:opacity-50"
        >
          {busy === "vault" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Re-sincronizar vault
        </button>
      </div>

      {msg && <p className="mt-2 text-[11.5px] text-slate-600 dark:text-white/60">{msg}</p>}

      {/* ── Saldo ─────────────────────────────────────────────────── */}
      <div className="mt-3 rounded-[6px] border border-slate-100 dark:border-white/[0.06] px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-white/40">
            Saldo do OpenRouter
          </span>
          <span className={`text-[15px] font-semibold ${tom.cor}`}>
            {s?.saldoUsd != null ? `US$ ${s.saldoUsd.toFixed(2)}` : "—"}
          </span>
          <span className={`text-[11.5px] font-medium ${tom.cor}`}>{tom.rotulo}</span>
          <span className="text-[11px] text-slate-400 dark:text-white/40">
            piso US$ {(s?.pisoUsd ?? 5).toFixed(2)} · checado {quando(s?.checadoEm)}
          </span>
        </div>
        {s?.erro && (
          <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
            Última leitura falhou: {s.erro}
          </p>
        )}
        {!s && (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
            Nunca checado. O cron roda de hora em hora — ou clique em &ldquo;Checar saldo&rdquo;.
          </p>
        )}
        {s?.situacao === "esgotado" && (
          <p className="mt-1.5 inline-flex items-start gap-1.5 text-[11.5px] text-red-600 dark:text-red-400">
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            Com saldo zerado param juntos: o chat, os embeddings da base de conhecimento e das
            transcrições, e os agentes de email.{" "}
            <a
              href="https://openrouter.ai/settings/credits"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Adicionar crédito
            </a>
          </p>
        )}
      </div>

      {/* ── Busca na internet ─────────────────────────────────────── */}
      <div className="mt-2 rounded-[6px] border border-slate-100 dark:border-white/[0.06] px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-white/40">
            Busca na internet
          </span>
          {data.busca_web.provedor ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> {data.busca_web.provedor}
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-amber-600 dark:text-amber-400">
              não configurada
            </span>
          )}
          <button
            onClick={() => void acao("testar_busca")}
            disabled={busy !== null}
            className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2 text-[11px] font-medium text-slate-700 dark:text-white/75 disabled:opacity-50"
          >
            {busy === "busca" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
            Testar busca
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
          {data.busca_web.provedor
            ? // A variável pode existir no Vercel e não ter entrado neste deploy —
              // por isso o botão faz uma busca DE VERDADE, e não uma checagem de env.
              "O provedor acima é o que está valendo neste deploy. O teste faz uma busca real (gasta 1 crédito) e mostra o 1º resultado."
            : "Nenhuma das variáveis está preenchida (SERPER_API_KEY, TAVILY_API_KEY ou BRAVE_SEARCH_API_KEY). O web_abrir — ler uma URL que você colar — funciona mesmo assim."}
        </p>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-white/40">
          O conector &ldquo;Internet&rdquo; nasce <strong>desligado</strong> no chat: ligado por
          padrão, gastaria rodada procurando fora o que o vault responde melhor. Ligue no menu
          &ldquo;+&rdquo; da conversa.
        </p>
      </div>

      {/* ── Turnos com erro ───────────────────────────────────────── */}
      <div className="mt-2 rounded-[6px] border border-slate-100 dark:border-white/[0.06] px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-white/40">
            Turnos · últimos {data.turnos.janela_dias} dias
          </span>
          <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
            {data.turnos.total} respostas
          </span>
          {data.turnos.taxa_falha != null && (
            <span
              className={`text-[11.5px] font-medium ${
                data.turnos.falhas === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {data.turnos.falhas} com erro ({data.turnos.taxa_falha}%)
            </span>
          )}
        </div>
        {data.turnos.por_causa.length === 0 ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nenhuma falha na janela.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {data.turnos.por_causa.map((c) => (
              <li key={c.codigo} className="text-[11.5px] text-slate-700 dark:text-white/75">
                <span className="font-semibold">{c.total}×</span> {c.mensagem}
                {c.hint && <span className="text-slate-500 dark:text-white/50"> — {c.hint}</span>}
                <span className="text-slate-400 dark:text-white/40">
                  {" "}
                  · último {quando(c.ultima_em)}
                  {c.modelos.length > 0 && ` · ${c.modelos.join(", ")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Base de conhecimento ──────────────────────────────────── */}
      <div className="mt-2 rounded-[6px] border border-slate-100 dark:border-white/[0.06] px-3 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-white/40">
            Base de conhecimento
          </span>
          <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
            {data.base.notas_ativas} notas ativas
          </span>
          {data.base.advisors.length > 0 && (
            <span className="text-[11.5px] text-slate-600 dark:text-white/60">
              advisor{data.base.advisors.length === 1 ? "" : "s"}:{" "}
              {data.base.advisors.map((a) => a.titulo).join(", ")}
            </span>
          )}
        </div>
        {data.base.notas_sem_vetor > 0 && (
          <div className="mt-1">
            <p className="text-[11.5px] text-amber-600 dark:text-amber-400">
              {data.base.notas_sem_vetor} sem embedding — a busca por significado está desligada, só
              o texto responde.
              {!data.embeddings_configurados && " (OPENROUTER_API_KEY não configurada)"}
            </p>
            {data.embeddings_configurados && (
              <>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => void acao("testar_embeddings")}
                    disabled={busy !== null}
                    className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2 text-[11px] font-medium text-slate-700 dark:text-white/75 disabled:opacity-50"
                  >
                    {busy === "embed" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Testar embeddings
                  </button>
                  <button
                    onClick={() => void acao("embedar_pendentes")}
                    disabled={busy !== null}
                    className="inline-flex h-6 items-center gap-1 rounded-[6px] border border-slate-200 dark:border-white/[0.1] px-2 text-[11px] font-medium text-slate-700 dark:text-white/75 disabled:opacity-50"
                  >
                    {busy === "embedar" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Vetorizar as {data.base.notas_sem_vetor} pendentes
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-white/40">
                  A chave estar configurada não quer dizer que o embedding funcione: o teste faz uma
                  chamada real e mostra a recusa do provedor, que antes morria no log.
                </p>
              </>
            )}
          </div>
        )}
        {data.vault ? (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
            {data.vault.repo}@{data.vault.branch} · {data.vault.base_path} ·{" "}
            {data.vault.ultimo_commit?.slice(0, 8) ?? "sem commit"} · sincronizado{" "}
            {quando(data.vault.sincronizado_em)}
            {data.vault.puladas.length > 0 && ` · ${data.vault.puladas.length} nota(s) pulada(s)`}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-white/50">
            Sync do vault nunca rodou (ou a migration não foi aplicada).
          </p>
        )}
        {data.vault?.erro && (
          <p className="mt-1 text-[11.5px] text-red-600 dark:text-red-400">
            Último sync com erro: {data.vault.erro}
          </p>
        )}
        {data.vault && data.vault.puladas.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {data.vault.puladas.slice(0, 5).map((p) => (
              <li key={p.path} className="text-[11px] text-amber-600 dark:text-amber-400">
                {p.path} — {p.motivo}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Lacunas ───────────────────────────────────────────────── */}
      <div className="mt-2 rounded-[6px] border border-slate-100 dark:border-white/[0.06] px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-white/40">
          O que perguntaram e a base não respondeu
        </span>
        {data.schema_missing ? (
          <p className="mt-1 text-[11.5px] text-amber-600 dark:text-amber-400">
            Migration 20261122 ainda não aplicada — as lacunas não estão sendo registradas.
          </p>
        ) : data.lacunas.length === 0 ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-white/50">
            <HelpCircle className="h-3.5 w-3.5" /> Nenhuma busca voltou vazia ainda.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {data.lacunas.map((l) => (
              <li key={l.id} className="text-[11.5px] text-slate-700 dark:text-white/75">
                <span className="font-semibold">{l.frequencia}×</span> &ldquo;
                {(Array.isArray(l.consultas) && l.consultas[0]) || l.consulta_normalizada}&rdquo;
                <span className="text-slate-400 dark:text-white/40">
                  {" "}
                  · {l.fonte} · {quando(l.ultima_vez_em)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-white/40">
          Cada linha é uma nota que falta escrever no vault. A frequência diz qual escrever primeiro.
        </p>
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">
        O acerto do cache de prompt e o custo por turno ficam no card{" "}
        <span className="font-medium">ConvertIA · Desempenho</span>, logo abaixo. O modo econômico
        (rodadas de consulta num modelo barato) é por conversa e nasce <strong>desligado</strong> —
        ligá-lo por padrão mudaria a qualidade de toda resposta, então é escolha de quem pergunta,
        não default silencioso.
      </p>
    </div>
  )
}
