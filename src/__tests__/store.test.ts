import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getClientes,
  addCliente,
  updateCliente,
  deleteCliente,
  getIngresos,
  addIngreso,
  getEgresos,
  addEgreso,
  getProductos,
  addProducto,
  updateProducto,
  deleteProducto,
  getCotizaciones,
  addCotizacion,
  updateCotizacion,
  deleteCotizacion,
  getConfig,
  saveConfig,
  exportAllData,
  importAllData,
  clearAllData,
  clearSensitiveLocalData,
  bindLocalDataToUser,
  ACTIVE_USER_KEY,
  getNextFolio,
} from '@/lib/store';
import type { Cliente, Ingreso, Egreso, Producto, Cotizacion, ConfigNegocio } from '@/lib/types';

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

beforeEach(() => {
  const storage = createMemoryStorage();
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
});

// --- CRUD Clientes ---

describe('Clientes CRUD', () => {
  const cliente: Cliente = {
    id: 'c1',
    nombre: 'Test',
    telefono: '555',
    email: 'test@test.com',
    direccion: '',
    logo: '',
    notas: '',
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('agrega y obtiene clientes', () => {
    expect(getClientes()).toHaveLength(0);
    addCliente(cliente);
    expect(getClientes()).toHaveLength(1);
    expect(getClientes()[0].nombre).toBe('Test');
  });

  it('actualiza cliente', () => {
    addCliente(cliente);
    updateCliente({ ...cliente, nombre: 'Updated' });
    expect(getClientes()[0].nombre).toBe('Updated');
  });

  it('elimina cliente', () => {
    addCliente(cliente);
    deleteCliente('c1');
    expect(getClientes()).toHaveLength(0);
  });

  it('no falla al eliminar inexistente', () => {
    deleteCliente('nonexistent');
    expect(getClientes()).toHaveLength(0);
  });
});

// --- CRUD Productos ---

describe('Productos CRUD', () => {
  const producto: Producto = {
    id: 'p1',
    nombre: 'Bordado chico',
    categoria: 'bordado',
    precio: 150,
    activo: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('agrega y obtiene productos', () => {
    addProducto(producto);
    expect(getProductos()).toHaveLength(1);
    expect(getProductos()[0].precio).toBe(150);
  });

  it('actualiza producto', () => {
    addProducto(producto);
    updateProducto({ ...producto, precio: 200 });
    expect(getProductos()[0].precio).toBe(200);
  });

  it('elimina producto', () => {
    addProducto(producto);
    deleteProducto('p1');
    expect(getProductos()).toHaveLength(0);
  });
});

// --- Cotizaciones con updateCotizacion ---

describe('Cotizaciones CRUD', () => {
  const cotizacion: Cotizacion = {
    id: 'cot1',
    folio: 'COT-001',
    clienteNombre: 'Juan',
    clienteEmpresa: 'Empresa',
    items: [{ descripcion: 'Bordado', cantidad: 10, precioUnitario: 100 }],
    conIVA: false,
    notas: '',
    subtotal: 1000,
    iva: 0,
    total: 1000,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('agrega cotización', () => {
    addCotizacion(cotizacion);
    expect(getCotizaciones()).toHaveLength(1);
  });

  it('actualiza cotización', () => {
    addCotizacion(cotizacion);
    updateCotizacion({ ...cotizacion, clienteNombre: 'Pedro' });
    expect(getCotizaciones()[0].clienteNombre).toBe('Pedro');
  });

  it('elimina cotización', () => {
    addCotizacion(cotizacion);
    deleteCotizacion('cot1');
    expect(getCotizaciones()).toHaveLength(0);
  });
});

// --- Config ---

describe('Config', () => {
  it('retorna defaults vacíos', () => {
    const config = getConfig();
    expect(config.nombreNegocio).toBe('');
    expect(config.titular).toBe('');
  });

  it('guarda y recupera config', () => {
    const custom: ConfigNegocio = {
      nombreNegocio: 'Mi Negocio',
      titular: 'Juan',
      rfc: 'XAXX010101000',
      regimenFiscal: '626',
      codigoPostal: '64000',
      banco: 'BBVA',
      numeroCuenta: '123',
      clabe: '456',
      telefono: '555',
      email: 'a@b.com',
      direccion: 'Dir',
      logoUrl: '',
    };
    saveConfig(custom);
    expect(getConfig().nombreNegocio).toBe('Mi Negocio');
  });
});

// --- Folio ---

describe('getNextFolio', () => {
  it('genera folios incrementales', () => {
    const f1 = getNextFolio('COT');
    const f2 = getNextFolio('COT');
    expect(f1).toBe('COT-001');
    expect(f2).toBe('COT-002');
  });

  it('no repite folios tras borrar cotizaciones', () => {
    const cot: Cotizacion = {
      id: 'x',
      folio: 'COT-001',
      clienteNombre: '',
      clienteEmpresa: '',
      items: [],
      conIVA: false,
      notas: '',
      subtotal: 0,
      iva: 0,
      total: 0,
      createdAt: '2026-01-01T00:00:00Z',
    };
    addCotizacion(cot);
    const f1 = getNextFolio('COT');
    deleteCotizacion('x');
    const f2 = getNextFolio('COT');
    // f2 debe ser mayor que f1, no repetir
    expect(f2 > f1).toBe(true);
  });
});

// --- Backup / Restore ---

describe('Backup y Restore', () => {
  it('exporta e importa datos correctamente', () => {
    addCliente({
      id: 'c1',
      nombre: 'Backup Test',
      telefono: '',
      email: '',
      direccion: '',
      logo: '',
      notas: '',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const json = exportAllData();
    clearAllData();
    expect(getClientes()).toHaveLength(0);
    importAllData(json);
    expect(getClientes()).toHaveLength(1);
    expect(getClientes()[0].nombre).toBe('Backup Test');
  });

  it('clearAllData limpia todo', () => {
    addCliente({
      id: 'c1',
      nombre: 'Test',
      telefono: '',
      email: '',
      direccion: '',
      logo: '',
      notas: '',
      createdAt: '2026-01-01T00:00:00Z',
    });
    addProducto({
      id: 'p1',
      nombre: 'Test',
      categoria: 'bordado',
      precio: 100,
      activo: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
    clearAllData();
    expect(getClientes()).toHaveLength(0);
    expect(getProductos()).toHaveLength(0);
  });

  it('clearSensitiveLocalData limpia datos sensibles y conserva bandera seeded', () => {
    addCliente({
      id: 'c1',
      nombre: 'Test',
      telefono: '',
      email: '',
      direccion: '',
      logo: '',
      notas: '',
      createdAt: '2026-01-01T00:00:00Z',
    });
    localStorage.setItem('bordados_pin_hash', 'secret');
    clearSensitiveLocalData();
    expect(getClientes()).toHaveLength(0);
    expect(localStorage.getItem('bordados_pin_hash')).toBeNull();
    expect(localStorage.getItem('bordados_seeded')).toBe('1');
  });

  it('bindLocalDataToUser limpia cache al cambiar de usuario', () => {
    bindLocalDataToUser('u1');
    addCliente({
      id: 'c1',
      nombre: 'Usuario 1',
      telefono: '',
      email: '',
      direccion: '',
      logo: '',
      notas: '',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const cleared = bindLocalDataToUser('u2');
    expect(cleared).toBe(true);
    expect(getClientes()).toHaveLength(0);
    expect(localStorage.getItem(ACTIVE_USER_KEY)).toBe('u2');
  });

  it('importAllData rechaza JSON inválido', () => {
    expect(() => importAllData('not json')).toThrow();
  });

  it('importAllData rechaza estructura inválida', () => {
    expect(() => importAllData(JSON.stringify({ clientes: 'not array' }))).toThrow('lista');
  });

  it('importAllData rechaza config no-objeto', () => {
    expect(() => importAllData(JSON.stringify({ config: [1, 2, 3] }))).toThrow('config');
  });
});
