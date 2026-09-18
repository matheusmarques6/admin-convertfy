"use client"

/**
 * A aba Fluxo (handoff §5): canvas com grade de pontos, nós de 232×64
 * em duas linhas, arestas SVG (ordem tracejada, desvio sólido com
 * pílula) e o painel de 320px à direita com os desvios da tela
 * selecionada.
 *
 * O painel NÃO reimplementa a edição de desvios: é o `FlowEditor` com
 * `foco`, o mesmo que o inspetor da aba Criar usa. Dois editores da
 * mesma regra divergiriam no primeiro operador novo.
 *
 * Duplo clique no nó abre a tela em Criar — a seleção é a MESMA nos dois
 * lados (`noDaSelecao`), então o operador não perde o lugar ao trocar de
 * aba.
 */

import { useMemo } from "react"
import { Flag, Info, Pencil, Play, Workflow } from "lucide-react"
import type { FormSchema } from "@/types/forms-conversational"
import {
  caminhoDaAresta,
  montarCanvas,
  NO,
  type NoDoCanvas,
} from "@/lib/forms/fluxo-canvas"
import { FlowEditor, type FocoDoFluxo } from "./flow-editor"
import { TipoIcone } from "./tipo-icone"

const BRAND = "#4E62D8"

export function FluxoCanvas({
  fluxo,
  onChange,
  temAbertura,
  selecionado,
  onSelecionar,
  onEditar,
  formId,
}: {
  fluxo: FormSchema
  onChange: (f: FormSchema) => void
  temAbertura: boolean
  /** Id do nó (ver `montarCanvas`). */
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  /** Duplo clique / botão Editar: abre o nó na aba Criar. */
  onEditar: (no: NoDoCanvas) => void
  formId?: string
}) {
  const canvas = useMemo(() => montarCanvas(fluxo, { temAbertura }), [fluxo, temAbertura])
  const porId = useMemo(() => new Map(canvas.nos.map((n) => [n.id, n])), [canvas])
  const noSel = selecionado ? (porId.get(selecionado) ?? null) : null

  const foco: FocoDoFluxo | null = !noSel
    ? null
    : noSel.tipo === "abertura"
      ? { tipo: "abertura" }
      : noSel.tipo === "final"
        ? { tipo: "final", ref: noSel.ref }
        : { tipo: "tela", ref: noSel.ref }

  return (
    <div className="flex h-full min-h-0">
      <div
        className="relative min-w-0 flex-1 overflow-auto bg-slate-50 [--fluxo-ponto:rgba(0,0,0,0.08)] dark:bg-[#0A0B12] dark:[--fluxo-ponto:rgba(255,255,255,0.07)]"
        style={{
          backgroundImage: "radial-gradient(var(--fluxo-ponto) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        onClick={() => onSelecionar(null)}
      >
        <div className="pointer-events-none sticky left-0 top-0 z-10 flex items-center gap-2.5 px-[18px] py-3">
          <span className="text-[13px] font-semibold text-slate-900 dark:text-white">Mapa do fluxo</span>
          <span className="text-[11.5px] text-slate-500 dark:text-white/50">
            {canvas.contagem.telas} {canvas.contagem.telas === 1 ? "tela" : "telas"} · {canvas.contagem.finais}{" "}
            {canvas.contagem.finais === 1 ? "final" : "finais"} · {canvas.contagem.desvios}{" "}
            {canvas.contagem.desvios === 1 ? "desvio" : "desvios"}
            {canvas.perdidas.length > 0 && (
              <span className="ml-1.5 text-red-600 dark:text-red-400">
                · {canvas.perdidas.length} {canvas.perdidas.length === 1 ? "desvio sem destino" : "desvios sem destino"}
              </span>
            )}
          </span>
          <span className="ml-auto inline-flex gap-3.5 text-[11px] text-slate-500 dark:text-white/50">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 bg-slate-400" /> segue em ordem
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5" style={{ background: BRAND }} /> desvio por resposta
            </span>
          </span>
        </div>

        <div className="relative" style={{ width: canvas.largura, height: canvas.altura }}>
          <svg width={canvas.largura} height={canvas.altura} className="pointer-events-none absolute inset-0">
            <defs>
              <marker id="fluxo-seta" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" className="fill-slate-400 dark:fill-white/40" />
              </marker>
              <marker id="fluxo-seta-desvio" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill={BRAND} />
              </marker>
            </defs>
            {canvas.arestas.map((a, i) => {
              const de = porId.get(a.de)
              const para = porId.get(a.para)
              if (!de || !para) return null
              const p = caminhoDaAresta(de, para, a.tipo)
              const desvio = a.tipo === "desvio"
              const ligada = !selecionado || a.de === selecionado || a.para === selecionado
              return (
                <g key={i} opacity={ligada ? 1 : 0.25}>
                  <path
                    d={p.d}
                    fill="none"
                    stroke={desvio ? BRAND : "currentColor"}
                    className={desvio ? "" : "text-slate-400 dark:text-white/40"}
                    strokeWidth={desvio ? 1.8 : 1.4}
                    strokeDasharray={desvio ? undefined : "4 4"}
                    markerEnd={`url(#${desvio ? "fluxo-seta-desvio" : "fluxo-seta"})`}
                  />
                  {desvio && a.rotulo && (
                    <g>
                      <rect
                        x={p.lx - 44}
                        y={p.ly - 10}
                        width={88}
                        height={20}
                        rx={10}
                        className="fill-white dark:fill-[#1A1D27]"
                        stroke={BRAND}
                        strokeWidth={1}
                      />
                      <text
                        x={p.lx}
                        y={p.ly + 4}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={BRAND}
                        fontFamily="Inter, system-ui, sans-serif"
                      >
                        {a.rotulo.length > 14 ? a.rotulo.slice(0, 13) + "…" : a.rotulo}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          {canvas.nos.map((n) => {
            const ativo = n.id === selecionado
            const apagado = selecionado !== null && !ativo && !canvas.arestas.some((a) => (a.de === selecionado && a.para === n.id) || (a.para === selecionado && a.de === n.id))
            return (
              <button
                key={n.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelecionar(ativo ? null : n.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onEditar(n)
                }}
                aria-pressed={ativo}
                className={
                  "absolute flex items-center gap-2.5 rounded-[11px] border-[1.5px] bg-white px-3 text-left transition-[opacity,box-shadow] dark:bg-[#1A1D27] " +
                  (ativo
                    ? "border-[#4E62D8] shadow-[0_0_0_3px_rgba(78,98,216,0.2)]"
                    : "border-black/[0.10] shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-black/20 dark:border-white/[0.12] dark:hover:border-white/25")
                }
                style={{ left: n.x, top: n.y, width: NO.largura, height: NO.altura, opacity: apagado ? 0.35 : 1 }}
              >
                <IconeDoNo no={n} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.05em] text-slate-400 dark:text-white/40">
                    {n.rotulo}
                  </span>
                  <span className="block truncate text-[12px] font-semibold text-slate-900 dark:text-white">
                    {n.titulo.replace(/\{\{(\w+)\}\}/g, "{$1}")}
                  </span>
                </span>
                {n.desvios > 0 && (
                  <span
                    className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[10px] font-bold"
                    style={{ background: `${BRAND}22`, color: BRAND }}
                  >
                    {n.desvios}
                  </span>
                )}
              </button>
            )
          })}
          {canvas.contagem.finais > 0 && (
            <span
              className="absolute text-[10.5px] font-bold uppercase tracking-[0.07em] text-slate-400 dark:text-white/40"
              style={{ left: NO.x0, top: NO.y0 + NO.altura + NO.gapY - 34 }}
            >
              Finais
            </span>
          )}
        </div>
      </div>

      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-black/[0.06] bg-white lg:block dark:border-white/[0.08] dark:bg-[#0F1117]">
        {!noSel || !foco ? (
          <div className="px-5 py-8 text-center">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
              <Workflow className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[13px] font-semibold text-slate-900 dark:text-white">Selecione uma tela</p>
            <p className="mx-auto mt-1 max-w-[30ch] text-[11.5px] leading-relaxed text-slate-500 dark:text-white/50">
              Clique num nó para ver e editar os desvios por resposta. Duplo clique abre em Criar.
            </p>
            <div className="mt-5 rounded-[8px] border border-black/[0.06] p-3 text-left dark:border-white/[0.08]">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate-400 dark:text-white/40">
                Como funciona
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-600 dark:text-white/65">
                Cada tela segue para a próxima em ordem (linha tracejada). Um desvio (linha colorida) muda
                o caminho conforme a resposta — as regras são avaliadas de cima para baixo e a primeira que
                casa vence. Quem chega ao fim da ordem cai no final padrão.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center gap-2.5 border-b border-black/[0.06] px-3.5 py-2.5 dark:border-white/[0.08]">
              <IconeDoNo no={noSel} />
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-semibold text-slate-400 dark:text-white/40">{noSel.rotulo}</span>
                <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                  {noSel.titulo.replace(/\{\{(\w+)\}\}/g, "{$1}")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onEditar(noSel)}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[7px] border border-black/[0.10] px-2 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/[0.12] dark:text-white/80 dark:hover:bg-white/[0.06]"
              >
                <Pencil className="h-3 w-3" />
                Editar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FlowEditor fluxo={fluxo} onChange={onChange} temAbertura={temAbertura} foco={foco} formId={formId} />
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function IconeDoNo({ no }: { no: NoDoCanvas }) {
  if (no.tipo === "tela" && no.tipoDoBloco) return <TipoIcone tipo={no.tipoDoBloco} tamanho={28} />
  const Glifo = no.tipo === "abertura" ? Play : no.rotulo.includes("desqualifica") ? Info : Flag
  return (
    <span
      aria-hidden
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-white/55"
    >
      <Glifo className="h-3.5 w-3.5" />
    </span>
  )
}
