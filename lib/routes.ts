import type { UserRole } from '@/types/database';

/**
 * Role -> home route. Each role portal lives under its own URL prefix so
 * Next.js route groups don't collide on /dashboard.
 */
export const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  landlord: '/landlord/dashboard',
  tenant: '/tenant/dashboard',
};

export const PUBLIC_PATHS = ['/', '/login', '/signup', '/auth/callback'];

/** Which URL prefix does a given path belong to (for role gating)? */
export function requiredRoleForPath(pathname: string): UserRole | null {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/landlord')) return 'landlord';
  if (pathname.startsWith('/tenant')) return 'tenant';
  return null;
}
