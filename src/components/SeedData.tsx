'use client';

import { useEffect } from 'react';
import { getClientes, getProveedores, getEgresos, getIngresos } from '@/lib/store';
import { getSeedClientes, getSeedProveedores, getSeedEgresos, getSeedIngresos } from '@/lib/seed';

const SEED_KEY = 'bordados_seeded';

export default function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SEED_KEY)) return;

    // Only seed if all stores are empty
    if (
      getClientes().length > 0 ||
      getProveedores().length > 0 ||
      getEgresos().length > 0 ||
      getIngresos().length > 0
    ) {
      localStorage.setItem(SEED_KEY, '1');
      return;
    }

    const clientes = getSeedClientes();
    const proveedores = getSeedProveedores();
    const clienteIds = clientes.map((c) => c.id);
    const proveedorIds = proveedores.map((p) => p.id);
    const egresos = getSeedEgresos(proveedorIds);
    const ingresos = getSeedIngresos(clienteIds);

    localStorage.setItem('bordados_clientes', JSON.stringify(clientes));
    localStorage.setItem('bordados_proveedores', JSON.stringify(proveedores));
    localStorage.setItem('bordados_egresos', JSON.stringify(egresos));
    localStorage.setItem('bordados_ingresos', JSON.stringify(ingresos));
    localStorage.setItem(SEED_KEY, '1');

    // Reload to show seeded data
    window.location.reload();
  }, []);

  return null;
}
