import { describe, expect, it } from 'vitest';
import { canAccess, getVisibleGroups } from '@/lib/roles';

describe('permisos por rol', () => {
  it('admin puede entrar a cualquier ruta operativa', () => {
    expect(canAccess('admin', '/auditoria')).toBe(true);
    expect(canAccess('admin', '/ingresos')).toBe(true);
    expect(canAccess('admin', '/pedidos')).toBe(true);
  });

  it('operador no entra a finanzas ni auditoría', () => {
    expect(canAccess('operador', '/pedidos')).toBe(true);
    expect(canAccess('operador', '/cotizador')).toBe(true);
    expect(canAccess('operador', '/ingresos')).toBe(false);
    expect(canAccess('operador', '/egresos')).toBe(false);
    expect(canAccess('operador', '/auditoria')).toBe(false);
  });

  it('contador no entra a producción ni auditoría', () => {
    expect(canAccess('contador', '/ingresos')).toBe(true);
    expect(canAccess('contador', '/facturas')).toBe(true);
    expect(canAccess('contador', '/pedidos')).toBe(false);
    expect(canAccess('contador', '/inventario')).toBe(false);
    expect(canAccess('contador', '/auditoria')).toBe(false);
  });

  it('todos los roles autenticados pueden entrar a ajustes personales', () => {
    expect(canAccess('admin', '/ajustes')).toBe(true);
    expect(canAccess('operador', '/ajustes')).toBe(true);
    expect(canAccess('contador', '/ajustes')).toBe(true);
  });

  it('solo muestra grupos relevantes en navegación', () => {
    expect(getVisibleGroups('operador')).toEqual(['PRODUCCIÓN', 'VENTAS']);
    expect(getVisibleGroups('contador')).toEqual(['FINANZAS', 'DIRECTORIO']);
  });
});
