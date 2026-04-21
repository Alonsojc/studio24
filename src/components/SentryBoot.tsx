'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { initSentry, identifySentryUser } from '@/lib/sentry';

/**
 * Inicializa Sentry lo antes posible y sincroniza el usuario actual.
 * No renderiza nada. Va adentro de AuthGate (para tener la sesión) pero
 * debe estar lo más arriba posible del árbol para que capture errores
 * de todo.
 */
export default function SentryBoot() {
  useEffect(() => {
    initSentry();

    // Adjuntamos el usuario actual al scope para que los errores traigan email.
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user) identifySentryUser({ id: user.id, email: user.email ?? undefined });
      })
      .catch(() => {
        // Sin sesión: OK, los errores se reportan como anónimos.
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        identifySentryUser({ id: session.user.id, email: session.user.email ?? undefined });
      } else {
        identifySentryUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
