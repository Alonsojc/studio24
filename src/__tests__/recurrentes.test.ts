import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEgreso as localAddEgreso,
  addEgresoRecurrente,
  addRecurrenteLog as localAddRecurrenteLog,
  deleteEgreso as localDeleteEgreso,
  getEgresos,
  getRecurrentesLog,
} from '@/lib/store';
import type { Egreso, EgresoRecurrente } from '@/lib/types';

vi.mock('@/lib/store-sync', () => ({
  addEgreso: localAddEgreso,
  addRecurrenteLog: localAddRecurrenteLog,
  deleteEgreso: localDeleteEgreso,
}));

function createMemoryStorage(): Storage {
  let data: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear: () => {
      data = {};
    },
    getItem: (key: string) => data[key] ?? null,
    key: (index: number) => Object.keys(data)[index] ?? null,
    removeItem: (key: string) => {
      delete data[key];
    },
    setItem: (key: string, value: string) => {
      data[key] = String(value);
    },
  };
}

function recurrente(overrides: Partial<EgresoRecurrente> = {}): EgresoRecurrente {
  return {
    id: 'rec-1',
    descripcion: 'Suscripción Canva Pro',
    categoria: 'programas',
    subcategoria: 'Canva',
    proveedorId: '',
    monto: 150,
    formaPago: 'tarjeta',
    factura: false,
    diaDelMes: 13,
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function automatico(overrides: Partial<Egreso> = {}): Egreso {
  return {
    id: 'eg-1',
    fecha: '2026-05-13',
    descripcion: 'Suscripción Canva Pro (automático)',
    categoria: 'programas',
    subcategoria: 'Canva',
    proveedorId: '',
    monto: 150,
    iva: 0,
    montoTotal: 150,
    formaPago: 'tarjeta',
    factura: false,
    numeroFactura: '',
    notas: 'Generado automáticamente desde egreso recurrente',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  const storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'));
});

describe('generarEgresosRecurrentes', () => {
  it('no genera el cargo del mes actual antes del día programado', async () => {
    const { generarEgresosRecurrentes } = await import('@/lib/recurrentes');
    addEgresoRecurrente(recurrente());

    expect(generarEgresosRecurrentes()).toBe(4);
    expect(getEgresos().map((e) => e.fecha)).toEqual(['2026-01-13', '2026-02-13', '2026-03-13', '2026-04-13']);
  });

  it('no duplica aunque existan dos recurrentes iguales con distinto id', async () => {
    const { generarEgresosRecurrentes } = await import('@/lib/recurrentes');
    addEgresoRecurrente(recurrente({ id: 'rec-1' }));
    addEgresoRecurrente(recurrente({ id: 'rec-2' }));

    expect(generarEgresosRecurrentes()).toBe(4);
    expect(getEgresos()).toHaveLength(4);
    expect(getRecurrentesLog()).toContain('rec-1::2026-04');
    expect(getRecurrentesLog()).toContain('rec-2::2026-04');
  });
});

describe('limpiarEgresosAutomaticosDuplicados', () => {
  it('borra duplicados exactos y cargos automáticos futuros', async () => {
    const { limpiarEgresosAutomaticosDuplicados } = await import('@/lib/recurrentes');
    localAddEgreso(automatico({ id: 'past-1', fecha: '2026-04-13', createdAt: '2026-04-13T00:00:00.000Z' }));
    localAddEgreso(automatico({ id: 'past-2', fecha: '2026-04-13', createdAt: '2026-04-14T00:00:00.000Z' }));
    localAddEgreso(automatico({ id: 'future-1', fecha: '2026-05-13', createdAt: '2026-05-01T00:00:00.000Z' }));

    expect(limpiarEgresosAutomaticosDuplicados()).toBe(2);
    expect(getEgresos().map((e) => e.id)).toEqual(['past-1']);
  });
});
