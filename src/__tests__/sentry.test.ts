import { describe, expect, it } from 'vitest';
import { sanitizeForTelemetry } from '@/lib/sentry';

describe('telemetría segura', () => {
  it('filtra campos sensibles antes de enviar contexto', () => {
    const clean = sanitizeForTelemetry({
      kind: 'cloudSyncFailed',
      email: 'cliente@example.com',
      nested: {
        clabe: '012345678901234567',
        descripcion: 'Error normal',
      },
    });

    expect(clean).toEqual({
      kind: 'cloudSyncFailed',
      email: '[Filtered]',
      nested: {
        clabe: '[Filtered]',
        descripcion: 'Error normal',
      },
    });
  });

  it('recorta strings largos y arreglos grandes', () => {
    const clean = sanitizeForTelemetry({
      message: 'x'.repeat(400),
      rows: Array.from({ length: 30 }, (_, i) => i),
    }) as { message: string; rows: number[] };

    expect(clean.message.length).toBeLessThan(310);
    expect(clean.rows).toHaveLength(20);
  });
});
