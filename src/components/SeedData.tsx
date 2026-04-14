'use client';

import { useEffect } from 'react';
import { generarEgresosRecurrentes } from '@/lib/recurrentes';

/**
 * Componente que solo ejecuta lógica de recurrentes al montar.
 * La carga de datos demo se maneja manualmente desde /ajustes.
 */
export default function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    generarEgresosRecurrentes();
  }, []);

  return null;
}
