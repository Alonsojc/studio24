'use client';

import { useEffect } from 'react';
import {
  getNotifPrefs,
  getLastCheck,
  setLastCheck,
  canNotify,
  checkPendingInvoices,
  sendPendingInvoiceNotification,
} from '@/lib/notifications';

export default function NotificationManager() {
  useEffect(() => {
    const prefs = getNotifPrefs();
    if (!prefs.enabled || !canNotify()) return;

    const check = () => {
      const lastCheck = getLastCheck();
      const intervalMs = prefs.checkIntervalMinutes * 60 * 1000;
      if (Date.now() - lastCheck < intervalMs) return;

      if (prefs.facturasPendientes) {
        const report = checkPendingInvoices();
        if (report.ingresosCount + report.egresosCount > 0) {
          sendPendingInvoiceNotification(report);
        }
      }
      setLastCheck();
    };

    // Check on mount after a short delay
    const timeout = setTimeout(check, 3000);
    // And periodically
    const interval = setInterval(check, prefs.checkIntervalMinutes * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  return null;
}
