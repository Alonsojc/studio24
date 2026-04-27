import { describe, expect, it } from 'vitest';
import { auditLogToCSV, redactAuditPayload, summarizeAuditChange } from '@/lib/audit';

describe('audit log', () => {
  it('resume inserts y deletes sin exponer payload completo', () => {
    expect(summarizeAuditChange({ action: 'INSERT', oldData: null, newData: { nombre: 'Cliente' } })).toBe(
      'Registro creado',
    );
    expect(summarizeAuditChange({ action: 'DELETE', oldData: { nombre: 'Cliente' }, newData: null })).toBe(
      'Registro eliminado',
    );
  });

  it('lista campos modificados en updates', () => {
    expect(
      summarizeAuditChange({
        action: 'UPDATE',
        oldData: { nombre: 'A', telefono: '1' },
        newData: { nombre: 'B', telefono: '1', notas: 'Nueva' },
      }),
    ).toBe('nombre, notas');
  });

  it('redacta campos sensibles en payload y resumen', () => {
    expect(redactAuditPayload({ nombre: 'Cliente', email: 'a@b.com', clabe: '123' })).toEqual({
      nombre: 'Cliente',
      email: '[Filtrado]',
      clabe: '[Filtrado]',
    });

    expect(
      summarizeAuditChange({
        action: 'UPDATE',
        oldData: { email: 'a@b.com', nombre: 'A' },
        newData: { email: 'b@c.com', nombre: 'B' },
      }),
    ).toBe('nombre, 1 sensible filtrado');
  });

  it('exporta auditoría a filas CSV sin payload crudo', () => {
    const csv = auditLogToCSV([
      {
        id: 1,
        tableName: 'clientes',
        recordId: 'c1',
        action: 'UPDATE',
        actorId: 'u1',
        createdAt: '2026-04-27T10:00:00.000Z',
        oldData: { telefono: '1', nombre: 'A' },
        newData: { telefono: '2', nombre: 'B' },
      },
    ]);

    expect(csv.headers).toEqual(['Fecha', 'Acción', 'Tabla', 'Registro', 'Cambio', 'Usuario']);
    expect(csv.rows[0]).toEqual([
      '2026-04-27T10:00:00.000Z',
      'UPDATE',
      'clientes',
      'c1',
      'nombre, 1 sensible filtrado',
      'u1',
    ]);
  });
});
