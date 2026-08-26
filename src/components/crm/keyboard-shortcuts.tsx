"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ROUTES } from "@/lib/routes"
import type { NavItemId } from "@/lib/permissions/role-access"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { useWorkspaceNavigation } from "@/components/layout/workspace-switcher"
import type { WorkspaceKey } from "@/hooks/use-workspace"

/**
 * Atalhos globais de navegacao (estilo Linear/Superhuman) com prefixo
 * "g + letra". Janela de 1.5s entre teclas. Ativos em rotas /admin/*.
 *
 * Comercial:
 *   g + d  → Dashboard comercial
 *   g + p  → Pipelines comerciais
 *   g + l  → Leads
 *   g + f  → Funil
 *   g + r  → Reports comercial
 *   g + a  → Automações
 *
 * Operacional:
 *   g + o  → Dashboard operacional (CS)
 *   g + c  → Pipelines CS
 *   g + s  → Saúde
 *
 * Compartilhado:
 *   g + i  → Inbox
 *
 * Workspaces (Onda 1): ⌥1 Comercial · ⌥2 Operacional · ⌥3 Geral.
 *
 * TODOS os destinos respeitam o gate de função (canAccess) — antes os
 * atalhos navegavam pra páginas que a sidebar escondia. Cmd+K continua
 * sendo o command palette (gerenciado em outro lugar).
 */

const SHORTCUTS: Record<string, { href: string; id: NavItemId }> = {
  // Comercial
  d: { href: ROUTES.ADMIN.COMERCIAL.DASHBOARD, id: "comercial.dashboard" },
  p: { href: ROUTES.ADMIN.COMERCIAL.PIPELINES, id: "comercial.pipelines" },
  l: { href: ROUTES.ADMIN.COMERCIAL.LEADS, id: "comercial.leads" },
  f: { href: ROUTES.ADMIN.COMERCIAL.FUNIL, id: "comercial.funil" },
  r: { href: ROUTES.ADMIN.COMERCIAL.REPORTS, id: "comercial.reports" },
  a: { href: ROUTES.ADMIN.COMERCIAL.AUTOMACOES.LIST, id: "comercial.automacoes" },
  i: { href: ROUTES.ADMIN.INBOX, id: "comercial.inbox" },
  // Operacional
  o: { href: ROUTES.ADMIN.OPERACIONAL.DASHBOARD, id: "ops.dashboard" },
  c: { href: ROUTES.ADMIN.OPERACIONAL.PIPELINES, id: "ops.cs.pipelines" },
  s: { href: ROUTES.ADMIN.HEALTH, id: "ops.health" },
}

// ⌥1/2/3 — mesma ordem das abas do switcher.
const WS_BY_DIGIT: Record<string, WorkspaceKey> = {
  Digit1: "comercial",
  Digit2: "operacional",
  Digit3: "geral",
}

export function CrmKeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname()
  const { canAccess, isLoading } = usePermissions()
  const { goTo } = useWorkspaceNavigation()

  useEffect(() => {
    // Ativa em qualquer rota /admin/*
    if (!pathname?.startsWith("/admin")) return

    let prefixActive = false
    let prefixTimer: ReturnType<typeof setTimeout> | null = null

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignora se tipando em input/textarea/select/contenteditable
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }

      // ⌥1/2/3 troca workspace. e.code (não e.key): no mac, Option+1
      // produz caracteres especiais ("¡") e o match por key nunca casa.
      if (e.altKey && !e.metaKey && !e.ctrlKey && WS_BY_DIGIT[e.code]) {
        e.preventDefault()
        goTo(WS_BY_DIGIT[e.code])
        return
      }

      // Ignora se tem modificador (sequências g+letra são sem modificador)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()

      if (!prefixActive && key === "g") {
        prefixActive = true
        if (prefixTimer) clearTimeout(prefixTimer)
        prefixTimer = setTimeout(() => {
          prefixActive = false
        }, 1500)
        return
      }

      if (prefixActive) {
        prefixActive = false
        if (prefixTimer) clearTimeout(prefixTimer)
        const shortcut = SHORTCUTS[key]
        // Gate de função: destino vetado = atalho inerte (igual à sidebar).
        if (shortcut && !isLoading && canAccess(shortcut.id)) {
          e.preventDefault()
          router.push(shortcut.href)
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      if (prefixTimer) clearTimeout(prefixTimer)
    }
  }, [pathname, router, canAccess, isLoading, goTo])

  return null
}
