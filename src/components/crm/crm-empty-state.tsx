"use client"

import { ReactNode } from "react"
import { Inbox } from "lucide-react"

interface CrmEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function CrmEmptyState({ icon, title, description, action }: CrmEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "var(--crm-gray-100)", color: "var(--crm-gray-500)" }}
      >
        {icon || <Inbox className="h-5 w-5" />}
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
          style={{ fontSize: "var(--crm-text-base)", color: "var(--crm-gray-500)" }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
