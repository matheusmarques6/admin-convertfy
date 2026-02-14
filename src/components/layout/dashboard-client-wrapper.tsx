"use client"

import { ReactNode } from "react"
import { PermissionsProvider, Permissions } from "@/lib/hooks/use-permissions"

interface DashboardClientWrapperProps {
  children: ReactNode
  initialPermissions?: Permissions | null
}

export function DashboardClientWrapper({
  children,
  initialPermissions
}: DashboardClientWrapperProps) {
  return (
    <PermissionsProvider initialPermissions={initialPermissions}>
      {children}
    </PermissionsProvider>
  )
}
