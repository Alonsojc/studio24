'use client';

import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import AuthGate from '@/components/AuthGate';
import ConnectionScreen from '@/components/ConnectionScreen';

const AuthenticatedFrame = dynamic(() => import('@/components/AuthenticatedFrame'), {
  loading: () => <ConnectionScreen />,
});

const PUBLIC_ROUTES = ['/seguimiento'];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/studio24/, '') || '/';
  const isPublic = PUBLIC_ROUTES.some((route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`));

  if (isPublic) return <>{children}</>;

  return (
    <AuthGate>
      <AuthenticatedFrame>{children}</AuthenticatedFrame>
    </AuthGate>
  );
}
