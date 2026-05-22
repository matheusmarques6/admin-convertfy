"use client"

import { C } from "./_shared"

export type SidebarSection =
  | "visao-geral"
  | "sobre-cliente"
  | "brand-brain"
  | "assets-visuais"
  | "criterios"
  | "checklist"
  | "entregaveis"
  | "comentarios"
  | "historico"
  | "anotacoes"

export type SidebarGroup = {
  label: string
  items: Array<{
    id: SidebarSection
    label: string
    badge?: { value: string; tone?: "default" | "purple" | "green" }
  }>
}

const ICONS: Record<SidebarSection, React.ReactNode> = {
  "visao-geral": (
    <path
      d="M3 9.75L12 3l9 6.75V20a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V9.75z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  "sobre-cliente": (
    <>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  ),
  "brand-brain": (
    <path
      d="M9 4a4 4 0 014 4v8a4 4 0 11-8 0V8a4 4 0 014-4zm6 0a4 4 0 00-4 4v8a4 4 0 108 0V8a4 4 0 00-4-4z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  ),
  "assets-visuais": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <circle cx="9" cy="11" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M3 17l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </>
  ),
  criterios: (
    <>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </>
  ),
  checklist: (
    <>
      <path d="M3 6h14M3 12h14M3 18h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="19.5" cy="6" r="1.5" fill="currentColor" />
      <circle cx="19.5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19.5" cy="18" r="1.5" fill="currentColor" />
    </>
  ),
  entregaveis: (
    <>
      <path d="M21 8v13H3V8" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="1" y="3" width="22" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  comentarios: (
    <path
      d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  ),
  historico: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  anotacoes: (
    <path
      d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinejoin="round"
    />
  ),
}

function NavBadge({ tone, value }: { tone?: "default" | "purple" | "green"; value: string }) {
  const bg = tone === "purple" ? C.purpleBg : tone === "green" ? C.greenBg : C.gray100
  const color = tone === "purple" ? C.purpleText : tone === "green" ? C.greenText : C.gray700
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 3,
        background: bg,
        color,
        letterSpacing: 0.4,
      }}
    >
      {value}
    </span>
  )
}

export function TaskPanelSidebar({
  active,
  onChange,
  groups,
  progressPct,
  subtasksLabel,
  estimatedRemaining,
}: {
  active: SidebarSection
  onChange: (id: SidebarSection) => void
  groups: SidebarGroup[]
  progressPct?: number
  subtasksLabel?: string
  estimatedRemaining?: string
}) {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        background: C.gray50,
        borderRight: `1px solid ${C.gray200}`,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      <nav style={{ flex: 1, padding: "16px 12px" }}>
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                color: C.gray500,
                marginBottom: 6,
                padding: "0 8px",
              }}
            >
              {g.label}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {g.items.map((item) => {
                const isActive = active === item.id
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onChange(item.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        background: isActive ? "#fff" : "transparent",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        textAlign: "left",
                        color: isActive ? C.brandBlue : C.gray700,
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        boxShadow: isActive ? `0 1px 2px ${C.gray200}` : undefined,
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                        {ICONS[item.id]}
                      </svg>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </span>
                      {item.badge && <NavBadge tone={item.badge.tone} value={item.badge.value} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {progressPct != null && (
        <div
          style={{
            padding: 14,
            borderTop: `1px solid ${C.gray200}`,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: C.gray700, marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>{progressPct}% concluído</span>
            {subtasksLabel && <span style={{ color: C.gray500 }}>{subtasksLabel}</span>}
          </div>
          <div
            style={{
              height: 4,
              background: C.gray100,
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: C.brandBlue,
                transition: "width 0.3s",
              }}
            />
          </div>
          {estimatedRemaining && (
            <div style={{ fontSize: 10, color: C.gray500, marginTop: 4 }}>
              ~{estimatedRemaining} restantes
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
