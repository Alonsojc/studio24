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

const SENSITIVE_KEY_PATTERN = /(password|secret|token|key|authorization|cookie|clabe|cuenta|rfc|email|telefono|phone)/i;

export function sanitizeForTelemetry(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForTelemetry(item, depth + 1));

  const clean: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    clean[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[Filtered]' : sanitizeForTelemetry(nested, depth + 1);
  }
  return clean;
}

export function initSentry(): void {
  if (initialized || typeof window === 'undefined') return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || FALLBACK_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.extra) event.extra = sanitizeForTelemetry(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = sanitizeForTelemetry(event.contexts) as typeof event.contexts;
      return event;
    },
    // Evitar duplicados en React dev-mode doble-render.
    enabled: process.env.NODE_ENV !== 'test',
  });
  initialized = true;
}

/** Vincula el usuario actual al scope de Sentry sin enviar datos personales. */
export function identifySentryUser(user: { id: string; email?: string } | null): void {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: user.id });
}

/** Captura un error manualmente con contexto opcional. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const safeContext = context ? (sanitizeForTelemetry(context) as Record<string, unknown>) : undefined;
  if (!initialized) {
    // Sin Sentry, al menos logear a consola para no perderlo.
    console.error('[reportError]', error, safeContext);
    return;
  }
  if (safeContext) Sentry.setContext('app', safeContext);
  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error), 'error');
  }
}
