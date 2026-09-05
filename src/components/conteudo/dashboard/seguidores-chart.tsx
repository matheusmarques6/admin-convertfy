"use client"

/**
 * Crescimento de seguidores no período em SVG puro (série diária real dos
 * snapshots), com marcadores nos dias de publicação: hover mostra o post e
 * os seguidores ganhos por ele (insight `follows`), clique abre o drawer.
 * Dias sem snapshot ficam em branco — a linha não é interpolada.
 */

import { useState } from "react"
import type { Perfil, Post, SerieSeguidores } from "@/lib/conteudo/types"
import { CtThumbPost, TNUM, fmtNum } from "../ui"

const GW = 720
const GH = 220
const PL = 48
const PR = 12
const PT = 14
const PB = 26

function diaSp(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function SeguidoresChart({ serie, posts, perfis, onAbrirPost }: { serie: SerieSeguidores; posts: Post[]; perfis: Perfil[]; onAbrirPost: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const n = serie.dias.length
  if (n < 2) return null
  const validos = serie.valores.filter((v): v is number => v != null)
  const temDado = validos.length >= 1
  const mn = temDado ? Math.min(...validos) - Math.max(20, Math.round(Math.min(...validos) * 0.005)) : 0
  const mx = temDado ? Math.max(...validos) + Math.max(20, Math.round(Math.max(...validos) * 0.005)) : 1
  const X = (i: number) => PL + (i / (n - 1)) * (GW - PL - PR)
  const Y = (v: number) => PT + (1 - (v - mn) / (mx - mn || 1)) * (GH - PT - PB)
  const idx = new Map(serie.dias.map((d, i) => [d, i]))

  // Segmentos contínuos (buraco quebra a linha).
  let path = ""
  let aberto = false
  serie.valores.forEach((v, i) => {
    if (v == null) {
      aberto = false
      return
    }
    path += `${aberto ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)} `
    aberto = true
  })
  const primeiro = serie.valores.findIndex((v) => v != null)
  const ultimo = serie.valores.length - 1 - [...serie.valores].reverse().findIndex((v) => v != null)
  const xIdx = [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1].filter((v, i, a) => a.indexOf(v) === i)
  const hp = hover ? posts.find((p) => p.id === hover) : null
  const nomePerfil = (id: string) => perfis.find((p) => p.id === id)?.nome ?? "Perfil"
  const fmtK = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}K` : String(Math.round(v)))

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Crescimento de seguidores por dia">
        {[0, 0.5, 1].map((f) => {
          const v = mn + (mx - mn) * f
          return (
            <g key={f}>
              <line x1={PL} x2={GW - PR} y1={Y(v)} y2={Y(v)} stroke="var(--ops-border)" />
              {temDado && (
                <text x={PL - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--ops-mut)" style={TNUM}>
                  {fmtK(v)}
                </text>
              )}
            </g>
          )
        })}
        {xIdx.map((i) => (
          <text key={i} x={X(i)} y={GH - 8} textAnchor="middle" fontSize="9.5" fill="var(--ops-mut)" style={TNUM}>
            {ddmm(serie.dias[i])}
          </text>
        ))}
        {temDado && primeiro >= 0 && ultimo >= primeiro && (
          <path d={`${path} L${X(ultimo)},${GH - PB} L${X(primeiro)},${GH - PB} Z`} fill="var(--ops-accent)" opacity="0.07" />
        )}
        {temDado && <path d={path} fill="none" stroke="var(--ops-accent)" strokeWidth="2" strokeLinejoin="round" />}
        {!temDado && (
          <text x={(GW + PL) / 2} y={GH / 2} textAnchor="middle" fontSize="11" fill="var(--ops-mut)">
            Coletando snapshots diários de seguidores — o gráfico preenche a partir do primeiro dia.
          </text>
        )}
        {posts.map((p) => {
          const i = idx.get(diaSp(p.publicadoEm))
          if (i == null) return null
          const on = hover === p.id
          const v = serie.valores[i]
          const cy = v != null ? Y(v) : GH - PB
          return (
            <g key={p.id} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)} onClick={() => onAbrirPost(p.id)} className="cursor-pointer" role="button" aria-label={`Abrir post ${p.head}`}>
              <line x1={X(i)} x2={X(i)} y1={PT} y2={GH - PB} stroke="var(--ops-mut)" strokeDasharray="2 4" opacity={on ? 0.9 : 0.35} />
              <circle cx={X(i)} cy={cy} r={on ? 6 : 4.5} fill="var(--ops-accent)" stroke="var(--ops-card)" strokeWidth="2" />
              <circle cx={X(i)} cy={cy} r={12} fill="transparent" />
            </g>
          )
        })}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-1.5 flex w-[256px] gap-2.5 rounded-[10px] bg-[var(--ops-title)] p-2.5 text-[var(--ops-card)] shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
          style={{ left: `${Math.min(66, Math.max(2, (X(idx.get(diaSp(hp.publicadoEm)) ?? 0) / GW) * 100 - 14))}%` }}
        >
          <CtThumbPost src={hp.thumb} className="h-[55px] w-[44px] shrink-0 rounded-md" />
          <span className="min-w-0">
            <span className="line-clamp-2 text-[11px] font-semibold leading-[1.35]">{hp.head}</span>
            <span className="mt-[5px] block text-[10px] opacity-70" style={TNUM}>
              {hp.data} · {nomePerfil(hp.perfil)} ·{" "}
              {hp.seg != null ? <strong className="font-semibold text-[var(--ops-pos)] opacity-100">+{fmtNum(hp.seg)} seguidores</strong> : <span>seguidores: sem insight</span>}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
