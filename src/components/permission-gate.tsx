"use client"

import { ReactNode } from "react"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { ShieldAlert, Loader2 } from "lucide-react"
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface PermissionGateProps {
  children: ReactNode
  // Features necessárias - precisa ter pelo menos UMA
  requiredFeatures?: string[]
  // Features necessárias - precisa ter TODAS
  requiredAllFeatures?: string[]
  // Verifica se tem acesso a alguma loja
  requiresStoreAccess?: boolean
  // ID específico da loja que precisa acessar
  storeId?: string
  // Componente customizado para mostrar quando não tem permissão
  fallback?: ReactNode
  // Se true, mostra loading enquanto carrega permissões
  showLoading?: boolean
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">Acesso Negado</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Você não tem permissão para acessar esta página.
        Entre em contato com o administrador se precisar de acesso.
      </p>
      <Button asChild>
        <Link href="/admin/dashboard">Voltar ao Dashboard</Link>
      </Button>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

export function PermissionGate({
  children,
  requiredFeatures,
  requiredAllFeatures,
  requiresStoreAccess,
  storeId,
  fallback,
  showLoading = true,
}: PermissionGateProps) {
  const { permissions, hasAnyFeature, hasAllFeatures, canAccessStore, isLoading } = usePermissions()

  // Mostra loading enquanto carrega
  if (isLoading) {
    return showLoading ? <LoadingState /> : null
  }

  // Se não tem permissões carregadas, nega acesso
  if (!permissions) {
    return fallback || <AccessDenied />
  }

  // Admin e Owner sempre têm acesso
  if (permissions.isAdmin || permissions.isOrgOwner) {
    return <>{children}</>
  }

  // Verifica features (pelo menos uma)
  if (requiredFeatures && requiredFeatures.length > 0) {
    if (!hasAnyFeature(requiredFeatures)) {
      return fallback || <AccessDenied />
    }
  }

  // Verifica features (todas necessárias)
  if (requiredAllFeatures && requiredAllFeatures.length > 0) {
    if (!hasAllFeatures(requiredAllFeatures)) {
      return fallback || <AccessDenied />
    }
  }

  // Verifica acesso a lojas
  if (requiresStoreAccess) {
    if (permissions.storeAccess.length === 0) {
      return fallback || <AccessDenied />
    }
  }

  // Verifica acesso a loja específica
  if (storeId) {
    if (!canAccessStore(storeId)) {
      return fallback || <AccessDenied />
    }
  }

  return <>{children}</>
}

// Componente para esconder elementos sem mostrar mensagem de erro
export function PermissionHide({
  children,
  requiredFeatures,
  requiredAllFeatures,
  requiresStoreAccess,
  storeId,
}: Omit<PermissionGateProps, "fallback" | "showLoading">) {
  return (
    <PermissionGate
      requiredFeatures={requiredFeatures}
      requiredAllFeatures={requiredAllFeatures}
      requiresStoreAccess={requiresStoreAccess}
      storeId={storeId}
      fallback={null}
      showLoading={false}
    >
      {children}
    </PermissionGate>
  )
}
