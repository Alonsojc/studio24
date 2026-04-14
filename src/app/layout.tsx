import type { Metadata, Viewport } from 'next';
import Sidebar from '@/components/Sidebar';
import SeedData from '@/components/SeedData';
import AuthGate from '@/components/AuthGate';
import RoleProvider from '@/components/RoleProvider';
import MigrationBanner from '@/components/MigrationBanner';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#c72a09',
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
        <AuthGate>
          <RoleProvider>
            <SeedData />
            <Sidebar />
            <main className="lg:ml-[260px] min-h-screen px-4 py-16 lg:px-10 lg:py-8">{children}</main>
            <MigrationBanner />
          </RoleProvider>
        </AuthGate>
      </body>
    </html>
  );
}
