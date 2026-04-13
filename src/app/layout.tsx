import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import SeedData from "@/components/SeedData";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio24 - Control de Bordados",
  description: "Sistema de control de ingresos, egresos y clientes para negocio de bordados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <SeedData />
        <Sidebar />
        <main className="lg:ml-[260px] min-h-screen px-4 py-16 lg:px-10 lg:py-8">{children}</main>
      </body>
    </html>
  );
}
