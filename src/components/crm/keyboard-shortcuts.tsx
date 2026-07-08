"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ROUTES } from "@/lib/routes"

/**
 * Atalhos globais de navegacao (estilo Linear/Superhuman) com prefixo
 * "g + letra". Janela de 1.5s entre teclas. Ativos em rotas /admin/*.
 *
 * Comercial:
 *   g + d  → Dashboard comercial
 *   g + p  → Pipelines comerciais
 *   g + l  → Leads
 *   g + r  → Reports comercial
 *
 * Operacional:
 *   g + o  → Dashboard operacional (CS)
 *   g + c  → Pipelines CS
 *   g + s  → Saude
 *   g + a  → Automacoes
 *
 * Compartilhado:
 *   g + i  → Inbox
 *
 * Cmd+K continua sendo o command palette (gerenciado em outro lugar).
 */

const SHORTCUTS: Record<string, string> = {
  // Comercial
  d: ROUTES.ADMIN.COMERCIAL.DASHBOARD,
  p: ROUTES.ADMIN.COMERCIAL.PIPELINES,
  l: ROUTES.ADMIN.COMERCIAL.LEADS,
  r: ROUTES.ADMIN.COMERCIAL.REPORTS,
  a: ROUTES.ADMIN.COMERCIAL.AUTOMACOES.LIST,
  i: ROUTES.ADMIN.INBOX,
  // Operacional
  o: ROUTES.ADMIN.OPERACIONAL.DASHBOARD,
  c: ROUTES.ADMIN.OPERACIONAL.PIPELINES,
  s: ROUTES.ADMIN.HEALTH,
}

export function CrmKeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname()

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
      // Ignora se tem modificador
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
        const target = SHORTCUTS[key]
        if (target) {
          e.preventDefault()
          router.push(target)
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      if (prefixTimer) clearTimeout(prefixTimer)
    }
  }, [pathname, router])

  return null
}
