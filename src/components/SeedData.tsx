'use client';

import { useEffect } from 'react';
import { generarEgresosRecurrentes } from '@/lib/recurrentes';
import { restoreFromIDB, syncAllToIDB } from '@/lib/db';
import { getPedidos } from '@/lib/store';
import { formatDate } from '@/lib/helpers';

const NOTIF_KEY = 'bordados_last_notif';

function checkPedidosNotification() {
  if (!('Notification' in window)) return;

  // Only notify once per day
  const today = new Date().toISOString().split('T')[0];
  if (localStorage.getItem(NOTIF_KEY) === today) return;

  const pedidos = getPedidos();
  const now = new Date();
  const en48h = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const activos = pedidos.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado');
  const porVencer = activos.filter((p) => {
    if (!p.fechaEntrega) return false;
    const entrega = new Date(p.fechaEntrega);
    return entrega >= now && entrega <= en48h;
  });
  const vencidos = activos.filter((p) => p.fechaEntrega && new Date(p.fechaEntrega) < now);

  if (porVencer.length === 0 && vencidos.length === 0) return;

  if (Notification.permission === 'granted') {
    sendNotification(porVencer, vencidos);
    localStorage.setItem(NOTIF_KEY, today);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') {
        sendNotification(porVencer, vencidos);
        localStorage.setItem(NOTIF_KEY, today);
      }
    });
  }
}

function sendNotification(porVencer: ReturnType<typeof getPedidos>, vencidos: ReturnType<typeof getPedidos>) {
  const lines: string[] = [];
  if (vencidos.length > 0) {
    lines.push(`${vencidos.length} vencido${vencidos.length > 1 ? 's' : ''}`);
  }
  if (porVencer.length > 0) {
    lines.push(`${porVencer.length} por vencer en 48h`);
    porVencer.slice(0, 3).forEach((p) => {
      lines.push(`  ${p.descripcion} — ${formatDate(p.fechaEntrega)}`);
    });
  }
  new Notification('Studio 24 — Pedidos', {
    body: lines.join('\n'),
    icon: '/studio24/favicon.svg',
  });
}

/**
 * Componente que ejecuta lógica de inicio al montar:
 * - Restaura datos desde IndexedDB si localStorage está vacío
 * - Sincroniza localStorage → IndexedDB como mirror
 * - Genera egresos recurrentes del mes
 * - Registra Service Worker para PWA
 */
export default function SeedData() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Intentar restaurar datos desde IDB si localStorage está vacío.
    // generarEgresosRecurrentes runs AFTER restore to avoid race-condition duplicates.
    restoreFromIDB()
      .then((restored) => {
        if (restored) {
          window.location.reload();
          return;
        }
        syncAllToIDB();
        generarEgresosRecurrentes();
      })
      .catch(() => {
        // IDB not available (e.g. mobile private mode) — run startup without restore
        generarEgresosRecurrentes();
      });

    // Registrar Service Worker para PWA offline
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/studio24/sw.js').catch(() => {});
    }

    // Notificaciones de pedidos por vencer
    checkPedidosNotification();
  }, []);

  return null;
}
