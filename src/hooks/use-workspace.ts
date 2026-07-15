"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { create } from "zustand"
import { persist } from "zustand/middleware"
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
 * Detecao do workspace ativo e por pathname (regras abaixo). Inbox
 * pertence ao workspace comercial (secao Atendimento).
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
    // Cinza grafite — visivel sobre fundo preto da sidebar.
    // O brand do CRM continua sendo #1F1F1F (em crm-tokens.css); aqui
    // usamos um cinza neutro pra dar identidade ao workspace sem sumir.
    color: "#71717A",
    colorBg: "rgba(113, 113, 122, 0.10)",
    colorBorder: "rgba(113, 113, 122, 0.30)",
    colorFg: "#FFFFFF",
    homeHref: "/admin/productivity",
    icon: LayoutGrid,
  },
}

const COMERCIAL_PREFIXES = ["/admin/comercial"]

const OPERACIONAL_PREFIXES = [
  // Tudo sob /admin/operacional/* (canonico). As paginas Customer
  // Success (CRM CS, Acompanhamento, Calls Mensais, Ritual, Cadencias)
  // moram em /admin/operacional/cs-crm, /acompanhamento e /ritual.
  // URLs antigas /admin/cs-crm etc respondem com redirect 308 — mas
  // como o navegador segue o redirect, o pathname final ja eh canonico.
  "/admin/operacional",
  "/admin/clients",
  "/admin/stores",
  "/admin/onboarding",
  "/admin/health",
  "/admin/campaigns",
  "/admin/insights",
  "/admin/list-hygiene",
]

// Rotas que NAO pertencem a workspace nenhum (configuracoes, notificacoes,
// tutorial do cliente): visitar uma delas nao deve trocar a sidebar de
// workspace — o usuario continua "onde estava". `detectWorkspace` devolve
// null para elas e o hook resolve pro ultimo workspace ativo (persistido).
const NEUTRAL_PREFIXES = [
  "/admin/settings",
  "/admin/notifications",
  "/admin/onboarding-help",
]

/**
 * Classifica o pathname em workspace, ou null para rotas neutras.
 * ATENCAO a ordem: onboarding-help e neutro e precisa ser testado ANTES
 * de /admin/onboarding (prefixo operacional que o contem).
 */
export function detectWorkspaceOrNull(pathname: string): WorkspaceKey | null {
  if (NEUTRAL_PREFIXES.some((p) => pathname.startsWith(p))) return null
  if (COMERCIAL_PREFIXES.some((p) => pathname.startsWith(p))) return "comercial"
  if (OPERACIONAL_PREFIXES.some((p) => pathname.startsWith(p))) return "operacional"
  // Inbox faz parte do Atendimento, que vive no workspace comercial
  if (pathname.startsWith("/admin/inbox")) return "comercial"
  return "geral"
}

/** Compat: classificacao sem memoria — rota neutra cai em "geral". */
export function detectWorkspace(pathname: string): WorkspaceKey {
  return detectWorkspaceOrNull(pathname) ?? "geral"
}

// Ultimo workspace NAO-neutro visitado, persistido (molde do
// use-sidebar.ts). E o fallback das rotas neutras.
interface WorkspaceMemoryState {
  lastWorkspace: WorkspaceKey
  setLastWorkspace: (w: WorkspaceKey) => void
}

export const useWorkspaceMemory = create<WorkspaceMemoryState>()(
  persist(
    (set) => ({
      lastWorkspace: "geral",
      setLastWorkspace: (w) =>
        set((s) => (s.lastWorkspace === w ? s : { lastWorkspace: w })),
    }),
    {
      name: "convertfy-workspace",
      partialize: (s) => ({ lastWorkspace: s.lastWorkspace }),
    },
  ),
)

export function useWorkspace(): WorkspaceKey {
  const pathname = usePathname() || ""
  const searchParams = useSearchParams()
  // Reunioes e rota COMPARTILHADA por dois workspaces. A intencao vem do
  // scope: ?scope=mine pertence ao Geral; sem scope (visao "todas") pertence
  // ao Comercial. Deterministico -> no F5 sempre cai num workspace que TEM
  // o item Reunioes (nunca no Operacional, que nao tem).
  const detected: WorkspaceKey | null = pathname.startsWith("/admin/meetings")
    ? searchParams.get("scope") === "mine"
      ? "geral"
      : "comercial"
    : detectWorkspaceOrNull(pathname)
  const lastWorkspace = useWorkspaceMemory((s) => s.lastWorkspace)

  // Grava o ultimo workspace real fora do render (evita setState-in-render).
  useEffect(() => {
    if (detected) useWorkspaceMemory.getState().setLastWorkspace(detected)
  }, [detected])

  return detected ?? lastWorkspace
}
