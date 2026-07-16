"use client"

/**
 * Reuniões — Comercial (design novo, portado do protótipo Convertfy DS v3).
 * Plugado nos dados reais (meetings + participants). O "tipo" da reunião é
 * DERIVADO do contexto (sem coluna nova):
 *   - sem cliente            -> interno
 *   - título kickoff/briefing -> onboarding
 *   - título follow/check-in  -> followup
 *   - caso contrário          -> cliente
 *
 * Ações (criar/editar/concluir) reutilizam MeetingDialog e
 * MeetingCompletionDialog — funcionalidade já validada.
 */

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { addDays, addMonths, startOfWeek, startOfMonth, isSameDay, isSameMonth, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MeetingDialog } from "@/components/board/meeting-dialog"
import { MeetingCompletionDialog } from "@/components/meetings/meeting-completion-dialog"
import { toast } from "@/lib/hooks/use-toast"
import type { MeetingStatus } from "@/types"

// ── Tokens (subset do DS do protótipo) ─────────────────────────────────────
const C = {
  brand: "#4E62D8", brandHover: "#2137B6",
  blue50: "#EEF0FB", blue100: "#C7CDEF",
  white: "#FFFFFF", g25: "#FCFCFD", g50: "#F8FAFC", g100: "#F3F4F6",
  g200: "#E5E7EB", g300: "#D1D5DB", g400: "#9CA3AF", g500: "#6B7280",
  g600: "#4B5563", g700: "#374151", g800: "#1F2937", g900: "#111827",
  pos: "#065F46", posBg: "#ECFDF5", posBorder: "#A7F3D0",
  purple: "#7C3AED", purpleBg: "#F3E8FF", purpleBorder: "#E0CBFF",
  amber: "#D97706", amberBg: "#FFFBEB", amberBorder: "#FDE68A",
  border: "rgba(0,0,0,0.08)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.05)",
  shadowMd: "0 2px 6px rgba(0,0,0,0.06)",
  gradient: "linear-gradient(90deg,#4E62D8,#2137B6,#041366)",
}
const TNUM = { fontVariantNumeric: "tabular-nums lining-nums" as const }

type MType = "cliente" | "onboarding" | "interno" | "followup"
const MTYPE: Record<MType, { label: string; c: string; bg: string; border: string }> = {
  cliente:    { label: "Cliente",    c: C.brand,  bg: C.blue50,   border: C.blue100 },
  onboarding: { label: "Onboarding", c: C.purple, bg: C.purpleBg, border: C.purpleBorder },
  interno:    { label: "Interno",    c: C.amber,  bg: C.amberBg,  border: C.amberBorder },
  followup:   { label: "Follow-up",  c: C.pos,    bg: C.posBg,    border: C.posBorder },
}

// ── Ícones inline ──────────────────────────────────────────────────────────
type IcoProps = { s?: number; sw?: number }
const svg = (children: React.ReactNode, s = 18, sw = 2) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const I = {
  calendar: ({ s = 18 }: IcoProps) => svg(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>, s),
  clock: ({ s = 18 }: IcoProps) => svg(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>, s),
  check: ({ s = 18 }: IcoProps) => svg(<polyline points="20 6 9 17 4 12"/>, s),
  plus: ({ s = 18 }: IcoProps) => svg(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>, s),
  chevL: ({ s = 18 }: IcoProps) => svg(<polyline points="15 18 9 12 15 6"/>, s),
  chevR: ({ s = 18 }: IcoProps) => svg(<polyline points="9 18 15 12 9 6"/>, s),
  video: ({ s = 18 }: IcoProps) => svg(<><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></>, s),
  phone: ({ s = 18 }: IcoProps) => svg(<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>, s),
  grid: ({ s = 18 }: IcoProps) => svg(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></>, s),
  list: ({ s = 18 }: IcoProps) => svg(<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>, s),
  close: ({ s = 18 }: IcoProps) => svg(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>, s),
  edit: ({ s = 18 }: IcoProps) => svg(<><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></>, s),
  refresh: ({ s = 18 }: IcoProps) => svg(<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>, s),
}

