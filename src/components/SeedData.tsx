'use client';

import { useEffect } from 'react';
import { getClientes, getProveedores, getEgresos, getIngresos } from '@/lib/store';
import { getSeedClientes, getSeedProveedores, getSeedEgresos, getSeedIngresos, getSeedRecurrentes } from '@/lib/seed';
import { generarEgresosRecurrentes } from '@/lib/recurrentes';

const SEED_KEY = 'bordados_seeded';

export default function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Seed demo data on first visit
    if (!localStorage.getItem(SEED_KEY)) {
      if (
        getClientes().length === 0 &&
        getProveedores().length === 0 &&
        getEgresos().length === 0 &&
        getIngresos().length === 0
      ) {
        const clientes = getSeedClientes();
        const proveedores = getSeedProveedores();
        const clienteIds = clientes.map((c) => c.id);
        const proveedorIds = proveedores.map((p) => p.id);
        const egresos = getSeedEgresos(proveedorIds);
        const ingresos = getSeedIngresos(clienteIds);
        const recurrentes = getSeedRecurrentes();

        localStorage.setItem('bordados_clientes', JSON.stringify(clientes));
        localStorage.setItem('bordados_proveedores', JSON.stringify(proveedores));
        localStorage.setItem('bordados_egresos', JSON.stringify(egresos));
        localStorage.setItem('bordados_ingresos', JSON.stringify(ingresos));
        localStorage.setItem('bordados_egresos_recurrentes', JSON.stringify(recurrentes));
      }
      localStorage.setItem(SEED_KEY, '1');
      window.location.reload();
      return;
    }

    // Auto-generate recurring expenses for current month
    generarEgresosRecurrentes();
  }, []);

  return null;
}
