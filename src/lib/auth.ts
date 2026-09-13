'use client';

import { supabase } from './supabase';
import { clearTeamIdCache } from './teams';
import { clearSensitiveLocalData } from './store';
import { hasPendingSync } from './sync-queue';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  if (hasPendingSync())
    throw new Error('Hay cambios pendientes. Sincroniza o exporta un respaldo antes de cerrar sesion.');
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
  clearTeamIdCache();
  clearSensitiveLocalData();
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/studio24/ajustes`,
  });
  if (error) throw new Error(error.message);
}

export async function getUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export function onAuthChange(callback: (user: unknown) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}
