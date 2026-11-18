'use client';

import { createContext } from 'react';
import type { UserProfile } from '@/lib/roles';

export const StartupContext = createContext<{ profile: UserProfile | null; dataReady: boolean }>({
  profile: null,
  dataReady: false,
});
