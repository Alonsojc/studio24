import { describe, expect, it } from 'vitest';
import { summarizeAuditChange } from '@/lib/audit';

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
});
