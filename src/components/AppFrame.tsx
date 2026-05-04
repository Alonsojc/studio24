'use client';

import { usePathname } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import RoleProvider from '@/components/RoleProvider';
import SeedData from '@/components/SeedData';
import Sidebar from '@/components/Sidebar';
import RouteGuard from '@/components/RouteGuard';
import MigrationBanner from '@/components/MigrationBanner';
import NotificationManager from '@/components/NotificationManager';

const PUBLIC_ROUTES = ['/seguimiento'];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/^\/studio24/, '') || '/';
  const isPublic = PUBLIC_ROUTES.some((route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`));

  if (isPublic) return <>{children}</>;

  return (
    <AuthGate>
      <RoleProvider>
        <SeedData />
        <Sidebar />
        <main className="lg:ml-[260px] min-h-screen px-3 py-14 sm:px-4 sm:py-16 lg:px-10 lg:py-8">
          <RouteGuard>{children}</RouteGuard>
        </main>
        <MigrationBanner />
        <NotificationManager />
      </RoleProvider>
    </AuthGate>
  );
}