// ── Modelo de dado que a página consome ────────────────────────────────────
interface ParticipantLite {
  participant_id: string
  is_organizer: boolean
  profile?: { name?: string | null; email?: string | null } | null
}
export interface MeetingLite {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  status: MeetingStatus
  meeting_url?: string | null
  meeting_url_source?: string | null
  notes?: string | null
  completion_notes?: string | null
  client_id?: string | null
  client?: { id: string; name: string; company?: string | null } | null
  user?: { name?: string | null; email?: string | null } | null
  participants?: ParticipantLite[]
  [k: string]: unknown
}

interface ClientOption { id: string; name: string; company?: string | null; stores?: string[] }
interface MemberOption { id: string; name: string; email?: string; avatar_url?: string; type: "org_member"; role?: string }

interface Props {
  meetings: MeetingLite[]
  clients: ClientOption[]
  members: MemberOption[]
  hasGoogleCalendar?: boolean
}

// ── Derivação de tipo + shape de exibição ──────────────────────────────────
function deriveType(m: MeetingLite): MType {
  const title = (m.title || "").toLowerCase()
  if (!m.client_id && !m.client) return "interno"
  if (/kick-?off|onboarding|briefing|implanta|integra/.test(title)) return "onboarding"
  if (/follow|acompanh|check-?in|retorno/.test(title)) return "followup"
  return "cliente"
}

interface Shaped {
  id: string
  date: Date
  start: number
  end: number
  type: MType
  title: string
  withName: string
  channel: "meet" | "phone"
  owner: string
  status: "upcoming" | "done" | "now"
  attendees: string[]
  raw: MeetingLite
}

function shape(m: MeetingLite): Shaped {
  const d = new Date(m.scheduled_at)
  const start = d.getHours() + d.getMinutes() / 60
  const end = start + (m.duration_minutes || 30) / 60
  const now = new Date()
  let status: Shaped["status"] = "upcoming"
  if (m.status === "completed") status = "done"
  else if (m.status === "cancelled" || m.status === "no_show") status = "done"
  else if (isSameDay(d, now) && now >= d && now.getTime() <= d.getTime() + (m.duration_minutes || 30) * 60000) status = "now"
  const channel: Shaped["channel"] =
    m.meeting_url_source === "google_meet" || m.meeting_url ? "meet" : "phone"
  const attendees = (m.participants || [])
    .map((p) => p.profile?.name || "")
    .filter(Boolean) as string[]
  return {
    id: m.id, date: d, start, end, type: deriveType(m), title: m.title || "(sem título)",
    withName: m.client?.name || m.client?.company || m.user?.name || "—",
    channel, owner: m.user?.name || "", status, attendees, raw: m,
  }
}

const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0")}`

// ── Átomos ─────────────────────────────────────────────────────────────────
function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = (name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()
  const palette = [
    { bg: "#EEF0FB", c: "#4E62D8" }, { bg: "#ECFDF5", c: "#065F46" },
    { bg: "#FFFBEB", c: "#92400E" }, { bg: "#F3E8FF", c: "#7C3AED" },
    { bg: "#FEF2F2", c: "#991B1B" }, { bg: "#F3F4F6", c: "#4B5563" },
  ]
  const h = (name || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const p = palette[h % palette.length]
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: p.bg, color: p.c,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.max(10, Math.round(size * 0.38)), fontWeight: 600, flexShrink: 0 }}>{initials}</div>
  )
}

function Kpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number; hint?: string; tone: string }) {
  return (
    <div style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.g500 }}>
        <span style={{ display: "flex", color: tone }}>{icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: C.g500 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 600, color: C.g900, letterSpacing: "-0.03em", ...TNUM }}>{value}</span>
        {hint && <span style={{ fontSize: 12, color: C.g400 }}>{hint}</span>}
      </div>
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string; icon?: React.ReactNode }[]; onChange: (k: T) => void }) {
  return (
    <div style={{ display: "inline-flex", background: C.g100, borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 6, border: "none",
            cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 500,
            background: on ? C.white : "transparent", color: on ? C.g900 : C.g500, boxShadow: on ? C.shadowSm : "none",
          }}>{o.icon}{o.label}</button>
        )
      })}
    </div>
  )
}

// ── Grade de tempo (Semana / Dia) ──────────────────────────────────────────
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i) // 07–20
const ROW_H = 58

