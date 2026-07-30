/**
 * Selos de curadoria na linha do run (story CM-7).
 *
 * Por que selo e não notificação: nada aqui é erro, então alerta viraria
 * ruído que se aprende a ignorar. O selo aparece quando a pessoa já está
 * olhando os logs. A regra que decide os selos vive em `curation-signals.ts`.
 */

"use client"

import {
  curationSignals,
  type CurationSignals,
  type Tone,
} from "./curation-signals"

/**
 * Paleta e fonte vêm do caller. O `logs-workspace` replica os tokens da
 * maquete inline (mesmo trade-off do resto da página, light-only) — receber
 * por prop evita uma TERCEIRA cópia dos mesmos hexes.
 */
export interface BadgeTheme {
  warn: string
  warnBg: string
  warnBorder: string
  info: string
  infoBg: string
  infoBorder: string
  sans: string
}

export function CurationBadges({
  curation,
  theme,
}: {
  curation: CurationSignals | null | undefined
  theme: BadgeTheme
}) {
  const signals = curationSignals(curation)
  // Ausência é o estado normal e não deve ocupar espaço na linha.
  if (signals.length === 0) return null

  const tones: Record<Tone, { bg: string; border: string; color: string }> = {
    warn: { bg: theme.warnBg, border: theme.warnBorder, color: theme.warn },
    info: { bg: theme.infoBg, border: theme.infoBorder, color: theme.info },
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {signals.map((s) => {
        const t = tones[s.tone]
        return (
          <span
            key={s.key}
            title={s.title}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 18,
              padding: "0 6px",
              borderRadius: 4,
              background: t.bg,
              border: `1px solid ${t.border}`,
              color: t.color,
              fontFamily: theme.sans,
              fontSize: 10.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
              cursor: "help",
            }}
          >
            {s.label}
          </span>
        )
      })}
    </div>
  )
}
