"use client"

/**
 * Átomos visuais do inbox v3 (design ago/2026, Claude Design):
 * superfície única no tema do app (tokens --ops-*), identidade de canal
 * via logo/label discretos, brand indigo nas bolhas/acentos.
 *
 * threadKind: "direct" | "comment" | "group" — comentário de post vem
 * com contact_external_id "comment:{media_id}" (webhook do Instagram);
 * grupo (@g.us) hoje é PULADO pelo webhook Evolution, então a detecção
 * fica aqui por robustez, sem UI dedicada.
 */

/** Brand indigo do design (mesma família do hero do dashboard). */
export const INBOX_BRAND = "#4E62D8"

export const IBX_COLORS = {
  wa: "#25D366",
  igGrad: "linear-gradient(45deg, #F58529 0%, #DD2A7B 55%, #8134AF 100%)",
}

export function ChBadge({ canal, size = 16 }: { canal: string; size?: number }) {
  const s: React.CSSProperties = {
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  }
  if (canal === "whatsapp") {
    return (
      <span style={{ ...s, borderRadius: "50%", background: IBX_COLORS.wa }}>
        <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="#fff">
          <path d="M17.6 6.32A7.85 7.85 0 0012.05 4a7.94 7.94 0 00-6.88 11.89L4 20l4.2-1.1a7.93 7.93 0 003.8.97h.01a7.95 7.95 0 005.6-13.55zm-5.55 12.2h-.01a6.6 6.6 0 01-3.36-.92l-.24-.14-2.49.65.67-2.43-.16-.25a6.59 6.59 0 1112.23-3.5 6.6 6.6 0 01-6.64 6.6zm3.62-4.94c-.2-.1-1.17-.58-1.36-.64-.18-.07-.31-.1-.45.1-.13.2-.5.64-.62.77-.11.13-.23.15-.43.05-.2-.1-.83-.3-1.59-.98a5.96 5.96 0 01-1.1-1.37c-.11-.2 0-.3.09-.4.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.06-.13.03-.25-.02-.35-.05-.1-.45-1.08-.61-1.47-.16-.39-.33-.34-.45-.34l-.38-.01c-.13 0-.35.05-.53.25-.18.2-.7.68-.7 1.66 0 .98.72 1.93.82 2.06.1.13 1.4 2.13 3.39 2.99.47.2.84.33 1.13.42.48.15.91.13 1.25.08.38-.06 1.17-.48 1.33-.94.17-.46.17-.86.12-.94-.05-.08-.18-.13-.38-.23z" />
        </svg>
      </span>
    )
  }
  return (
    <span style={{ ...s, borderRadius: "30%", background: IBX_COLORS.igGrad }}>
      <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 24 24" fill="#fff">
        <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23a3.72 3.72 0 01-.9 1.38c-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 01-1.38-.9 3.72 3.72 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.88 5.88 0 00.63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.88 5.88 0 002.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 002.13-1.38 5.88 5.88 0 001.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 00-1.38-2.13A5.88 5.88 0 0019.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 105.84 12 6.16 6.16 0 0012 5.84zM12 16a4 4 0 110-8 4 4 0 010 8zm7.85-10.4a1.44 1.44 0 11-2.88 0 1.44 1.44 0 012.88 0z" />
      </svg>
    </span>
  )
}

export type ThreadKind = "direct" | "comment" | "group"

export function threadKind(t: {
  contact_external_id?: string | null
}): ThreadKind {
  const ext = t.contact_external_id ?? ""
  if (ext.startsWith("comment:")) return "comment"
  if (ext.endsWith("@g.us")) return "group"
  return "direct"
}

/** Rótulo do subtipo — "Direct", "Comentário", "API Oficial", "QR · envio livre". */
export function channelSubLabel(t: {
  contact_external_id?: string | null
  channel?: { type: string; provider?: string | null } | null
}): string {
  const kind = threadKind(t)
  if (t.channel?.type === "instagram") {
    return kind === "comment" ? "Comentário" : "Direct"
  }
  if (kind === "group") return "Grupo"
  return t.channel?.provider === "evolution" ? "QR · envio livre" : "API Oficial"
}

/** "WhatsApp · API Oficial" / "Instagram · Direct" com o logo do canal. */
export function ChLabel({
  thread,
  strong = false,
}: {
  thread: {
    contact_external_id?: string | null
    channel?: { type: string; provider?: string | null; display_name?: string } | null
  }
  strong?: boolean
}) {
  const canal = thread.channel?.type ?? "whatsapp"
  return (
    <span
      className="inline-flex items-center gap-[5px] whitespace-nowrap text-[10px] font-medium"
      style={{ color: strong ? "var(--ops-text)" : "var(--ops-mut)" }}
    >
      <ChBadge canal={canal} size={12} />
      {canal === "whatsapp" ? "WhatsApp" : "Instagram"}
      <span className="opacity-60">·</span> {channelSubLabel(thread)}
    </span>
  )
}

/** Botão de ícone do header (30px, borda; `on` inverte pra sólido). */
export function IcoBtn({
  title,
  on,
  onClick,
  disabled,
  children,
  label,
}: {
  title: string
  on?: boolean
  onClick?: () => void
  disabled?: boolean
  children?: React.ReactNode
  label?: string | null
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[30px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] border text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        padding: label ? "0 11px" : 0,
        width: label ? "auto" : 30,
        borderColor: on ? "var(--ops-title)" : "var(--ops-border)",
        background: on ? "var(--ops-title)" : "transparent",
        color: on ? "var(--ops-page)" : "var(--ops-sec)",
      }}
    >
      {children}
      {label}
    </button>
  )
}

/** Avatar com iniciais (paleta determinística) + foto quando existir. */
export function InboxAvatar({
  name,
  avatarUrl,
  size = 38,
}: {
  name: string
  avatarUrl?: string | null
  size?: number
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size, border: "1px solid var(--ops-border)", flexShrink: 0 }}
      />
    )
  }
  const clean = (name || "?").replace("@", "")
  const initials = clean
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const h = clean.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const palette = [
    ["#EEF0FB", "#4E62D8"],
    ["#ECFDF5", "#065F46"],
    ["#FFFBEB", "#92400E"],
    ["#F3E8FF", "#7C3AED"],
    ["#FEF2F2", "#991B1B"],
  ]
  const [bg, fg] = palette[h % palette.length]
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {initials || "?"}
    </span>
  )
}

/** Avatar + badge do canal sobreposto (canto inferior direito). */
export function AvatarWithChannel({
  name,
  avatarUrl,
  canal,
  size = 38,
  badge = 15,
}: {
  name: string
  avatarUrl?: string | null
  canal: string
  size?: number
  badge?: number
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <InboxAvatar name={name} avatarUrl={avatarUrl} size={size} />
      <span
        className="absolute flex"
        style={{
          bottom: -2,
          right: -2,
          borderRadius: canal === "instagram" ? "35%" : "50%",
          boxShadow: "0 0 0 2px var(--ops-card)",
        }}
      >
        <ChBadge canal={canal} size={badge} />
      </span>
    </span>
  )
}

export function fmtWaitShort(min: number): string {
  if (min < 60) return `${min}m`
  // Acima de 48h, "626h 9m" vira ruído — dias dizem mais.
  if (min >= 48 * 60) return `${Math.floor(min / 1440)}d`
  return `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`
}

/** Horas restantes da janela de 24h (null = sem janela / fechada). */
export function windowHoursLeft(expiresAt?: string | null): number | null {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  return ms > 0 ? ms / 3_600_000 : 0
}

export const TNUM: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums lining-nums",
}
