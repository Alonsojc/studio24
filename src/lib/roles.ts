'use client';

import { supabase } from './supabase';

export type UserRole = 'admin' | 'operador' | 'contador';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  nombre: string;
}

// Get current user's profile/role
export async function getMyProfile(): Promise<UserProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: member }] = await Promise.all([
    supabase.from('profiles').select('id, email, role, nombre').eq('id', user.id).maybeSingle(),
    supabase
      .from('team_members')
      .select('role')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile && !member) {
    return null;
  }
  return {
    id: user.id,
    email: (profile?.email as string) || user.email || '',
    role: (member?.role as UserRole | undefined) || (profile?.role as UserRole | undefined) || 'operador',
    nombre: (profile?.nombre as string) || '',
  };
}

// Update profile
export async function updateProfile(profile: Partial<UserProfile>): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const safeProfile: Partial<UserProfile> = { ...profile };
  delete safeProfile.id;
  delete safeProfile.role;
  await supabase.from('profiles').upsert({ id: user.id, email: user.email || '', ...safeProfile });
}

// Route permissions per role
const ROLE_ROUTES: Record<UserRole, string[]> = {
  admin: ['*'], // Everything
  operador: [
    '/',
    '/pedidos',
    '/agenda',
    '/disenos',
    '/inventario',
    '/productos',
    '/plantillas',
    '/seguimiento',
    '/calculadora',
  ],
  contador: [
    '/',
    '/ingresos',
    '/egresos',
    '/reportes',
    '/fiscal',
    '/facturas',
    '/conciliacion',
    '/clientes',
    '/proveedores',
  ],
};

export function canAccess(role: UserRole, path: string): boolean {
  const routes = ROLE_ROUTES[role];
  if (routes.includes('*')) return true;
  return routes.some((r) => path === r || path.startsWith(r + '/'));
}

// What sections are visible in sidebar
export function getVisibleGroups(role: UserRole): string[] {
  if (role === 'admin') return ['PRODUCCIÓN', 'VENTAS', 'FINANZAS', 'DIRECTORIO'];
  if (role === 'operador') return ['PRODUCCIÓN', 'VENTAS'];
  if (role === 'contador') return ['FINANZAS', 'DIRECTORIO'];
  return [];
}

// Can write (mutate data)?
export function canWrite(role: UserRole): boolean {
  return role === 'admin' || role === 'operador';
}

// Role labels
export function roleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    admin: 'Administrador',
    operador: 'Operador',
    contador: 'Contador',
  };
  return map[role] || role;
}

export function roleColor(role: UserRole): string {
  const map: Record<UserRole, string> = {
    admin: 'bg-[#c72a09]/10 text-[#c72a09]',
    operador: 'bg-blue-100 text-blue-700',
    contador: 'bg-purple-100 text-purple-700',
  };
  return map[role] || 'bg-neutral-100 text-neutral-500';
}
