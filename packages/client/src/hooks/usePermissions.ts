import { useAppContext } from '../context/AppContext';

export interface PermissionEntry {
  id: number;
  permission: string;
  scope: string;
  granted_by: string | null;
  granted_at: number;
}

export function useCan(permission: string, scope?: string): boolean {
  const { state } = useAppContext();
  const { currentUser, permissions } = state;

  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;

  if (!permissions) return false;

  return permissions.some(
    (p) =>
      p.permission === permission &&
      (p.scope === '*' || (scope != null && p.scope === scope)),
  );
}
