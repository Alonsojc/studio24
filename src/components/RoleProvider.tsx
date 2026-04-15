'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getMyProfile, type UserProfile, type UserRole } from '@/lib/roles';

interface RoleContextType {
  profile: UserProfile | null;
  role: UserRole;
  loading: boolean;
}

const RoleContext = createContext<RoleContextType>({ profile: null, role: 'admin', loading: true });

export function useRole() {
  return useContext(RoleContext);
}

export default function RoleProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const role = profile?.role || 'admin';

  return (
    <RoleContext.Provider value={{ profile, role, loading }}>
      {children}
    </RoleContext.Provider>
  );
}
