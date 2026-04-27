'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getClientes,
  getIngresos,
  getEgresos,
  getPedidos,
  getProveedores,
  getCotizaciones,
  getProductos,
} from '@/lib/store';
import { formatCurrency } from '@/lib/helpers';

interface SearchResult {
  type: string;
  label: string;
  sub: string;
  href: string;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closeSearch]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.length >= 2 ? query : ''), query.length >= 2 ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return [];
    const q = debouncedQuery.toLowerCase();
    const r: SearchResult[] = [];

    getClientes()
      .filter((c) => c.nombre.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.telefono.includes(q))
      .slice(0, 5)
      .forEach((c) => r.push({ type: 'Cliente', label: c.nombre, sub: c.telefono || c.email, href: '/clientes' }));

    getPedidos()
      .filter((p) => p.descripcion.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((p) =>
        r.push({ type: 'Pedido', label: p.descripcion, sub: formatCurrency(p.montoTotal), href: '/pedidos' }),
      );

    getIngresos()
      .filter((i) => i.descripcion.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((i) =>
        r.push({ type: 'Ingreso', label: i.descripcion, sub: formatCurrency(i.montoTotal), href: '/ingresos' }),
      );

    getEgresos()
      .filter((e) => e.descripcion.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((e) =>
        r.push({ type: 'Egreso', label: e.descripcion, sub: formatCurrency(e.montoTotal), href: '/egresos' }),
      );

    getProveedores()
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((p) => r.push({ type: 'Proveedor', label: p.nombre, sub: p.tipo, href: '/proveedores' }));

    getCotizaciones()
      .filter((c) => c.folio.toLowerCase().includes(q) || c.clienteNombre.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((c) =>
        r.push({
          type: 'Cotización',
          label: `${c.folio} — ${c.clienteNombre || 'Sin cliente'}`,
          sub: formatCurrency(c.total),
          href: '/cotizador',
        }),
      );

    getProductos()
      .filter((p) => p.nombre.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((p) => r.push({ type: 'Producto', label: p.nombre, sub: formatCurrency(p.precio), href: '/productos' }));

    return r;
  }, [debouncedQuery]);

  const go = (href: string) => {
    closeSearch();
    router.push(href);
  };

  const typeColor: Record<string, string> = {
    Cliente: 'bg-blue-100 text-blue-700',
    Pedido: 'bg-orange-100 text-orange-700',
    Ingreso: 'bg-green-100 text-green-700',
    Egreso: 'bg-red-100 text-red-600',
    Proveedor: 'bg-purple-100 text-purple-700',
    Cotización: 'bg-amber-100 text-amber-700',
    Producto: 'bg-cyan-100 text-cyan-700',
  };

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] text-neutral-500 hover:text-white hover:bg-white/[0.08] transition-all text-xs"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <span>Buscar...</span>
        <span className="ml-auto text-[9px] text-neutral-600 bg-white/10 px-1.5 py-0.5 rounded">⌘K</span>
      </button>
    );

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeSearch} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
          <svg
            className="w-5 h-5 text-neutral-400 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar clientes, pedidos, ingresos..."
            className="flex-1 text-sm outline-none"
          />
          <button
            onClick={() => setOpen(false)}
            className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-1 rounded-lg font-bold"
          >
            ESC
          </button>
        </div>
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map((r, idx) => (
              <button
                key={idx}
                onClick={() => go(r.href)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-neutral-50 text-left transition-colors"
              >
                <span
                  className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wide shrink-0 ${typeColor[r.type] || 'bg-neutral-100 text-neutral-500'}`}
                >
                  {r.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0a0a0a] truncate">{r.label}</p>
                  <p className="text-xs text-neutral-400 truncate">{r.sub}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {query.length >= 2 && results.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-8">Sin resultados para &quot;{query}&quot;</p>
        )}
      </div>
    </div>
  );
}
