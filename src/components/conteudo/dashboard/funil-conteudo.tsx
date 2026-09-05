"use client"

/**
 * Funil Conteúdo → Comercial: trapézios em clip-path com taper fixo (o
 * volume nunca deforma a silhueta) e pílulas de conversão na borda direita.
 */

import { FUNIL_CORES } from "@/lib/conteudo/brand"
import type { FunilEtapa } from "@/lib/conteudo/types"
import { TNUM, fmtDec, fmtNum } from "../ui"

const FW = 430
const SH = 58
const STEP = 5.5

export function FunilConteudo({ etapas }: { etapas: FunilEtapa[] }) {
  return (
    <div className="relative mx-auto max-w-full pb-2.5 pt-1.5" style={{ width: FW }}>
      {etapas.map((e, i) => {
        const t = i * STEP
        const b = (i + 1) * STEP
        const cor = FUNIL_CORES[i % FUNIL_CORES.length]
        return (
          <div
            key={e.label}
            className="flex flex-col items-center justify-center text-white"
            style={{
              height: SH,
              background: `linear-gradient(180deg, ${cor} 0%, ${cor}E6 100%)`,
              clipPath: `polygon(${t}% 0, ${100 - t}% 0, ${100 - b}% 100%, ${b}% 100%)`,
            }}
          >
            <span className="text-[22px] font-bold leading-none [text-shadow:0_1px_2px_rgba(0,0,0,0.18)]" style={TNUM}>
              {fmtNum(e.valor)}
            </span>
            <span className="mt-[5px] whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.12em] opacity-90">{e.label}</span>
          </div>
        )
      })}
      {etapas.slice(1).map((e, i) => {
        const base = etapas[i].valor
        const c = base > 0 ? (e.valor / base) * 100 : 0
        const b = (i + 1) * STEP
        const x = (FW * (100 - b)) / 100
        return (
          <span
            key={e.label}
            className="absolute rounded-full border border-white/15 bg-[var(--ops-title)] px-[9px] py-[3px] text-[10px] font-bold text-[var(--ops-card)] shadow-[0_3px_8px_rgba(0,0,0,0.3)]"
            style={{ top: 6 + (i + 1) * SH - 11, left: x + 2, ...TNUM }}
            title={`${e.label}: ${fmtDec(c, 2)}% da etapa anterior`}
          >
            {c < 1 ? fmtDec(c, 2) : fmtDec(c, 1)}%
          </span>
        )
      })}
    </div>
  )
}
