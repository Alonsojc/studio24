'use client';

import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { canAccess } from '@/lib/roles';
import { useRole } from './RoleProvider';

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, loading, error, retry } = useRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-xl font-bold text-[#0a0a0a]">Conexion interrumpida</h1>
          <p className="text-sm text-neutral-500 mt-3">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-md bg-[#c72a09] text-white text-sm font-semibold"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!canAccess(role, pathname)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="max-w-md text-center">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-neutral-400">Acceso restringido</p>
          <h1 className="text-2xl font-black text-[#0a0a0a] mt-2">No tienes permiso para abrir esta sección</h1>
          <p className="text-sm text-neutral-500 mt-3">
            Pide a un administrador que revise tu rol si necesitas entrar a esta pantalla.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
