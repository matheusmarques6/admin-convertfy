"use client"

import { PRODUCTION_BUCKETS, type ProductionStore } from "@/types/campaign-production"
import { bucketCounts } from "./helpers"

/** Distribuição por estágio — escala pra qualquer nº de lojas. */
export function StageBar({ stores }: { stores: ProductionStore[] }) {
  const c = bucketCounts(stores)
  const total = stores.length || 1
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {PRODUCTION_BUCKETS.map((b) =>
          c[b.key] > 0 ? (
            <div
              key={b.key}
              title={`${c[b.key]} em ${b.label.toLowerCase()}`}
              style={{ width: `${(c[b.key] / total) * 100}%`, background: b.color }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {PRODUCTION_BUCKETS.map((b) => {
          const n = c[b.key]
          return (
            <span key={b.key} className="inline-flex items-center gap-1.5 text-[11.5px]">
              <span
                className="size-2 rounded-full"
                style={{ background: n ? b.color : "#E5E7EB" }}
              />
              <span
                className={`font-bold tabular-nums ${n ? "text-foreground" : "text-muted-foreground/40"}`}
              >
                {n}
              </span>
              <span className={n ? "text-muted-foreground" : "text-muted-foreground/40"}>
                {b.label}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
