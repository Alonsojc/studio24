'use client';

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

type SentrySdk = typeof import('@sentry/browser');
type PendingError = { error: unknown; context?: Record<string, unknown> };

let sdk: SentrySdk | null = null;
let loading: Promise<void> | null = null;
let currentUser: { id: string } | null = null;
const pendingErrors: PendingError[] = [];

export function isValidSentryDsn(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    return (
      url.protocol === 'https:' &&
      /^[a-f0-9]{32}$/i.test(url.username) &&
      /^\/[0-9]+$/.test(url.pathname) &&
      url.hostname.endsWith('.sentry.io')
    );
  } catch {
    return false;
  }
}

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

function capture(sentry: SentrySdk, { error, context }: PendingError): void {
  const options = context ? { contexts: { app: context } } : undefined;
  if (error instanceof Error) sentry.captureException(error, options);
  else sentry.captureMessage(String(error), { ...options, level: 'error' });
}

export function initSentry(): Promise<void> {
  if (sdk || typeof window === 'undefined') return Promise.resolve();
  if (loading) return loading;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || FALLBACK_DSN;
  if (!dsn || !isValidSentryDsn(dsn)) return Promise.resolve();

  loading = import('@sentry/browser')
    .then((sentry) => {
      sentry.init({
        dsn,
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0,
        beforeSend(event) {
          if (event.extra) event.extra = sanitizeForTelemetry(event.extra) as typeof event.extra;
          if (event.contexts) event.contexts = sanitizeForTelemetry(event.contexts) as typeof event.contexts;
          return event;
        },
        enabled: process.env.NODE_ENV !== 'test',
      });
      sdk = sentry;
      sentry.setUser(currentUser);
      for (const entry of pendingErrors.splice(0)) capture(sentry, entry);
    })
    .catch((error) => {
      console.error('[sentryInit]', error);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Vincula el usuario actual al scope de Sentry sin enviar datos personales. */
export function identifySentryUser(user: { id: string; email?: string } | null): void {
  currentUser = user ? { id: user.id } : null;
  sdk?.setUser(currentUser);
}

/** Captura un error manualmente con contexto opcional. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const safeContext = context ? (sanitizeForTelemetry(context) as Record<string, unknown>) : undefined;
  if (!sdk) {
    console.error('[reportError]', error, safeContext);
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || FALLBACK_DSN;
    if (typeof window !== 'undefined' && isValidSentryDsn(dsn)) {
      // Keep early startup errors while the monitoring chunk is downloading.
      if (pendingErrors.length === 20) pendingErrors.shift();
      pendingErrors.push({ error, context: safeContext });
      void initSentry();
    }
    return;
  }
  capture(sdk, { error, context: safeContext });
}
