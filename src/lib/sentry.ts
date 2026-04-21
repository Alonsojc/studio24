'use client';

import * as Sentry from '@sentry/browser';

/**
 * Captura de errores en producción via Sentry (gratis hasta 5k errores/mes).
 *
 * Setup:
 *   1. Crear cuenta gratis en https://sentry.io, crear un proyecto tipo
 *      "Browser JavaScript" y copiar el DSN.
 *   2. Inyectar la variable de entorno NEXT_PUBLIC_SENTRY_DSN al build
 *      (GitHub Actions: Secret → env), o hardcodearla en
 *      `FALLBACK_DSN` de este archivo.
 *   3. Si NEXT_PUBLIC_SENTRY_DSN queda vacío, Sentry no se inicializa
 *      (no-op) — la app sigue funcionando sin telemetría.
 */

// Reemplazar con el DSN del proyecto de Sentry si no se usa env var.
const FALLBACK_DSN = '';

let initialized = false;

export function initSentry(): void {
  if (initialized || typeof window === 'undefined') return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || FALLBACK_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    // Capturamos 100% de los errores; Sentry free tier alcanza de sobra.
    tracesSampleRate: 0,
    // Evitar duplicados en React dev-mode doble-render.
    enabled: process.env.NODE_ENV !== 'test',
  });
  initialized = true;
}

/** Vincula el usuario actual al scope de Sentry para que los errores traigan email. */
export function identifySentryUser(user: { id: string; email?: string } | null): void {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id, email: user.email || undefined });
}

/** Captura un error manualmente con contexto opcional. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    // Sin Sentry, al menos logear a consola para no perderlo.
    console.error('[reportError]', error, context);
    return;
  }
  if (context) Sentry.setContext('app', context);
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error), 'error');
  }
}
