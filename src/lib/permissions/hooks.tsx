"use client";

import { type ReactNode } from 'react';
import { useAuthStore } from '@/lib/store';
import {
  type Permission,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccessRoute,
  canManage,
} from './index';

/**
 * Hook to check a single permission
 */
export function usePermission(permission: Permission): boolean {
  const { user } = useAuthStore();
  return hasPermission(user?.role, permission);
}

/**
 * Hook to check multiple permissions (any)
 */
export function useAnyPermission(permissions: Permission[]): boolean {
  const { user } = useAuthStore();
  return hasAnyPermission(user?.role, permissions);
}

/**
 * Hook to check multiple permissions (all)
 */
export function useAllPermissions(permissions: Permission[]): boolean {
  const { user } = useAuthStore();
  return hasAllPermissions(user?.role, permissions);
}

/**
 * Hook to check route access
 */
export function useCanAccessRoute(route: string): boolean {
  const { user } = useAuthStore();
  return canAccessRoute(user?.role, route);
}

/**
 * Hook to check if user can manage a resource
 */
export function useCanManage(resource: string): boolean {
  const { user } = useAuthStore();
  return canManage(user?.role, resource);
}

/**
 * Hook that returns permission check functions
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const role = user?.role;

  return {
    role,
    can: (permission: Permission) => hasPermission(role, permission),
    canAny: (permissions: Permission[]) => hasAnyPermission(role, permissions),
    canAll: (permissions: Permission[]) => hasAllPermissions(role, permissions),
    canAccess: (route: string) => canAccessRoute(role, route),
    canManage: (resource: string) => canManage(role, resource),
  };
}

/**
 * Permission Gate Component
 * Conditionally renders children based on permission
 */
interface PermissionGateProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const hasAccess = usePermission(permission);
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Multiple Permissions Gate (any)
 */
interface AnyPermissionGateProps {
  permissions: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function AnyPermissionGate({
  permissions,
  children,
  fallback = null,
}: AnyPermissionGateProps) {
  const hasAccess = useAnyPermission(permissions);
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Role Gate Component
 * Conditionally renders children based on role
 */
interface RoleGateProps {
  roles: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGate({
  roles,
  children,
  fallback = null,
}: RoleGateProps) {
  const { user } = useAuthStore();
  const hasAccess = user?.role && roles.includes(user.role);
  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
