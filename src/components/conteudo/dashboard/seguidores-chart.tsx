"use client"

/**
 * Crescimento de seguidores (30 dias) em SVG puro, com marcadores nos dias
 * de publicação: hover mostra o post e o salto de seguidores, clique abre
 * o drawer.
 */

import { useState } from "react"
import { CT_PERFIS } from "@/lib/conteudo/brand"
import type { Post } from "@/lib/conteudo/types"
import { TNUM, ctThumb } from "../ui"

const GW = 720
const GH = 220
const PL = 44
const PR = 12
const PT = 14
const PB = 26

export function SeguidoresChart({
  serie,
  posts,
  rotulos,
  onAbrirPost,
}: {
  serie: number[]
  posts: Post[]
  /** 5 rótulos do eixo X (índices 0, 7, 14, 21, 29). */
  rotulos: string[]
  onAbrirPost: (id: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  if (serie.length < 2) return null
  const mn = Math.min(...serie) - 60
  const mx = Math.max(...serie) + 60
  const X = (i: number) => PL + (i / (serie.length - 1)) * (GW - PL - PR)
  const Y = (v: number) => PT + (1 - (v - mn) / (mx - mn)) * (GH - PT - PB)
  const path = serie.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")
  const xIdx = [0, 7, 14, 21, 29].filter((i) => i < serie.length)
  const hp = hover ? posts.find((p) => p.id === hover) : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${GW} ${GH}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Crescimento de seguidores por dia">
        {[0, 0.5, 1].map((f) => {
          const v = mn + (mx - mn) * f
          return (
            <g key={f}>
              <line x1={PL} x2={GW - PR} y1={Y(v)} y2={Y(v)} stroke="var(--ops-border)" />
              <text x={PL - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--ops-mut)" style={TNUM}>
                {(v / 1000).toFixed(1).replace(".", ",")}K
              </text>
            </g>
          )
        })}
        {xIdx.map((i, k) => (
          <text key={i} x={X(i)} y={GH - 8} textAnchor="middle" fontSize="9.5" fill="var(--ops-mut)" style={TNUM}>
            {rotulos[k] ?? ""}
          </text>
        ))}
        <path d={`${path} L${X(serie.length - 1)},${GH - PB} L${PL},${GH - PB} Z`} fill="var(--ops-accent)" opacity="0.07" />
        <path d={path} fill="none" stroke="var(--ops-accent)" strokeWidth="2" strokeLinejoin="round" />
        {posts.map((p) => {
          const on = hover === p.id
          const dia = Math.min(p.dia, serie.length - 1)
          return (
            <g
              key={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onAbrirPost(p.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`Abrir post ${p.head}`}
            >
              <line x1={X(dia)} x2={X(dia)} y1={PT} y2={GH - PB} stroke="var(--ops-mut)" strokeDasharray="2 4" opacity={on ? 0.9 : 0.35} />
              <circle cx={X(dia)} cy={Y(serie[dia])} r={on ? 6 : 4.5} fill="var(--ops-accent)" stroke="var(--ops-card)" strokeWidth="2" />
              {/* área de toque maior */}
              <circle cx={X(dia)} cy={Y(serie[dia])} r={12} fill="transparent" />
            </g>
          )
        })}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-1.5 flex w-[256px] gap-2.5 rounded-[10px] bg-[var(--ops-title)] p-2.5 text-[var(--ops-card)] shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
          style={{ left: `${Math.min(66, Math.max(2, (X(hp.dia) / GW) * 100 - 14))}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ctThumb(hp.thumbSeed ?? hp.id, 88, 110)} alt="" className="h-[55px] w-[44px] shrink-0 rounded-md object-cover" />
          <span className="min-w-0">
            <span className="line-clamp-2 text-[11px] font-semibold leading-[1.35]">{hp.head}</span>
            <span className="mt-[5px] block text-[10px] opacity-70" style={TNUM}>
              {hp.data} · {CT_PERFIS[hp.perfil].nome} · <strong className="font-semibold text-[var(--ops-pos)] opacity-100">+{hp.seg} seguidores</strong>
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
