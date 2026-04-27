import { describe, expect, it } from 'vitest';
import { getExpectedInpcPeriod, getInpcSyncHealth } from '@/lib/inpc';

describe('monitoreo INPC', () => {
  it('espera el mes anterior después del día 12', () => {
    expect(getExpectedInpcPeriod(new Date('2026-04-27T12:00:00.000Z'))).toEqual({ year: 2026, month: 3 });
  });

  it('espera dos meses atrás antes del corte mensual', () => {
    expect(getExpectedInpcPeriod(new Date('2026-04-05T12:00:00.000Z'))).toEqual({ year: 2026, month: 2 });
  });

  it('marca el cron al día cuando el último periodo esperado existe', () => {
    const health = getInpcSyncHealth([{ year: 2026, month: 3 }], new Date('2026-04-27T12:00:00.000Z'));
    expect(health).toMatchObject({
      latestLabel: '2026-03',
      expectedLabel: '2026-03',
      stale: false,
      monthsBehind: 0,
    });
  });

  it('marca datos atrasados cuando falta el periodo esperado', () => {
    const health = getInpcSyncHealth([{ year: 2026, month: 1 }], new Date('2026-04-27T12:00:00.000Z'));
    expect(health.stale).toBe(true);
    expect(health.monthsBehind).toBe(2);
  });
});
