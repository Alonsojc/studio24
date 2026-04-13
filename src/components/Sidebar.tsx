'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/ingresos', label: 'Ingresos', icon: '💰' },
  { href: '/egresos', label: 'Egresos', icon: '💸' },
  { href: '/clientes', label: 'Clientes', icon: '👥' },
  { href: '/proveedores', label: 'Proveedores', icon: '🏭' },
  { href: '/reportes', label: 'Reportes', icon: '📈' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-[#1e1b4b] text-white flex flex-col z-50">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-purple-300">Studio</span>
          <span className="text-pink-300">24</span>
        </h1>
        <p className="text-xs text-purple-200/60 mt-1">Sistema de Bordados</p>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 text-sm transition-all ${
                isActive
                  ? 'bg-white/15 text-white border-r-4 border-pink-400 font-semibold'
                  : 'text-purple-200/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 text-xs text-purple-200/40">
        Bordados &mdash; Control de Negocio
      </div>
    </aside>
  );
}
