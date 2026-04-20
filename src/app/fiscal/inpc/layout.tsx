import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'INPC' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
