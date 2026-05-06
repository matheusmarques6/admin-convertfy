"use client"

import { usePathname } from "next/navigation"
import {
  Briefcase,
  HeartHandshake,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react"

/**
 * Workspaces sao "sub-sistemas" dentro do admin. Cada workspace tem
 * sidebar propria, cor de acento e dashboard inicial. O usuario alterna
 * via WorkspaceSwitcher (topo da sidebar) ou navegando direto pra uma
 * URL pertencente ao workspace.
 *
 * Detecao do workspace ativo e por pathname (regras abaixo). Inbox e
 * compartilhado — aparece nos sidebars de comercial e operacional.
 * Quando aberto direto, default operacional.
 */

export type WorkspaceKey = "comercial" | "operacional" | "geral"

export interface WorkspaceMeta {
  key: WorkspaceKey
  label: string
  description: string
  /** Iniciais 1-2 letras pra avatar/badge compacto */
  initials: string
  /** Cor de acento (CSS var) — define brand do workspace */
  color: string
  /** Variante mais clara (background sutil em hovers/selected) */
  colorBg: string
  /** Border do badge */
  colorBorder: string
  /** Texto sobre a cor (geralmente branco) */
  colorFg: string
  /** Para onde o switcher leva ao trocar pra esse workspace */
  homeHref: string
  icon: LucideIcon
}

export const WORKSPACES: Record<WorkspaceKey, WorkspaceMeta> = {
  comercial: {
    key: "comercial",
    label: "Comercial",
    description: "Vendas e prospeccao",
    initials: "CM",
    color: "#2563EB",
    colorBg: "rgba(37, 99, 235, 0.08)",
    colorBorder: "rgba(37, 99, 235, 0.25)",
    colorFg: "#FFFFFF",
    homeHref: "/admin/comercial/dashboard",
    icon: Briefcase,
  },
  operacional: {
    key: "operacional",
    label: "Operacional",
    description: "Customer Success e operacoes",
    initials: "OP",
    color: "#047857",
    colorBg: "rgba(4, 120, 87, 0.08)",
    colorBorder: "rgba(4, 120, 87, 0.25)",
    colorFg: "#FFFFFF",
    homeHref: "/admin/operacional/dashboard",
    icon: HeartHandshake,
  },
  geral: {
    key: "geral",
    label: "Geral",
    description: "Produtividade, financeiro, configs",
    initials: "GR",
    color: "#1F1F1F",
    colorBg: "rgba(31, 31, 31, 0.06)",
    colorBorder: "rgba(31, 31, 31, 0.18)",
    colorFg: "#FFFFFF",
    homeHref: "/admin/dashboard",
    icon: LayoutGrid,
  },
}

const COMERCIAL_PREFIXES = ["/admin/comercial"]

const OPERACIONAL_PREFIXES = [
  "/admin/operacional",
  "/admin/clients",
  "/admin/stores",
  "/admin/onboarding",
  "/admin/health",
  "/admin/campaigns",
  "/admin/insights",
  "/admin/list-hygiene",
]

export function detectWorkspace(pathname: string): WorkspaceKey {
  if (COMERCIAL_PREFIXES.some((p) => pathname.startsWith(p))) return "comercial"
  if (OPERACIONAL_PREFIXES.some((p) => pathname.startsWith(p))) return "operacional"
  // Inbox e compartilhado — default operacional quando aberto direto
  if (pathname.startsWith("/admin/inbox")) return "operacional"
  return "geral"
}

export function useWorkspace(): WorkspaceKey {
  const pathname = usePathname() || ""
  return detectWorkspace(pathname)
}
