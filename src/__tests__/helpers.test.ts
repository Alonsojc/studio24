import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formaPagoLabel,
  conceptoLabel,
  categoriaLabel,
  estadoPedidoLabel,
  estadoPedidoColor,
  calcIVA,
  todayString,
  validateIngreso,
  validateEgreso,
  validatePedido,
  validateCliente,
  validateProveedor,
  validateProducto,
  validateEgresoRecurrente,
} from '@/lib/helpers';

// --- Formateo ---

describe('formatCurrency', () => {
  it('formatea pesos mexicanos', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('1,500');
  });

  it('maneja cero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('maneja negativos', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('500');
  });
});

describe('formatDate', () => {
  it('formatea fecha correctamente', () => {
    const result = formatDate('2026-04-14');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('retorna vacío para string vacío', () => {
    expect(formatDate('')).toBe('');
  });
});

describe('calcIVA', () => {
  it('calcula 16% correctamente', () => {
    expect(calcIVA(100)).toBe(16);
    expect(calcIVA(1000)).toBe(160);
  });

  it('redondea a 2 decimales', () => {
    expect(calcIVA(33)).toBe(5.28);
    expect(calcIVA(99.99)).toBe(16);
  });

  it('maneja cero', () => {
    expect(calcIVA(0)).toBe(0);
  });
});

describe('todayString', () => {
  it('retorna formato YYYY-MM-DD', () => {
    const result = todayString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// --- Labels ---

describe('formaPagoLabel', () => {
  it('retorna label correcto', () => {
    expect(formaPagoLabel('efectivo')).toBe('Efectivo');
    expect(formaPagoLabel('tarjeta')).toBe('Tarjeta');
    expect(formaPagoLabel('transferencia')).toBe('Transferencia');
    expect(formaPagoLabel('otro')).toBe('Otro');
  });
});

describe('conceptoLabel', () => {
  it('retorna label con acentos', () => {
    expect(conceptoLabel('diseno')).toBe('Diseño');
    expect(conceptoLabel('reparacion')).toBe('Reparación');
    expect(conceptoLabel('solo_bordado')).toBe('Solo Bordado');
  });
});

describe('categoriaLabel', () => {
  it('retorna label correcto', () => {
    expect(categoriaLabel('mercancia')).toBe('Mercancía');
    expect(categoriaLabel('programas')).toBe('Programas/Software');
    expect(categoriaLabel('renta')).toBe('Renta/Local');
  });
});

describe('estadoPedidoLabel', () => {
  it('retorna label con acentos', () => {
    expect(estadoPedidoLabel('diseno')).toBe('En Diseño');
    expect(estadoPedidoLabel('en_maquina')).toBe('En Máquina');
    expect(estadoPedidoLabel('entregado')).toBe('Entregado');
  });
});

describe('estadoPedidoColor', () => {
  it('retorna clases Tailwind', () => {
    expect(estadoPedidoColor('pendiente')).toContain('bg-amber');
    expect(estadoPedidoColor('diseno')).toContain('bg-blue');
    expect(estadoPedidoColor('cancelado')).toContain('bg-red');
  });
});

// --- Validaciones ---

describe('validateIngreso', () => {
  const base = {
    fecha: '2026-04-14',
    clienteId: '',
    descripcion: 'Test',
    concepto: 'solo_bordado' as const,
    monto: 100,
    iva: 0,
    montoTotal: 100,
    formaPago: 'efectivo' as const,
    factura: false,
    numeroFactura: '',
    notas: '',
  };

  it('pasa con datos válidos', () => {
    expect(validateIngreso(base)).toBeNull();
  });

  it('falla sin descripción', () => {
    expect(validateIngreso({ ...base, descripcion: '' })).toContain('descripción');
  });

  it('falla con monto 0', () => {
    expect(validateIngreso({ ...base, monto: 0 })).toContain('monto');
  });

  it('falla con monto negativo', () => {
    expect(validateIngreso({ ...base, monto: -10 })).toContain('monto');
  });

  it('falla con fecha inválida', () => {
    expect(validateIngreso({ ...base, fecha: 'invalid' })).toContain('fecha');
  });

  it('falla con factura sin número', () => {
    expect(validateIngreso({ ...base, factura: true, numeroFactura: '' })).toContain('factura');
  });

  it('pasa con factura y número', () => {
    expect(validateIngreso({ ...base, factura: true, numeroFactura: 'F-001' })).toBeNull();
  });
});

describe('validateEgreso', () => {
  const base = {
    fecha: '2026-04-14',
    descripcion: 'Compra',
    categoria: 'insumos' as const,
    subcategoria: '',
    proveedorId: '',
    monto: 50,
    iva: 0,
    montoTotal: 50,
    formaPago: 'efectivo' as const,
    factura: false,
    numeroFactura: '',
    notas: '',
  };

  it('pasa con datos válidos', () => {
    expect(validateEgreso(base)).toBeNull();
  });

  it('falla sin descripción', () => {
    expect(validateEgreso({ ...base, descripcion: '   ' })).toContain('descripción');
  });

  it('falla con monto 0', () => {
    expect(validateEgreso({ ...base, monto: 0 })).toContain('monto');
  });
});

describe('validatePedido', () => {
  const base = {
    clienteId: 'abc',
    descripcion: 'Pedido test',
    concepto: 'solo_bordado' as const,
    piezas: 10,
    precioUnitario: 100,
    montoTotal: 1000,
    costoMateriales: 0,
    estado: 'pendiente' as const,
    estadoPago: 'pendiente' as const,
    montoPagado: 0,
    maquina: '',
    archivoDiseno: '',
    fotos: [] as string[],
    checklist: {
      archivoListo: false,
      hilosCargados: false,
      aroColocado: false,
      estabilizador: false,
      pruebaHecha: false,
    },
    fechaPedido: '2026-04-14',
    fechaEntrega: '',
    fechaEntregaReal: '',
    urgente: false,
    notas: '',
  };

  it('pasa con datos válidos', () => {
    expect(validatePedido(base)).toBeNull();
  });

  it('falla sin cliente', () => {
    expect(validatePedido({ ...base, clienteId: '' })).toContain('cliente');
  });

  it('falla con 0 piezas', () => {
    expect(validatePedido({ ...base, piezas: 0 })).toContain('pieza');
  });

  it('falla con precio 0', () => {
    expect(validatePedido({ ...base, precioUnitario: 0 })).toContain('precio');
  });

  it('falla con monto pagado negativo', () => {
    expect(validatePedido({ ...base, montoPagado: -1 })).toContain('negativo');
  });

  it('falla si el pago excede el total del pedido', () => {
    expect(validatePedido({ ...base, montoPagado: 1001 })).toContain('exceder');
  });
});

describe('validateCliente', () => {
  it('pasa con nombre', () => {
    expect(validateCliente({ nombre: 'Juan', telefono: '', email: '', direccion: '', logo: '', notas: '' })).toBeNull();
  });

  it('falla sin nombre', () => {
    expect(validateCliente({ nombre: '', telefono: '', email: '', direccion: '', logo: '', notas: '' })).toContain(
      'nombre',
    );
  });

  it('falla con email inválido', () => {
    expect(
      validateCliente({ nombre: 'Juan', telefono: '', email: 'bad', direccion: '', logo: '', notas: '' }),
    ).toContain('email');
  });

  it('pasa sin email', () => {
    expect(validateCliente({ nombre: 'Juan', telefono: '', email: '', direccion: '', logo: '', notas: '' })).toBeNull();
  });
});

describe('validateProveedor', () => {
  it('pasa con nombre', () => {
    expect(
      validateProveedor({
        nombre: 'Proveedor X',
        contacto: '',
        telefono: '',
        email: '',
        tipo: '',
        logo: '',
        notas: '',
      }),
    ).toBeNull();
  });

  it('falla con email inválido', () => {
    expect(
      validateProveedor({ nombre: 'X', contacto: '', telefono: '', email: 'nope', tipo: '', logo: '', notas: '' }),
    ).toContain('email');
  });
});

describe('validateProducto', () => {
  it('pasa con datos válidos', () => {
    expect(validateProducto({ nombre: 'Bordado', categoria: 'bordado', precio: 100, activo: true })).toBeNull();
  });

  it('permite precio 0', () => {
    expect(validateProducto({ nombre: 'Gratis', categoria: 'otro', precio: 0, activo: true })).toBeNull();
  });

  it('falla con precio negativo', () => {
    expect(validateProducto({ nombre: 'X', categoria: 'bordado', precio: -1, activo: true })).toContain('negativo');
  });

  it('falla sin nombre', () => {
    expect(validateProducto({ nombre: '', categoria: 'bordado', precio: 100, activo: true })).toContain('nombre');
  });
});

describe('validateEgresoRecurrente', () => {
  const base = {
    descripcion: 'Canva',
    categoria: 'programas' as const,
    subcategoria: '',
    proveedorId: '',
    monto: 129,
    formaPago: 'tarjeta' as const,
    factura: false,
    diaDelMes: 1,
    activo: true,
  };

  it('pasa con datos válidos', () => {
    expect(validateEgresoRecurrente(base)).toBeNull();
  });

  it('falla con día 0', () => {
    expect(validateEgresoRecurrente({ ...base, diaDelMes: 0 })).toContain('día');
  });

  it('falla con día 29', () => {
    expect(validateEgresoRecurrente({ ...base, diaDelMes: 29 })).toContain('día');
  });

  it('falla con monto 0', () => {
    expect(validateEgresoRecurrente({ ...base, monto: 0 })).toContain('monto');
  });
});
