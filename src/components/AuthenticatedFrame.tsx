'use client';

import { useContext } from 'react';
import RoleProvider from '@/components/RoleProvider';
import SeedData from '@/components/SeedData';
import Sidebar from '@/components/Sidebar';
import RouteGuard from '@/components/RouteGuard';
import MigrationBanner from '@/components/MigrationBanner';
import NotificationManager from '@/components/NotificationManager';
import CloudDataStatus from '@/components/CloudDataStatus';
import { StartupContext } from '@/components/StartupContext';

export default function AuthenticatedFrame({ children }: { children: React.ReactNode }) {
  const { dataReady } = useContext(StartupContext);
  return (
    <RoleProvider>
      {dataReady && <SeedData />}
      <Sidebar />
      <main className="lg:ml-[260px] min-h-screen px-3 py-14 sm:px-4 sm:py-16 lg:px-10 lg:py-8">
        <RouteGuard>
          <CloudDataStatus>{children}</CloudDataStatus>
        </RouteGuard>
      </main>
      <MigrationBanner />
      <NotificationManager />
    </RoleProvider>
  );
}
