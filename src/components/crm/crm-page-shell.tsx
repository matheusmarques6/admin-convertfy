"use client"

import { ReactNode } from "react"

interface CrmPageShellProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

/**
 * Shell padrao das paginas do CRM. Tipografia e espacamento seguem
 * src/styles/crm-tokens.css — densidade alta, fundo neutro, sem
 * sombras excessivas. Topbar fixa de 44px alinhada ao --crm-topbar-height.
 */
export function CrmPageShell({ title, subtitle, actions, children }: CrmPageShellProps) {
  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--crm-gray-50)", fontFamily: "var(--crm-font-sans)" }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2 md:flex-nowrap md:px-6 md:py-0"
        style={{
          // minHeight (não height fixo): quando as ações quebram linha no
          // mobile, o header cresce em vez de espremer/vazar. No desktop
          // (md:flex-nowrap) nada quebra e a altura fica em 44px como antes.
          minHeight: "var(--crm-topbar-height)",
          borderColor: "var(--crm-gray-200)",
          background: "var(--crm-gray-0)",
        }}
      >
        <div className="flex flex-col">
          <h1
            className="leading-none"
            style={{
              fontSize: "var(--crm-text-md)",
              fontWeight: "var(--crm-weight-medium)",
              color: "var(--crm-gray-900)",
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="mt-1"
              style={{
                fontSize: "var(--crm-text-xs)",
                color: "var(--crm-gray-500)",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
