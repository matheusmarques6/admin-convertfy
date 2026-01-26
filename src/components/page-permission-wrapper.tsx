"use client"

import { ReactNode } from "react"
import { PermissionGate } from "@/components/permission-gate"

interface PagePermissionWrapperProps {
  children: ReactNode
  requiredFeatures?: string[]
  requiredAllFeatures?: string[]
  requiresStoreAccess?: boolean
  storeId?: string
}

export function PagePermissionWrapper({
  children,
  requiredFeatures,
  requiredAllFeatures,
  requiresStoreAccess,
  storeId,
}: PagePermissionWrapperProps) {
  return (
    <PermissionGate
      requiredFeatures={requiredFeatures}
      requiredAllFeatures={requiredAllFeatures}
      requiresStoreAccess={requiresStoreAccess}
      storeId={storeId}
    >
      {children}
    </PermissionGate>
  )
}
