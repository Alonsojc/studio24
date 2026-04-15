import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Conciliación Bancaria' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
