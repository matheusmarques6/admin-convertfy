"use client"

import React from "react"

// Design tokens compartilhados (alinhados com task-detail-drawer)
export const C = {
  brandBlue: "#2137B6",
  brandBlueLight: "#4E62D8",
  brandBlue50: "#EEF0FB",
  brandBlue100: "#C7CDEF",
  green: "#10B981",
  greenText: "#065F46",
  greenBg: "#ECFDF5",
  greenBorder: "#A7F3D0",
  amber: "#F59E0B",
  amberText: "#92400E",
  amberBg: "#FFFBEB",
  red: "#DC2626",
  redText: "#991B1B",
  purple: "#A855F7",
  purpleText: "#7E22CE",
  purpleBg: "#F3E8FF",
  purpleBorder: "#7C3AED",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray500: "#6B7280",
  gray700: "#374151",
  gray900: "#111827",
}

export function BlockSection({
  title,
  badge,
  action,
  children,
  className,
}: {
  title?: string
  badge?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={className}
      style={{
        background: "#fff",
        border: `1px solid ${C.gray200}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: `1px solid ${C.gray100}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {title && (
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.gray700,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                  margin: 0,
                }}
              >
                {title}
              </h3>
            )}
            {badge}
          </div>
          {action}
        </header>
      )}
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "24px 12px",
        color: C.gray500,
        fontSize: 13,
      }}
    >
      {icon && <div style={{ marginBottom: 8, opacity: 0.5 }}>{icon}</div>}
      <div style={{ fontWeight: 600, color: C.gray700, marginBottom: 4 }}>{title}</div>
      {description && (
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

export function MiniSpinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      style={{ animation: "spin 1s linear infinite" }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke={C.brandBlue}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="80 60"
      />
    </svg>
  )
}

// Hook simples pra fetch com SWR-like behavior
export function useFetch<T>(url: string | null): {
  data: T | null
  loading: boolean
  error: Error | null
  mutate: () => void
} {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<Error | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!url) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((j) => {
        if (cancelled) return
        const payload = (j.data ?? j) as T
        setData(payload)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e as Error)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, tick])

  return { data, loading, error, mutate: () => setTick((t) => t + 1) }
}
