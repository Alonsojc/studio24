'use client';

import RoleProvider from '@/components/RoleProvider';
import SeedData from '@/components/SeedData';
import Sidebar from '@/components/Sidebar';
import RouteGuard from '@/components/RouteGuard';
import MigrationBanner from '@/components/MigrationBanner';
import NotificationManager from '@/components/NotificationManager';

export default function AuthenticatedFrame({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <SeedData />
      <Sidebar />
      <main className="lg:ml-[260px] min-h-screen px-3 py-14 sm:px-4 sm:py-16 lg:px-10 lg:py-8">
        <RouteGuard>{children}</RouteGuard>
      </main>
      <MigrationBanner />
      <NotificationManager />
    </RoleProvider>
  );
}
