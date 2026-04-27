import type { Metadata, Viewport } from 'next';
import Sidebar from '@/components/Sidebar';
import SeedData from '@/components/SeedData';
import AuthGate from '@/components/AuthGate';
import RoleProvider from '@/components/RoleProvider';
import RouteGuard from '@/components/RouteGuard';
import MigrationBanner from '@/components/MigrationBanner';
import NotificationManager from '@/components/NotificationManager';
import SentryBoot from '@/components/SentryBoot';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#c72a09',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'Studio 24',
    template: 'Studio 24 - %s',
  },
  description: 'Sistema de control de ingresos, egresos y clientes para negocio de bordados',
  icons: {
    icon: '/studio24/favicon.svg',
  },
  manifest: '/studio24/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Studio 24',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <SentryBoot />
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
      </body>
    </html>
  );
}
