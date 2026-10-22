import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import SentryBoot from '@/components/SentryBoot';
import AppFrame from '@/components/AppFrame';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

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
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <SentryBoot />
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
