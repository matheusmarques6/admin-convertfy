"use client"

/**
 * Header padrao das 5 paginas de Customer Success.
 *
 * Garante consistencia visual e provê:
 *  - Breadcrumb (Operacional > Customer Success > [Pagina atual])
 *  - Title + descricao curta
 *  - Tabs de cross-navigation pras outras 4 paginas do CS
 *
 * Sem isso, cada pagina parece desconectada e o usuario tem que voltar
 * pro menu pra trocar de pagina. Com isso, fica claro que sao 5 telas
 * de um mesmo "modulo CS".
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

const C = {
  brand: "#2137B6",
  brand50: "#EEF0FB",
  g100: "#F3F4F6",
  g200: "#E5E7EB",
  g300: "#D1D5DB",
  g500: "#6B7280",
  g700: "#374151",
  g900: "#111827",
}

const CS_PAGES = [
  { key: "pipelines", label: "Pipelines CS", href: "/admin/operacional/pipelines" },
  { key: "acomp", label: "Acompanhamento", href: "/admin/operacional/acompanhamento" },
  { key: "calls", label: "Calls Mensais", href: "/admin/operacional/cs-crm/calls" },
  { key: "ritual", label: "Ritual de Sexta", href: "/admin/operacional/ritual" },
  { key: "cadences", label: "Cadências", href: "/admin/operacional/cs-crm/cadences" },
] as const

interface CSPageHeaderProps {
  title: string
  description: string
  /** ex.: "crm" | "acomp" | "calls" | "ritual" | "cadences" */
  active: typeof CS_PAGES[number]["key"]
  /** Slot direito (acoes secundarias, filtros globais, etc.) */
  right?: React.ReactNode
}

export function CSPageHeader({ title, description, active, right }: CSPageHeaderProps) {
  const pathname = usePathname()

  return (
    <div
      style={{
        paddingBottom: 16,
        marginBottom: 20,
        borderBottom: `1px solid ${C.g200}`,
      }}
    >
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: C.g500,
          marginBottom: 8,
        }}
      >
        <Link
          href="/admin/operacional/dashboard"
          style={{ color: C.g500, textDecoration: "none" }}
        >
          Operacional
        </Link>
        <ChevronRight size={11} style={{ color: C.g300 }} />
        <span style={{ color: C.g700, fontWeight: 500 }}>Customer Success</span>
        <ChevronRight size={11} style={{ color: C.g300 }} />
        <span style={{ color: C.g900, fontWeight: 600 }}>{title}</span>
      </nav>

      {/* Title + right slot */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: C.g900,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: 12.5,
              color: C.g500,
              marginTop: 4,
              marginBottom: 0,
              lineHeight: 1.5,
              maxWidth: 720,
            }}
          >
            {description}
          </p>
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>

      {/* Cross-nav tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        {CS_PAGES.map((p) => {
          const isActive =
            p.key === active ||
            (pathname === p.href && p.key !== active)
          return (
            <Link
              key={p.key}
              href={p.href}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? C.brand : C.g700,
                background: isActive ? C.brand50 : "transparent",
                borderRadius: 4,
                textDecoration: "none",
                transition: "background 120ms ease",
              }}
              className="hover:bg-gray-50"
            >
              {p.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