function EventBlock({ m, onOpen }: { m: Shaped; onOpen: (m: Shaped) => void }) {
  const t = MTYPE[m.type]
  const top = (m.start - 7) * ROW_H
  const h = Math.max(26, (m.end - m.start) * ROW_H - 4)
  const done = m.status === "done"
  const now = m.status === "now"
  const compact = h < 46
  return (
    <button onClick={() => onOpen(m)} style={{
      position: "absolute", top: top + 2, left: 3, right: 3, height: h,
      background: done ? C.white : t.bg, border: `1px solid ${done ? C.border : t.border}`,
      borderLeft: `3px solid ${t.c}`, borderRadius: 6, padding: compact ? "3px 7px" : "5px 8px",
      textAlign: "left", cursor: "pointer", overflow: "hidden", opacity: done ? 0.72 : 1,
      display: "flex", flexDirection: "column", gap: 1, boxShadow: now ? `0 0 0 2px ${C.brand}, ${C.shadowMd}` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: t.c, ...TNUM, whiteSpace: "nowrap" }}>{fmtHour(m.start)}</span>
        <span style={{ display: "flex", color: t.c }}>{m.channel === "meet" ? <I.video s={11} /> : <I.phone s={11} />}</span>
        {now && <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: "#fff", background: C.brand, borderRadius: 3, padding: "0 4px" }}>AGORA</span>}
        {done && <span style={{ marginLeft: "auto", display: "flex", color: C.g400 }}><I.check s={12} /></span>}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: done ? C.g500 : C.g800, lineHeight: 1.2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: compact ? "nowrap" : "normal" }}>{m.title}</div>
    </button>
  )
}

