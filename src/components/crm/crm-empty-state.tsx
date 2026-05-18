"use client"

import { ReactNode } from "react"
import { Layers } from "lucide-react"

interface CrmEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** Variantes visuais. "card" usa o layout do prototipo V2 com card branco. */
  variant?: "inline" | "card"
  /** Hints adicionais no rodape (ex: link pra docs, importar CSV). */
  hints?: ReactNode
}

/**
 * Empty state do CRM (V2 — Convertfy DS).
 *
 * - `variant="inline"` (padrao): bloco centralizado leve, sem fundo. Usado
 *   dentro de drawers, popovers, lista filtrada vazia.
 * - `variant="card"`: card branco com radius grande, padding generoso e
 *   icone destacado. Usado no board vazio (`Pipeline · Estado vazio`).
 */
export function CrmEmptyState({
  icon,
  title,
  description,
  action,
  variant = "inline",
  hints,
}: CrmEmptyStateProps) {
  if (variant === "card") {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full">
        <div
          className="text-center"
          style={{
            maxWidth: 480,
            background: "var(--crm-gray-0)",
            border: "1px solid var(--crm-border)",
            borderRadius: "var(--crm-radius-2xl)",
            padding: "48px 40px",
            fontFamily: "var(--crm-font-sans)",
          }}
        >
          <div
            className="mx-auto flex items-center justify-center"
            style={{
              width: 64,
              height: 64,
              marginBottom: 20,
              borderRadius: 16,
              background: "var(--crm-blue-50)",
              color: "var(--crm-brand)",
            }}
          >
            {icon || <Layers className="h-7 w-7" />}
          </div>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--crm-gray-900)",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
          {description && (
            <p
              style={{
                margin: "0 0 24px",
                fontSize: 13,
                color: "var(--crm-gray-500)",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
          {action && (
            <div className="flex justify-center gap-2">{action}</div>
          )}
          {hints && (
            <div
              className="flex justify-center gap-4"
              style={{
                marginTop: 28,
                paddingTop: 20,
                borderTop: "1px solid var(--crm-gray-100)",
                fontSize: 12,
                color: "var(--crm-gray-500)",
              }}
            >
              {hints}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="mb-4 flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
          borderRadius: "var(--crm-radius-full)",
          background: "var(--crm-gray-100)",
          color: "var(--crm-gray-500)",
        }}
      >
        {icon || <Layers className="h-5 w-5" />}
      </div>
      <h3
        style={{
          fontSize: "var(--crm-text-md)",
          fontWeight: "var(--crm-weight-medium)",
          color: "var(--crm-gray-900)",
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="mt-1 max-w-sm"
          style={{
            fontSize: "var(--crm-text-base)",
            color: "var(--crm-gray-500)",
          }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
