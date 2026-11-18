'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getMyProfile, type UserProfile, type UserRole } from '@/lib/roles';
import { StartupContext } from './StartupContext';

interface RoleContextType {
  profile: UserProfile | null;
  role: UserRole;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const RoleContext = createContext<RoleContextType>({
  profile: null,
  role: 'operador',
  loading: true,
  error: null,
  retry: () => {},
});

export function useRole() {
  return useContext(RoleContext);
}

export default function RoleProvider({ children }: { children: React.ReactNode }) {
  const initialProfile = useContext(StartupContext).profile;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (attempt === 0 && initialProfile) return;
    let finished = false;
    const fail = () => {
      if (finished) return;
      finished = true;
      setError('No se pudieron verificar tus permisos. Intenta de nuevo.');
      setLoading(false);
    };
    const timer = setTimeout(fail, 8000);
    getMyProfile()
      .then((p) => {
        if (finished) return;
        if (!p) {
          fail();
          return;
        }
        finished = true;
        setProfile(p);
        setLoading(false);
      })
      .catch(fail)
      .finally(() => clearTimeout(timer));
    return () => {
      finished = true;
      clearTimeout(timer);
    };
  }, [attempt, initialProfile]);

  const retry = () => {
    setError(null);
    setLoading(true);
    setAttempt((previous) => previous + 1);
  };

  const verified = attempt === 0 ? initialProfile : null;
  const resolvedProfile = verified || profile;
  const role = resolvedProfile?.role || 'operador';

  return (
    <RoleContext.Provider
      value={{ profile: resolvedProfile, role, loading: !verified && loading, error: verified ? null : error, retry }}
    >
      {children}
    </RoleContext.Provider>
  );
}