function TimeGrid({ days, byDay, onOpen }: { days: { date: Date; today: boolean }[]; byDay: Map<string, Shaped[]>; onOpen: (m: Shaped) => void }) {
  const now = new Date()
  const nowH = now.getHours() + now.getMinutes() / 60
  const gridCols = `60px repeat(${days.length}, minmax(0,1fr))`
  const key = (d: Date) => format(d, "yyyy-MM-dd")
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: `1px solid ${C.border}`, background: C.g25 }}>
        <div style={{ borderRight: `1px solid ${C.border}` }} />
        {days.map((d) => (
          <div key={key(d.date)} style={{ padding: "10px 0 9px", textAlign: "center", borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: d.today ? C.brand : C.g500, textTransform: "capitalize" }}>{format(d.date, "EEEE", { locale: ptBR })}</div>
            <div style={{ marginTop: 4, display: "flex", justifyContent: "center" }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600, ...TNUM, background: d.today ? C.brand : "transparent", color: d.today ? "#fff" : C.g800 }}>{format(d.date, "d")}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: gridCols, position: "relative" }}>
          <div style={{ borderRight: `1px solid ${C.border}` }}>
            {HOURS.map((h) => (
              <div key={h} style={{ height: ROW_H, position: "relative" }}>
                <span style={{ position: "absolute", top: -7, right: 8, fontSize: 10.5, color: C.g400, ...TNUM }}>{h > 7 ? `${String(h).padStart(2, "0")}:00` : ""}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const evs = byDay.get(key(d.date)) || []
            return (
              <div key={key(d.date)} style={{ position: "relative", borderRight: `1px solid ${C.border}`, background: d.today ? "rgba(78,98,216,0.02)" : C.white }}>
                {HOURS.map((h) => <div key={h} style={{ height: ROW_H, borderBottom: `1px solid ${C.g100}` }} />)}
                {d.today && nowH >= 7 && nowH <= 20 && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: (nowH - 7) * ROW_H, height: 0, borderTop: `2px solid ${C.brand}`, zIndex: 3 }}>
                    <span style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: C.brand }} />
                  </div>
                )}
                {evs.map((m) => <EventBlock key={m.id} m={m} onOpen={onOpen} />)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Lista ──────────────────────────────────────────────────────────────────
function ListView({ days, byDay, onOpen }: { days: { date: Date; today: boolean }[]; byDay: Map<string, Shaped[]>; onOpen: (m: Shaped) => void }) {
  const key = (d: Date) => format(d, "yyyy-MM-dd")
  const withEvents = days.filter((d) => (byDay.get(key(d.date)) || []).length > 0)
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", flex: 1, minHeight: 0, padding: "4px 0" }}>
      {withEvents.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: C.g400, fontSize: 13 }}>Nenhuma reunião nesta semana.</div>
      )}
      {withEvents.map((d) => {
        const evs = (byDay.get(key(d.date)) || []).slice().sort((a, b) => a.start - b.start)
        return (
          <div key={key(d.date)} style={{ padding: "8px 18px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 10px" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: d.today ? C.brand : C.g800, textTransform: "capitalize" }}>{format(d.date, "EEEE, d 'de' MMM", { locale: ptBR })}</span>
              {d.today && <span style={{ fontSize: 10, fontWeight: 700, color: C.brand, background: C.blue50, border: `1px solid ${C.blue100}`, borderRadius: 4, padding: "1px 6px" }}>HOJE</span>}
              <span style={{ flex: 1, height: 1, background: C.g100 }} />
              <span style={{ fontSize: 11.5, color: C.g400 }}>{evs.length} {evs.length === 1 ? "reunião" : "reuniões"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
              {evs.map((m) => {
                const t = MTYPE[m.type]
                const done = m.status === "done"
                const now = m.status === "now"
                return (
                  <button key={m.id} onClick={() => onOpen(m)} style={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, padding: "13px 16px",
                    background: C.white, border: `1px solid ${now ? C.brand : C.border}`, borderLeft: `3px solid ${t.c}`,
                    borderRadius: 10, cursor: "pointer", opacity: done ? 0.75 : 1,
                  }}>
                    <div style={{ width: 58, flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.g900, ...TNUM }}>{fmtHour(m.start)}</div>
                      <div style={{ fontSize: 11, color: C.g400, ...TNUM }}>{fmtHour(m.end)}</div>
                    </div>
                    <div style={{ width: 1, alignSelf: "stretch", background: C.border }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.g900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, color: t.c, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "1px 7px" }}>{t.label}</span>
                        {now && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: C.brand, borderRadius: 4, padding: "1px 6px" }}>AGORA</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: C.g500 }}>
                        <span style={{ display: "flex", color: C.g400 }}>{m.channel === "meet" ? <I.video s={13} /> : <I.phone s={13} />}</span>
                        <span>{m.channel === "meet" ? "Google Meet" : "Ligação"}</span>
                        <span style={{ color: C.g300 }}>·</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.withName}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", marginLeft: 8 }}>
                      {m.attendees.slice(0, 3).map((a, i) => (
                        <span key={i} style={{ marginLeft: i ? -8 : 0, border: `2px solid ${C.white}`, borderRadius: "50%", display: "flex" }}><Avatar name={a} size={26} /></span>
                      ))}
                      {m.attendees.length > 3 && <span style={{ marginLeft: -8, width: 26, height: 26, borderRadius: "50%", border: `2px solid ${C.white}`, background: C.g100, color: C.g500, fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", ...TNUM }}>+{m.attendees.length - 3}</span>}
                    </div>
                    {done
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.pos, fontWeight: 500, flexShrink: 0 }}><I.check s={14} /> Realizada</span>
                      : <span style={{ fontSize: 12, color: C.g400, flexShrink: 0 }}>Ver</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Mês ────────────────────────────────────────────────────────────────────
const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

function MonthGrid({ anchor, byDay, onOpen }: { anchor: Date; byDay: Map<string, Shaped[]>; onOpen: (m: Shaped) => void }) {
  const monthStart = startOfMonth(anchor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const today = new Date()
  const key = (d: Date) => format(d, "yyyy-MM-dd")
  // 6 semanas cobre qualquer mês; removemos a última linha se toda fora do mês
  const weeks: Date[][] = []
  for (let w = 0; w < 6; w++) {
    const row = Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))
    if (w === 5 && row.every((d) => !isSameMonth(d, monthStart))) break
    weeks.push(row)
  }
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${C.border}`, background: C.g25 }}>
        {DOW.map((d) => (
          <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: C.g500, textTransform: "capitalize" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateRows: `repeat(${weeks.length},1fr)`, flex: 1, minHeight: 0 }}>
        {weeks.map((row, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: wi < weeks.length - 1 ? `1px solid ${C.g100}` : "none" }}>
            {row.map((d) => {
              const out = !isSameMonth(d, monthStart)
              const isToday = isSameDay(d, today)
              const evs = (byDay.get(key(d)) || []).slice().sort((a, b) => a.start - b.start)
              const shown = evs.slice(0, 3)
              return (
                <div key={key(d)} style={{ borderRight: `1px solid ${C.g100}`, padding: "6px 6px 4px", minHeight: 0, overflow: "hidden", background: out ? C.g25 : C.white, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, ...TNUM,
                      background: isToday ? C.brand : "transparent", color: isToday ? "#fff" : out ? C.g300 : C.g700 }}>{format(d, "d")}</span>
                  </div>
                  {shown.map((m) => {
                    const t = MTYPE[m.type]
                    return (
                      <button key={m.id} onClick={() => onOpen(m)} style={{
                        display: "flex", alignItems: "center", gap: 4, width: "100%", textAlign: "left",
                        background: t.bg, border: "none", borderLeft: `2px solid ${t.c}`, borderRadius: 3,
                        padding: "1px 5px", cursor: "pointer", overflow: "hidden", opacity: m.status === "done" ? 0.6 : 1,
                      }}>
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: t.c, ...TNUM, flexShrink: 0 }}>{fmtHour(m.start)}</span>
                        <span style={{ fontSize: 10.5, color: C.g700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</span>
                      </button>
                    )
                  })}
                  {evs.length > 3 && <span style={{ fontSize: 10, color: C.g400, paddingLeft: 4 }}>+{evs.length - 3} mais</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Drawer de detalhe ──────────────────────────────────────────────────────
function DetailDrawer({ m, clients, onClose, onEdit, onComplete, onLinkClient }: { m: Shaped | null; clients: ClientOption[]; onClose: () => void; onEdit: (m: MeetingLite) => void; onComplete: (m: MeetingLite) => void; onLinkClient: (meetingId: string, clientId: string) => void }) {
  if (!m) return null
  const t = MTYPE[m.type]
  const done = m.status === "done"
  const meetUrl = m.raw.meeting_url
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(17,24,39,0.28)" }} />
      <div style={{ position: "relative", width: 400, maxWidth: "92vw", height: "100%", background: C.white, boxShadow: "0 12px 24px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 4, background: t.c }} />
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: t.c, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4, padding: "1px 7px" }}>{t.label}</span>
              {m.status === "now" && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: C.brand, borderRadius: 4, padding: "2px 6px" }}>AGORA</span>}
              {done && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.pos, fontWeight: 500 }}><I.check s={13} /> Realizada</span>}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.g400, display: "flex", padding: 2 }}><I.close s={18} /></button>
          </div>
          <h2 style={{ margin: "12px 0 0", fontSize: 18, fontWeight: 600, color: C.g900, lineHeight: 1.3 }}>{m.title}</h2>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.g700 }}>
            <span style={{ color: C.g400, display: "flex" }}><I.clock s={17} /></span>
            <span style={{ fontSize: 13.5, textTransform: "capitalize" }}>{format(m.date, "EEEE, d 'de' MMMM", { locale: ptBR })} · <b style={TNUM}>{fmtHour(m.start)}–{fmtHour(m.end)}</b></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.g700 }}>
            <span style={{ color: C.g400, display: "flex" }}>{m.channel === "meet" ? <I.video s={17} /> : <I.phone s={17} />}</span>
            <span style={{ fontSize: 13.5 }}>{m.channel === "meet" ? "Google Meet" : "Ligação telefônica"}</span>
            {meetUrl && <a href={meetUrl} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 13, color: C.brand, fontWeight: 500, textDecoration: "none" }}>Abrir link ↗</a>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: "0.07em", marginBottom: 8 }}>CLIENTE</div>
            {m.raw.client ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={m.raw.client.name} size={28} />
                <div style={{ fontSize: 13, fontWeight: 500, color: C.g800 }}>{m.raw.client.name}</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12.5, color: C.g500, marginBottom: 8 }}>
                  {m.raw.source === "google" ? "Importada do Google — sem cliente vinculado." : "Sem cliente vinculado."}
                </div>
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) onLinkClient(m.id, e.target.value) }}
                  style={{ width: "100%", height: 34, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.white, color: C.g700, fontSize: 13 }}
                >
                  <option value="">Vincular cliente…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: "0.07em", marginBottom: 8 }}>PARTICIPANTES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {m.attendees.length === 0 && <div style={{ fontSize: 12.5, color: C.g400 }}>Sem participantes registrados.</div>}
              {m.attendees.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={a} size={30} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.g800 }}>{a}</div>
                    <div style={{ fontSize: 11.5, color: C.g400 }}>{a === m.owner ? "Organizador" : "Convidado"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {(m.raw.notes || m.raw.completion_notes) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.g400, letterSpacing: "0.07em", marginBottom: 6 }}>NOTAS</div>
              <div style={{ fontSize: 13, color: C.g600, lineHeight: 1.5, background: C.g50, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
                {m.raw.completion_notes || m.raw.notes}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
          {!done ? (
            <>
              <button onClick={() => onComplete(m.raw)} style={{ flex: 1, height: 36, borderRadius: 6, border: "none", background: C.brandHover, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Concluir</button>
              <button onClick={() => onEdit(m.raw)} style={{ height: 36, padding: "0 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.g700, fontWeight: 500, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><I.edit s={14} /> Editar</button>
            </>
          ) : (
            <button onClick={() => onEdit(m.raw)} style={{ flex: 1, height: 36, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.g700, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>Ver / Editar</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────
type View = "calendario" | "lista"
type Scale = "mes" | "semana" | "dia"

export function ComercialReunioes({ meetings, clients, members, hasGoogleCalendar = false }: Props) {
  const router = useRouter()
  const [view, setView] = useState<View>("calendario")
  const [scale, setScale] = useState<Scale>("semana")
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [open, setOpen] = useState<Shaped | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MeetingLite | null>(null)
  const [completion, setCompletion] = useState<MeetingLite | null>(null)
  const [syncing, setSyncing] = useState(false)

  const syncNow = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/integrations/google/calendar/org", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Falha ao sincronizar")
      const imported = data.imported || 0
      const updated = data.updated || 0
      toast({
        title: "Sincronização concluída",
        description: imported || updated
          ? `${imported} nova(s), ${updated} atualizada(s).`
          : "Nenhuma reunião nova na agenda central.",
      })
      router.refresh()
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao sincronizar", description: e instanceof Error ? e.message : "Tente novamente" })
    } finally {
      setSyncing(false)
    }
  }

  const shaped = useMemo(() => meetings.map(shape), [meetings])

  // Dias visíveis (semana = 7 a partir de domingo; dia = só o anchor)
  const days = useMemo(() => {
    const today = new Date()
    if (scale === "dia") return [{ date: anchor, today: isSameDay(anchor, today) }]
    const ws = startOfWeek(anchor, { weekStartsOn: 0 })
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(ws, i)
      return { date, today: isSameDay(date, today) }
    })
  }, [anchor, scale])

  const byDay = useMemo(() => {
    const map = new Map<string, Shaped[]>()
    for (const s of shaped) {
      const k = format(s.date, "yyyy-MM-dd")
      const arr = map.get(k) || []
      arr.push(s)
      map.set(k, arr)
    }
    return map
  }, [shaped])

  // KPIs
  const now = new Date()
  const upcoming = shaped.filter((s) => s.status !== "done" && s.date >= new Date(now.getFullYear(), now.getMonth(), now.getDate())).length
  const doneCount = shaped.filter((s) => s.status === "done").length
  const todayCount = shaped.filter((s) => isSameDay(s.date, now)).length

  const rangeLabel = scale === "mes"
    ? format(anchor, "MMMM yyyy", { locale: ptBR })
    : scale === "dia"
      ? format(anchor, "d 'de' MMM yyyy", { locale: ptBR })
      : `${format(days[0].date, "d")} – ${format(days[6].date, "d 'de' MMM", { locale: ptBR })}`

  const step = (dir: number) =>
    setAnchor((a) => (scale === "mes" ? addMonths(a, dir) : addDays(a, dir * (scale === "dia" ? 1 : 7))))

  const openNew = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (m: MeetingLite) => { setOpen(null); setEditing(m); setDialogOpen(true) }
  const openComplete = (m: MeetingLite) => { setOpen(null); setCompletion(m) }

  const linkClient = async (meetingId: string, clientId: string) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      })
      if (!res.ok) throw new Error()
      setOpen(null)
      router.refresh()
    } catch {
      // silencioso — mantém o drawer aberto para nova tentativa
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minHeight: 0, flex: 1 }}>
      <style>{`@keyframes cf-spin{to{transform:rotate(360deg)}}`}</style>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, color: C.g900, letterSpacing: "-0.02em" }}>Reuniões</h1>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.brand, background: C.blue50, border: `1px solid ${C.blue100}`, borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", ...TNUM }}>{upcoming}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13.5, color: C.g500 }}>Agende e acompanhe reuniões com clientes e equipe.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={syncNow} disabled={syncing} title="Importar reuniões da agenda central" style={{ height: 40, padding: "0 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.g700, fontWeight: 500, fontSize: 13, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "flex", animation: syncing ? "cf-spin 1s linear infinite" : "none" }}><I.refresh s={15} /></span>
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
          <button onClick={openNew} style={{ height: 40, padding: "0 20px", borderRadius: 6, border: "none", background: C.brandHover, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><I.plus s={16} /> Nova Reunião</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
        <Kpi icon={<I.calendar s={17} />} tone={C.brand} label="Próximas" value={upcoming} hint="próximos dias" />
        <Kpi icon={<I.check s={17} />} tone={C.pos} label="Realizadas" value={doneCount} hint="total" />
        <Kpi icon={<I.clock s={17} />} tone={C.amber} label="Hoje" value={todayCount} hint={todayCount === 1 ? "1 reunião" : "reuniões"} />
      </div>

      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, marginBottom: 16, flexWrap: "wrap" }}>
        <Segmented<View> value={view} onChange={setView} options={[
          { key: "calendario", label: "Calendário", icon: <I.grid s={15} /> },
          { key: "lista", label: "Lista", icon: <I.list s={15} /> },
        ]} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.g800, whiteSpace: "nowrap", textTransform: "capitalize", ...TNUM }}>{rangeLabel}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <button onClick={() => step(-1)} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: C.white, border: `1px solid ${C.border}`, borderRadius: "7px 0 0 7px", cursor: "pointer", color: C.g600 }}><I.chevL s={16} /></button>
            <button onClick={() => setAnchor(new Date())} style={{ height: 32, padding: "0 12px", background: C.white, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, cursor: "pointer", color: C.g700, fontSize: 12.5, fontWeight: 500 }}>Hoje</button>
            <button onClick={() => step(1)} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: C.white, border: `1px solid ${C.border}`, borderRadius: "0 7px 7px 0", cursor: "pointer", color: C.g600 }}><I.chevR s={16} /></button>
          </div>
          {view === "calendario" && (
            <Segmented<Scale> value={scale} onChange={setScale} options={[
              { key: "mes", label: "Mês" },
              { key: "semana", label: "Semana" },
              { key: "dia", label: "Dia" },
            ]} />
          )}
        </div>
      </div>

      {/* corpo */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {view === "lista"
          ? <ListView days={days} byDay={byDay} onOpen={setOpen} />
          : scale === "mes"
            ? <MonthGrid anchor={anchor} byDay={byDay} onOpen={setOpen} />
            : <TimeGrid days={days} byDay={byDay} onOpen={setOpen} />}
      </div>

      <DetailDrawer m={open} clients={clients} onClose={() => setOpen(null)} onEdit={openEdit} onComplete={openComplete} onLinkClient={linkClient} />

      {dialogOpen && (
        <MeetingDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null) }}
          onSuccess={() => { setDialogOpen(false); setEditing(null); router.refresh() }}
          meeting={editing as unknown as Parameters<typeof MeetingDialog>[0]["meeting"]}
          clients={clients as unknown as Parameters<typeof MeetingDialog>[0]["clients"]}
          members={members as unknown as Parameters<typeof MeetingDialog>[0]["members"]}
          hasGoogleCalendar={hasGoogleCalendar}
        />
      )}
      {completion && (
        <MeetingCompletionDialog
          open={!!completion}
          onClose={() => setCompletion(null)}
          onSuccess={() => { setCompletion(null); router.refresh() }}
          meeting={completion as unknown as Parameters<typeof MeetingCompletionDialog>[0]["meeting"]}
        />
      )}
    </div>
  )
}
