'use client';

export function createTrackingToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  }
  const bytes = Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function publicTrackingUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const prefix = process.env.NODE_ENV === 'production' ? '/studio24' : '';
  return `${base}${prefix}/seguimiento?t=${encodeURIComponent(token)}`;
}
