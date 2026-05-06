"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ROUTES } from "@/lib/routes"

/**
 * CRM keyboard shortcuts (estilo Linear/Superhuman):
 * - g + l → Leads
 * - g + p → Pipelines comerciais
 * - g + c → Customer Success
 * - g + i → Inbox
 * - g + a → Automacoes
 * - g + r → Reports
 * - g + d → Dashboard comercial
 *
 * Inputs/textareas/selects sao ignorados (so dispara fora deles).
 *
 * Cmd+K continua sendo o command palette (gerenciado em outro lugar).
 */

const SHORTCUTS: Record<string, string> = {
  l: ROUTES.ADMIN.CRM.SALES.LEADS,
  p: ROUTES.ADMIN.CRM.SALES.PIPELINES,
  c: ROUTES.ADMIN.CRM.CS.PIPELINES,
  i: ROUTES.ADMIN.CRM.INBOX,
  a: ROUTES.ADMIN.CRM.AUTOMATIONS.LIST,
  r: ROUTES.ADMIN.CRM.REPORTS,
  d: ROUTES.ADMIN.CRM.SALES.DASHBOARD,
}

export function CrmKeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // So ativa em rotas /admin/crm/*
    if (!pathname?.startsWith("/admin/crm")) return

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
