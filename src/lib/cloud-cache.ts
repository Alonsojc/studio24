'use client';

import { ACTIVE_USER_KEY } from './store';

const requests = new Map<string, { expires: number; value: Promise<unknown> }>();
let generation = 0;

export function invalidateCloudCache(): void {
  generation++;
  requests.clear();
}

export function cachedCloudRequest<T>(key: string, fetcher: () => Promise<T>, ttl = 15_000): Promise<T> {
  const owner = typeof window === 'undefined' ? '' : localStorage.getItem(ACTIVE_USER_KEY);
  const scoped = `${owner}:${generation}:${key}`;
  const cached = requests.get(scoped);
  if (cached && cached.expires > Date.now()) return cached.value as Promise<T>;
  const value = fetcher().catch((error) => {
    requests.delete(scoped);
    throw error;
  });
  requests.set(scoped, { expires: Date.now() + ttl, value });
  return value;
}
