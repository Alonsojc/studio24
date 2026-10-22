'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { initSentry, identifySentryUser } from '@/lib/sentry';

/** Load telemetry independently of the login and reuse auth events for identity. */
export default function SentryBoot() {
  useEffect(() => {
    void initSentry();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      identifySentryUser(session?.user ? { id: session.user.id } : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
