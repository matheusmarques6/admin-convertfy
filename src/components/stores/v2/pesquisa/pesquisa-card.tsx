"use client"

/**
 * PesquisaCard — wrapper de cada pilar com header em gradient creme→branco,
 * numeral grande Playfair, título e slot meta (botões/badges).
 */

import { cn } from "@/lib/utils"

interface PesquisaCardProps {
  id?: string
  number: string
  title: string
  meta?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function PesquisaCard({ id, number, title, meta, children, className }: PesquisaCardProps) {
  return (
    <section
      id={id}
      className={cn("bg-white border rounded-[10px] overflow-hidden", className)}
      style={{ borderColor: "rgba(0,0,0,0.06)" }}
    >
      <header
        className="px-5 py-4 border-b flex items-center justify-between gap-3"
        style={{
          background: "linear-gradient(180deg, #FDFBF6 0%, #FFFFFF 100%)",
          borderColor: "rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-bold shrink-0"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: "#4E62D8",
              fontSize: 28,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {number}
          </span>
          <h3
            className="m-0 text-slate-900"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 19,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            {title}
          </h3>
        </div>
        {meta && <div className="shrink-0">{meta}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}
