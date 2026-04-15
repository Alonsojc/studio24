'use client';

import { getIngresos, getEgresos } from './store';

const NOTIF_KEY = 'bordados_notif_prefs';
const NOTIF_LAST_CHECK = 'bordados_notif_last_check';

export interface NotifPrefs {
  enabled: boolean;
  facturasPendientes: boolean; // ingresos/egresos sin factura
  checkIntervalMinutes: number;
}

const defaultPrefs: NotifPrefs = {
  enabled: false,
  facturasPendientes: true,
  checkIntervalMinutes: 60,
};

export function getNotifPrefs(): NotifPrefs {
  if (typeof window === 'undefined') return defaultPrefs;
  const raw = localStorage.getItem(NOTIF_KEY);
  return raw ? { ...defaultPrefs, ...JSON.parse(raw) } : defaultPrefs;
}

export function saveNotifPrefs(prefs: NotifPrefs): void {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
}

export function getLastCheck(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(NOTIF_LAST_CHECK) || '0', 10);
}

export function setLastCheck(): void {
  localStorage.setItem(NOTIF_LAST_CHECK, String(Date.now()));
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function canNotify(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && Notification.permission === 'granted';
}

interface PendingInvoiceReport {
  ingresosCount: number;
  egresosCount: number;
  ingresosTotal: number;
  egresosTotal: number;
}

export function checkPendingInvoices(): PendingInvoiceReport {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const ingresos = getIngresos().filter((i) => i.fecha.startsWith(currentMonth) && !i.factura);
  const egresos = getEgresos().filter((e) => e.fecha.startsWith(currentMonth) && !e.factura);

  return {
    ingresosCount: ingresos.length,
    egresosCount: egresos.length,
    ingresosTotal: ingresos.reduce((s, i) => s + i.montoTotal, 0),
    egresosTotal: egresos.reduce((s, e) => s + e.montoTotal, 0),
  };
}

export function sendPendingInvoiceNotification(report: PendingInvoiceReport): void {
  if (!canNotify()) return;
  const total = report.ingresosCount + report.egresosCount;
  if (total === 0) return;

  const parts: string[] = [];
  if (report.ingresosCount > 0) {
    parts.push(`${report.ingresosCount} ingreso${report.ingresosCount > 1 ? 's' : ''} sin factura`);
  }
  if (report.egresosCount > 0) {
    parts.push(`${report.egresosCount} egreso${report.egresosCount > 1 ? 's' : ''} sin factura`);
  }

  new Notification('Studio 24 — Facturas pendientes', {
    body: `Este mes tienes ${parts.join(' y ')}. Revisa antes de tu declaración.`,
    icon: '/studio24/favicon.svg',
    tag: 'facturas-pendientes',
  });
}
