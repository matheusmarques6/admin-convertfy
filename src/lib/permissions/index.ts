// TODO [TECH-DEBT INC-01]: This static role-based permission system coexists with the dynamic
// feature-based system in src/lib/hooks/use-permissions.tsx + PermissionGate.
// Consolidate into a single permission model. The dynamic system (use-permissions) is the
// actively used one; this static matrix is legacy and may be removable.
import type { UserRole } from '@/types';

/**
 * Permission types for the Convertfy Admin system
 */
export type Permission =
  // Client permissions
  | 'clients.view'
  | 'clients.create'
  | 'clients.edit'
  | 'clients.delete'

  // Deal permissions
  | 'deals.view'
  | 'deals.create'
  | 'deals.edit'
  | 'deals.delete'

  // Meeting permissions
  | 'meetings.view'
  | 'meetings.create'
  | 'meetings.edit'
  | 'meetings.delete'

  // Report permissions
  | 'reports.view'
  | 'reports.create'
  | 'reports.edit'

  // Financial permissions
  | 'financial.view'
  | 'financial.manage'

  // Automation permissions
  | 'automations.view'
  | 'automations.manage'

  // Settings permissions
  | 'settings.view'
  | 'settings.manage'

  // User management
  | 'users.view'
  | 'users.manage'

  // Pipeline permissions
  | 'pipeline.view'
  | 'pipeline.manage';

/**
 * Role-based permission matrix
 */
export const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'meetings.view', 'meetings.create', 'meetings.edit', 'meetings.delete',
    'reports.view', 'reports.create', 'reports.edit',
    'financial.view', 'financial.manage',
    'automations.view', 'automations.manage',
    'settings.view', 'settings.manage',
    'users.view', 'users.manage',
    'pipeline.view', 'pipeline.manage',
  ],

  manager: [
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'meetings.view', 'meetings.create', 'meetings.edit', 'meetings.delete',
    'reports.view', 'reports.create', 'reports.edit',
    'financial.view',
    'automations.view', 'automations.manage',
    'settings.view',
    'users.view',
    'pipeline.view', 'pipeline.manage',
  ],

  coo: [
    'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'meetings.view', 'meetings.create', 'meetings.edit', 'meetings.delete',
    'reports.view', 'reports.create', 'reports.edit',
    'financial.view',
    'automations.view', 'automations.manage',
    'settings.view',
    'users.view',
    'pipeline.view', 'pipeline.manage',
  ],

  sdr: [
    'clients.view',
    'deals.view', 'deals.create', 'deals.edit',
    'meetings.view', 'meetings.create', 'meetings.edit',
    'pipeline.view',
  ],

  closer: [
    'clients.view',
    'deals.view', 'deals.create', 'deals.edit',
    'meetings.view', 'meetings.create', 'meetings.edit',
    'pipeline.view',
  ],

  cs: [
    'clients.view', 'clients.edit',
    'deals.view',
    'meetings.view', 'meetings.create', 'meetings.edit',
    'reports.view', 'reports.create',
    'pipeline.view',
  ],

  financial: [
    'clients.view',
    'reports.view',
    'financial.view', 'financial.manage',
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = rolePermissions[role];
  return permissions?.includes(permission) ?? false;
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: UserRole | undefined, permissions: Permission[]): boolean {
  if (!role) return false;
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return rolePermissions[role] || [];
}

/**
 * Check if role can manage (create/edit/delete) a resource
 */
export function canManage(role: UserRole | undefined, resource: string): boolean {
  if (!role) return false;
  const createPerm = `${resource}.create` as Permission;
  const editPerm = `${resource}.edit` as Permission;
  return hasPermission(role, createPerm) || hasPermission(role, editPerm);
}

/**
 * Route access configuration by role
 */
export const routeAccess: Record<string, UserRole[]> = {
  '/admin/dashboard': ['admin', 'manager', 'coo', 'sdr', 'closer', 'cs', 'financial'],
  '/admin/clients': ['admin', 'manager', 'coo', 'sdr', 'closer', 'cs', 'financial'],
  '/admin/clients/new': ['admin', 'manager', 'coo'],
  '/admin/pipeline': ['admin', 'manager', 'coo', 'sdr', 'closer', 'cs'],
  '/admin/meetings': ['admin', 'manager', 'coo', 'sdr', 'closer', 'cs'],
  '/admin/reports': ['admin', 'manager', 'coo', 'cs', 'financial'],
  '/admin/financial': ['admin', 'manager', 'coo', 'financial'],
  '/admin/automations': ['admin', 'manager', 'coo'],
  '/admin/settings': ['admin', 'manager', 'coo'],
  '/admin/settings/users': ['admin'],
  '/admin/tools': ['admin', 'manager', 'coo', 'sdr', 'closer', 'cs'],
};

/**
 * Check if a role can access a specific route
 */
export function canAccessRoute(role: UserRole | undefined, route: string): boolean {
  if (!role) return false;

  // Check exact match first
  if (routeAccess[route]) {
    return routeAccess[route].includes(role);
  }

  // Check parent routes
  const segments = route.split('/').filter(Boolean);
  while (segments.length > 0) {
    const parentRoute = '/' + segments.join('/');
    if (routeAccess[parentRoute]) {
      return routeAccess[parentRoute].includes(role);
    }
    segments.pop();
  }

  // Default to allowing access if not explicitly restricted
  return true;
}
