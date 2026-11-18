import { expect, it, vi } from 'vitest';
import { addCalendarDays, todayString } from '@/lib/business-date';
import { dashboardBounds } from '@/lib/store-cloud';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

it('keeps business dates and finance periods in Mexico City at the UTC month boundary', () => {
  const now = new Date('2026-12-01T01:00:00Z');
  expect(todayString(now)).toBe('2026-11-30');
  expect(dashboardBounds('mes', now)).toMatchObject({ dateFrom: '2026-10-01', dateTo: '2026-12-01' });
  expect(todayString(new Date('2026-12-01T06:00:00Z'))).toBe('2026-12-01');
});

it('advances calendar days without shifting an all-day event in a different browser time zone', () => {
  expect(addCalendarDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
});
